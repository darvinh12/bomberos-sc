from datetime import UTC, date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy import update as sql_update
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.core.scope_check import assert_scope_funcionario
from bomberos_api.core.storage import get_storage
from bomberos_api.models.catalogos import Cargo, Condicion, Jerarquia
from bomberos_api.models.direccion import Direccion
from bomberos_api.models.expediente import (
    Actividad,
    CargaFamiliar,
    Carnet,
    Habilidad,
    HistoricoCarnet,
    HistoricoJerarquia,
    HistoricoUbicacion,
    TiempoAdmPublica,
)
from bomberos_api.models.funcionario import Funcionario, PeriodoServicio
from bomberos_api.models.ops import MovimientoEstatus
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
    CargaFamiliarCreate,
    CargaFamiliarOut,
    CargaFamiliarUpdate,
    CarnetCreate,
    CarnetOut,
    CarnetUpdate,
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
# SOFT-DELETE — helpers compartidos por las 8 entidades del expediente
# =============================================================================
# Patrón único para no repetir 8 veces el mismo cuerpo de DELETE/restaurar.
# El router decide la entidad y el nombre amigable; el helper aplica la lógica
# (404, marca/limpia campos de auditoría, flush).


async def _es_admin(db, user) -> bool:
    """True si el usuario tiene el rol ADMIN. Necesario porque `?incluir_borrados`
    y los endpoints de restaurar son operaciones reservadas a administradores."""
    n = await db.scalar(
        select(func.count())
        .select_from(UsuarioRol)
        .join(Rol, Rol.id == UsuarioRol.rol_id)
        .where(UsuarioRol.usuario_id == user.id, Rol.codigo == "ADMIN")
    )
    return bool(n)


async def _soft_delete(
    db,
    model: type[Any],
    *,
    rec_id: int,
    funcionario_id: int,
    user_id: int,
    motivo: str,
    nombre_entidad: str,
) -> None:
    """Marca un registro como borrado lógico.

    Solo encuentra el registro si NO está ya borrado (idempotencia segura: un
    DELETE sobre algo ya borrado devuelve 404 en vez de doble-marcar el motivo).
    """
    rec = await db.scalar(
        select(model).where(
            model.id == rec_id,
            model.funcionario_id == funcionario_id,
            model.deleted_at.is_(None),
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{nombre_entidad} no encontrado",
        )

    rec.deleted_at = datetime.now(UTC)
    rec.deleted_by = user_id
    rec.delete_reason = motivo
    await db.flush()


async def _restaurar(
    db,
    model: type[Any],
    *,
    rec_id: int,
    funcionario_id: int,
    nombre_entidad: str,
) -> Any:
    """Restaura un registro soft-deleted limpiando los tres campos de auditoría.

    Devuelve la instancia ORM refrescada para que el endpoint la serialice.
    Solo encuentra registros efectivamente borrados; si está activo o no existe,
    devuelve 404.
    """
    rec = await db.scalar(
        select(model).where(
            model.id == rec_id,
            model.funcionario_id == funcionario_id,
            model.deleted_at.is_not(None),
        )
    )
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{nombre_entidad} borrado no encontrado",
        )

    rec.deleted_at = None
    rec.deleted_by = None
    rec.delete_reason = None
    await db.flush()
    await db.refresh(rec)
    return rec


