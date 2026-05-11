"""Gestión de usuarios y roles. Solo accesible por ADMIN."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
import re

from bomberos_api.core.crud import client_ip, integrity_409, not_found, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.core.security import hash_password
from bomberos_api.models.usuario import Modulo, Rol, RolPermiso, Usuario, UsuarioRol
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


class AuditoriaOut(BaseModel):
    id: int
    schema_name: str
    table_name: str
    registro_id: str | None
    operacion: str
    usuario_id: int | None
    usuario_nombre: str | None
    ip: str | None
    fecha: datetime
    campos_cambiados: dict | list | None = None


@router.get("/auditoria", response_model=Page[AuditoriaOut])
async def listar_auditoria(
    db: DbSession,
    _: CurrentUser,
    table_name: str | None = None,
    schema_name: str | None = None,
    usuario_id: int | None = None,
    operacion: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[AuditoriaOut]:
    from sqlalchemy import text

    where_clauses = []
    params: dict[str, object] = {}
    if table_name:
        where_clauses.append("table_name = :table_name")
        params["table_name"] = table_name
    if schema_name:
        where_clauses.append("schema_name = :schema_name")
        params["schema_name"] = schema_name
    if usuario_id:
        where_clauses.append("usuario_id = :usuario_id")
        params["usuario_id"] = usuario_id
    if operacion:
        where_clauses.append("operacion::text = :operacion")
        params["operacion"] = operacion
    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    total = (
        await db.scalar(text(f"SELECT count(*) FROM aud.log_cambios {where_sql}").bindparams(**params))
    ) or 0
    res = await db.execute(
        text(
            f"""SELECT id, schema_name, table_name, registro_id,
                       operacion::text AS operacion, usuario_id, usuario_nombre,
                       ip::text AS ip, fecha, campos_cambiados
                FROM aud.log_cambios {where_sql}
                ORDER BY fecha DESC
                OFFSET :offset LIMIT :limit"""
        ).bindparams(**params, offset=(page - 1) * page_size, limit=page_size)
    )
    items = [AuditoriaOut.model_validate(dict(r._mapping)) for r in res]
    return Page[AuditoriaOut](
        items=items, total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


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


# =============================================================================
# Roles — CRUD (los roles con es_sistema=true no son editables ni borrables)
# =============================================================================


class RolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    es_sistema: bool
    activo: bool


_CODIGO_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,31}$")


class RolCreate(BaseModel):
    codigo: str = Field(min_length=2, max_length=32)
    nombre: str = Field(min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def codigo_format(cls, v: str) -> str:
        v = v.strip().upper()
        if not _CODIGO_RE.match(v):
            raise ValueError("Código: mayúsculas, dígitos o '_', empezar con letra")
        return v


class RolUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool | None = None


@router.get("/roles", response_model=list[RolOut])
async def listar_roles(db: DbSession, _: CurrentUser) -> list[RolOut]:
    rows = (await db.execute(select(Rol).order_by(Rol.es_sistema.desc(), Rol.codigo))).scalars().all()
    return [RolOut.model_validate(r) for r in rows]


@router.post("/roles", response_model=RolOut, status_code=status.HTTP_201_CREATED)
async def crear_rol(
    request: Request, payload: RolCreate, db: DbSession, user: CurrentUser
) -> RolOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Rol(
        codigo=payload.codigo,
        nombre=payload.nombre,
        descripcion=payload.descripcion,
        es_sistema=False,
        activo=payload.activo,
    )
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return RolOut.model_validate(r)


@router.patch("/roles/{rol_id}", response_model=RolOut)
async def actualizar_rol(
    request: Request,
    rol_id: int,
    payload: RolUpdate,
    db: DbSession,
    user: CurrentUser,
) -> RolOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Rol).where(Rol.id == rol_id))
    if r is None:
        raise not_found("Rol")
    if r.es_sistema and payload.activo is False:
        raise HTTPException(status_code=400, detail="No se puede desactivar un rol de sistema")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return RolOut.model_validate(r)


@router.delete("/roles/{rol_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_rol(
    request: Request, rol_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete

    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Rol).where(Rol.id == rol_id))
    if r is None:
        raise not_found("Rol")
    if r.es_sistema:
        raise HTTPException(status_code=400, detail="No se puede borrar un rol de sistema")
    asignados = await db.scalar(
        select(func.count()).select_from(UsuarioRol).where(UsuarioRol.rol_id == rol_id)
    )
    if asignados:
        raise HTTPException(
            status_code=409,
            detail=f"El rol tiene {asignados} usuarios asignados — desasignar antes de borrar",
        )
    await db.execute(delete(RolPermiso).where(RolPermiso.rol_id == rol_id))
    await db.execute(delete(Rol).where(Rol.id == rol_id))


# =============================================================================
# Módulos — CRUD
# =============================================================================


class ModuloOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    icono: str | None
    orden: int
    activo: bool


_MODULO_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{1,31}$")


class ModuloCreate(BaseModel):
    codigo: str = Field(min_length=2, max_length=32)
    nombre: str = Field(min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    icono: str | None = Field(default=None, max_length=32)
    orden: int = 0
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def codigo_format(cls, v: str) -> str:
        v = v.strip().lower()
        if not _MODULO_CODE_RE.match(v):
            raise ValueError("Código: minúsculas, dígitos o '_', empezar con letra")
        return v


class ModuloUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    icono: str | None = Field(default=None, max_length=32)
    orden: int | None = None
    activo: bool | None = None


@router.get("/modulos", response_model=list[ModuloOut])
async def listar_modulos(db: DbSession, _: CurrentUser) -> list[ModuloOut]:
    rows = (await db.execute(select(Modulo).order_by(Modulo.orden, Modulo.nombre))).scalars().all()
    return [ModuloOut.model_validate(m) for m in rows]


@router.post("/modulos", response_model=ModuloOut, status_code=status.HTTP_201_CREATED)
async def crear_modulo(
    request: Request, payload: ModuloCreate, db: DbSession, user: CurrentUser
) -> ModuloOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    m = Modulo(**payload.model_dump())
    db.add(m)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return ModuloOut.model_validate(m)


@router.patch("/modulos/{modulo_id}", response_model=ModuloOut)
async def actualizar_modulo(
    request: Request,
    modulo_id: int,
    payload: ModuloUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ModuloOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    m = await db.scalar(select(Modulo).where(Modulo.id == modulo_id))
    if m is None:
        raise not_found("Módulo")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.flush()
    return ModuloOut.model_validate(m)


@router.delete("/modulos/{modulo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_modulo(
    request: Request, modulo_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete

    await set_audit_ctx(db, user.id, client_ip(request))
    m = await db.scalar(select(Modulo).where(Modulo.id == modulo_id))
    if m is None:
        raise not_found("Módulo")
    await db.execute(delete(RolPermiso).where(RolPermiso.modulo_id == modulo_id))
    await db.execute(delete(Modulo).where(Modulo.id == modulo_id))


# =============================================================================
# Matriz de permisos rol × módulo
# =============================================================================


class PermisoCell(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rol_id: int
    modulo_id: int
    puede_ver: bool
    puede_crear: bool
    puede_editar: bool
    puede_eliminar: bool
    puede_exportar: bool
    puede_aprobar: bool


class PermisoUpdate(BaseModel):
    puede_ver: bool | None = None
    puede_crear: bool | None = None
    puede_editar: bool | None = None
    puede_eliminar: bool | None = None
    puede_exportar: bool | None = None
    puede_aprobar: bool | None = None


@router.get("/permisos", response_model=list[PermisoCell])
async def listar_permisos(db: DbSession, _: CurrentUser) -> list[PermisoCell]:
    rows = (await db.execute(select(RolPermiso))).scalars().all()
    return [PermisoCell.model_validate(r) for r in rows]


@router.put("/permisos/{rol_id}/{modulo_id}", response_model=PermisoCell)
async def upsert_permiso(
    request: Request,
    rol_id: int,
    modulo_id: int,
    payload: PermisoUpdate,
    db: DbSession,
    user: CurrentUser,
) -> PermisoCell:
    """Upsert de una celda de la matriz. Crea la fila si no existe."""
    await set_audit_ctx(db, user.id, client_ip(request))
    rol = await db.scalar(select(Rol).where(Rol.id == rol_id))
    if rol is None:
        raise not_found("Rol")
    mod = await db.scalar(select(Modulo).where(Modulo.id == modulo_id))
    if mod is None:
        raise not_found("Módulo")

    p = await db.scalar(
        select(RolPermiso).where(
            RolPermiso.rol_id == rol_id, RolPermiso.modulo_id == modulo_id
        )
    )
    if p is None:
        p = RolPermiso(rol_id=rol_id, modulo_id=modulo_id)
        db.add(p)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.flush()
    return PermisoCell.model_validate(p)
