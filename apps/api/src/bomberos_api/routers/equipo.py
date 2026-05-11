from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, not_found, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.equipo import (
    ProteccionAsignacion,
    ProteccionInventario,
    Radio,
    RadioAsignacion,
)
from bomberos_api.schemas.common import Page
from bomberos_api.schemas.equipo import (
    ProteccionAsignacionCreate,
    ProteccionAsignacionOut,
    ProteccionInventarioCreate,
    ProteccionInventarioOut,
    RadioAsignacionCreate,
    RadioAsignacionOut,
    RadioCreate,
    RadioOut,
)

router = APIRouter(prefix="/equipo", tags=["equipo"])


# -------- Protección: inventario --------


@router.get("/proteccion/inventario", response_model=Page[ProteccionInventarioOut])
async def listar_inv_proteccion(
    db: DbSession,
    _: CurrentUser,
    tipo_id: int | None = None,
    estatus: str | None = None,
    estacion_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[ProteccionInventarioOut]:
    stmt = select(ProteccionInventario).order_by(ProteccionInventario.id.desc())
    if tipo_id is not None:
        stmt = stmt.where(ProteccionInventario.tipo_id == tipo_id)
    if estatus is not None:
        stmt = stmt.where(ProteccionInventario.estatus == estatus)
    if estacion_id is not None:
        stmt = stmt.where(ProteccionInventario.estacion_id == estacion_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[ProteccionInventarioOut](
        items=[ProteccionInventarioOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/proteccion/inventario",
    response_model=ProteccionInventarioOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("LOGISTICA", "ADMIN"))],
)
async def crear_inv_proteccion(
    request: Request, payload: ProteccionInventarioCreate, db: DbSession, user: CurrentUser
) -> ProteccionInventarioOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    i = ProteccionInventario(**payload.model_dump())
    db.add(i)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(i)
    return ProteccionInventarioOut.model_validate(i)


# -------- Protección: asignaciones --------


@router.get("/proteccion/asignaciones", response_model=Page[ProteccionAsignacionOut])
async def listar_asignaciones_proteccion(
    db: DbSession,
    _: CurrentUser,
    devuelto: bool | None = None,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[ProteccionAsignacionOut]:
    stmt = select(ProteccionAsignacion).order_by(ProteccionAsignacion.id.desc())
    if devuelto is not None:
        stmt = stmt.where(ProteccionAsignacion.devuelto == devuelto)
    if funcionario_id is not None:
        stmt = stmt.where(ProteccionAsignacion.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[ProteccionAsignacionOut](
        items=[ProteccionAsignacionOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/proteccion/asignaciones",
    response_model=ProteccionAsignacionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("LOGISTICA", "ADMIN"))],
)
async def asignar_proteccion(
    request: Request, payload: ProteccionAsignacionCreate, db: DbSession, user: CurrentUser
) -> ProteccionAsignacionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    inv = await db.scalar(
        select(ProteccionInventario).where(ProteccionInventario.id == payload.inventario_id)
    )
    if inv is None:
        raise not_found("Inventario")
    if inv.estatus != "DISPONIBLE":
        raise HTTPException(status_code=409, detail=f"Inventario en estado {inv.estatus}")
    a = ProteccionAsignacion(**payload.model_dump())
    inv.estatus = "ASIGNADO"
    db.add(a)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(a)
    return ProteccionAsignacionOut.model_validate(a)


@router.post(
    "/proteccion/asignaciones/{asignacion_id}/devolver",
    response_model=ProteccionAsignacionOut,
    dependencies=[Depends(require_role("LOGISTICA", "ADMIN"))],
)
async def devolver_proteccion(
    request: Request,
    asignacion_id: int,
    estado_devolucion: str | None = None,
    fecha_devolucion: date | None = None,
    db: DbSession = ...,
    user: CurrentUser = ...,
):
    from datetime import date as _d
    await set_audit_ctx(db, user.id, client_ip(request))
    a = await db.scalar(
        select(ProteccionAsignacion).where(ProteccionAsignacion.id == asignacion_id)
    )
    if a is None:
        raise not_found("Asignación")
    if a.devuelto:
        raise HTTPException(status_code=400, detail="Ya estaba devuelto")
    a.fecha_devolucion = fecha_devolucion or _d.today()
    a.estado_devolucion = estado_devolucion
    a.devuelto = True
    inv = await db.scalar(
        select(ProteccionInventario).where(ProteccionInventario.id == a.inventario_id)
    )
    if inv:
        inv.estatus = "DISPONIBLE"
    await db.flush()
    return ProteccionAsignacionOut.model_validate(a)


# -------- Radios --------


@router.get("/radios", response_model=Page[RadioOut])
async def listar_radios(
    db: DbSession,
    _: CurrentUser,
    estatus: str | None = None,
    estacion_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[RadioOut]:
    stmt = select(Radio).order_by(Radio.id)
    if estatus is not None:
        stmt = stmt.where(Radio.estatus == estatus)
    if estacion_id is not None:
        stmt = stmt.where(Radio.estacion_id == estacion_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[RadioOut](
        items=[RadioOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/radios",
    response_model=RadioOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("LOGISTICA", "ADMIN"))],
)
async def crear_radio(
    request: Request, payload: RadioCreate, db: DbSession, user: CurrentUser
) -> RadioOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Radio(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(r)
    return RadioOut.model_validate(r)


@router.post(
    "/radios/asignaciones",
    response_model=RadioAsignacionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("LOGISTICA", "ADMIN"))],
)
async def asignar_radio(
    request: Request, payload: RadioAsignacionCreate, db: DbSession, user: CurrentUser
) -> RadioAsignacionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Radio).where(Radio.id == payload.radio_id))
    if r is None:
        raise not_found("Radio")
    if r.estatus != "DISPONIBLE":
        raise HTTPException(status_code=409, detail=f"Radio en estado {r.estatus}")
    a = RadioAsignacion(**payload.model_dump())
    r.estatus = "ASIGNADO"
    db.add(a)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(a)
    return RadioAsignacionOut.model_validate(a)
