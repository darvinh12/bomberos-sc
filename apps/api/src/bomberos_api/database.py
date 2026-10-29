from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

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
        # asyncpg entiende los sslmode de libpq como string y aplica su misma
        # semántica: 'require' = cifrar SIN verificar CA (lo que usa el DSN del
        # pooler de Supabase); 'verify-full' = cifrar + verificar CA/host.
        # Pasamos el modo tal cual (fiel a libpq) en vez de forzar verificación.
        connect_args["ssl"] = False if mode == "disable" else mode
    cleaned = re.sub(r"[?&]sslmode=[^&]+", "", url)
    cleaned = re.sub(r"\?&", "?", cleaned).rstrip("?&")
    return cleaned, connect_args


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        s = get_settings()
        url, connect_args = _strip_sslmode_for_sqlalchemy(s.database_url)
        host = url.split("@", 1)[-1] if "@" in url else ""
        # Pooler en modo transacción (pgbouncer: Supabase :6543, otros poolers):
        # NO soporta prepared statements con nombre persistente. Desactivamos el
        # cache de asyncpg y usamos nombres únicos para evitar
        # "prepared statement ... does not exist".
        is_txn_pooler = "pooler." in host or ":6543" in host or "pgbouncer" in host
        if is_txn_pooler:
            from uuid import uuid4
            # Sin cache de prepared statements (ni asyncpg ni el dialecto) y con
            # nombres únicos: pgbouncer en modo transacción rota el backend por
            # transacción, invalidando cualquier prepared statement persistente.
            connect_args["statement_cache_size"] = 0
            connect_args["prepared_statement_cache_size"] = 0
            connect_args["prepared_statement_name_func"] = lambda: f"__asyncpg_{uuid4()}__"
        # Si no se especificó sslmode pero el host es gestionado, exigir cifrado
        # (require = sin verificación de CA, como el DSN por defecto de Supabase).
        if "ssl" not in connect_args and any(
            x in host for x in ("supabase.com", "supabase.co", "pooler.", "neon.tech")
        ):
            connect_args["ssl"] = "require"
        engine_kwargs: dict = {"echo": s.app_debug, "connect_args": connect_args}
        if is_txn_pooler:
            # NullPool: conexión nueva por request. Evita reutilizar conexiones
            # cuyo backend en pgbouncer ya rotó (causa de 500 intermitentes).
            engine_kwargs["poolclass"] = NullPool
        else:
            engine_kwargs.update(
                pool_pre_ping=True, pool_size=10, max_overflow=20, pool_recycle=1800
            )
        _engine = create_async_engine(url, **engine_kwargs)
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
