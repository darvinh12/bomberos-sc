"""Gestión de usuarios y roles. Solo accesible por ADMIN."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
import re

from bomberos_api.core.crud import client_ip, integrity_409, not_found, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.core.security import hash_password
from bomberos_api.models.usuario import Rol, Usuario, UsuarioRol
from bomberos_api.schemas.common import Page

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("ADMIN"))],
)


def _strong_password(v: str) -> str:
    if len(v) < 10:
        raise ValueError("Mínimo 10 caracteres")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Requiere mayúscula")
    if not re.search(r"[a-z]", v):
        raise ValueError("Requiere minúscula")
    if not re.search(r"\d", v):
        raise ValueError("Requiere dígito")
    if not re.search(r"[^A-Za-z0-9]", v):
        raise ValueError("Requiere carácter especial")
    return v


class UsuarioCreate(BaseModel):
    usuario: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    nombre_completo: str = Field(min_length=3, max_length=100)
    correo: EmailStr | None = None
    funcionario_id: int | None = None
    password: str
    roles: list[str] = []

    @field_validator("password")
    @classmethod
    def pw_strength(cls, v: str) -> str:
        return _strong_password(v)


class UsuarioUpdate(BaseModel):
    nombre_completo: str | None = Field(default=None, min_length=3, max_length=100)
    correo: EmailStr | None = None
    activo: bool | None = None
    bloqueado: bool | None = None
    motivo_bloqueo: str | None = None


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    usuario: str
    nombre_completo: str
    correo: EmailStr | None
    funcionario_id: int | None
    activo: bool
    bloqueado: bool
    motivo_bloqueo: str | None
    intentos_fallidos: int
    debe_cambiar_password: bool
    mfa_activo: bool
    ultimo_acceso: datetime | None


class ResetPasswordRequest(BaseModel):
    password_nuevo: str

    @field_validator("password_nuevo")
    @classmethod
    def pw(cls, v: str) -> str:
        return _strong_password(v)


@router.get("/usuarios", response_model=Page[UsuarioOut])
async def listar_usuarios(
    db: DbSession,
    _: CurrentUser,
    activo: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[UsuarioOut]:
    stmt = select(Usuario).order_by(Usuario.usuario)
    if activo is not None:
        stmt = stmt.where(Usuario.activo == activo)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[UsuarioOut](
        items=[UsuarioOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("/usuarios", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
async def crear_usuario(
    request: Request, payload: UsuarioCreate, db: DbSession, user: CurrentUser
) -> UsuarioOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    u = Usuario(
        usuario=payload.usuario,
        nombre_completo=payload.nombre_completo,
        correo=payload.correo,
        funcionario_id=payload.funcionario_id,
        password_hash=hash_password(payload.password),
        debe_cambiar_password=True,
        created_by=user.id,
    )
    db.add(u)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e

    if payload.roles:
        roles = (
            await db.execute(select(Rol).where(Rol.codigo.in_(payload.roles)))
        ).scalars().all()
        for r in roles:
            db.add(UsuarioRol(usuario_id=u.id, rol_id=r.id, asignado_por=user.id))
    await db.flush()
    await db.refresh(u)
    return UsuarioOut.model_validate(u)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioOut)
async def actualizar_usuario(
    request: Request,
    usuario_id: int,
    payload: UsuarioUpdate,
    db: DbSession,
    user: CurrentUser,
) -> UsuarioOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    u = await db.scalar(select(Usuario).where(Usuario.id == usuario_id))
    if u is None:
        raise not_found("Usuario")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(u, k, v)
    if payload.bloqueado is False:  # desbloqueo manual
        u.intentos_fallidos = 0
    u.updated_by = user.id
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return UsuarioOut.model_validate(u)


@router.post("/usuarios/{usuario_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    request: Request,
    usuario_id: int,
    payload: ResetPasswordRequest,
    db: DbSession,
    user: CurrentUser,
) -> None:
    """Reset administrativo: marca al usuario para cambiar password en el próximo login."""
    await set_audit_ctx(db, user.id, client_ip(request))
    u = await db.scalar(select(Usuario).where(Usuario.id == usuario_id))
    if u is None:
        raise not_found("Usuario")
    u.password_hash = hash_password(payload.password_nuevo)
    u.debe_cambiar_password = True
    u.intentos_fallidos = 0
    u.bloqueado = False
    u.motivo_bloqueo = None
    u.updated_by = user.id


@router.post("/usuarios/{usuario_id}/roles/{rol_codigo}", status_code=status.HTTP_204_NO_CONTENT)
async def asignar_rol(
    request: Request,
    usuario_id: int,
    rol_codigo: str,
    db: DbSession,
    user: CurrentUser,
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    u = await db.scalar(select(Usuario).where(Usuario.id == usuario_id))
    if u is None:
        raise not_found("Usuario")
    r = await db.scalar(select(Rol).where(Rol.codigo == rol_codigo))
    if r is None:
        raise not_found("Rol")
    db.add(UsuarioRol(usuario_id=u.id, rol_id=r.id, asignado_por=user.id))
    try:
        await db.flush()
    except IntegrityError as e:
        if "duplicate" in str(e.orig).lower():
            raise HTTPException(status_code=409, detail="Rol ya asignado")
        raise integrity_409(e) from e


@router.delete(
    "/usuarios/{usuario_id}/roles/{rol_codigo}", status_code=status.HTTP_204_NO_CONTENT
)
async def remover_rol(
    request: Request,
    usuario_id: int,
    rol_codigo: str,
    db: DbSession,
    user: CurrentUser,
) -> None:
    from sqlalchemy import delete

    await set_audit_ctx(db, user.id, client_ip(request))
    rol_id = await db.scalar(select(Rol.id).where(Rol.codigo == rol_codigo))
    if rol_id is None:
        raise not_found("Rol")
    await db.execute(
        delete(UsuarioRol).where(
            UsuarioRol.usuario_id == usuario_id, UsuarioRol.rol_id == rol_id
        )
    )
