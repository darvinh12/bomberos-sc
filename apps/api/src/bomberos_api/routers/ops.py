from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, not_found, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.ops import (
    ComisionServicio,
    Falta,
    Guardia,
    GuardiaFuncionario,
    Permiso,
    Vacaciones,
)
from bomberos_api.schemas.common import Page
from bomberos_api.schemas.ops import (
    ComisionCreate,
    ComisionOut,
    FaltaCreate,
    FaltaOut,
    GuardiaCreate,
    GuardiaDetalle,
    GuardiaFuncionarioCreate,
    GuardiaOut,
    PermisoCreate,
    PermisoOut,
    VacacionesCreate,
    VacacionesOut,
    VacacionesUpdate,
)

router = APIRouter(prefix="/ops", tags=["ops"])

# -------- Guardias --------


@router.get("/guardias", response_model=Page[GuardiaOut])
async def listar_guardias(
    db: DbSession,
    _: CurrentUser,
    fecha: date | None = None,
    estacion_id: int | None = None,
    cerradas: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[GuardiaOut]:
    stmt = select(Guardia).order_by(Guardia.fecha.desc(), Guardia.estacion_id)
    if fecha is not None:
        stmt = stmt.where(Guardia.fecha == fecha)
    if estacion_id is not None:
        stmt = stmt.where(Guardia.estacion_id == estacion_id)
    if cerradas is not None:
        stmt = stmt.where(Guardia.cerrada == cerradas)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[GuardiaOut](
        items=[GuardiaOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/guardias/{guardia_id}", response_model=GuardiaDetalle)
async def obtener_guardia(guardia_id: int, db: DbSession, _: CurrentUser) -> GuardiaDetalle:
    from bomberos_api.schemas.ops import GuardiaFuncionarioOut
    g = await db.scalar(select(Guardia).where(Guardia.id == guardia_id))
    if g is None:
        raise not_found("Guardia")
    asignados = (await db.scalars(
        select(GuardiaFuncionario).where(GuardiaFuncionario.guardia_id == guardia_id)
    )).all()
    data = GuardiaDetalle.model_validate(g)
    data.funcionarios_asignados = [GuardiaFuncionarioOut.model_validate(a) for a in asignados]
    return data


@router.post(
    "/guardias",
    response_model=GuardiaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("OPERADOR", "ADMIN"))],
)
async def crear_guardia(
    request: Request, payload: GuardiaCreate, db: DbSession, user: CurrentUser
) -> GuardiaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    g = Guardia(**payload.model_dump())
    db.add(g)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(g)
    return GuardiaOut.model_validate(g)


@router.post(
    "/guardias/{guardia_id}/funcionarios",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("OPERADOR", "ADMIN"))],
)
async def asignar_funcionario(
    request: Request,
    guardia_id: int,
    payload: GuardiaFuncionarioCreate,
    db: DbSession,
    user: CurrentUser,
):
    await set_audit_ctx(db, user.id, client_ip(request))
    g = await db.scalar(select(Guardia).where(Guardia.id == guardia_id))
    if g is None:
        raise not_found("Guardia")
    gf = GuardiaFuncionario(guardia_id=guardia_id, **payload.model_dump())
    db.add(gf)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return {"id": gf.id}


@router.patch(
    "/guardias/{guardia_id}/funcionarios/{gf_id}/asistencia",
    dependencies=[Depends(require_role("OPERADOR", "ADMIN"))],
)
async def marcar_asistencia(
    request: Request,
    guardia_id: int,
    gf_id: int,
    asistio: bool,
    motivo_inasistencia: str | None = None,
    db: DbSession = ...,
    user: CurrentUser = ...,
):
    await set_audit_ctx(db, user.id, client_ip(request))
    gf = await db.scalar(
        select(GuardiaFuncionario).where(
            GuardiaFuncionario.id == gf_id,
            GuardiaFuncionario.guardia_id == guardia_id,
        )
    )
    if gf is None:
        raise not_found("Asignación")
    gf.asistio = asistio
    gf.motivo_inasistencia = motivo_inasistencia
    await db.flush()
    return {"id": gf.id, "asistio": gf.asistio}


@router.post(
    "/guardias/{guardia_id}/cerrar",
    response_model=GuardiaOut,
    dependencies=[Depends(require_role("OPERADOR", "ADMIN"))],
)
async def cerrar_guardia(
    request: Request, guardia_id: int, db: DbSession, user: CurrentUser
) -> GuardiaOut:
    from datetime import UTC, datetime

    await set_audit_ctx(db, user.id, client_ip(request))
    g = await db.scalar(select(Guardia).where(Guardia.id == guardia_id))
    if g is None:
        raise not_found("Guardia")
    if g.cerrada:
        raise HTTPException(status_code=400, detail="Guardia ya cerrada")
    g.cerrada = True
    g.cerrada_at = datetime.now(UTC)
    g.cerrada_por = user.id
    await db.flush()
    return GuardiaOut.model_validate(g)


# -------- Permisos --------


