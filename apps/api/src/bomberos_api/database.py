from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from bomberos_api.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _strip_sslmode_for_sqlalchemy(url: str) -> tuple[str, dict]:
    """SQLAlchemy + asyncpg no acepta ?sslmode= en la URL — lo extraemos
    y devolvemos también connect_args con el modo SSL para asyncpg."""
    connect_args: dict = {}
    if "sslmode=" not in url:
        return url, connect_args
    import re
    m = re.search(r"[?&]sslmode=([^&]+)", url)
    if m:
        mode = m.group(1)
        # asyncpg.connect acepta ssl=True/False o ssl='require'/'allow'/'disable'/'prefer'
        connect_args["ssl"] = True if mode in ("require", "verify-ca", "verify-full") else mode
    cleaned = re.sub(r"[?&]sslmode=[^&]+", "", url)
    cleaned = re.sub(r"\?&", "?", cleaned).rstrip("?&")
    return cleaned, connect_args


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        s = get_settings()
        url, connect_args = _strip_sslmode_for_sqlalchemy(s.database_url)
        # Fallback: si es Neon/Supabase y no se especificó sslmode, exigir SSL.
        host = url.split("@", 1)[-1] if "@" in url else ""
        if "ssl" not in connect_args and any(
            x in host for x in ("neon.tech", "supabase.co", "supabase.com")
        ):
            connect_args["ssl"] = True
        _engine = create_async_engine(
            url,
            echo=s.app_debug,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_recycle=1800,
            connect_args=connect_args,
        )
        _session_factory = async_sessionmaker(
            bind=_engine, expire_on_commit=False, class_=AsyncSession
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        get_engine()
    assert _session_factory is not None
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields one session per request, with auto-commit/rollback."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def session_scope() -> AsyncGenerator[AsyncSession, None]:
    """Use outside of FastAPI request scope (scripts, jobs, tests)."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
