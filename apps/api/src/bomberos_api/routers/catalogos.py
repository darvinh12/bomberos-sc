from fastapi import APIRouter
from sqlalchemy import select

from bomberos_api.core.deps import CurrentUser, DbSession
from bomberos_api.models.catalogos import (
    Banco,
    Cargo,
    Condicion,
    EstadoCivil,
    Especialidad,
    EstatusFuncionario,
    GrupoSanguineo,
    InstitucionFormadora,
    Jerarquia,
    NivelEducativo,
    TenenciaVivienda,
    TipoPersonal,
    TipoVivienda,
)
from bomberos_api.models.geografia import Estado, Municipio, Parroquia
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


class _EstadoOut(_CatalogoOut):
    """Estados de geo.* — no tienen `activo` real; lo sintetizamos como True
    para mantener la simetría con el resto del catálogo del frontend."""

    capital: str | None = None


class _MunicipioOut(_CatalogoOut):
    estado_id: int


class _ParroquiaOut(_CatalogoOut):
    municipio_id: int


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


@router.get("/tipos-personal", response_model=list[_CatalogoOut])
async def tipos_personal(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(TipoPersonal).where(TipoPersonal.activo).order_by(TipoPersonal.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/estatus-funcionario", response_model=list[_CatalogoOut])
async def estatus_funcionario(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(EstatusFuncionario)
        .where(EstatusFuncionario.activo)
        .order_by(EstatusFuncionario.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/instituciones-formadoras", response_model=list[_CatalogoOut])
async def instituciones_formadoras(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(InstitucionFormadora)
        .where(InstitucionFormadora.activo)
        .order_by(InstitucionFormadora.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/tipos-vivienda", response_model=list[_CatalogoOut])
async def tipos_vivienda(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(TipoVivienda).where(TipoVivienda.activo).order_by(TipoVivienda.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/tenencias-vivienda", response_model=list[_CatalogoOut])
async def tenencias_vivienda(db: DbSession, _: CurrentUser):
    res = await db.execute(
        select(TenenciaVivienda)
        .where(TenenciaVivienda.activo)
        .order_by(TenenciaVivienda.nombre)
    )
    return [_CatalogoOut.model_validate(x) for x in res.scalars().all()]


@router.get("/estados", response_model=list[_EstadoOut])
async def estados(db: DbSession, _: CurrentUser):
    res = await db.execute(select(Estado).order_by(Estado.nombre))
    return [
        _EstadoOut(
            id=x.id, codigo=x.codigo, nombre=x.nombre, activo=True, capital=x.capital
        )
        for x in res.scalars().all()
    ]


@router.get("/municipios", response_model=list[_MunicipioOut])
async def municipios(db: DbSession, _: CurrentUser, estado_id: int | None = None):
    stmt = select(Municipio)
    if estado_id is not None:
        stmt = stmt.where(Municipio.estado_id == estado_id)
    res = await db.execute(stmt.order_by(Municipio.nombre))
    return [
        _MunicipioOut(
            id=x.id,
            codigo=x.codigo,
            nombre=x.nombre,
            activo=True,
            estado_id=x.estado_id,
        )
        for x in res.scalars().all()
    ]


@router.get("/parroquias", response_model=list[_ParroquiaOut])
async def parroquias(db: DbSession, _: CurrentUser, municipio_id: int | None = None):
    stmt = select(Parroquia)
    if municipio_id is not None:
        stmt = stmt.where(Parroquia.municipio_id == municipio_id)
    res = await db.execute(stmt.order_by(Parroquia.nombre))
    return [
        _ParroquiaOut(
            id=x.id,
            codigo=x.codigo,
            nombre=x.nombre,
            activo=True,
            municipio_id=x.municipio_id,
        )
        for x in res.scalars().all()
    ]