def _aplicar_filtro_borrados(stmt, model: type[Any], es_admin: bool, incluir_borrados: bool):
    """Aplica el filtro estándar por `deleted_at IS NULL`.

    Regla: solo ADMIN puede ver borrados. Si el flag llega de un rol no-admin
    se ignora silenciosamente (no levantamos 403 — devolvemos data válida pero
    filtrada).
    """
    if incluir_borrados and es_admin:
        return stmt
    return stmt.where(model.deleted_at.is_(None))


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir direcciones soft-deleted (solo ADMIN)"
    ),
) -> list[DireccionOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(Direccion).where(Direccion.funcionario_id == funcionario_id)
    stmt = _aplicar_filtro_borrados(stmt, Direccion, await _es_admin(db, user), incluir_borrados)
    stmt = stmt.order_by(Direccion.es_actual.desc(), Direccion.fecha_registro.desc())
    rows = (await db.execute(stmt)).scalars().all()
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
            Direccion.deleted_at.is_(None),
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
    # Filtramos por `deleted_at IS NULL` para no tocar registros borrados (no
    # afectan el unique pero igual evitamos updates innecesarios).
    if es_actual:
        await db.execute(
            sql_update(Direccion)
            .where(
                Direccion.funcionario_id == funcionario_id,
                Direccion.es_actual.is_(True),
                Direccion.deleted_at.is_(None),
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
            Direccion.deleted_at.is_(None),
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
                Direccion.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        Direccion,
        rec_id=direccion_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Dirección",
    )


@router.post(
    "/{funcionario_id}/direcciones/{direccion_id}/restaurar",
    response_model=DireccionOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_direccion(
    request: Request,
    funcionario_id: int,
    direccion_id: int,
    db: DbSession,
    user: CurrentUser,
) -> DireccionOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        Direccion,
        rec_id=direccion_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Dirección",
    )
    return DireccionOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[CargaFamiliarOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(CargaFamiliar).where(CargaFamiliar.funcionario_id == funcionario_id)
    stmt = _aplicar_filtro_borrados(
        stmt, CargaFamiliar, await _es_admin(db, user), incluir_borrados
    )
    stmt = stmt.order_by(CargaFamiliar.activo.desc(), CargaFamiliar.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
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
            CargaFamiliar.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        CargaFamiliar,
        rec_id=cf_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Carga familiar",
    )


@router.post(
    "/{funcionario_id}/carga-familiar/{cf_id}/restaurar",
    response_model=CargaFamiliarOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_carga_familiar(
    request: Request,
    funcionario_id: int,
    cf_id: int,
    db: DbSession,
    user: CurrentUser,
) -> CargaFamiliarOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        CargaFamiliar,
        rec_id=cf_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Carga familiar",
    )
    return CargaFamiliarOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[HistoricoJerarquiaOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(HistoricoJerarquia).where(
        HistoricoJerarquia.funcionario_id == funcionario_id
    )
    stmt = _aplicar_filtro_borrados(
        stmt, HistoricoJerarquia, await _es_admin(db, user), incluir_borrados
    )
    stmt = stmt.order_by(HistoricoJerarquia.fecha_inicio.desc())
    rows = (await db.execute(stmt)).scalars().all()
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
            HistoricoJerarquia.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        HistoricoJerarquia,
        rec_id=hist_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Registro histórico",
    )


@router.post(
    "/{funcionario_id}/historico-jerarquias/{hist_id}/restaurar",
    response_model=HistoricoJerarquiaOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_historico_jerarquia(
    request: Request,
    funcionario_id: int,
    hist_id: int,
    db: DbSession,
    user: CurrentUser,
) -> HistoricoJerarquiaOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        HistoricoJerarquia,
        rec_id=hist_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Registro histórico",
    )
    return HistoricoJerarquiaOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[HistoricoUbicacionOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(HistoricoUbicacion).where(
        HistoricoUbicacion.funcionario_id == funcionario_id
    )
    stmt = _aplicar_filtro_borrados(
        stmt, HistoricoUbicacion, await _es_admin(db, user), incluir_borrados
    )
    stmt = stmt.order_by(HistoricoUbicacion.fecha_inicio.desc())
    rows = (await db.execute(stmt)).scalars().all()
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
            HistoricoUbicacion.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        HistoricoUbicacion,
        rec_id=hist_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Registro histórico",
    )


@router.post(
    "/{funcionario_id}/historico-ubicaciones/{hist_id}/restaurar",
    response_model=HistoricoUbicacionOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_historico_ubicacion(
    request: Request,
    funcionario_id: int,
    hist_id: int,
    db: DbSession,
    user: CurrentUser,
) -> HistoricoUbicacionOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        HistoricoUbicacion,
        rec_id=hist_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Registro histórico",
    )
    return HistoricoUbicacionOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[TiempoAdmPublicaOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(TiempoAdmPublica).where(
        TiempoAdmPublica.funcionario_id == funcionario_id
    )
    stmt = _aplicar_filtro_borrados(
        stmt, TiempoAdmPublica, await _es_admin(db, user), incluir_borrados
    )
    stmt = stmt.order_by(TiempoAdmPublica.fecha_inicio.desc())
    rows = (await db.execute(stmt)).scalars().all()
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
            TiempoAdmPublica.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        TiempoAdmPublica,
        rec_id=tap_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Registro",
    )


@router.post(
    "/{funcionario_id}/tiempo-admpublica/{tap_id}/restaurar",
    response_model=TiempoAdmPublicaOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_tiempo_admpublica(
    request: Request,
    funcionario_id: int,
    tap_id: int,
    db: DbSession,
    user: CurrentUser,
) -> TiempoAdmPublicaOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        TiempoAdmPublica,
        rec_id=tap_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Registro",
    )
    return TiempoAdmPublicaOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[HabilidadOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(Habilidad).where(Habilidad.funcionario_id == funcionario_id)
    stmt = _aplicar_filtro_borrados(
        stmt, Habilidad, await _es_admin(db, user), incluir_borrados
    )
    stmt = stmt.order_by(Habilidad.grupo, Habilidad.nombre)
    rows = (await db.execute(stmt)).scalars().all()
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
            Habilidad.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        Habilidad,
        rec_id=hab_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Habilidad",
    )


@router.post(
    "/{funcionario_id}/habilidades/{hab_id}/restaurar",
    response_model=HabilidadOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_habilidad(
    request: Request,
    funcionario_id: int,
    hab_id: int,
    db: DbSession,
    user: CurrentUser,
) -> HabilidadOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        Habilidad,
        rec_id=hab_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Habilidad",
    )
    return HabilidadOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[ActividadOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(Actividad).where(Actividad.funcionario_id == funcionario_id)
    stmt = _aplicar_filtro_borrados(
        stmt, Actividad, await _es_admin(db, user), incluir_borrados
    )
    stmt = stmt.order_by(
        Actividad.activo.desc(), Actividad.fecha_inicio.desc().nullslast()
    )
    rows = (await db.execute(stmt)).scalars().all()
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
            Actividad.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        Actividad,
        rec_id=act_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Actividad",
    )


@router.post(
    "/{funcionario_id}/actividades/{act_id}/restaurar",
    response_model=ActividadOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_actividad(
    request: Request,
    funcionario_id: int,
    act_id: int,
    db: DbSession,
    user: CurrentUser,
) -> ActividadOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        Actividad,
        rec_id=act_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Actividad",
    )
    return ActividadOut.model_validate(rec)


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
    incluir_borrados: bool = Query(
        default=False, description="Incluir registros soft-deleted (solo ADMIN)"
    ),
) -> list[CarnetOut]:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    stmt = select(Carnet).where(Carnet.funcionario_id == funcionario_id)
    if not incluir_inactivos:
        stmt = stmt.where(Carnet.activo.is_(True))
    stmt = _aplicar_filtro_borrados(
        stmt, Carnet, await _es_admin(db, user), incluir_borrados
    )
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
            Carnet.deleted_at.is_(None),
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
    motivo: str = Query(..., min_length=3, description="Motivo del borrado lógico"),
) -> None:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    await _soft_delete(
        db,
        Carnet,
        rec_id=cn_id,
        funcionario_id=funcionario_id,
        user_id=user.id,
        motivo=motivo,
        nombre_entidad="Carnet",
    )


@router.post(
    "/{funcionario_id}/carnets/{cn_id}/restaurar",
    response_model=CarnetOut,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def restaurar_carnet(
    request: Request,
    funcionario_id: int,
    cn_id: int,
    db: DbSession,
    user: CurrentUser,
) -> CarnetOut:
    funcionario = await _funcionario_o_404(db, funcionario_id)
    await assert_scope_funcionario(db, user, funcionario)
    await _set_audit_ctx(db, user.id, _client_ip(request))
    rec = await _restaurar(
        db,
        Carnet,
        rec_id=cn_id,
        funcionario_id=funcionario_id,
        nombre_entidad="Carnet",
    )
    return CarnetOut.model_validate(rec)


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
    # Excluimos historicos cuyo carnet padre fue soft-deleted: el registro no
    # se borra (append-only), pero el frontend no debería listarlos cuando el
    # carnet asociado está en papelera.
    rows = (
        await db.execute(
            select(HistoricoCarnet)
            .join(Carnet, Carnet.id == HistoricoCarnet.carnet_id)
            .where(
                Carnet.funcionario_id == funcionario_id,
                Carnet.deleted_at.is_(None),
            )
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


# =============================================================================
# Idiomas (relación N:M vía personal.funcionario_idiomas)
# =============================================================================


@router.get("/{funcionario_id}/idiomas", response_model=list[int])
async def listar_idiomas_funcionario(
    funcionario_id: int, db: DbSession, user: CurrentUser
) -> list[int]:
    """Devuelve los IDs de idioma asignados al funcionario."""
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(status_code=404, detail="Funcionario no encontrado")
    await assert_scope_funcionario(db, user, funcionario)
    rows = await db.execute(
        text(
            "SELECT idioma_id FROM personal.funcionario_idiomas "
            "WHERE funcionario_id = :fid ORDER BY idioma_id"
        ).bindparams(fid=funcionario_id)
    )
    return [r[0] for r in rows.all()]


@router.put("/{funcionario_id}/idiomas", response_model=list[int])
async def reemplazar_idiomas_funcionario(
    funcionario_id: int,
    payload: list[int],
    db: DbSession,
    user: CurrentUser,
) -> list[int]:
    """Reemplaza el set completo de idiomas del funcionario."""
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(status_code=404, detail="Funcionario no encontrado")
    await assert_scope_funcionario(db, user, funcionario)
    await db.execute(
        text("DELETE FROM personal.funcionario_idiomas WHERE funcionario_id = :fid")
        .bindparams(fid=funcionario_id)
    )
    seen: set[int] = set()
    for idioma_id in payload:
        if idioma_id in seen:
            continue
        seen.add(idioma_id)
        try:
            await db.execute(
                text(
                    "INSERT INTO personal.funcionario_idiomas (funcionario_id, idioma_id) "
                    "VALUES (:fid, :iid) ON CONFLICT DO NOTHING"
                ).bindparams(fid=funcionario_id, iid=idioma_id)
            )
        except IntegrityError as e:
            raise HTTPException(
                status_code=400, detail=f"Idioma {idioma_id} inválido"
            ) from e
    return sorted(seen)


# ---------------------------------------------------------------------------
# Cambio de estatus con sustento (suspensión / reactivación / egreso)
# ---------------------------------------------------------------------------

_TIPO_MOVIMIENTO = {
    "SUSPENDIDO": "SUSPENSION",
    "ACTIVO": "REACTIVACION",
    "EGRESADO": "EGRESO",
}


class CambioEstatusIn(BaseModel):
    estatus_nuevo: Literal["SUSPENDIDO", "ACTIVO", "EGRESADO"]
    fecha_efectiva: date | None = None
    fecha_fin: date | None = None
    motivo: str | None = None
    base_legal: str | None = None
    resolucion: str | None = None
    observaciones: str | None = None


@router.post(
    "/{funcionario_id}/cambiar-estatus",
    dependencies=[Depends(require_role("RRHH", "SUPERVISOR", "INSPECTOR", "ADMIN"))],
)
async def cambiar_estatus(
    request: Request,
    funcionario_id: int,
    payload: CambioEstatusIn,
    db: DbSession,
    user: CurrentUser,
) -> dict[str, Any]:
    """Cambia el estatus del funcionario dejando el movimiento registrado en
    ops.movimientos_estatus (motivo, fechas, resolución, base legal). Sustituye
    al PATCH pelado que descartaba esos campos en silencio.
    """
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(status_code=404, detail="Funcionario no encontrado")
    await assert_scope_funcionario(db, user, funcionario)

    estatus_anterior = funcionario.estatus
    if estatus_anterior == payload.estatus_nuevo:
        raise HTTPException(
            status_code=400,
            detail=f"El funcionario ya está en estatus {payload.estatus_nuevo}",
        )

    await _set_audit_ctx(db, user.id, _client_ip(request))

    movimiento = MovimientoEstatus(
        funcionario_id=funcionario_id,
        tipo=_TIPO_MOVIMIENTO[payload.estatus_nuevo],
        estatus_anterior=estatus_anterior,
        estatus_nuevo=payload.estatus_nuevo,
        fecha_efectiva=payload.fecha_efectiva or date.today(),
        fecha_fin=payload.fecha_fin,
        motivo=payload.motivo,
        base_legal=payload.base_legal,
        resolucion=payload.resolucion,
        observaciones=payload.observaciones,
        created_by=user.id,
    )
    db.add(movimiento)
    funcionario.estatus = payload.estatus_nuevo
    await db.flush()
    return {
        "id": movimiento.id,
        "estatus_anterior": estatus_anterior,
        "estatus_nuevo": payload.estatus_nuevo,
    }


@router.get("/{funcionario_id}/movimientos-estatus")
async def listar_movimientos_estatus(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
) -> list[dict[str, Any]]:
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(status_code=404, detail="Funcionario no encontrado")
    await assert_scope_funcionario(db, user, funcionario)
    rows = (
        await db.scalars(
            select(MovimientoEstatus)
            .where(MovimientoEstatus.funcionario_id == funcionario_id)
            .order_by(MovimientoEstatus.fecha_efectiva.desc(), MovimientoEstatus.id.desc())
        )
    ).all()
    return [
        {
            "id": m.id,
            "tipo": m.tipo,
            "estatus_anterior": m.estatus_anterior,
            "estatus_nuevo": m.estatus_nuevo,
            "fecha_efectiva": m.fecha_efectiva.isoformat(),
            "fecha_fin": m.fecha_fin.isoformat() if m.fecha_fin else None,
            "motivo": m.motivo,
            "base_legal": m.base_legal,
            "resolucion": m.resolucion,
            "observaciones": m.observaciones,
        }
        for m in rows
    ]


# ---------------------------------------------------------------------------
# Auditoría por funcionario
# ---------------------------------------------------------------------------

_OPERACION_LABEL = {"I": "CREAR", "U": "EDITAR", "D": "ELIMINAR"}


@router.get("/{funcionario_id}/auditoria")
async def auditoria_funcionario(
    funcionario_id: int,
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict[str, Any]]:
    """Historial de cambios del funcionario y sus registros relacionados.

    Junta dos orígenes de aud.log_cambios: los cambios sobre la fila del
    funcionario (registro_id) y los cambios en tablas de dominio cuyo JSONB
    referencia funcionario_id (reposos, ascensos, cargas familiares, etc.).
    """
    funcionario = await db.scalar(
        select(Funcionario).where(Funcionario.id == funcionario_id)
    )
    if funcionario is None:
        raise HTTPException(status_code=404, detail="Funcionario no encontrado")
    await assert_scope_funcionario(db, user, funcionario)

    res = await db.execute(
        text(
            """SELECT id, table_name, operacion::text AS operacion,
                      usuario_id, usuario_nombre, ip::text AS ip, fecha
               FROM aud.log_cambios
               WHERE (table_name = 'funcionarios' AND registro_id = :fid_txt)
                  OR (valor_nuevo->>'funcionario_id' = :fid_txt)
                  OR (valor_anterior->>'funcionario_id' = :fid_txt)
               ORDER BY fecha DESC
               LIMIT :limit"""
        ).bindparams(fid_txt=str(funcionario_id), limit=limit)
    )
    eventos: list[dict[str, Any]] = []
    for r in res:
        tipo = _OPERACION_LABEL.get(r.operacion, r.operacion)
        eventos.append(
            {
                "id": r.id,
                "funcionario_id": funcionario_id,
                "tipo": tipo,
                "tabla": r.table_name,
                "usuario_id": r.usuario_id,
                "usuario_nombre": r.usuario_nombre or "sistema",
                "fecha": r.fecha.isoformat(),
                "descripcion": f"{tipo.capitalize()} en {r.table_name}",
                "ip": r.ip,
            }
        )
    return eventos
