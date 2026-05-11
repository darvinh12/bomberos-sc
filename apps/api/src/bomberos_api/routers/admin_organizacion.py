"""CRUD de departamentos (zonas, estaciones, divisiones, áreas, dependencias).

Solo accesible por ADMIN. Las queries de lectura siguen disponibles en
`/catalogos/*` (sin auth de ADMIN) para que los formularios del sistema
puedan llenar dropdowns.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
import re

from bomberos_api.core.crud import client_ip, integrity_409, not_found, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.org import Area, Dependencia, Division, Estacion, Zona

router = APIRouter(
    prefix="/admin/organizacion",
    tags=["admin-org"],
    dependencies=[Depends(require_role("ADMIN"))],
)


_CODIGO_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")


def _validar_codigo(v: str) -> str:
    v = v.strip()
    if not _CODIGO_RE.match(v):
        raise ValueError("Código: 1-16 chars, alfanumérico, '_' o '-'")
    return v


# ============================================================
# Zonas
# ============================================================


class ZonaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    activo: bool


class ZonaCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class ZonaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool | None = None


@router.get("/zonas", response_model=list[ZonaOut])
async def listar_zonas(db: DbSession, _: CurrentUser) -> list[ZonaOut]:
    rows = (await db.execute(select(Zona).order_by(Zona.codigo))).scalars().all()
    return [ZonaOut.model_validate(z) for z in rows]


@router.post("/zonas", response_model=ZonaOut, status_code=status.HTTP_201_CREATED)
async def crear_zona(
    request: Request, payload: ZonaCreate, db: DbSession, user: CurrentUser
) -> ZonaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    z = Zona(**payload.model_dump())
    db.add(z)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return ZonaOut.model_validate(z)


@router.patch("/zonas/{zona_id}", response_model=ZonaOut)
async def actualizar_zona(
    request: Request, zona_id: int, payload: ZonaUpdate, db: DbSession, user: CurrentUser
) -> ZonaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    z = await db.scalar(select(Zona).where(Zona.id == zona_id))
    if z is None:
        raise not_found("Zona")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(z, k, v)
    await db.flush()
    return ZonaOut.model_validate(z)


@router.delete("/zonas/{zona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_zona(
    request: Request, zona_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete, func

    await set_audit_ctx(db, user.id, client_ip(request))
    z = await db.scalar(select(Zona).where(Zona.id == zona_id))
    if z is None:
        raise not_found("Zona")
    deps = await db.scalar(
        select(func.count()).select_from(Estacion).where(Estacion.zona_id == zona_id)
    )
    if deps:
        raise HTTPException(
            status_code=409,
            detail=f"La zona tiene {deps} estaciones. Mové o borrá las estaciones primero.",
        )
    await db.execute(delete(Zona).where(Zona.id == zona_id))


# ============================================================
# Estaciones
# ============================================================


class EstacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    zona_id: int
    codigo: str
    nombre: str
    nombre_corto: str | None
    direccion: str | None
    telefono: str | None
    activa: bool


class EstacionCreate(BaseModel):
    zona_id: int
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    nombre_corto: str | None = Field(default=None, max_length=16)
    direccion: str | None = Field(default=None, max_length=255)
    telefono: str | None = Field(default=None, max_length=32)
    activa: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class EstacionUpdate(BaseModel):
    zona_id: int | None = None
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    nombre_corto: str | None = Field(default=None, max_length=16)
    direccion: str | None = Field(default=None, max_length=255)
    telefono: str | None = Field(default=None, max_length=32)
    activa: bool | None = None


@router.get("/estaciones", response_model=list[EstacionOut])
async def listar_estaciones(db: DbSession, _: CurrentUser) -> list[EstacionOut]:
    rows = (
        await db.execute(select(Estacion).order_by(Estacion.zona_id, Estacion.codigo))
    ).scalars().all()
    return [EstacionOut.model_validate(e) for e in rows]


@router.post("/estaciones", response_model=EstacionOut, status_code=status.HTTP_201_CREATED)
async def crear_estacion(
    request: Request, payload: EstacionCreate, db: DbSession, user: CurrentUser
) -> EstacionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Zona).where(Zona.id == payload.zona_id)) is None:
        raise not_found("Zona")
    e = Estacion(**payload.model_dump())
    db.add(e)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise integrity_409(exc) from exc
    return EstacionOut.model_validate(e)


@router.patch("/estaciones/{estacion_id}", response_model=EstacionOut)
async def actualizar_estacion(
    request: Request,
    estacion_id: int,
    payload: EstacionUpdate,
    db: DbSession,
    user: CurrentUser,
) -> EstacionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    e = await db.scalar(select(Estacion).where(Estacion.id == estacion_id))
    if e is None:
        raise not_found("Estación")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    await db.flush()
    return EstacionOut.model_validate(e)


@router.delete("/estaciones/{estacion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_estacion(
    request: Request, estacion_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete

    await set_audit_ctx(db, user.id, client_ip(request))
    e = await db.scalar(select(Estacion).where(Estacion.id == estacion_id))
    if e is None:
        raise not_found("Estación")
    await db.execute(delete(Estacion).where(Estacion.id == estacion_id))


# ============================================================
# Genérico para entidades planas con (id, codigo, nombre, activo)
# Divisiones / Áreas / Dependencias
# ============================================================


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    activo: bool
    parent_id: int | None = None  # division_id en Areas, area_id en Dependencias


class OrgCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    parent_id: int | None = None
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class OrgUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    parent_id: int | None = None
    activo: bool | None = None


def _serialize_org(obj: object, parent_attr: str | None) -> OrgOut:
    return OrgOut(
        id=getattr(obj, "id"),
        codigo=getattr(obj, "codigo"),
        nombre=getattr(obj, "nombre"),
        activo=getattr(obj, "activo"),
        parent_id=getattr(obj, parent_attr) if parent_attr else None,
    )


# ---- Divisiones ----


@router.get("/divisiones", response_model=list[OrgOut])
async def listar_divisiones(db: DbSession, _: CurrentUser) -> list[OrgOut]:
    rows = (await db.execute(select(Division).order_by(Division.codigo))).scalars().all()
    return [_serialize_org(d, None) for d in rows]


@router.post("/divisiones", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
async def crear_division(
    request: Request, payload: OrgCreate, db: DbSession, user: CurrentUser
) -> OrgOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    d = Division(codigo=payload.codigo, nombre=payload.nombre, activo=payload.activo)
    db.add(d)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _serialize_org(d, None)


@router.patch("/divisiones/{division_id}", response_model=OrgOut)
async def actualizar_division(
    request: Request, division_id: int, payload: OrgUpdate, db: DbSession, user: CurrentUser
) -> OrgOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    d = await db.scalar(select(Division).where(Division.id == division_id))
    if d is None:
        raise not_found("División")
    data = payload.model_dump(exclude_unset=True)
    data.pop("parent_id", None)
    for k, v in data.items():
        setattr(d, k, v)
    await db.flush()
    return _serialize_org(d, None)


@router.delete("/divisiones/{division_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_division(
    request: Request, division_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete, func

    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Division).where(Division.id == division_id)) is None:
        raise not_found("División")
    deps = await db.scalar(
        select(func.count()).select_from(Area).where(Area.division_id == division_id)
    )
    if deps:
        raise HTTPException(
            status_code=409, detail=f"La división tiene {deps} áreas asignadas."
        )
    await db.execute(delete(Division).where(Division.id == division_id))


# ---- Áreas ----


@router.get("/areas", response_model=list[OrgOut])
async def listar_areas(db: DbSession, _: CurrentUser) -> list[OrgOut]:
    rows = (await db.execute(select(Area).order_by(Area.codigo))).scalars().all()
    return [_serialize_org(a, "division_id") for a in rows]


@router.post("/areas", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
async def crear_area(
    request: Request, payload: OrgCreate, db: DbSession, user: CurrentUser
) -> OrgOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    if payload.parent_id is not None:
        if await db.scalar(select(Division).where(Division.id == payload.parent_id)) is None:
            raise not_found("División")
    a = Area(
        codigo=payload.codigo,
        nombre=payload.nombre,
        activo=payload.activo,
        division_id=payload.parent_id,
    )
    db.add(a)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _serialize_org(a, "division_id")


@router.patch("/areas/{area_id}", response_model=OrgOut)
async def actualizar_area(
    request: Request, area_id: int, payload: OrgUpdate, db: DbSession, user: CurrentUser
) -> OrgOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    a = await db.scalar(select(Area).where(Area.id == area_id))
    if a is None:
        raise not_found("Área")
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        a.division_id = data.pop("parent_id")
    for k, v in data.items():
        setattr(a, k, v)
    await db.flush()
    return _serialize_org(a, "division_id")


@router.delete("/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_area(
    request: Request, area_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete, func

    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Area).where(Area.id == area_id)) is None:
        raise not_found("Área")
    deps = await db.scalar(
        select(func.count()).select_from(Dependencia).where(Dependencia.area_id == area_id)
    )
    if deps:
        raise HTTPException(
            status_code=409, detail=f"El área tiene {deps} dependencias asignadas."
        )
    await db.execute(delete(Area).where(Area.id == area_id))


# ---- Dependencias ----


@router.get("/dependencias", response_model=list[OrgOut])
async def listar_dependencias(db: DbSession, _: CurrentUser) -> list[OrgOut]:
    rows = (
        await db.execute(select(Dependencia).order_by(Dependencia.codigo))
    ).scalars().all()
    return [_serialize_org(d, "area_id") for d in rows]


@router.post("/dependencias", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
async def crear_dependencia(
    request: Request, payload: OrgCreate, db: DbSession, user: CurrentUser
) -> OrgOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    if payload.parent_id is not None:
        if await db.scalar(select(Area).where(Area.id == payload.parent_id)) is None:
            raise not_found("Área")
    d = Dependencia(
        codigo=payload.codigo,
        nombre=payload.nombre,
        activo=payload.activo,
        area_id=payload.parent_id,
    )
    db.add(d)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _serialize_org(d, "area_id")


@router.patch("/dependencias/{dependencia_id}", response_model=OrgOut)
async def actualizar_dependencia(
    request: Request,
    dependencia_id: int,
    payload: OrgUpdate,
    db: DbSession,
    user: CurrentUser,
) -> OrgOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    d = await db.scalar(select(Dependencia).where(Dependencia.id == dependencia_id))
    if d is None:
        raise not_found("Dependencia")
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        d.area_id = data.pop("parent_id")
    for k, v in data.items():
        setattr(d, k, v)
    await db.flush()
    return _serialize_org(d, "area_id")


@router.delete("/dependencias/{dependencia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_dependencia(
    request: Request, dependencia_id: int, db: DbSession, user: CurrentUser
) -> None:
    from sqlalchemy import delete

    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Dependencia).where(Dependencia.id == dependencia_id)) is None:
        raise not_found("Dependencia")
    await db.execute(delete(Dependencia).where(Dependencia.id == dependencia_id))
