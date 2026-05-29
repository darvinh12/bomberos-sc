from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import and_, func, or_, select, text, update as sql_update
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.core.scope_check import assert_scope_funcionario
from bomberos_api.core.storage import get_storage
from bomberos_api.models.catalogos import Cargo, Condicion, Jerarquia
from bomberos_api.models.direccion import Direccion
from bomberos_api.models.expediente import (
    Actividad,
    Carnet,
    CargaFamiliar,
    Habilidad,
    HistoricoCarnet,
    HistoricoJerarquia,
    HistoricoUbicacion,
    TiempoAdmPublica,
)
from bomberos_api.models.funcionario import Funcionario, PeriodoServicio
from bomberos_api.models.org import Estacion, Zona
from bomberos_api.models.usuario import Rol, UsuarioRol, UsuarioScope
from bomberos_api.schemas.common import Page
from bomberos_api.schemas.direccion import (
    CAMPOS_BIENESTAR,
    DireccionCreate,
    DireccionOut,
    DireccionUpdate,
)
from bomberos_api.schemas.expediente import (
    ActividadCreate,
    ActividadOut,
    ActividadUpdate,
    CarnetCreate,
    CarnetOut,
    CarnetUpdate,
    CargaFamiliarCreate,
    CargaFamiliarOut,
    CargaFamiliarUpdate,
    HabilidadCreate,
    HabilidadOut,
    HabilidadUpdate,
    HistoricoCarnetOut,
    HistoricoJerarquiaCreate,
    HistoricoJerarquiaOut,
    HistoricoJerarquiaUpdate,
    HistoricoUbicacionCreate,
    HistoricoUbicacionOut,
    HistoricoUbicacionUpdate,
    TiempoAdmPublicaCreate,
    TiempoAdmPublicaOut,
    TiempoAdmPublicaUpdate,
)
from bomberos_api.schemas.funcionario import (
    FuncionarioCreate,
    FuncionarioDetail,
    FuncionarioListItem,
    FuncionarioUpdate,
)

# Validaciones de upload de foto.
_FOTO_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_FOTO_MAX_BYTES = 5 * 1024 * 1024  # 5 MB

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

    # Mapear todos los campos enviados por el cliente. `exclude_unset=True`
    # evita pisar defaults del modelo con None cuando el cliente no manda
    # el campo. Los validadores de Pydantic ya garantizan tipos correctos.
    data = payload.model_dump(exclude_unset=True, exclude_none=False)
    # `fecha_primer_ingreso` es requerido por el schema y además lo necesitamos
    # abajo para el primer periodo. Lo extraemos sin removerlo del dict.
    fecha_primer_ingreso = payload.fecha_primer_ingreso

    funcionario = Funcionario(**data)
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
            fecha_ingreso=fecha_primer_ingreso,
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


@router.post(
    "/{funcionario_id}/foto",
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def subir_foto(
    funcionario_id: int,
    file: UploadFile,
    db: DbSession,
    user: CurrentUser,
    request: Request,
) -> dict[str, str]:
    """Sube la foto del funcionario al storage local y persiste `foto_url`.

    Validaciones:
    - Tipo MIME en {jpeg, png, webp}
    - Tamaño máximo 5 MB
    - Scope sobre el funcionario
    """
    ext = _FOTO_CONTENT_TYPES.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato no soportado. Use JPEG, PNG o WebP.",
        )

    content = await file.read()
    if len(content) > _FOTO_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La foto no debe exceder 5 MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo vacío.",
        )

    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, funcionario)

    await _set_audit_ctx(db, user.id, _client_ip(request))

    storage = get_storage()
    rel_path = f"funcionarios/{funcionario_id}/foto{ext}"
    saved_path = await storage.save(rel_path, content, file.content_type or "application/octet-stream")

    funcionario.foto_url = saved_path
    funcionario.updated_by = user.id
    await db.flush()

    return {"foto_url": saved_path}


async def _user_role_codes(db, usuario_id: int) -> set[str]:
    """Códigos de rol del usuario (set). Vacío si no tiene roles asignados."""
    res = await db.execute(
        select(Rol.codigo)
        .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .where(UsuarioRol.usuario_id == usuario_id)
    )
    return {r for r in res.scalars().all()}


