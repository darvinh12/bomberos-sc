from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.core.scope_check import assert_scope_funcionario
from bomberos_api.models.catalogos import Cargo, Condicion, Jerarquia
from bomberos_api.models.funcionario import Funcionario, PeriodoServicio
from bomberos_api.models.org import Estacion, Zona
from bomberos_api.models.usuario import Rol, UsuarioRol, UsuarioScope
from bomberos_api.schemas.common import Page
from bomberos_api.schemas.funcionario import (
    FuncionarioCreate,
    FuncionarioDetail,
    FuncionarioListItem,
    FuncionarioUpdate,
)

router = APIRouter(prefix="/funcionarios", tags=["funcionarios"])


def _client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def _set_audit_ctx(db, usuario_id: int, ip: str | None) -> None:
    # SET LOCAL no acepta parámetros bindeados — usamos set_config(name, value, is_local)
    await db.execute(
        text("SELECT set_config('app.usuario_id', :v, true)").bindparams(v=str(usuario_id))
    )
    if ip:
        await db.execute(
            text("SELECT set_config('app.usuario_ip', :v, true)").bindparams(v=ip)
        )


async def _scope_filter(db, user) -> object | None:
    """Devuelve una condición SQLAlchemy si el usuario tiene scopes, o None
    si es ADMIN o no tiene scopes asignados."""
    es_admin = await db.scalar(
        select(func.count())
        .select_from(UsuarioRol)
        .join(Rol, Rol.id == UsuarioRol.rol_id)
        .where(UsuarioRol.usuario_id == user.id, Rol.codigo == "ADMIN")
    )
    if es_admin:
        return None
    scopes = (
        await db.execute(
            select(UsuarioScope).where(UsuarioScope.usuario_id == user.id)
        )
    ).scalars().all()
    if not scopes:
        return None
    conds: list = []
    for s in scopes:
        partes = []
        if s.zona_id is not None:
            partes.append(Funcionario.zona_id == s.zona_id)
        if s.estacion_id is not None:
            partes.append(Funcionario.estacion_id == s.estacion_id)
        if s.division_id is not None:
            partes.append(Funcionario.division_id == s.division_id)
        if s.area_id is not None:
            partes.append(Funcionario.area_id == s.area_id)
        if partes:
            conds.append(and_(*partes))
    return or_(*conds) if conds else None


@router.get("", response_model=Page[FuncionarioListItem])
async def listar(
    db: DbSession,
    user: CurrentUser,
    q: str | None = Query(default=None, description="Búsqueda fuzzy por nombre o cédula"),
    estatus: str | None = Query(default="ACTIVO"),
    zona_id: int | None = None,
    estacion_id: int | None = None,
    jerarquia_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
) -> Page[FuncionarioListItem]:
    stmt = select(Funcionario)
    count_stmt = select(func.count()).select_from(Funcionario)

    filters = []
    if estatus:
        filters.append(Funcionario.estatus == estatus)
    if zona_id is not None:
        filters.append(Funcionario.zona_id == zona_id)
    if estacion_id is not None:
        filters.append(Funcionario.estacion_id == estacion_id)
    if jerarquia_id is not None:
        filters.append(Funcionario.jerarquia_id == jerarquia_id)
    if q:
        like = f"%{q}%"
        cond = or_(
            Funcionario.nombre_completo.ilike(like),
            Funcionario.numero_empleado.ilike(like),
        )
        if q.isdigit():
            cond = or_(cond, Funcionario.cedula == int(q))
        filters.append(cond)

    scope_cond = await _scope_filter(db, user)
    if scope_cond is not None:
        filters.append(scope_cond)

    if filters:
        stmt = stmt.where(*filters)
        count_stmt = count_stmt.where(*filters)

    total = await db.scalar(count_stmt) or 0

    stmt = (
        stmt.order_by(Funcionario.apellidos, Funcionario.nombres)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    pages = (total + page_size - 1) // page_size
    return Page[FuncionarioListItem](
        items=[FuncionarioListItem.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{funcionario_id}", response_model=FuncionarioDetail)
async def obtener(funcionario_id: int, db: DbSession, user: CurrentUser) -> FuncionarioDetail:
    stmt = (
        select(
            Funcionario,
            Jerarquia.nombre.label("jerarquia_nombre"),
            Jerarquia.nombre_corto.label("jerarquia_nombre_corto"),
            Cargo.nombre.label("cargo_nombre"),
            Condicion.nombre.label("condicion_nombre"),
            Zona.nombre.label("zona_nombre"),
            Estacion.nombre.label("estacion_nombre"),
        )
        .outerjoin(Jerarquia, Jerarquia.id == Funcionario.jerarquia_id)
        .outerjoin(Cargo, Cargo.id == Funcionario.cargo_id)
        .outerjoin(Condicion, Condicion.id == Funcionario.condicion_id)
        .outerjoin(Zona, Zona.id == Funcionario.zona_id)
        .outerjoin(Estacion, Estacion.id == Funcionario.estacion_id)
        .where(Funcionario.id == funcionario_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    funcionario = row[0]
    await assert_scope_funcionario(db, user, funcionario)
    detail = FuncionarioDetail.model_validate(funcionario)
    detail.jerarquia_nombre = row.jerarquia_nombre
    detail.jerarquia_nombre_corto = row.jerarquia_nombre_corto
    detail.cargo_nombre = row.cargo_nombre
    detail.condicion_nombre = row.condicion_nombre
    detail.zona_nombre = row.zona_nombre
    detail.estacion_nombre = row.estacion_nombre
    return detail


@router.post(
    "",
    response_model=FuncionarioDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear(
    request: Request,
    payload: FuncionarioCreate,
    db: DbSession,
    user: CurrentUser,
) -> FuncionarioDetail:
    await _set_audit_ctx(db, user.id, _client_ip(request))

    funcionario = Funcionario(
        nacionalidad=payload.nacionalidad,
        cedula=payload.cedula,
        apellidos=payload.apellidos,
        nombres=payload.nombres,
        fecha_nacimiento=payload.fecha_nacimiento,
        sexo=payload.sexo,
        fecha_primer_ingreso=payload.fecha_primer_ingreso,
        jerarquia_id=payload.jerarquia_id,
        cargo_id=payload.cargo_id,
        zona_id=payload.zona_id,
        estacion_id=payload.estacion_id,
        correo=payload.correo,
        telefono_movil=payload.telefono_movil,
    )
    db.add(funcionario)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear funcionario: {e.orig}",
        ) from e

    # Crear el primer período de servicio
    db.add(
        PeriodoServicio(
            funcionario_id=funcionario.id,
            numero_periodo=1,
            fecha_ingreso=payload.fecha_primer_ingreso,
            tipo_ingreso="INGRESO",
        )
    )
    await db.flush()
    await db.refresh(funcionario)
    return FuncionarioDetail.model_validate(funcionario)


@router.patch(
    "/{funcionario_id}",
    response_model=FuncionarioDetail,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar(
    request: Request,
    funcionario_id: int,
    payload: FuncionarioUpdate,
    db: DbSession,
    user: CurrentUser,
) -> FuncionarioDetail:
    await _set_audit_ctx(db, user.id, _client_ip(request))
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )

    # Si el usuario tiene scope restringido, validar que el funcionario está dentro
    await assert_scope_funcionario(db, user, funcionario)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(funcionario, field, value)
    funcionario.updated_by = user.id

    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar: {e.orig}",
        ) from e

    return FuncionarioDetail.model_validate(funcionario)
