from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, not_found, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.salud import EvaluacionFisica, Lesion, Reposo
from bomberos_api.schemas.common import Page
from bomberos_api.schemas.salud import (
    EvaluacionFisicaCreate,
    EvaluacionFisicaOut,
    LesionCreate,
    LesionOut,
    ReposoCreate,
    ReposoOut,
    ReposoUpdate,
)

router = APIRouter(prefix="/salud", tags=["salud"])

# ---------------- Reposos ----------------


@router.get("/reposos", response_model=Page[ReposoOut])
async def listar_reposos(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    activos: bool = Query(default=False, description="Solo reposos vigentes hoy"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[ReposoOut]:
    stmt = select(Reposo).order_by(Reposo.fecha_inicio.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Reposo.funcionario_id == funcionario_id)
    if activos:
        from sqlalchemy import func as sa_func

        stmt = stmt.where(~Reposo.anulado, Reposo.fecha_fin >= sa_func.current_date())
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[ReposoOut](
        items=[ReposoOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/reposos/{reposo_id}", response_model=ReposoOut)
async def obtener_reposo(reposo_id: int, db: DbSession, _: CurrentUser) -> ReposoOut:
    r = await db.scalar(select(Reposo).where(Reposo.id == reposo_id))
    if r is None:
        raise not_found("Reposo")
    return ReposoOut.model_validate(r)


@router.post(
    "/reposos",
    response_model=ReposoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("MEDICO", "RRHH", "ADMIN"))],
)
async def crear_reposo(
    request: Request, payload: ReposoCreate, db: DbSession, user: CurrentUser
) -> ReposoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Reposo(**payload.model_dump(), created_by=user.id)
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(r)
    return ReposoOut.model_validate(r)


@router.patch(
    "/reposos/{reposo_id}",
    response_model=ReposoOut,
    dependencies=[Depends(require_role("MEDICO", "RRHH", "ADMIN"))],
)
async def actualizar_reposo(
    request: Request,
    reposo_id: int,
    payload: ReposoUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ReposoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = await db.scalar(select(Reposo).where(Reposo.id == reposo_id))
    if r is None:
        raise not_found("Reposo")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return ReposoOut.model_validate(r)


# ---------------- Lesiones ----------------


@router.get("/lesiones", response_model=Page[LesionOut])
async def listar_lesiones(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[LesionOut]:
    stmt = select(Lesion).order_by(Lesion.fecha_evento.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Lesion.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[LesionOut](
        items=[LesionOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/lesiones",
    response_model=LesionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("MEDICO", "RRHH", "ADMIN"))],
)
async def crear_lesion(
    request: Request, payload: LesionCreate, db: DbSession, user: CurrentUser
) -> LesionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    l = Lesion(**payload.model_dump())
    db.add(l)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(l)
    return LesionOut.model_validate(l)


# ---------------- Evaluación física ----------------


@router.get("/evaluacion-fisica", response_model=Page[EvaluacionFisicaOut])
async def listar_evf(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[EvaluacionFisicaOut]:
    stmt = select(EvaluacionFisica).order_by(EvaluacionFisica.fecha.desc())
    if funcionario_id is not None:
        stmt = stmt.where(EvaluacionFisica.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[EvaluacionFisicaOut](
        items=[EvaluacionFisicaOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/evaluacion-fisica",
    response_model=EvaluacionFisicaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("MEDICO", "RRHH", "ADMIN"))],
)
async def crear_evf(
    request: Request,
    payload: EvaluacionFisicaCreate,
    db: DbSession,
    user: CurrentUser,
) -> EvaluacionFisicaOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    e = EvaluacionFisica(**payload.model_dump())
    db.add(e)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise integrity_409(exc) from exc
    await db.refresh(e)
    return EvaluacionFisicaOut.model_validate(e)
