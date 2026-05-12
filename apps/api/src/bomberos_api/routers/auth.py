from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, text

from bomberos_api.config import get_settings
from bomberos_api.core.deps import CurrentUser, DbSession
from bomberos_api.core.security import (
    create_token,
    decode_token,
    hash_password,
    verify_password,
)
from bomberos_api.logging import get_logger
from bomberos_api.models.usuario import Rol, Usuario, UsuarioRol
from bomberos_api.schemas.auth import (
    ChangePasswordRequest,
    RefreshRequest,
    TokenResponse,
    UsuarioMeResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = get_logger("auth")

# Política de bloqueo: tras N intentos fallidos consecutivos
MAX_INTENTOS_FALLIDOS = 5


async def _set_audit_context(db, usuario_id: int | None, ip: str | None) -> None:
    """Inyecta contexto de auditoría a la sesión PG (lo recoge el trigger aud.fn_audit).
    SET LOCAL no acepta parámetros bindeados — usamos set_config(name, value, is_local)."""
    if usuario_id is not None:
        await db.execute(
            text("SELECT set_config('app.usuario_id', :v, true)").bindparams(v=str(usuario_id))
        )
    if ip:
        await db.execute(
            text("SELECT set_config('app.usuario_ip', :v, true)").bindparams(v=ip)
        )


async def _log_acceso(db, *, usuario_id: int | None, usuario: str, ip: str | None,
                       user_agent: str | None, tipo_evento: str, detalle: str | None = None):
    try:
        await db.execute(
            text(
                """INSERT INTO aud.log_accesos
                   (usuario_id, usuario, ip, user_agent, tipo_evento, detalle)
                   VALUES (:uid, :u, CAST(:ip AS inet), :ua, CAST(:te AS core.tipo_evento_acceso), :d)"""
            ).bindparams(
                uid=usuario_id, u=usuario, ip=ip, ua=user_agent, te=tipo_evento, d=detalle
            )
        )
    except Exception as e:
        log.warning("audit_log_failed", error=str(e), tipo_evento=tipo_evento, usuario=usuario)


def _client_ip(request: Request) -> str | None:
    # Confía en X-Forwarded-For solo si el reverse proxy está bajo control.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    db: DbSession,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> TokenResponse:
    s = get_settings()
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")

    user = await db.scalar(select(Usuario).where(Usuario.usuario == form.username))

    # Mensaje genérico (no revelar si el usuario existe)
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas"
    )

    if user is None:
        await _log_acceso(
            db, usuario_id=None, usuario=form.username, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="usuario_inexistente"
        )
        raise invalid_exc

    if not user.activo:
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="inactivo"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta inactiva"
        )

    if user.bloqueado:
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="bloqueada"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta bloqueada. Contacta al administrador.",
        )

    if not verify_password(form.password, user.password_hash):
        user.intentos_fallidos = (user.intentos_fallidos or 0) + 1
        if user.intentos_fallidos >= MAX_INTENTOS_FALLIDOS:
            user.bloqueado = True
            user.motivo_bloqueo = f"Excedió {MAX_INTENTOS_FALLIDOS} intentos fallidos"
            await _log_acceso(
                db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
                tipo_evento="BLOQUEO", detalle=user.motivo_bloqueo
            )
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle=f"intento_{user.intentos_fallidos}"
        )
        raise invalid_exc

    # Login exitoso
    user.intentos_fallidos = 0
    user.ultimo_acceso = datetime.now(UTC)
    user.ultimo_ip = ip

    await _set_audit_context(db, user.id, ip)
    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
        tipo_evento="LOGIN"
    )

    # Cargar roles para el token
    result = await db.execute(
        select(Rol.codigo)
        .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .where(UsuarioRol.usuario_id == user.id)
    )
    roles = result.scalars().all()

    access = create_token(user.id, "access", {"roles": list(roles)})
    refresh = create_token(user.id, "refresh")

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=s.jwt_access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(payload: RefreshRequest, db: DbSession) -> TokenResponse:
    s = get_settings()
    try:
        decoded = decode_token(payload.refresh_token, expected_type="refresh")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido"
        )

    user_id = int(decoded["sub"])
    user = await db.scalar(select(Usuario).where(Usuario.id == user_id))
    if user is None or not user.activo or user.bloqueado:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta no disponible"
        )

    result = await db.execute(
        select(Rol.codigo)
        .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .where(UsuarioRol.usuario_id == user.id)
    )
    roles = result.scalars().all()

    access = create_token(user.id, "access", {"roles": list(roles)})
    new_refresh = create_token(user.id, "refresh")  # rotación

    return TokenResponse(
        access_token=access,
        refresh_token=new_refresh,
        expires_in=s.jwt_access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UsuarioMeResponse)
async def me(user: CurrentUser, db: DbSession) -> UsuarioMeResponse:
    result = await db.execute(
        select(Rol.codigo)
        .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .where(UsuarioRol.usuario_id == user.id)
    )
    roles = list(result.scalars().all())
    return UsuarioMeResponse(
        id=user.id,
        usuario=user.usuario,
        nombre_completo=user.nombre_completo,
        correo=user.correo,
        activo=user.activo,
        bloqueado=user.bloqueado,
        debe_cambiar_password=user.debe_cambiar_password,
        mfa_activo=user.mfa_activo,
        funcionario_id=user.funcionario_id,
        roles=roles,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    user: CurrentUser,
    db: DbSession,
) -> None:
    if not verify_password(payload.password_actual, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña actual incorrecta",
        )
    if verify_password(payload.password_nuevo, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña nueva debe ser distinta a la actual",
        )

    ip = _client_ip(request)
    user.password_hash = hash_password(payload.password_nuevo)
    user.debe_cambiar_password = False

    await _set_audit_context(db, user.id, ip)
    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=request.headers.get("user-agent"),
        tipo_evento="CAMBIO_PASSWORD"
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, user: CurrentUser, db: DbSession) -> None:
    """Logout best-effort: registra el evento. El JWT seguirá válido hasta su exp;
    para invalidación inmediata implementar lista de revocación con Redis (siguiente fase)."""
    ip = _client_ip(request)
    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=request.headers.get("user-agent"), tipo_evento="LOGOUT"
    )
