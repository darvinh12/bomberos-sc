from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, not_found, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.beneficios import Ayuda, Entrega
from bomberos_api.schemas.beneficios import (
    AyudaCreate,
    AyudaOut,
    AyudaUpdate,
    EntregaCreate,
    EntregaOut,
)
from bomberos_api.schemas.common import Page

router = APIRouter(prefix="/beneficios", tags=["beneficios"])


@router.get("/ayudas", response_model=Page[AyudaOut])
async def listar_ayudas(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    estatus: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[AyudaOut]:
    stmt = select(Ayuda).order_by(Ayuda.fecha_solicitud.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Ayuda.funcionario_id == funcionario_id)
    if estatus is not None:
        stmt = stmt.where(Ayuda.estatus == estatus)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[AyudaOut](
        items=[AyudaOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/ayudas",
    response_model=AyudaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_ayuda(
    request: Request, payload: AyudaCreate, db: DbSession, user: CurrentUser
) -> AyudaOut:
    from datetime import date as _d
    await set_audit_ctx(db, user.id, client_ip(request))
    a = Ayuda(**payload.model_dump(), fecha_solicitud=_d.today(), created_by=user.id)
    db.add(a)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(a)
    return AyudaOut.model_validate(a)


@router.patch(
    "/ayudas/{ayuda_id}",
    response_model=AyudaOut,
    dependencies=[Depends(require_role("SUPERVISOR", "ADMIN"))],
)
async def actualizar_ayuda(
    request: Request, ayuda_id: int, payload: AyudaUpdate, db: DbSession, user: CurrentUser
) -> AyudaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    a = await db.scalar(select(Ayuda).where(Ayuda.id == ayuda_id))
    if a is None:
        raise not_found("Ayuda")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    a.aprobado_por = user.id if payload.estatus in {"APROBADO", "PAGADO"} else a.aprobado_por
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return AyudaOut.model_validate(a)


@router.get("/entregas", response_model=Page[EntregaOut])
async def listar_entregas(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    tipo_beneficio_id: int | None = None,
    periodo: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[EntregaOut]:
    stmt = select(Entrega).order_by(Entrega.fecha_entrega.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Entrega.funcionario_id == funcionario_id)
    if tipo_beneficio_id is not None:
        stmt = stmt.where(Entrega.tipo_beneficio_id == tipo_beneficio_id)
    if periodo is not None:
        stmt = stmt.where(Entrega.periodo == periodo)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[EntregaOut](
        items=[EntregaOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/entregas",
    response_model=EntregaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_entrega(
    request: Request, payload: EntregaCreate, db: DbSession, user: CurrentUser
) -> EntregaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    e = Entrega(**payload.model_dump())
    db.add(e)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise integrity_409(exc) from exc
    await db.refresh(e)
    return EntregaOut.model_validate(e)
