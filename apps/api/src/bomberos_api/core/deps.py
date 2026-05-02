from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bomberos_api.core.security import decode_token
from bomberos_api.database import get_session
from bomberos_api.models.usuario import Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

DbSession = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> Usuario:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token, expected_type="access")
    except ValueError:
        raise credentials_exc

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exc

    user = await db.scalar(select(Usuario).where(Usuario.id == int(user_id)))
    if user is None or not user.activo or user.bloqueado:
        raise credentials_exc

    return user


CurrentUser = Annotated[Usuario, Depends(get_current_user)]


def require_role(*roles: str):
    """Dependency factory: exige que el usuario tenga al menos uno de estos códigos de rol."""

    async def _check(user: CurrentUser, db: DbSession) -> Usuario:
        from bomberos_api.models.usuario import Rol, UsuarioRol

        result = await db.execute(
            select(Rol.codigo)
            .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
            .where(UsuarioRol.usuario_id == user.id)
        )
        codigos = {r for r in result.scalars().all()}
        if "ADMIN" in codigos:
            return user
        if not codigos.intersection(roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requiere uno de los roles: {', '.join(roles)}",
            )
        return user

    return _check
