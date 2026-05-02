"""CRUD de campos personalizados (`core.campos_custom`).

Solo accesible por ADMIN. Estos campos se renderizan dinámicamente en
los formularios de cada entidad y los valores se guardan en la columna
`metadata` JSONB de la entidad correspondiente.
"""

from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from bomberos_api.core.crud import client_ip, integrity_409, set_audit_ctx
from bomberos_api.core.deps import CurrentUser, DbSession, require_role

router = APIRouter(
    prefix="/admin/campos-custom",
    tags=["admin"],
    dependencies=[Depends(require_role("ADMIN"))],
)

ENTIDADES_PERMITIDAS = {
    "funcionario", "reposo", "vacaciones", "permiso", "comision", "falta",
    "guardia", "ayuda", "ascenso", "curso", "evaluacion", "proteccion", "radio",
    "reconocimiento", "jubilado", "solicitud_jubilacion", "fallecimiento",
}

TipoCampo = Literal["texto", "texto_largo", "numero", "fecha", "booleano", "seleccion"]


class CampoCustomCreate(BaseModel):
    entidad: str
    codigo: str = Field(min_length=2, max_length=50)
    etiqueta: str = Field(min_length=2, max_length=100)
    tipo: TipoCampo
    opciones: list[str] | None = None
    requerido: bool = False
    orden: int = Field(default=0, ge=0, le=999)
    ayuda_descripcion: str | None = Field(default=None, max_length=500)

    @field_validator("entidad")
    @classmethod
    def entidad_valida(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ENTIDADES_PERMITIDAS:
            raise ValueError(f"Entidad inválida. Permitidas: {sorted(ENTIDADES_PERMITIDAS)}")
        return v

    @field_validator("codigo")
    @classmethod
    def codigo_snake(cls, v: str) -> str:
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            raise ValueError("código debe ser snake_case ([a-z][a-z0-9_]*)")
        return v


class CampoCustomUpdate(BaseModel):
    etiqueta: str | None = Field(default=None, min_length=2, max_length=100)
    requerido: bool | None = None
    orden: int | None = Field(default=None, ge=0, le=999)
    activo: bool | None = None
    opciones: list[str] | None = None
    ayuda_descripcion: str | None = Field(default=None, max_length=500)


class CampoCustomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entidad: str
    codigo: str
    etiqueta: str
    tipo: str
    opciones: list[str] | None
    requerido: bool
    orden: int
    activo: bool
    ayuda_descripcion: str | None


@router.get("", response_model=list[CampoCustomOut])
async def listar(
    db: DbSession,
    _: CurrentUser,
    entidad: str | None = None,
    activo: bool | None = None,
) -> list[CampoCustomOut]:
    sql = """
    SELECT id, entidad, codigo, etiqueta, tipo, opciones, requerido,
           orden, activo, ayuda_descripcion
    FROM core.campos_custom
    WHERE 1=1
    """
    params: dict = {}
    if entidad is not None:
        sql += " AND entidad = :entidad"
        params["entidad"] = entidad
    if activo is not None:
        sql += " AND activo = :activo"
        params["activo"] = activo
    sql += " ORDER BY entidad, orden, codigo"
    res = await db.execute(text(sql).bindparams(**params))
    return [
        CampoCustomOut(
            id=r.id, entidad=r.entidad, codigo=r.codigo, etiqueta=r.etiqueta,
            tipo=r.tipo, opciones=r.opciones, requerido=r.requerido,
            orden=r.orden, activo=r.activo, ayuda_descripcion=r.ayuda_descripcion,
        )
        for r in res
    ]


@router.post("", response_model=CampoCustomOut, status_code=status.HTTP_201_CREATED)
async def crear(
    request: Request,
    payload: CampoCustomCreate,
    db: DbSession,
    user: CurrentUser,
) -> CampoCustomOut:
    if payload.tipo == "seleccion" and not payload.opciones:
        raise HTTPException(
            status_code=400,
            detail="Para tipo 'seleccion' se requiere al menos una opción",
        )
    await set_audit_ctx(db, user.id, client_ip(request))
    try:
        res = await db.execute(
            text(
                """
                INSERT INTO core.campos_custom
                  (entidad, codigo, etiqueta, tipo, opciones, requerido,
                   orden, ayuda_descripcion, created_by, updated_by)
                VALUES
                  (:entidad, :codigo, :etiqueta, :tipo,
                   CAST(:opciones AS jsonb), :requerido, :orden,
                   :ayuda_descripcion, :uid, :uid)
                RETURNING id, entidad, codigo, etiqueta, tipo, opciones,
                          requerido, orden, activo, ayuda_descripcion
                """
            ).bindparams(
                entidad=payload.entidad,
                codigo=payload.codigo,
                etiqueta=payload.etiqueta,
                tipo=payload.tipo,
                opciones=None if payload.opciones is None else __import__("json").dumps(payload.opciones),
                requerido=payload.requerido,
                orden=payload.orden,
                ayuda_descripcion=payload.ayuda_descripcion,
                uid=user.id,
            )
        )
    except IntegrityError as e:
        raise integrity_409(e) from e
    r = res.fetchone()
    return CampoCustomOut(
        id=r.id, entidad=r.entidad, codigo=r.codigo, etiqueta=r.etiqueta,
        tipo=r.tipo, opciones=r.opciones, requerido=r.requerido, orden=r.orden,
        activo=r.activo, ayuda_descripcion=r.ayuda_descripcion,
    )


@router.patch("/{campo_id}", response_model=CampoCustomOut)
async def actualizar(
    request: Request,
    campo_id: int,
    payload: CampoCustomUpdate,
    db: DbSession,
    user: CurrentUser,
) -> CampoCustomOut:
    await set_audit_ctx(db, user.id, client_ip(request))
    sets = []
    params: dict = {"id": campo_id, "uid": user.id}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if k == "opciones":
            sets.append(f"{k} = CAST(:{k} AS jsonb)")
            params[k] = None if v is None else __import__("json").dumps(v)
        else:
            sets.append(f"{k} = :{k}")
            params[k] = v
    if not sets:
        raise HTTPException(status_code=400, detail="Sin campos para actualizar")
    sets.append("updated_by = :uid")
    sql = f"""
    UPDATE core.campos_custom SET {', '.join(sets)}
    WHERE id = :id
    RETURNING id, entidad, codigo, etiqueta, tipo, opciones, requerido,
              orden, activo, ayuda_descripcion
    """
    try:
        res = await db.execute(text(sql).bindparams(**params))
    except IntegrityError as e:
        raise integrity_409(e) from e
    r = res.fetchone()
    if r is None:
        raise HTTPException(status_code=404, detail="Campo no encontrado")
    return CampoCustomOut(
        id=r.id, entidad=r.entidad, codigo=r.codigo, etiqueta=r.etiqueta,
        tipo=r.tipo, opciones=r.opciones, requerido=r.requerido, orden=r.orden,
        activo=r.activo, ayuda_descripcion=r.ayuda_descripcion,
    )


@router.delete("/{campo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar(
    request: Request, campo_id: int, db: DbSession, user: CurrentUser
) -> None:
    """Soft-delete: marca como inactivo. Para hard delete usa el SQL directo."""
    await set_audit_ctx(db, user.id, client_ip(request))
    res = await db.execute(
        text(
            "UPDATE core.campos_custom SET activo = FALSE, updated_by = :uid "
            "WHERE id = :id RETURNING id"
        ).bindparams(id=campo_id, uid=user.id)
    )
    if res.fetchone() is None:
        raise HTTPException(status_code=404, detail="Campo no encontrado")
