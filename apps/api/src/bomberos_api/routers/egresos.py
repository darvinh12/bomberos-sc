from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.egresos import Fallecimiento, Jubilado, SolicitudJubilacion
from bomberos_api.schemas.common import Page
from bomberos_api.schemas.egresos import (
    FallecimientoCreate,
    FallecimientoOut,
    JubiladoCreate,
    JubiladoOut,
    SolicitudJubilacionCreate,
    SolicitudJubilacionOut,
)

router = APIRouter(prefix="/egresos", tags=["egresos"])


@router.get("/jubilados", response_model=Page[JubiladoOut])
async def listar_jubilados(
    db: DbSession,
    _: CurrentUser,
    activo: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[JubiladoOut]:
    stmt = select(Jubilado).order_by(Jubilado.fecha_jubilacion.desc())
    if activo is not None:
        stmt = stmt.where(Jubilado.activo == activo)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[JubiladoOut](
        items=[JubiladoOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/jubilados",
    response_model=JubiladoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def jubilar(
    request: Request, payload: JubiladoCreate, db: DbSession, user: CurrentUser
) -> JubiladoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    j = Jubilado(**payload.model_dump())
    db.add(j)
    # Cierra periodo activo via SP de la BD
    await db.execute(
        text(
            "SELECT personal.fn_registrar_egreso(:f, :fec, 'JUBILACION', :motivo, :res, NULL)"
        ).bindparams(
            f=payload.funcionario_id,
            fec=payload.fecha_jubilacion,
            motivo=f"Jubilación {payload.tipo_jubilacion or ''}".strip(),
            res=payload.resolucion,
        )
    )
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(j)
    return JubiladoOut.model_validate(j)


@router.get("/solicitudes-jubilacion", response_model=Page[SolicitudJubilacionOut])
async def listar_solicitudes(
    db: DbSession,
    _: CurrentUser,
    estatus: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[SolicitudJubilacionOut]:
    stmt = select(SolicitudJubilacion).order_by(SolicitudJubilacion.fecha_solicitud.desc())
    if estatus is not None:
        stmt = stmt.where(SolicitudJubilacion.estatus == estatus)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[SolicitudJubilacionOut](
        items=[SolicitudJubilacionOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/solicitudes-jubilacion",
    response_model=SolicitudJubilacionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_solicitud(
    request: Request,
    payload: SolicitudJubilacionCreate,
    db: DbSession,
    user: CurrentUser,
) -> SolicitudJubilacionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    s = SolicitudJubilacion(**payload.model_dump())
    db.add(s)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(s)
    return SolicitudJubilacionOut.model_validate(s)


@router.post(
    "/fallecimientos",
    response_model=FallecimientoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def registrar_fallecimiento(
    request: Request,
    payload: FallecimientoCreate,
    db: DbSession,
    user: CurrentUser,
) -> FallecimientoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    f = Fallecimiento(**payload.model_dump())
    db.add(f)
    # Cierra periodo activo via SP
    await db.execute(
        text(
            "SELECT personal.fn_registrar_egreso(:f, :fec, 'FALLECIMIENTO', :motivo, NULL, NULL)"
        ).bindparams(
            f=payload.funcionario_id,
            fec=payload.fecha_fallecimiento,
            motivo=payload.causa or "Fallecimiento",
        )
    )
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(f)
    return FallecimientoOut.model_validate(f)
