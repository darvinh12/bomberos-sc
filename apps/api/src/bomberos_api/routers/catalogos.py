from fastapi import APIRouter
from sqlalchemy import select

from bomberos_api.core.deps import CurrentUser, DbSession
from bomberos_api.models.catalogos import (
    Banco,
    Cargo,
    Condicion,
    EstadoCivil,
    Especialidad,
    GrupoSanguineo,
    Jerarquia,
    NivelEducativo,
)
from bomberos_api.models.org import Area, Dependencia, Division, Estacion, Zona
from bomberos_api.schemas.common import ORMBase

router = APIRouter(prefix="/catalogos", tags=["catalogos"])


class _CatalogoOut(ORMBase):
    id: int
    codigo: str
    nombre: str
    activo: bool


class _JerarquiaOut(_CatalogoOut):
    nombre_corto: str | None
    orden: int
    es_oficial: bool
    es_tropa: bool
    es_estado_mayor: bool


class _EstacionOut(_CatalogoOut):
    zona_id: int


@router.get("/jerarquias", response_model=list[_JerarquiaOut])
async def jerarquias(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(Jerarquia).where(Jerarquia.activo).order_by(Jerarquia.orden)
    )
    return [_JerarquiaOut.model_validate(x) for x in res.scalars().all()]


@router.get("/cargos", response_model=list[_CatalogoOut])
async def cargos(db: DbSession, _: CurrentUser):
    res = await db.execute(select(Cargo).where(Cargo.activo).order_by(Cargo.nombre))
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/condiciones", response_model=list[_CatalogoOut])
async def condiciones(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(Condicion).where(Condicion.activo).order_by(Condicion.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/niveles-educativos", response_model=list[_CatalogoOut])
async def niveles(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(NivelEducativo)
        .where(NivelEducativo.activo)
        .order_by(NivelEducativo.orden)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/especialidades", response_model=list[_CatalogoOut])
async def especialidades(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(Especialidad).where(Especialidad.activo).order_by(Especialidad.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/estados-civiles", response_model=list[_CatalogoOut])
async def estados_civiles(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(EstadoCivil).where(EstadoCivil.activo).order_by(EstadoCivil.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/grupos-sanguineos", response_model=list[_CatalogoOut])
async def grupos_sanguineos(db: DbSession, _: CurrentUser):
    res = await db.execute(select(GrupoSanguineo).order_by(GrupoSanguineo.codigo))
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/bancos", response_model=list[_CatalogoOut])
async def bancos(db: DbSession, _: CurrentUser):
    res = await db.execute(select(Banco).where(Banco.activo).order_by(Banco.nombre))
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/zonas", response_model=list[_CatalogoOut])
async def zonas(db: DbSession, _: CurrentUser):
    res = await db.execute(select(Zona).where(Zona.activo).order_by(Zona.nombre))
    return [
        _CatalogoOut(id=x.id, codigo=x.codigo, nombre=x.nombre, activo=x.activo)
        for x in res.scalars().all()
    ]


@router.get("/estaciones", response_model=list[_EstacionOut])
async def estaciones(db: DbSession, _: CurrentUser, zona_id: int | None = None):
    stmt = select(Estacion).where(Estacion.activa)
    if zona_id is not None:
        stmt = stmt.where(Estacion.zona_id == zona_id)
    res = await db.execute(stmt.order_by(Estacion.nombre))
    return [
        _EstacionOut(
            id=x.id, codigo=x.codigo, nombre=x.nombre, activo=x.activa, zona_id=x.zona_id
        )
        for x in res.scalars().all()
    ]


@router.get("/divisiones", response_model=list[_CatalogoOut])
async def divisiones(db: DbSession, _: CurrentUser):
    res = await db.execute(select(Division).where(Division.activo).order_by(Division.nombre))
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/areas", response_model=list[_CatalogoOut])
async def areas(db: DbSession, _: CurrentUser):
    res = await db.execute(select(Area).where(Area.activo).order_by(Area.nombre))
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/dependencias", response_model=list[_CatalogoOut])
async def dependencias(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(Dependencia).where(Dependencia.activo).order_by(Dependencia.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]