async def _puede_bienestar(db, user) -> bool:
    """True si el usuario es RRHH o ADMIN — únicos roles que pueden editar
    los flags sensibles de bienestar en personal.direcciones."""
    roles = await _user_role_codes(db, user.id)
    return bool(roles.intersection({"ADMIN", "RRHH"}))


async def _funcionario_o_404(db, funcionario_id: int) -> Funcionario:
    f = await db.scalar(select(Funcionario).where(Funcionario.id == funcionario_id))
    if f is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    return f


# =============================================================================
# DIRECCIONES (1:N) — historial de domicilios del funcionario
# =============================================================================


@router.get(
    "/{funcionario_id}/direcciones",
    response_model=list[DireccionOut],
)
async def listar_direcciones(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[DireccionOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(Direccion)
            .where(Direccion.funcionario_id == funcionario_id)
            .order_by(Direccion.es_actual.desc(), Direccion.fecha_registro.desc())
        )
    ).scalars().all()
    return [DireccionOut.model_validate(r) for r in rows]


@router.get(
    "/{funcionario_id}/direccion-actual",
    response_model=DireccionOut | None,
)
async def direccion_actual(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> DireccionOut | None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    row = await db.scalar(
        select(Direccion).where(
            Direccion.funcionario_id == funcionario_id,
            Direccion.es_actual.is_(True),
        )
    )
    return DireccionOut.model_validate(row) if row is not None else None


@router.post(
    "/{funcionario_id}/direcciones",
    response_model=DireccionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_direccion(
    request: Request,
    funcionario_id: int,
    payload: DireccionCreate,
    db: DbSession,
    user: CurrentUser,
) -> DireccionOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    data = payload.model_dump(exclude_unset=True)

    # Defaults: es_actual=true salvo que el cliente lo diga lo contrario.
    es_actual = bool(data.get("es_actual", True))
    data["es_actual"] = es_actual

    # Si esta dirección será la actual, desmarcar todas las otras del mismo
    # funcionario para no romper el índice UNIQUE parcial ux_direcciones_actual.
    if es_actual:
        await db.execute(
            sql_update(Direccion)
            .where(
                Direccion.funcionario_id == funcionario_id,
                Direccion.es_actual.is_(True),
            )
            .values(es_actual=False)
        )

    # fecha_registro tiene DEFAULT CURRENT_DATE en BD; si el cliente no la
    # envía, dejamos que Postgres la asigne.
    nueva = Direccion(funcionario_id=funcionario_id, **data)
    db.add(nueva)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear dirección: {e.orig}",
        ) from e
    await db.refresh(nueva)
    return DireccionOut.model_validate(nueva)


@router.patch(
    "/{funcionario_id}/direcciones/{direccion_id}",
    response_model=DireccionOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_direccion(
    request: Request,
    funcionario_id: int,
    direccion_id: int,
    payload: DireccionUpdate,
    db: DbSession,
    user: CurrentUser,
) -> DireccionOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    direccion = await db.scalar(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.funcionario_id == funcionario_id,
        )
    )
    if direccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dirección no encontrada"
        )

    data = payload.model_dump(exclude_unset=True)

    # Filtrado de campos de bienestar: solo RRHH/ADMIN puede modificarlos.
    # require_role ya garantiza esto a nivel de endpoint, pero defendemos
    # en profundidad por si la lista de roles cambia en el futuro.
    if not await _puede_bienestar(db, user):
        for campo in CAMPOS_BIENESTAR:
            data.pop(campo, None)

    # Si se está promoviendo esta dirección a actual, desmarcar las otras.
    if data.get("es_actual") is True and not direccion.es_actual:
        await db.execute(
            sql_update(Direccion)
            .where(
                Direccion.funcionario_id == funcionario_id,
                Direccion.es_actual.is_(True),
                Direccion.id != direccion_id,
            )
            .values(es_actual=False)
        )

    for k, v in data.items():
        setattr(direccion, k, v)

    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar dirección: {e.orig}",
        ) from e
    await db.refresh(direccion)
    return DireccionOut.model_validate(direccion)


