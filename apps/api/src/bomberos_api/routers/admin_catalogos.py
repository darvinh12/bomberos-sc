"""CRUD de catálogos del schema `core`. Solo accesible por ADMIN.

Guardrails:
- Si una fila tiene referencias desde `personal.funcionarios`, NO se permite
  borrar. El admin puede en su lugar marcar `activo=false` (soft-delete).
- Códigos: alfanuméricos cortos.
- Las queries de lectura siguen en `/catalogos/*` (sin rol ADMIN) para
  llenar dropdowns en toda la app.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
import re

from bomberos_api.core.crud import client_ip, integrity_409, not_found, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.catalogos import (
    Banco,
    Cargo,
    Condicion,
    Especialidad,
    EstadoCivil,
    GrupoSanguineo,
    Jerarquia,
    NivelEducativo,
)
from bomberos_api.models.funcionario import Funcionario

router = APIRouter(
    prefix="/admin/catalogos",
    tags=["admin-catalogos"],
    dependencies=[Depends(require_role("ADMIN"))],
)

_CODIGO_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")


def _validar_codigo(v: str) -> str:
    v = v.strip()
    if not _CODIGO_RE.match(v):
        raise ValueError("Código: 1-16 chars, alfanumérico, '_' o '-'")
    return v


async def _en_uso(db, fk_col, registro_id: int) -> int:
    """Cuenta cuántos funcionarios apuntan a esta fila vía la FK indicada."""
    return (
        await db.scalar(
            select(func.count()).select_from(Funcionario).where(fk_col == registro_id)
        )
    ) or 0


# ============================================================
# Genérico para catálogos planos (id, codigo, nombre, activo)
# ============================================================


class CatBaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    activo: bool


class CatBaseCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class CatBaseUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    activo: bool | None = None


# ============================================================
# Estados civiles
# ============================================================


@router.get("/estados-civiles", response_model=list[CatBaseOut])
async def listar_estados_civiles(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(EstadoCivil).order_by(EstadoCivil.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/estados-civiles", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_estado_civil(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = EstadoCivil(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/estados-civiles/{rec_id}", response_model=CatBaseOut)
async def actualizar_estado_civil(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(EstadoCivil).where(EstadoCivil.id == rec_id))
    if r is None:
        raise not_found("Estado civil")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/estados-civiles/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_estado_civil(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(EstadoCivil).where(EstadoCivil.id == rec_id)) is None:
        raise not_found("Estado civil")
    n = await _en_uso(db, Funcionario.estado_civil_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar (activo=false).",
        )
    await db.execute(delete(EstadoCivil).where(EstadoCivil.id == rec_id))


# ============================================================
# Grupos sanguíneos (no tiene `activo` en schema)
# ============================================================


class GrupoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str


class GrupoCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=8)
    nombre: str = Field(min_length=1, max_length=32)

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class GrupoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=32)


@router.get("/grupos-sanguineos", response_model=list[GrupoOut])
async def listar_grupos(db: DbSession, _: CurrentUser) -> list[GrupoOut]:
    rows = (await db.execute(select(GrupoSanguineo).order_by(GrupoSanguineo.codigo))).scalars().all()
    return [GrupoOut.model_validate(r) for r in rows]


@router.post("/grupos-sanguineos", response_model=GrupoOut, status_code=status.HTTP_201_CREATED)
async def crear_grupo(
    request: Request, payload: GrupoCreate, db: DbSession, user: CurrentUser
) -> GrupoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = GrupoSanguineo(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return GrupoOut.model_validate(r)


@router.patch("/grupos-sanguineos/{rec_id}", response_model=GrupoOut)
async def actualizar_grupo(
    request: Request, rec_id: int, payload: GrupoUpdate, db: DbSession, user: CurrentUser
) -> GrupoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(GrupoSanguineo).where(GrupoSanguineo.id == rec_id))
    if r is None:
        raise not_found("Grupo sanguíneo")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return GrupoOut.model_validate(r)


@router.delete("/grupos-sanguineos/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_grupo(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(GrupoSanguineo).where(GrupoSanguineo.id == rec_id)) is None:
        raise not_found("Grupo sanguíneo")
    n = await _en_uso(db, Funcionario.grupo_sanguineo_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). No se puede borrar.",
        )
    await db.execute(delete(GrupoSanguineo).where(GrupoSanguineo.id == rec_id))


# ============================================================
# Niveles educativos (tiene `orden`)
# ============================================================


class NivelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    orden: int


class NivelCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    orden: int = 0

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class NivelUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    orden: int | None = None


@router.get("/niveles-educativos", response_model=list[NivelOut])
async def listar_niveles(db: DbSession, _: CurrentUser) -> list[NivelOut]:
    rows = (await db.execute(select(NivelEducativo).order_by(NivelEducativo.orden, NivelEducativo.codigo))).scalars().all()
    return [NivelOut.model_validate(r) for r in rows]


@router.post("/niveles-educativos", response_model=NivelOut, status_code=status.HTTP_201_CREATED)
async def crear_nivel(
    request: Request, payload: NivelCreate, db: DbSession, user: CurrentUser
) -> NivelOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = NivelEducativo(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return NivelOut.model_validate(r)


@router.patch("/niveles-educativos/{rec_id}", response_model=NivelOut)
async def actualizar_nivel(
    request: Request, rec_id: int, payload: NivelUpdate, db: DbSession, user: CurrentUser
) -> NivelOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(NivelEducativo).where(NivelEducativo.id == rec_id))
    if r is None:
        raise not_found("Nivel educativo")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return NivelOut.model_validate(r)


@router.delete("/niveles-educativos/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_nivel(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(NivelEducativo).where(NivelEducativo.id == rec_id)) is None:
        raise not_found("Nivel educativo")
    n = await _en_uso(db, Funcionario.nivel_educativo_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). No se puede borrar.",
        )
    await db.execute(delete(NivelEducativo).where(NivelEducativo.id == rec_id))


# ============================================================
# Especialidades (tiene `descripcion`)
# ============================================================


class EspOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    activo: bool


class EspCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class EspUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    activo: bool | None = None


@router.get("/especialidades", response_model=list[EspOut])
async def listar_especialidades(db: DbSession, _: CurrentUser) -> list[EspOut]:
    rows = (await db.execute(select(Especialidad).order_by(Especialidad.codigo))).scalars().all()
    return [EspOut.model_validate(r) for r in rows]


@router.post("/especialidades", response_model=EspOut, status_code=status.HTTP_201_CREATED)
async def crear_esp(
    request: Request, payload: EspCreate, db: DbSession, user: CurrentUser
) -> EspOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Especialidad(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return EspOut.model_validate(r)


@router.patch("/especialidades/{rec_id}", response_model=EspOut)
async def actualizar_esp(
    request: Request, rec_id: int, payload: EspUpdate, db: DbSession, user: CurrentUser
) -> EspOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Especialidad).where(Especialidad.id == rec_id))
    if r is None:
        raise not_found("Especialidad")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return EspOut.model_validate(r)


@router.delete("/especialidades/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_esp(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Especialidad).where(Especialidad.id == rec_id)) is None:
        raise not_found("Especialidad")
    n = await _en_uso(db, Funcionario.especialidad_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(Especialidad).where(Especialidad.id == rec_id))


# ============================================================
# Jerarquías (rangos militares)
# ============================================================


class JerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    nombre_corto: str | None
    orden: int
    es_oficial: bool
    es_tropa: bool
    es_estado_mayor: bool
    activo: bool


class JerCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    nombre_corto: str | None = Field(default=None, max_length=16)
    orden: int = 0
    es_oficial: bool = False
    es_tropa: bool = False
    es_estado_mayor: bool = False
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class JerUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    nombre_corto: str | None = Field(default=None, max_length=16)
    orden: int | None = None
    es_oficial: bool | None = None
    es_tropa: bool | None = None
    es_estado_mayor: bool | None = None
    activo: bool | None = None


@router.get("/jerarquias", response_model=list[JerOut])
async def listar_jerarquias(db: DbSession, _: CurrentUser) -> list[JerOut]:
    rows = (await db.execute(select(Jerarquia).order_by(Jerarquia.orden, Jerarquia.codigo))).scalars().all()
    return [JerOut.model_validate(r) for r in rows]


@router.post("/jerarquias", response_model=JerOut, status_code=status.HTTP_201_CREATED)
async def crear_jer(
    request: Request, payload: JerCreate, db: DbSession, user: CurrentUser
) -> JerOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Jerarquia(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return JerOut.model_validate(r)


@router.patch("/jerarquias/{rec_id}", response_model=JerOut)
async def actualizar_jer(
    request: Request, rec_id: int, payload: JerUpdate, db: DbSession, user: CurrentUser
) -> JerOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Jerarquia).where(Jerarquia.id == rec_id))
    if r is None:
        raise not_found("Jerarquía")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return JerOut.model_validate(r)


@router.delete("/jerarquias/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_jer(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Jerarquia).where(Jerarquia.id == rec_id)) is None:
        raise not_found("Jerarquía")
    n = await _en_uso(db, Funcionario.jerarquia_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(Jerarquia).where(Jerarquia.id == rec_id))


# ============================================================
# Cargos (tiene descripcion, es_jefatura)
# ============================================================


class CargoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    descripcion: str | None
    es_jefatura: bool
    activo: bool


class CargoCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    es_jefatura: bool = False
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class CargoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    descripcion: str | None = Field(default=None, max_length=255)
    es_jefatura: bool | None = None
    activo: bool | None = None


@router.get("/cargos", response_model=list[CargoOut])
async def listar_cargos(db: DbSession, _: CurrentUser) -> list[CargoOut]:
    rows = (await db.execute(select(Cargo).order_by(Cargo.codigo))).scalars().all()
    return [CargoOut.model_validate(r) for r in rows]


@router.post("/cargos", response_model=CargoOut, status_code=status.HTTP_201_CREATED)
async def crear_cargo(
    request: Request, payload: CargoCreate, db: DbSession, user: CurrentUser
) -> CargoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Cargo(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CargoOut.model_validate(r)


@router.patch("/cargos/{rec_id}", response_model=CargoOut)
async def actualizar_cargo(
    request: Request, rec_id: int, payload: CargoUpdate, db: DbSession, user: CurrentUser
) -> CargoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Cargo).where(Cargo.id == rec_id))
    if r is None:
        raise not_found("Cargo")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CargoOut.model_validate(r)


@router.delete("/cargos/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_cargo(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Cargo).where(Cargo.id == rec_id)) is None:
        raise not_found("Cargo")
    n = await _en_uso(db, Funcionario.cargo_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(Cargo).where(Cargo.id == rec_id))


# ============================================================
# Condiciones (plano)
# ============================================================


@router.get("/condiciones", response_model=list[CatBaseOut])
async def listar_condiciones(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(Condicion).order_by(Condicion.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/condiciones", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_condicion(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Condicion(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/condiciones/{rec_id}", response_model=CatBaseOut)
async def actualizar_condicion(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Condicion).where(Condicion.id == rec_id))
    if r is None:
        raise not_found("Condición")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/condiciones/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_condicion(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Condicion).where(Condicion.id == rec_id)) is None:
        raise not_found("Condición")
    n = await _en_uso(db, Funcionario.condicion_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(Condicion).where(Condicion.id == rec_id))


# ============================================================
# Bancos (tiene swift)
# ============================================================


class BancoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    swift: str | None
    activo: bool


class BancoCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    swift: str | None = Field(default=None, max_length=16)
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class BancoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    swift: str | None = Field(default=None, max_length=16)
    activo: bool | None = None


@router.get("/bancos", response_model=list[BancoOut])
async def listar_bancos(db: DbSession, _: CurrentUser) -> list[BancoOut]:
    rows = (await db.execute(select(Banco).order_by(Banco.codigo))).scalars().all()
    return [BancoOut.model_validate(r) for r in rows]


@router.post("/bancos", response_model=BancoOut, status_code=status.HTTP_201_CREATED)
async def crear_banco(
    request: Request, payload: BancoCreate, db: DbSession, user: CurrentUser
) -> BancoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Banco(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return BancoOut.model_validate(r)


@router.patch("/bancos/{rec_id}", response_model=BancoOut)
async def actualizar_banco(
    request: Request, rec_id: int, payload: BancoUpdate, db: DbSession, user: CurrentUser
) -> BancoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Banco).where(Banco.id == rec_id))
    if r is None:
        raise not_found("Banco")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return BancoOut.model_validate(r)


@router.delete("/bancos/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_banco(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    # Bancos no tienen FK directa desde funcionarios — chequear si hay datos
    # bancarios en otra tabla cuando se agreguen.
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Banco).where(Banco.id == rec_id)) is None:
        raise not_found("Banco")
    try:
        await db.execute(delete(Banco).where(Banco.id == rec_id))
        await db.flush()
    except IntegrityError as e:
        # Si hay tabla con FK que no manejamos arriba, dejamos que Postgres lo bloquee
        raise HTTPException(
            status_code=409,
            detail="El banco tiene referencias en uso. Desactivá en su lugar.",
        ) from e
