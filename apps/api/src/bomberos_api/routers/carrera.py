from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, paginate, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.carrera import (
    Ascenso,
    CursoRealizado,
    Evaluacion,
    Merito,
    Reconocimiento,
)
from bomberos_api.schemas.carrera import (
    AscensoCreate,
    AscensoOut,
    CursoRealizadoCreate,
    CursoRealizadoOut,
    EvaluacionCreate,
    EvaluacionOut,
    MeritoOut,
    ReconocimientoCreate,
    ReconocimientoOut,
)
from bomberos_api.schemas.common import Page

router = APIRouter(prefix="/carrera", tags=["carrera"])


@router.get("/cursos-realizados", response_model=Page[CursoRealizadoOut])
async def listar_cursos(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[CursoRealizadoOut]:
    stmt = select(CursoRealizado).order_by(CursoRealizado.fecha_fin.desc().nullslast())
    if funcionario_id is not None:
        stmt = stmt.where(CursoRealizado.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[CursoRealizadoOut](
        items=[CursoRealizadoOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/cursos-realizados",
    response_model=CursoRealizadoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_curso_realizado(
    request: Request, payload: CursoRealizadoCreate, db: DbSession, user: CurrentUser
) -> CursoRealizadoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    c = CursoRealizado(**payload.model_dump())
    db.add(c)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(c)
    return CursoRealizadoOut.model_validate(c)


@router.get("/evaluaciones", response_model=Page[EvaluacionOut])
async def listar_evaluaciones(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    periodo_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[EvaluacionOut]:
    stmt = select(Evaluacion).order_by(Evaluacion.id.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Evaluacion.funcionario_id == funcionario_id)
    if periodo_id is not None:
        stmt = stmt.where(Evaluacion.periodo_id == periodo_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[EvaluacionOut](
        items=[EvaluacionOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/evaluaciones",
    response_model=EvaluacionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("SUPERVISOR", "ADMIN"))],
)
async def crear_evaluacion(
    request: Request, payload: EvaluacionCreate, db: DbSession, user: CurrentUser
) -> EvaluacionOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    e = Evaluacion(**payload.model_dump())
    db.add(e)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise integrity_409(exc) from exc
    await db.refresh(e)
    return EvaluacionOut.model_validate(e)


@router.get("/ascensos", response_model=Page[AscensoOut])
async def listar_ascensos(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[AscensoOut]:
    stmt = select(Ascenso).order_by(Ascenso.fecha_efectiva.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Ascenso.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[AscensoOut](
        items=[AscensoOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/ascensos",
    response_model=AscensoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_ascenso(
    request: Request, payload: AscensoCreate, db: DbSession, user: CurrentUser
) -> AscensoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    a = Ascenso(**payload.model_dump())
    db.add(a)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(a)
    # Sincroniza la jerarquía del funcionario (el trigger BD historiza)
    await db.execute(
        text(
            "UPDATE personal.funcionarios SET jerarquia_id = :j WHERE id = :f"
        ).bindparams(j=a.jerarquia_nueva_id, f=a.funcionario_id)
    )
    return AscensoOut.model_validate(a)


@router.get("/reconocimientos", response_model=Page[ReconocimientoOut])
async def listar_reconocimientos(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[ReconocimientoOut]:
    stmt = select(Reconocimiento).order_by(Reconocimiento.fecha_otorgamiento.desc())
    if funcionario_id is not None:
        stmt = stmt.where(Reconocimiento.funcionario_id == funcionario_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[ReconocimientoOut](
        items=[ReconocimientoOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/reconocimientos",
    response_model=ReconocimientoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_reconocimiento(
    request: Request, payload: ReconocimientoCreate, db: DbSession, user: CurrentUser
) -> ReconocimientoOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    r = Reconocimiento(**payload.model_dump())
    db.add(r)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    await db.refresh(r)
    return ReconocimientoOut.model_validate(r)


@router.get("/meritos", response_model=Page[MeritoOut])
async def listar_meritos(
    db: DbSession,
    _: CurrentUser,
    funcionario_id: int | None = None,
    periodo_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=200, ge=1, le=500),
) -> Page[MeritoOut]:
    stmt = select(Merito).order_by(Merito.posicion.asc().nullslast())
    if funcionario_id is not None:
        stmt = stmt.where(Merito.funcionario_id == funcionario_id)
    if periodo_id is not None:
        stmt = stmt.where(Merito.periodo_id == periodo_id)
    items, total = await paginate(db, stmt, page=page, page_size=page_size)
    return Page[MeritoOut](
        items=[MeritoOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/meritos/recalcular/{periodo_id}",
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def recalcular_meritos(
    request: Request, periodo_id: int, db: DbSession, user: CurrentUser
):
    """Llama al SP carrera.fn_recalcular_meritos_periodo para recomputar todos los puntajes."""
    await set_audit_ctx(db, user.id, client_ip(request))
    res = await db.execute(
        text("SELECT carrera.fn_recalcular_meritos_periodo(:p)").bindparams(p=periodo_id)
    )
    cantidad = res.scalar_one()
    return {"funcionarios_procesados": cantidad}