@router.delete(
    "/{funcionario_id}/direcciones/{direccion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_direccion(
    request: Request,
    funcionario_id: int,
    direccion_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    direccion = await db.scalar(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.funcionario_id == funcionario_id,
        )
    )
    if direccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dirección no encontrada"
        )

    await db.delete(direccion)
    await db.flush()


@router.get("/{funcionario_id}/foto")
async def obtener_foto(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> Response:
    """Devuelve la foto del funcionario directamente como bytes con el
    content-type correcto. Sirve para mostrarla en el frontend vía <img src>.
    """
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, funcionario)

    if not funcionario.foto_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario sin foto registrada"
        )

    storage = get_storage()
    try:
        data, content_type = await storage.read(funcionario.foto_url)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo de foto no encontrado en el storage",
        ) from e

    return Response(content=data, media_type=content_type)


# =============================================================================
# CARGA FAMILIAR (1:N)
# =============================================================================


@router.get(
    "/{funcionario_id}/carga-familiar",
    response_model=list[CargaFamiliarOut],
)
async def listar_carga_familiar(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[CargaFamiliarOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(CargaFamiliar)
            .where(CargaFamiliar.funcionario_id == funcionario_id)
            .order_by(CargaFamiliar.activo.desc(), CargaFamiliar.created_at.desc())
        )
    ).scalars().all()
    return [CargaFamiliarOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/carga-familiar",
    response_model=CargaFamiliarOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_carga_familiar(
    request: Request,
    funcionario_id: int,
    payload: CargaFamiliarCreate,
    db: DbSession,
    user: CurrentUser,
) -> CargaFamiliarOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    data = payload.model_dump(exclude_unset=True)
    rec = CargaFamiliar(funcionario_id=funcionario_id, **data)
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear carga familiar: {e.orig}",
        ) from e
    await db.refresh(rec)
    return CargaFamiliarOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/carga-familiar/{cf_id}",
    response_model=CargaFamiliarOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_carga_familiar(
    request: Request,
    funcionario_id: int,
    cf_id: int,
    payload: CargaFamiliarUpdate,
    db: DbSession,
    user: CurrentUser,
) -> CargaFamiliarOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(CargaFamiliar).where(
            CargaFamiliar.id == cf_id,
            CargaFamiliar.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carga familiar no encontrada"
        )

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar carga familiar: {e.orig}",
        ) from e
    await db.refresh(rec)
    return CargaFamiliarOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/carga-familiar/{cf_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_carga_familiar(
    request: Request,
    funcionario_id: int,
    cf_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(CargaFamiliar).where(
            CargaFamiliar.id == cf_id,
            CargaFamiliar.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carga familiar no encontrada"
        )
    await db.delete(rec)
    await db.flush()


# =============================================================================
# HISTÓRICO JERARQUÍAS (1:N)
# =============================================================================


@router.get(
    "/{funcionario_id}/historico-jerarquias",
    response_model=list[HistoricoJerarquiaOut],
)
async def listar_historico_jerarquias(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[HistoricoJerarquiaOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(HistoricoJerarquia)
            .where(HistoricoJerarquia.funcionario_id == funcionario_id)
            .order_by(HistoricoJerarquia.fecha_inicio.desc())
        )
    ).scalars().all()
    return [HistoricoJerarquiaOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/historico-jerarquias",
    response_model=HistoricoJerarquiaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_historico_jerarquia(
    request: Request,
    funcionario_id: int,
    payload: HistoricoJerarquiaCreate,
    db: DbSession,
    user: CurrentUser,
) -> HistoricoJerarquiaOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = HistoricoJerarquia(
        funcionario_id=funcionario_id, **payload.model_dump(exclude_unset=True)
    )
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear histórico de jerarquía: {e.orig}",
        ) from e
    await db.refresh(rec)
    return HistoricoJerarquiaOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/historico-jerarquias/{hist_id}",
    response_model=HistoricoJerarquiaOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_historico_jerarquia(
    request: Request,
    funcionario_id: int,
    hist_id: int,
    payload: HistoricoJerarquiaUpdate,
    db: DbSession,
    user: CurrentUser,
) -> HistoricoJerarquiaOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(HistoricoJerarquia).where(
            HistoricoJerarquia.id == hist_id,
            HistoricoJerarquia.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro histórico no encontrado",
        )
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar histórico: {e.orig}",
        ) from e
    await db.refresh(rec)
    return HistoricoJerarquiaOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/historico-jerarquias/{hist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_historico_jerarquia(
    request: Request,
    funcionario_id: int,
    hist_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(HistoricoJerarquia).where(
            HistoricoJerarquia.id == hist_id,
            HistoricoJerarquia.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro histórico no encontrado",
        )
    await db.delete(rec)
    await db.flush()


# =============================================================================
# HISTÓRICO UBICACIONES (1:N)
# =============================================================================


@router.get(
    "/{funcionario_id}/historico-ubicaciones",
    response_model=list[HistoricoUbicacionOut],
)
async def listar_historico_ubicaciones(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[HistoricoUbicacionOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(HistoricoUbicacion)
            .where(HistoricoUbicacion.funcionario_id == funcionario_id)
            .order_by(HistoricoUbicacion.fecha_inicio.desc())
        )
    ).scalars().all()
    return [HistoricoUbicacionOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/historico-ubicaciones",
    response_model=HistoricoUbicacionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_historico_ubicacion(
    request: Request,
    funcionario_id: int,
    payload: HistoricoUbicacionCreate,
    db: DbSession,
    user: CurrentUser,
) -> HistoricoUbicacionOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = HistoricoUbicacion(
        funcionario_id=funcionario_id, **payload.model_dump(exclude_unset=True)
    )
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear histórico de ubicación: {e.orig}",
        ) from e
    await db.refresh(rec)
    return HistoricoUbicacionOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/historico-ubicaciones/{hist_id}",
    response_model=HistoricoUbicacionOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_historico_ubicacion(
    request: Request,
    funcionario_id: int,
    hist_id: int,
    payload: HistoricoUbicacionUpdate,
    db: DbSession,
    user: CurrentUser,
) -> HistoricoUbicacionOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(HistoricoUbicacion).where(
            HistoricoUbicacion.id == hist_id,
            HistoricoUbicacion.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro histórico no encontrado",
        )
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar histórico: {e.orig}",
        ) from e
    await db.refresh(rec)
    return HistoricoUbicacionOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/historico-ubicaciones/{hist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_historico_ubicacion(
    request: Request,
    funcionario_id: int,
    hist_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(HistoricoUbicacion).where(
            HistoricoUbicacion.id == hist_id,
            HistoricoUbicacion.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro histórico no encontrado",
        )
    await db.delete(rec)
    await db.flush()


# =============================================================================
# TIEMPO EN ADMINISTRACIÓN PÚBLICA (1:N)
# =============================================================================


@router.get(
    "/{funcionario_id}/tiempo-admpublica",
    response_model=list[TiempoAdmPublicaOut],
)
async def listar_tiempo_admpublica(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[TiempoAdmPublicaOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(TiempoAdmPublica)
            .where(TiempoAdmPublica.funcionario_id == funcionario_id)
            .order_by(TiempoAdmPublica.fecha_inicio.desc())
        )
    ).scalars().all()
    return [TiempoAdmPublicaOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/tiempo-admpublica",
    response_model=TiempoAdmPublicaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_tiempo_admpublica(
    request: Request,
    funcionario_id: int,
    payload: TiempoAdmPublicaCreate,
    db: DbSession,
    user: CurrentUser,
) -> TiempoAdmPublicaOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = TiempoAdmPublica(
        funcionario_id=funcionario_id, **payload.model_dump(exclude_unset=True)
    )
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear tiempo adm pública: {e.orig}",
        ) from e
    await db.refresh(rec)
    return TiempoAdmPublicaOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/tiempo-admpublica/{tap_id}",
    response_model=TiempoAdmPublicaOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_tiempo_admpublica(
    request: Request,
    funcionario_id: int,
    tap_id: int,
    payload: TiempoAdmPublicaUpdate,
    db: DbSession,
    user: CurrentUser,
) -> TiempoAdmPublicaOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(TiempoAdmPublica).where(
            TiempoAdmPublica.id == tap_id,
            TiempoAdmPublica.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado"
        )
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar: {e.orig}",
        ) from e
    await db.refresh(rec)
    return TiempoAdmPublicaOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/tiempo-admpublica/{tap_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_tiempo_admpublica(
    request: Request,
    funcionario_id: int,
    tap_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(TiempoAdmPublica).where(
            TiempoAdmPublica.id == tap_id,
            TiempoAdmPublica.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado"
        )
    await db.delete(rec)
    await db.flush()


# =============================================================================
# HABILIDADES (1:N)
# =============================================================================


@router.get(
    "/{funcionario_id}/habilidades",
    response_model=list[HabilidadOut],
)
async def listar_habilidades(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[HabilidadOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(Habilidad)
            .where(Habilidad.funcionario_id == funcionario_id)
            .order_by(Habilidad.grupo, Habilidad.nombre)
        )
    ).scalars().all()
    return [HabilidadOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/habilidades",
    response_model=HabilidadOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_habilidad(
    request: Request,
    funcionario_id: int,
    payload: HabilidadCreate,
    db: DbSession,
    user: CurrentUser,
) -> HabilidadOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = Habilidad(funcionario_id=funcionario_id, **payload.model_dump(exclude_unset=True))
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear habilidad: {e.orig}",
        ) from e
    await db.refresh(rec)
    return HabilidadOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/habilidades/{hab_id}",
    response_model=HabilidadOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_habilidad(
    request: Request,
    funcionario_id: int,
    hab_id: int,
    payload: HabilidadUpdate,
    db: DbSession,
    user: CurrentUser,
) -> HabilidadOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(Habilidad).where(
            Habilidad.id == hab_id,
            Habilidad.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Habilidad no encontrada"
        )
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar habilidad: {e.orig}",
        ) from e
    await db.refresh(rec)
    return HabilidadOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/habilidades/{hab_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_habilidad(
    request: Request,
    funcionario_id: int,
    hab_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(Habilidad).where(
            Habilidad.id == hab_id,
            Habilidad.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Habilidad no encontrada"
        )
    await db.delete(rec)
    await db.flush()


# =============================================================================
# ACTIVIDADES (1:N)
# =============================================================================


@router.get(
    "/{funcionario_id}/actividades",
    response_model=list[ActividadOut],
)
async def listar_actividades(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[ActividadOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(Actividad)
            .where(Actividad.funcionario_id == funcionario_id)
            .order_by(Actividad.activo.desc(), Actividad.fecha_inicio.desc().nullslast())
        )
    ).scalars().all()
    return [ActividadOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/actividades",
    response_model=ActividadOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_actividad(
    request: Request,
    funcionario_id: int,
    payload: ActividadCreate,
    db: DbSession,
    user: CurrentUser,
) -> ActividadOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = Actividad(funcionario_id=funcionario_id, **payload.model_dump(exclude_unset=True))
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear actividad: {e.orig}",
        ) from e
    await db.refresh(rec)
    return ActividadOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/actividades/{act_id}",
    response_model=ActividadOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_actividad(
    request: Request,
    funcionario_id: int,
    act_id: int,
    payload: ActividadUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ActividadOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(Actividad).where(
            Actividad.id == act_id,
            Actividad.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada"
        )
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar actividad: {e.orig}",
        ) from e
    await db.refresh(rec)
    return ActividadOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/actividades/{act_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_actividad(
    request: Request,
    funcionario_id: int,
    act_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(Actividad).where(
            Actividad.id == act_id,
            Actividad.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada"
        )
    await db.delete(rec)
    await db.flush()


# =============================================================================
# CARNETS (1:N) + HISTÓRICO
# =============================================================================
# Reglas de histórico:
#   - Al CREAR un carnet con `numero` no nulo se inserta una fila en
#     historico_carnets con numero_anterior=NULL, numero_nuevo=<numero>,
#     motivo='ALTA'. Esto deja trazabilidad del primer registro.
#   - Al ACTUALIZAR un carnet, si el `numero` cambia y el cliente envía un
#     `motivo_cambio` (o usamos default 'CAMBIO'), se inserta una fila con
#     numero_anterior=<viejo>, numero_nuevo=<nuevo>. Si el número no cambia,
#     no se registra nada.
#   - El histórico es append-only; no se borra al eliminar el carnet porque
#     `ON DELETE CASCADE` ya lo limpia automáticamente desde la BD.


@router.get(
    "/{funcionario_id}/carnets",
    response_model=list[CarnetOut],
)
async def listar_carnets(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
    incluir_inactivos: bool = Query(default=False),
) -> list[CarnetOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(Carnet).where(Carnet.funcionario_id == funcionario_id)
    if not incluir_inactivos:
        stmt = stmt.where(Carnet.activo.is_(True))
    stmt = stmt.order_by(Carnet.activo.desc(), Carnet.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [CarnetOut.model_validate(r) for r in rows]


@router.post(
    "/{funcionario_id}/carnets",
    response_model=CarnetOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def crear_carnet(
    request: Request,
    funcionario_id: int,
    payload: CarnetCreate,
    db: DbSession,
    user: CurrentUser,
) -> CarnetOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = Carnet(
        funcionario_id=funcionario_id, **payload.model_dump(exclude_unset=True)
    )
    db.add(rec)
    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al crear carnet: {e.orig}",
        ) from e

    # Snapshot inicial en histórico (preserva el primer número emitido).
    if rec.numero is not None:
        db.add(
            HistoricoCarnet(
                carnet_id=rec.id,
                numero_anterior=None,
                numero_nuevo=rec.numero,
                motivo="ALTA",
                fecha=date.today(),
                usuario_id=user.id,
            )
        )
        await db.flush()

    await db.refresh(rec)
    return CarnetOut.model_validate(rec)


@router.patch(
    "/{funcionario_id}/carnets/{cn_id}",
    response_model=CarnetOut,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def actualizar_carnet(
    request: Request,
    funcionario_id: int,
    cn_id: int,
    payload: CarnetUpdate,
    db: DbSession,
    user: CurrentUser,
) -> CarnetOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(Carnet).where(
            Carnet.id == cn_id,
            Carnet.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carnet no encontrado"
        )

    data = payload.model_dump(exclude_unset=True)
    motivo_cambio = data.pop("motivo_cambio", None)
    numero_anterior = rec.numero
    nuevo_numero_en_payload = "numero" in data
    nuevo_numero = data.get("numero")

    for k, v in data.items():
        setattr(rec, k, v)

    try:
        await db.flush()
    except IntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflicto al actualizar carnet: {e.orig}",
        ) from e

    # Si el número cambió, registramos snapshot en histórico.
    if nuevo_numero_en_payload and nuevo_numero != numero_anterior:
        db.add(
            HistoricoCarnet(
                carnet_id=rec.id,
                numero_anterior=numero_anterior,
                numero_nuevo=nuevo_numero,
                motivo=motivo_cambio or "CAMBIO",
                fecha=date.today(),
                usuario_id=user.id,
            )
        )
        await db.flush()

    await db.refresh(rec)
    return CarnetOut.model_validate(rec)


@router.delete(
    "/{funcionario_id}/carnets/{cn_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def borrar_carnet(
    request: Request,
    funcionario_id: int,
    cn_id: int,
    db: DbSession,
    user: CurrentUser,
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))

    rec = await db.scalar(
        select(Carnet).where(
            Carnet.id == cn_id,
            Carnet.funcionario_id == funcionario_id,
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Carnet no encontrado"
        )
    await db.delete(rec)
    await db.flush()


@router.get(
    "/{funcionario_id}/historico-carnets",
    response_model=list[HistoricoCarnetOut],
)
async def listar_historico_carnets(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[HistoricoCarnetOut]:
    """Listado del histórico de cambios de TODOS los carnets del funcionario.

    Ordenado por fecha descendente. Cada fila apunta a un `carnet_id` para que
    el frontend pueda agrupar por carnet si lo necesita.
    """
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.execute(
            select(HistoricoCarnet)
            .join(Carnet, Carnet.id == HistoricoCarnet.carnet_id)
            .where(Carnet.funcionario_id == funcionario_id)
            .order_by(HistoricoCarnet.fecha.desc(), HistoricoCarnet.id.desc())
        )
    ).scalars().all()
    return [HistoricoCarnetOut.model_validate(r) for r in rows]


# =============================================================================
# DOCUMENTOS BIOMÉTRICOS: HUELLA Y FIRMA
# =============================================================================
# Mismo patrón que /foto:
#   - Tipos MIME aceptados: jpeg, png, webp
#   - Tamaño máximo: 5 MB
#   - Path en storage: funcionarios/{id}/<tipo><ext>
#   - Persiste el path en el campo correspondiente del modelo Funcionario
#   - POST exige rol RRHH/ADMIN; GET solo requiere autenticación
#   - Audit context obligatorio en POST


@router.post(
    "/{funcionario_id}/huella",
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def subir_huella(
    funcionario_id: int,
    file: UploadFile,
    db: DbSession,
    user: CurrentUser,
    request: Request,
) -> dict[str, str]:
    """Sube la huella del funcionario al storage local y persiste `huella_url`."""
    ext = _FOTO_CONTENT_TYPES.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato no soportado. Use JPEG, PNG o WebP.",
        )

    content = await file.read()
    if len(content) > _FOTO_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La huella no debe exceder 5 MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo vacío.",
        )

    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, funcionario)

    await _set_audit_ctx(db, user.id, _client_ip(request))

    storage = get_storage()
    rel_path = f"funcionarios/{funcionario_id}/huella{ext}"
    saved_path = await storage.save(rel_path, content, file.content_type or "application/octet-stream")

    funcionario.huella_url = saved_path
    funcionario.updated_by = user.id
    await db.flush()

    return {"huella_url": saved_path}


@router.get("/{funcionario_id}/huella")
async def obtener_huella(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> Response:
    """Devuelve la huella del funcionario directamente como bytes."""
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, funcionario)

    if not funcionario.huella_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario sin huella registrada"
        )

    storage = get_storage()
    try:
        data, content_type = await storage.read(funcionario.huella_url)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo de huella no encontrado en el storage",
        ) from e

    return Response(content=data, media_type=content_type)


@router.post(
    "/{funcionario_id}/firma",
    dependencies=[Depends(require_role("RRHH", "ADMIN"))],
)
async def subir_firma(
    funcionario_id: int,
    file: UploadFile,
    db: DbSession,
    user: CurrentUser,
    request: Request,
) -> dict[str, str]:
    """Sube la firma del funcionario al storage local y persiste `firma_url`."""
    ext = _FOTO_CONTENT_TYPES.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato no soportado. Use JPEG, PNG o WebP.",
        )

    content = await file.read()
    if len(content) > _FOTO_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La firma no debe exceder 5 MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo vacío.",
        )

    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, funcionario)

    await _set_audit_ctx(db, user.id, _client_ip(request))

    storage = get_storage()
    rel_path = f"funcionarios/{funcionario_id}/firma{ext}"
    saved_path = await storage.save(rel_path, content, file.content_type or "application/octet-stream")

    funcionario.firma_url = saved_path
    funcionario.updated_by = user.id
    await db.flush()

    return {"firma_url": saved_path}


@router.get("/{funcionario_id}/firma")
async def obtener_firma(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> Response:
    """Devuelve la firma del funcionario directamente como bytes."""
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, funcionario)

    if not funcionario.firma_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario sin firma registrada"
        )

    storage = get_storage()
    try:
        data, content_type = await storage.read(funcionario.firma_url)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo de firma no encontrado en el storage",
        ) from e

    return Response(content=data, media_type=content_type)
