"""Caché en memoria para la tabla seguridad.permisos_recursos.

Justificación: la matriz se consulta en CADA request del frontend (sidebar,
ficha de funcionario, panel de acciones). Cachear un minuto evita N consultas
por sesión sin sacrificar la frescura tras un guardado (la mutación llama
explícitamente a `invalidar_cache`).

Sin dependencias externas: dict + timestamp en módulo. El proceso es single-
worker por defecto en deploys on-premise; si en el futuro se levanta con
múltiples workers habrá que mover esto a Redis u otra capa compartida.
"""
from __future__ import annotations

import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bomberos_api.models.permiso_recurso import PermisoRecurso
from bomberos_api.models.usuario import Rol
from bomberos_api.schemas.permiso_recurso import PermisoRecursoOut

TTL_SECONDS: float = 60.0

_cache: dict[str, list[PermisoRecursoOut]] = {}
_cache_ts: float | None = None


async def get_permisos_cached(db: AsyncSession) -> list[PermisoRecursoOut]:
    global _cache_ts
    if _cache_ts is not None and (time.monotonic() - _cache_ts) < TTL_SECONDS:
        return _cache.get("all", [])
    rows = (
        await db.execute(
            select(PermisoRecurso, Rol.codigo)
            .join(Rol, Rol.id == PermisoRecurso.rol_id)
            .order_by(
                PermisoRecurso.rol_id,
                PermisoRecurso.recurso_tipo,
                PermisoRecurso.recurso_codigo,
            )
        )
    ).all()
    _cache["all"] = [
        PermisoRecursoOut(
            id=p.id,
            rol_id=p.rol_id,
            rol_codigo=codigo,
            recurso_tipo=p.recurso_tipo,
            recurso_codigo=p.recurso_codigo,
            nivel=p.nivel,
            updated_at=p.updated_at,
        )
        for p, codigo in rows
    ]
    _cache_ts = time.monotonic()
    return _cache["all"]


def invalidar_cache() -> None:
    """Invalida el caché. Llamar tras cualquier escritura en la tabla."""
    global _cache_ts
    _cache_ts = None
