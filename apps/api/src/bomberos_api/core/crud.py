"""Utilidades CRUD compartidas. Mantienen el patrón uniforme audit + paginación."""

from typing import Any

from fastapi import HTTPException, Request, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def set_audit_ctx(db: AsyncSession, usuario_id: int, ip: str | None) -> None:
    # SET LOCAL no acepta parámetros bindeados — usamos set_config(name, value, is_local)
    await db.execute(
        text("SELECT set_config('app.usuario_id', :v, true)").bindparams(v=str(usuario_id))
    )
    if ip:
        await db.execute(
            text("SELECT set_config('app.usuario_ip', :v, true)").bindparams(v=ip)
        )


async def paginate(
    db: AsyncSession,
    base_stmt,
    *,
    page: int,
    page_size: int,
) -> tuple[list[Any], int]:
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = await db.scalar(count_stmt) or 0
    rows = (
        await db.execute(base_stmt.offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return list(rows), total


def integrity_409(e: IntegrityError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Conflicto de datos: {e.orig}",
    )


def not_found(name: str = "Registro") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{name} no encontrado")
