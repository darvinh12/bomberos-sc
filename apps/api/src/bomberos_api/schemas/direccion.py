"""Schemas Pydantic para personal.direcciones.

Convención: los campos de bienestar (damnificado, damnificado_desde,
reside_alto_riesgo, ayuda_economica) son sensibles. El router decide si
permite escribirlos según el rol del usuario (solo RRHH/ADMIN).
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

# Conjunto de campos restringidos a RRHH/ADMIN. El router los filtra silenciosamente
# del payload si el usuario no tiene rol suficiente.
CAMPOS_BIENESTAR: frozenset[str] = frozenset(
    {"damnificado", "damnificado_desde", "reside_alto_riesgo", "ayuda_economica"}
)


class _DireccionBase(BaseModel):
    """Campos comunes a Create y Update. Todos opcionales aquí — los requeridos
    se marcan en DireccionCreate."""

    es_actual: bool | None = None

    estado_id: int | None = None
    municipio_id: int | None = None
    parroquia_id: int | None = None

    sector: str | None = Field(default=None, max_length=200)
    urbanizacion: str | None = Field(default=None, max_length=200)
    calle: str | None = Field(default=None, max_length=200)
    edificio_casa: str | None = Field(default=None, max_length=200)
    piso: str | None = Field(default=None, max_length=20)
    apartamento: str | None = Field(default=None, max_length=20)
    referencia: str | None = Field(default=None, max_length=400)
    direccion_completa: str | None = Field(default=None, max_length=500)
    codigo_postal: str | None = Field(default=None, max_length=10)
    latitud: Decimal | None = None
    longitud: Decimal | None = None

    es_propia: bool | None = None
    es_alquilada: bool | None = None
    tipo_vivienda_id: int | None = None
    tenencia_id: int | None = None

    # Bienestar — solo editable por RRHH/ADMIN
    damnificado: bool | None = None
    damnificado_desde: date | None = None
    reside_alto_riesgo: bool | None = None
    ayuda_economica: bool | None = None

    fecha_registro: date | None = None
    observaciones: str | None = None


class DireccionCreate(_DireccionBase):
    """Alta de dirección. Si `es_actual` es true, el router se encarga de
    desmarcar las otras direcciones del mismo funcionario."""

    pass


class DireccionUpdate(_DireccionBase):
    """Actualización parcial — todos los campos opcionales."""

    pass


class DireccionOut(_DireccionBase):
    """Salida completa de una dirección.

    Incluye los campos de soft-delete (siempre nulos en items activos). Cuando
    el cliente pide `?incluir_borrados=true` (solo ADMIN) pueden venir poblados
    para que la UI de papelera muestre quién y por qué eliminó la dirección.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    es_actual: bool
    fecha_registro: date
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    deleted_by: int | None = None
    delete_reason: str | None = None
