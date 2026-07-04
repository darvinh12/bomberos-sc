"""Edición de parámetros del sistema (sys.parametros).

Solo ADMIN. Solo se puede modificar VALOR; los demás campos son metadatos
gestionados por scripts SQL. Si `editable=false`, el parámetro es read-only.
Si `sensible=true`, el valor se enmascara al listarlo.

Cualquier cambio queda registrado en aud.log_cambios automáticamente.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, not_found, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role
from bomberos_api.models.sys import Parametro

router = APIRouter(
    prefix="/admin/parametros",
    tags=["admin-parametros"],
    dependencies=[Depends(require_role("ADMIN"))],
)


class ParametroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nombre: str
    valor: str
    tipo_dato: str
    descripcion: str | None
    editable: bool
    sensible: bool
    grupo: str


def _mascarar(p: Parametro) -> ParametroOut:
    out = ParametroOut.model_validate(p)
    if p.sensible:
        out.valor = "••••••••"
    return out


def _validar_valor(tipo: str, raw: str) -> str:
    """Valida que el string sea compatible con el tipo declarado. Devuelve normalizado."""
    raw = raw.strip()
    if tipo == "int":
        try:
            int(raw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="El valor debe ser entero") from e
    elif tipo == "decimal":
        try:
            float(raw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="El valor debe ser decimal") from e
    elif tipo == "boolean":
        if raw.lower() not in ("true", "false", "1", "0", "t", "f"):
            raise HTTPException(status_code=400, detail="El valor debe ser true/false")
        raw = "true" if raw.lower() in ("true", "1", "t") else "false"
    elif tipo == "date":
        from datetime import date

        try:
            date.fromisoformat(raw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Formato YYYY-MM-DD") from e
    elif tipo == "json":
        import json as _json

        try:
            _json.loads(raw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="JSON inválido") from e
    return raw


class ParametroUpdate(BaseModel):
    valor: str = Field(min_length=1, max_length=4096)


@router.get("", response_model=list[ParametroOut])
async def listar_parametros(db: DbSession, _: CurrentUser) -> list[ParametroOut]:
    rows = (
        await db.execute(select(Parametro).order_by(Parametro.grupo, Parametro.codigo))
    ).scalars().all()
    return [_mascarar(p) for p in rows]


@router.patch("/{rec_id}", response_model=ParametroOut)
async def actualizar_parametro(
    request: Request,
    rec_id: int,
    payload: ParametroUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ParametroOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    p = await db.scalar(select(Parametro).where(Parametro.id == rec_id))
    if p is None:
        raise not_found("Parámetro")
    if not p.editable:
        raise HTTPException(
            status_code=403,
            detail="Este parámetro es read-only (editable=false). Cambia el flag desde SQL si tenés certeza.",
        )
    p.valor = _validar_valor(p.tipo_dato, payload.valor)
    try:
        await db.flush()
    except IntegrityError as e:
        raise integrity_409(e) from e
    return _mascarar(p)
