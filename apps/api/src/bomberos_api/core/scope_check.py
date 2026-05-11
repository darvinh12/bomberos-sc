"""Validación de scope a nivel de recurso.

Uso desde endpoints sensibles: tras cargar un recurso, llamar
`await assert_scope_funcionario(db, user, funcionario)`. Si el usuario:
- es ADMIN → pasa sin chequear
- no tiene scopes → pasa (acceso completo)
- tiene scopes pero el recurso no coincide → 403 Forbidden
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select

from bomberos_api.models.funcionario import Funcionario
from bomberos_api.models.usuario import Rol, UsuarioRol, UsuarioScope


async def _es_admin(db, usuario_id: int) -> bool:
    n = await db.scalar(
        select(func.count())
        .select_from(UsuarioRol)
        .join(Rol, Rol.id == UsuarioRol.rol_id)
        .where(UsuarioRol.usuario_id == usuario_id, Rol.codigo == "ADMIN")
    )
    return bool(n)


async def _scopes_de(db, usuario_id: int) -> list[UsuarioScope]:
    return (
        (
            await db.execute(
                select(UsuarioScope).where(UsuarioScope.usuario_id == usuario_id)
            )
        )
        .scalars()
        .all()
    )


def _funcionario_en_scope(funcionario: Funcionario, s: UsuarioScope) -> bool:
    if s.zona_id is not None and funcionario.zona_id != s.zona_id:
        return False
    if s.estacion_id is not None and funcionario.estacion_id != s.estacion_id:
        return False
    if s.division_id is not None and funcionario.division_id != s.division_id:
        return False
    if s.area_id is not None and funcionario.area_id != s.area_id:
        return False
    # Si llegamos acá, todas las dimensiones presentes del scope se cumplen.
    # Pero si el scope no tiene NINGUNA dimensión, no es válido (la BD lo
    # garantiza con CHECK), así que esto siempre es safe.
    return True


async def assert_scope_funcionario(
    db, user, funcionario: Funcionario
) -> None:
    """Lanza 403 si el usuario no tiene scope sobre este funcionario."""
    if await _es_admin(db, user.id):
        return
    scopes = await _scopes_de(db, user.id)
    if not scopes:
        return  # Sin scopes = sin restricción
    if any(_funcionario_en_scope(funcionario, s) for s in scopes):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "No tenés acceso a este funcionario (está fuera de los departamentos "
            "asignados a tu usuario)."
        ),
    )
