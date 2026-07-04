"""Schemas Pydantic para permisos granulares rol x recurso."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoRecurso = Literal["seccion_ficha", "sidebar", "accion_panel"]
NivelAcceso = Literal["edit", "view", "none"]


class PermisoRecursoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rol_id: int
    rol_codigo: str
    recurso_tipo: TipoRecurso
    recurso_codigo: str
    nivel: NivelAcceso
    updated_at: datetime


class PermisoRecursoUpsert(BaseModel):
    """Una celda de la matriz que el admin envía al guardar."""

    rol_codigo: str = Field(min_length=1, max_length=32)
    recurso_tipo: TipoRecurso
    recurso_codigo: str = Field(min_length=1, max_length=64)
    nivel: NivelAcceso


class MatrizUpdate(BaseModel):
    """Bulk update — admin guarda múltiples cambios a la vez."""

    cambios: list[PermisoRecursoUpsert]