@router.get("/permisos", response_model=Page[PermisoOut])
async def listar_permisos(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    autorizado: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[PermisoOut]:
    stmt = select(Permiso).order_by(Permiso.fecha_inicio.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Permiso.funcionario_id == funcionario_id)
    if autorizado is not None:
        stmt = stmt.where(Permiso.autorizado == autorizado)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[PermisoOut](
        items=[PermisoOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/permisos/{permiso_id}", response_model=PermisoOut)
async def obtener_permiso(permiso_id: int, db: DbSession, _: CurrentUser) -> PermisoOut:
    p = await db.scalar(select(Permiso).where(Permiso.id == permiso_id))
    if p is None:
        raise not_found("Permiso")
    return PermisoOut.model_validate(p)


@router.post(
    "/permisos",
    response_model=PermisoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "SUPERVISOR", "ADMIN"))],
)
async def crear_permiso(
    request: Request, payload: PermisoCreate, db: DbSession, user: CurrentUser
) -> PermisoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    p = Permiso(**payload.model_dump())
    db.add(p)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(p)
    return PermisoOut.model_validate(p)


@router.post(
    "/permisos/{permiso_id}/autorizar",
    response_model=PermisoOut,
    dependencies=[Depends(require_role("SUPERVISOR", "ADMIN", "JEFE_ZONA", "JEFE_ESTACION"))],
)
async def autorizar_permiso(
    request: Request, permiso_id: int, db: DbSession, user: CurrentUser
) -> PermisoOut:
    from datetime import UTC, datetime

    await set_audit_ctx(db, user.id, client_ip(request))
    p = await db.scalar(select(Permiso).where(Permiso.id == permiso_id))
    if p is None:
        raise not_found("Permiso")
    p.autorizado = True
    p.autorizado_por = user.id
    p.autorizado_at = datetime.now(UTC)
    await db.flush()
    return PermisoOut.model_validate(p)


# -------- Vacaciones --------


@router.get("/vacaciones", response_model=Page[VacacionesOut])
async def listar_vacaciones(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    periodo_anio: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[VacacionesOut]:
    stmt = select(Vacaciones).order_by(Vacaciones.fecha_inicio.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Vacaciones.funcionario_id == funcionario_id)
    if periodo_anio is not None:
        stmt = stmt.where(Vacaciones.periodo_anio == periodo_anio)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[VacacionesOut](
        items=[VacacionesOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/vacaciones/{vacaciones_id}", response_model=VacacionesOut)
async def obtener_vacaciones(vacaciones_id: int, db: DbSession, _: CurrentUser) -> VacacionesOut:
    v = await db.scalar(select(Vacaciones).where(Vacaciones.id == vacaciones_id))
    if v is None:
        raise not_found("Vacaciones")
    return VacacionesOut.model_validate(v)


@router.patch(
    "/vacaciones/{vacaciones_id}",
    response_model=VacacionesOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_vacaciones(
    request: Request, vacaciones_id: int, payload: VacacionesUpdate, db: DbSession, user: CurrentUser
) -> VacacionesOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    v = await db.scalar(select(Vacaciones).where(Vacaciones.id == vacaciones_id))
    if v is None:
        raise not_found("Vacaciones")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(v, field, value)
    await db.flush()
    return VacacionesOut.model_validate(v)


@router.post(
    "/vacaciones",
    response_model=VacacionesOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_vacaciones(
    request: Request, payload: VacacionesCreate, db: DbSession, user: CurrentUser
) -> VacacionesOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    v = Vacaciones(**payload.model_dump())
    db.add(v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(v)
    return VacacionesOut.model_validate(v)


# -------- Comisiones --------


@router.get("/comisiones", response_model=Page[ComisionOut])
async def listar_comisiones(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    activo: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[ComisionOut]:
    stmt = select(ComisionServicio).order_by(ComisionServicio.fecha_inicio.desc())
    if funcionario_id is not None:
        stmt = stmt.where(ComisionServicio.funcionario_id == funcionario_id)
    if activo is not None:
        stmt = stmt.where(ComisionServicio.activo == activo)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[ComisionOut](
        items=[ComisionOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/comisiones",
    response_model=ComisionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_comision(
    request: Request, payload: ComisionCreate, db: DbSession, user: CurrentUser
) -> ComisionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    c = ComisionServicio(**payload.model_dump())
    db.add(c)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(c)
    return ComisionOut.model_validate(c)


# -------- Faltas --------


@router.get("/faltas", response_model=Page[FaltaOut])
async def listar_faltas(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[FaltaOut]:
    stmt = select(Falta).order_by(Falta.fecha.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Falta.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[FaltaOut](
        items=[FaltaOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/faltas",
    response_model=FaltaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("INSPECTOR", "ADMIN"))],
)
async def crear_falta(
    request: Request, payload: FaltaCreate, db: DbSession, user: CurrentUser
) -> FaltaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    f = Falta(**payload.model_dump())
    db.add(f)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(f)
    return FaltaOut.model_validate(f)
