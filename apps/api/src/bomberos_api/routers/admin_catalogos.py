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
from sqlalchemy import delete, func, select, text
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
    EstatusFuncionario,
    GrupoSanguineo,
    Idioma,
    InstitucionFormadora,
    Jerarquia,
    NivelEducativo,
    Pais,
    Parentesco,
    SeccionFuncionario,
    TenenciaVivienda,
    TipoLicencia,
    TipoNacionalizacion,
    TipoPersonal,
    TipoVivienda,
)
from bomberos_api.models.direccion import Direccion
from bomberos_api.models.funcionario import Funcionario
from bomberos_api.models.geografia import Estado, Municipio, Parroquia

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


async def _en_uso_direccion(db, fk_col, registro_id: int) -> int:
    """Cuenta cuántas direcciones apuntan a esta fila vía la FK indicada.

    Se usa para catálogos referenciados desde personal.direcciones
    (tipos_vivienda, tenencias_vivienda, geo.estados/municipios/parroquias).
    """
    return (
        await db.scalar(
            select(func.count()).select_from(Direccion).where(fk_col == registro_id)
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


# ============================================================
# Tipos de personal (plano, sin FK desde funcionarios — tipo_personal es string libre)
# ============================================================


@router.get("/tipos-personal", response_model=list[CatBaseOut])
async def listar_tipos_personal(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(TipoPersonal).order_by(TipoPersonal.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/tipos-personal", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_tipo_personal(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = TipoPersonal(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/tipos-personal/{rec_id}", response_model=CatBaseOut)
async def actualizar_tipo_personal(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(TipoPersonal).where(TipoPersonal.id == rec_id))
    if r is None:
        raise not_found("Tipo de personal")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/tipos-personal/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_tipo_personal(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    # `tipo_personal` en funcionarios es string libre, no FK → no chequeamos uso.
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(TipoPersonal).where(TipoPersonal.id == rec_id)) is None:
        raise not_found("Tipo de personal")
    await db.execute(delete(TipoPersonal).where(TipoPersonal.id == rec_id))


# ============================================================
# Estatus de funcionario (plano, sin FK — estatus es string libre)
# ============================================================


@router.get("/estatus-funcionario", response_model=list[CatBaseOut])
async def listar_estatus_funcionario(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (
        await db.execute(select(EstatusFuncionario).order_by(EstatusFuncionario.codigo))
    ).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post(
    "/estatus-funcionario", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED
)
async def crear_estatus_funcionario(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = EstatusFuncionario(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/estatus-funcionario/{rec_id}", response_model=CatBaseOut)
async def actualizar_estatus_funcionario(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(EstatusFuncionario).where(EstatusFuncionario.id == rec_id))
    if r is None:
        raise not_found("Estatus de funcionario")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/estatus-funcionario/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_estatus_funcionario(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    # `estatus` en funcionarios es string libre, no FK → no chequeamos uso.
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(EstatusFuncionario).where(EstatusFuncionario.id == rec_id)) is None:
        raise not_found("Estatus de funcionario")
    await db.execute(delete(EstatusFuncionario).where(EstatusFuncionario.id == rec_id))


# ============================================================
# Instituciones formadoras (plano, FK desde funcionarios.institucion_formadora_id)
# ============================================================


@router.get("/instituciones-formadoras", response_model=list[CatBaseOut])
async def listar_instituciones_formadoras(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (
        await db.execute(select(InstitucionFormadora).order_by(InstitucionFormadora.codigo))
    ).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post(
    "/instituciones-formadoras", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED
)
async def crear_institucion_formadora(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = InstitucionFormadora(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/instituciones-formadoras/{rec_id}", response_model=CatBaseOut)
async def actualizar_institucion_formadora(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(InstitucionFormadora).where(InstitucionFormadora.id == rec_id))
    if r is None:
        raise not_found("Institución formadora")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/instituciones-formadoras/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_institucion_formadora(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if (
        await db.scalar(select(InstitucionFormadora).where(InstitucionFormadora.id == rec_id))
        is None
    ):
        raise not_found("Institución formadora")
    n = await _en_uso(db, Funcionario.institucion_formadora_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(InstitucionFormadora).where(InstitucionFormadora.id == rec_id))


# ============================================================
# Tipos de vivienda (plano, FK desde personal.direcciones.tipo_vivienda_id)
# ============================================================


@router.get("/tipos-vivienda", response_model=list[CatBaseOut])
async def listar_tipos_vivienda(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(TipoVivienda).order_by(TipoVivienda.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/tipos-vivienda", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_tipo_vivienda(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = TipoVivienda(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/tipos-vivienda/{rec_id}", response_model=CatBaseOut)
async def actualizar_tipo_vivienda(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(TipoVivienda).where(TipoVivienda.id == rec_id))
    if r is None:
        raise not_found("Tipo de vivienda")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/tipos-vivienda/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_tipo_vivienda(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(TipoVivienda).where(TipoVivienda.id == rec_id)) is None:
        raise not_found("Tipo de vivienda")
    n = await _en_uso_direccion(db, Direccion.tipo_vivienda_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} dirección(es). Desactivá en su lugar.",
        )
    await db.execute(delete(TipoVivienda).where(TipoVivienda.id == rec_id))


# ============================================================
# Tenencias de vivienda (plano, FK desde personal.direcciones.tenencia_id)
# ============================================================


@router.get("/tenencias-vivienda", response_model=list[CatBaseOut])
async def listar_tenencias_vivienda(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (
        await db.execute(select(TenenciaVivienda).order_by(TenenciaVivienda.codigo))
    ).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post(
    "/tenencias-vivienda", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED
)
async def crear_tenencia_vivienda(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = TenenciaVivienda(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/tenencias-vivienda/{rec_id}", response_model=CatBaseOut)
async def actualizar_tenencia_vivienda(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(TenenciaVivienda).where(TenenciaVivienda.id == rec_id))
    if r is None:
        raise not_found("Tenencia de vivienda")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/tenencias-vivienda/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_tenencia_vivienda(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(TenenciaVivienda).where(TenenciaVivienda.id == rec_id)) is None:
        raise not_found("Tenencia de vivienda")
    n = await _en_uso_direccion(db, Direccion.tenencia_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} dirección(es). Desactivá en su lugar.",
        )
    await db.execute(delete(TenenciaVivienda).where(TenenciaVivienda.id == rec_id))


# ============================================================
# Geografía VE — schema `geo` (fuente de verdad única)
#
# Las tablas geo.estados / geo.municipios / geo.parroquias NO tienen
# columna `activo`: la división político-territorial existe o no existe.
# Para mantener la simetría con el resto de catálogos del admin UI
# sintetizamos `activo=true` en las respuestas (read-only desde frontend).
#
# El check de "en uso" se hace contra personal.direcciones, que es donde
# realmente se referencia la geografía (el funcionario ya no la guarda
# como columnas planas).
# ============================================================


class _GeoCatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    activo: bool = True


class _EstadoOut(_GeoCatOut):
    capital: str | None = None


class _EstadoCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=16)
    nombre: str = Field(min_length=2, max_length=64)
    capital: str | None = Field(default=None, max_length=120)

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class _EstadoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=64)
    capital: str | None = Field(default=None, max_length=120)


class _MunicipioOut(_GeoCatOut):
    estado_id: int


class _MunicipioCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=64)
    nombre: str = Field(min_length=2, max_length=120)
    estado_id: int

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class _MunicipioUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    estado_id: int | None = None


class _ParroquiaOut(_GeoCatOut):
    municipio_id: int


class _ParroquiaCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=64)
    nombre: str = Field(min_length=2, max_length=120)
    municipio_id: int

    @field_validator("codigo")
    @classmethod
    def cv(cls, v: str) -> str:
        return _validar_codigo(v)


class _ParroquiaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    municipio_id: int | None = None


# ----- Estados -----

@router.get("/estados", response_model=list[_EstadoOut])
async def listar_estados(db: DbSession, _: CurrentUser) -> list[_EstadoOut]:
    rows = (await db.execute(select(Estado).order_by(Estado.codigo))).scalars().all()
    return [
        _EstadoOut(
            id=r.id, codigo=r.codigo, nombre=r.nombre, capital=r.capital, activo=True
        )
        for r in rows
    ]


@router.post("/estados", response_model=_EstadoOut, status_code=status.HTTP_201_CREATED)
async def crear_estado(
    request: Request, payload: _EstadoCreate, db: DbSession, user: CurrentUser
) -> _EstadoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Estado(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _EstadoOut(
        id=r.id, codigo=r.codigo, nombre=r.nombre, capital=r.capital, activo=True
    )


@router.patch("/estados/{rec_id}", response_model=_EstadoOut)
async def actualizar_estado(
    request: Request, rec_id: int, payload: _EstadoUpdate, db: DbSession, user: CurrentUser
) -> _EstadoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Estado).where(Estado.id == rec_id))
    if r is None:
        raise not_found("Estado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return _EstadoOut(
        id=r.id, codigo=r.codigo, nombre=r.nombre, capital=r.capital, activo=True
    )


@router.delete("/estados/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_estado(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Estado).where(Estado.id == rec_id)) is None:
        raise not_found("Estado")
    n = await _en_uso_direccion(db, Direccion.estado_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} dirección(es). No se puede borrar.",
        )
    try:
        await db.execute(delete(Estado).where(Estado.id == rec_id))
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="El estado tiene municipios u otras referencias. No se puede borrar.",
        ) from e


# ----- Municipios -----

@router.get("/municipios", response_model=list[_MunicipioOut])
async def listar_municipios(
    db: DbSession, _: CurrentUser, estado_id: int | None = None
) -> list[_MunicipioOut]:
    stmt = select(Municipio)
    if estado_id is not None:
        stmt = stmt.where(Municipio.estado_id == estado_id)
    rows = (await db.execute(stmt.order_by(Municipio.codigo))).scalars().all()
    return [
        _MunicipioOut(
            id=r.id, codigo=r.codigo, nombre=r.nombre, estado_id=r.estado_id, activo=True
        )
        for r in rows
    ]


@router.post(
    "/municipios", response_model=_MunicipioOut, status_code=status.HTTP_201_CREATED
)
async def crear_municipio(
    request: Request, payload: _MunicipioCreate, db: DbSession, user: CurrentUser
) -> _MunicipioOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Municipio(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _MunicipioOut(
        id=r.id, codigo=r.codigo, nombre=r.nombre, estado_id=r.estado_id, activo=True
    )


@router.patch("/municipios/{rec_id}", response_model=_MunicipioOut)
async def actualizar_municipio(
    request: Request, rec_id: int, payload: _MunicipioUpdate, db: DbSession, user: CurrentUser
) -> _MunicipioOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Municipio).where(Municipio.id == rec_id))
    if r is None:
        raise not_found("Municipio")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return _MunicipioOut(
        id=r.id, codigo=r.codigo, nombre=r.nombre, estado_id=r.estado_id, activo=True
    )


@router.delete("/municipios/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_municipio(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Municipio).where(Municipio.id == rec_id)) is None:
        raise not_found("Municipio")
    n = await _en_uso_direccion(db, Direccion.municipio_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} dirección(es). No se puede borrar.",
        )
    try:
        await db.execute(delete(Municipio).where(Municipio.id == rec_id))
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="El municipio tiene parroquias u otras referencias. No se puede borrar.",
        ) from e


# ----- Parroquias -----

@router.get("/parroquias", response_model=list[_ParroquiaOut])
async def listar_parroquias(
    db: DbSession, _: CurrentUser, municipio_id: int | None = None
) -> list[_ParroquiaOut]:
    stmt = select(Parroquia)
    if municipio_id is not None:
        stmt = stmt.where(Parroquia.municipio_id == municipio_id)
    rows = (await db.execute(stmt.order_by(Parroquia.codigo))).scalars().all()
    return [
        _ParroquiaOut(
            id=r.id,
            codigo=r.codigo,
            nombre=r.nombre,
            municipio_id=r.municipio_id,
            activo=True,
        )
        for r in rows
    ]


@router.post(
    "/parroquias", response_model=_ParroquiaOut, status_code=status.HTTP_201_CREATED
)
async def crear_parroquia(
    request: Request, payload: _ParroquiaCreate, db: DbSession, user: CurrentUser
) -> _ParroquiaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Parroquia(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _ParroquiaOut(
        id=r.id,
        codigo=r.codigo,
        nombre=r.nombre,
        municipio_id=r.municipio_id,
        activo=True,
    )


@router.patch("/parroquias/{rec_id}", response_model=_ParroquiaOut)
async def actualizar_parroquia(
    request: Request, rec_id: int, payload: _ParroquiaUpdate, db: DbSession, user: CurrentUser
) -> _ParroquiaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Parroquia).where(Parroquia.id == rec_id))
    if r is None:
        raise not_found("Parroquia")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return _ParroquiaOut(
        id=r.id,
        codigo=r.codigo,
        nombre=r.nombre,
        municipio_id=r.municipio_id,
        activo=True,
    )


@router.delete("/parroquias/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_parroquia(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Parroquia).where(Parroquia.id == rec_id)) is None:
        raise not_found("Parroquia")
    n = await _en_uso_direccion(db, Direccion.parroquia_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} dirección(es). No se puede borrar.",
        )
    await db.execute(delete(Parroquia).where(Parroquia.id == rec_id))


# =============================================================================
# Mini-sprint: 6 catálogos nuevos (parentescos, tipos-licencia,
# tipos-nacionalizacion, idiomas, paises, secciones-funcionario)
#
# Todos siguen el patrón CatBase (codigo, nombre, activo). Para borrar:
#  - Parentescos / licencia / nacionalización / país / sección: chequeo de FK
#    contra Funcionario (la columna *_id). Si está en uso → 409.
#  - Idiomas: chequeo contra la tabla pivote personal.funcionario_idiomas.
# =============================================================================


async def _en_uso_pivote_idiomas(db, idioma_id: int) -> int:
    """Cuenta funcionarios que tienen este idioma asignado (pivote)."""
    return (
        await db.scalar(
            text("SELECT COUNT(*) FROM personal.funcionario_idiomas WHERE idioma_id = :id")
            .bindparams(id=idioma_id)
        )
    ) or 0


# ---------- Parentescos ----------


@router.get("/parentescos", response_model=list[CatBaseOut])
async def listar_parentescos(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(Parentesco).order_by(Parentesco.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/parentescos", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_parentesco(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Parentesco(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/parentescos/{rec_id}", response_model=CatBaseOut)
async def actualizar_parentesco(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Parentesco).where(Parentesco.id == rec_id))
    if r is None:
        raise not_found("Parentesco")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/parentescos/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_parentesco(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Parentesco).where(Parentesco.id == rec_id)) is None:
        raise not_found("Parentesco")
    n = await _en_uso(db, Funcionario.parentesco_contacto_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    try:
        await db.execute(delete(Parentesco).where(Parentesco.id == rec_id))
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="El parentesco tiene referencias en uso (carga familiar). Desactivá en su lugar.",
        ) from e


# ---------- Tipos de licencia ----------


@router.get("/tipos-licencia", response_model=list[CatBaseOut])
async def listar_tipos_licencia(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(TipoLicencia).order_by(TipoLicencia.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/tipos-licencia", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_tipo_licencia(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = TipoLicencia(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/tipos-licencia/{rec_id}", response_model=CatBaseOut)
async def actualizar_tipo_licencia(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(TipoLicencia).where(TipoLicencia.id == rec_id))
    if r is None:
        raise not_found("Tipo de licencia")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/tipos-licencia/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_tipo_licencia(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    # FK desde funcionarios.licencia_conducir_id y desde
    # personal.licencias_conducir.tipo_licencia_id (renovaciones).
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(TipoLicencia).where(TipoLicencia.id == rec_id)) is None:
        raise not_found("Tipo de licencia")
    n = await _en_uso(db, Funcionario.licencia_conducir_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    try:
        await db.execute(delete(TipoLicencia).where(TipoLicencia.id == rec_id))
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=409,
            detail="El tipo de licencia tiene renovaciones registradas. Desactivá en su lugar.",
        ) from e


# ---------- Tipos de nacionalización ----------


@router.get("/tipos-nacionalizacion", response_model=list[CatBaseOut])
async def listar_tipos_nacionalizacion(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (
        await db.execute(select(TipoNacionalizacion).order_by(TipoNacionalizacion.codigo))
    ).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post(
    "/tipos-nacionalizacion", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED
)
async def crear_tipo_nacionalizacion(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = TipoNacionalizacion(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/tipos-nacionalizacion/{rec_id}", response_model=CatBaseOut)
async def actualizar_tipo_nacionalizacion(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(TipoNacionalizacion).where(TipoNacionalizacion.id == rec_id))
    if r is None:
        raise not_found("Tipo de nacionalización")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/tipos-nacionalizacion/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_tipo_nacionalizacion(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if (
        await db.scalar(select(TipoNacionalizacion).where(TipoNacionalizacion.id == rec_id))
        is None
    ):
        raise not_found("Tipo de nacionalización")
    n = await _en_uso(db, Funcionario.tipo_nacionalizacion_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(TipoNacionalizacion).where(TipoNacionalizacion.id == rec_id))


# ---------- Idiomas (multi-select vía pivote) ----------


@router.get("/idiomas", response_model=list[CatBaseOut])
async def listar_idiomas(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(Idioma).order_by(Idioma.codigo))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/idiomas", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_idioma(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Idioma(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/idiomas/{rec_id}", response_model=CatBaseOut)
async def actualizar_idioma(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Idioma).where(Idioma.id == rec_id))
    if r is None:
        raise not_found("Idioma")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/idiomas/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_idioma(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Idioma).where(Idioma.id == rec_id)) is None:
        raise not_found("Idioma")
    n = await _en_uso_pivote_idiomas(db, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"Asignado a {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(Idioma).where(Idioma.id == rec_id))


# ---------- Países ----------


@router.get("/paises", response_model=list[CatBaseOut])
async def listar_paises(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (await db.execute(select(Pais).order_by(Pais.nombre))).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post("/paises", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED)
async def crear_pais(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Pais(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/paises/{rec_id}", response_model=CatBaseOut)
async def actualizar_pais(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Pais).where(Pais.id == rec_id))
    if r is None:
        raise not_found("País")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/paises/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_pais(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    # Dos columnas FK posibles: pais_origen_id y pais_nacimiento_id
    await set_audit_ctx(db, user.id, client_ip(request))
    if await db.scalar(select(Pais).where(Pais.id == rec_id)) is None:
        raise not_found("País")
    n_origen = await _en_uso(db, Funcionario.pais_origen_id, rec_id)
    n_nacimiento = await _en_uso(db, Funcionario.pais_nacimiento_id, rec_id)
    total = n_origen + n_nacimiento
    if total:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {total} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(Pais).where(Pais.id == rec_id))


# ---------- Secciones de funcionario ----------


@router.get("/secciones-funcionario", response_model=list[CatBaseOut])
async def listar_secciones_funcionario(db: DbSession, _: CurrentUser) -> list[CatBaseOut]:
    rows = (
        await db.execute(select(SeccionFuncionario).order_by(SeccionFuncionario.codigo))
    ).scalars().all()
    return [CatBaseOut.model_validate(r) for r in rows]


@router.post(
    "/secciones-funcionario", response_model=CatBaseOut, status_code=status.HTTP_201_CREATED
)
async def crear_seccion_funcionario(
    request: Request, payload: CatBaseCreate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = SeccionFuncionario(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return CatBaseOut.model_validate(r)


@router.patch("/secciones-funcionario/{rec_id}", response_model=CatBaseOut)
async def actualizar_seccion_funcionario(
    request: Request, rec_id: int, payload: CatBaseUpdate, db: DbSession, user: CurrentUser
) -> CatBaseOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(SeccionFuncionario).where(SeccionFuncionario.id == rec_id))
    if r is None:
        raise not_found("Sección de funcionario")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.flush()
    return CatBaseOut.model_validate(r)


@router.delete("/secciones-funcionario/{rec_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar_seccion_funcionario(
    request: Request, rec_id: int, db: DbSession, user: CurrentUser
) -> None:
    await set_audit_ctx(db, user.id, client_ip(request))
    if (
        await db.scalar(select(SeccionFuncionario).where(SeccionFuncionario.id == rec_id))
        is None
    ):
        raise not_found("Sección de funcionario")
    n = await _en_uso(db, Funcionario.seccion_id, rec_id)
    if n:
        raise HTTPException(
            status_code=409,
            detail=f"En uso por {n} funcionario(s). Desactivá en su lugar.",
        )
    await db.execute(delete(SeccionFuncionario).where(SeccionFuncionario.id == rec_id))
