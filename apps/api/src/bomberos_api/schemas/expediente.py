"""Schemas Pydantic v2 para el expediente personal.

Convenciones:
- `XOut`: lectura, incluye `id` y FK al funcionario (cuando aplica).
- `XCreate`: alta, sin `id` ni `funcionario_id` (el path lo aporta).
- `XUpdate`: parche, todos los campos opcionales.
- `ConfigDict(from_attributes=True)` para mapear desde modelos ORM.
- Los ENUM de Postgres se validan con `pattern=` o lista cerrada para fallar
  temprano antes de llegar al COMMIT.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# Valores válidos para core.tipo_actividad
_TIPO_ACTIVIDAD = r"^(CULTURAL|DEPORTIVA|MUSICAL|CIENTIFICA|LABORAL|ACADEMICA)$"


class _SoftDeleteOut(BaseModel):
    """Campos de auditoría de borrado lógico expuestos al cliente.

    Estos campos son siempre nulos en items activos. Cuando el cliente solicita
    `?incluir_borrados=true` (solo ADMIN), pueden venir poblados para que la UI
    de papelera muestre quién y por qué eliminó el registro.
    """

    deleted_at: datetime | None = None
    deleted_by: int | None = None
    delete_reason: str | None = None


# =============================================================================
# CARGA FAMILIAR
# =============================================================================


class _CargaFamiliarBase(BaseModel):
    parentesco: str | None = Field(default=None, max_length=40)
    nacionalidad: str | None = Field(default=None, pattern=r"^[VE]$")
    cedula: int | None = None
    apellidos: str | None = Field(default=None, max_length=120)
    nombres: str | None = Field(default=None, max_length=120)
    fecha_nacimiento: date | None = None
    sexo: str | None = Field(default=None, pattern=r"^[MF]$")
    estado_civil_id: int | None = None
    nivel_educativo_id: int | None = None
    estudia: bool | None = None
    institucion_estudio: str | None = None
    trabaja: bool | None = None
    lugar_trabajo: str | None = None
    discapacidad: bool | None = None
    detalle_discapacidad: str | None = None
    es_beneficiario_hcm: bool | None = None
    activo: bool | None = None
    fecha_inclusion: date | None = None
    fecha_baja: date | None = None
    motivo_baja: str | None = None
    observaciones: str | None = None


class CargaFamiliarCreate(_CargaFamiliarBase):
    parentesco: str = Field(..., max_length=40)
    apellidos: str = Field(..., max_length=120)
    nombres: str = Field(..., max_length=120)


class CargaFamiliarUpdate(_CargaFamiliarBase):
    pass


class CargaFamiliarOut(_CargaFamiliarBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    parentesco: str
    apellidos: str
    nombres: str
    estudia: bool
    trabaja: bool
    discapacidad: bool
    es_beneficiario_hcm: bool
    activo: bool
    fecha_inclusion: date
    created_at: datetime
    updated_at: datetime


# =============================================================================
# HISTORICO JERARQUIAS
# =============================================================================


class _HistoricoJerarquiaBase(BaseModel):
    jerarquia_id: int | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    motivo: str | None = None
    resolucion: str | None = None
    documento_url: str | None = None


class HistoricoJerarquiaCreate(_HistoricoJerarquiaBase):
    jerarquia_id: int
    fecha_inicio: date


class HistoricoJerarquiaUpdate(_HistoricoJerarquiaBase):
    pass


class HistoricoJerarquiaOut(_HistoricoJerarquiaBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    jerarquia_id: int
    fecha_inicio: date
    created_at: datetime


# =============================================================================
# HISTORICO UBICACIONES
# =============================================================================


class _HistoricoUbicacionBase(BaseModel):
    zona_id: int | None = None
    estacion_id: int | None = None
    area_id: int | None = None
    dependencia_id: int | None = None
    division_id: int | None = None
    cargo_id: int | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    motivo: str | None = None
    resolucion: str | None = None
    documento_url: str | None = None


class HistoricoUbicacionCreate(_HistoricoUbicacionBase):
    fecha_inicio: date


class HistoricoUbicacionUpdate(_HistoricoUbicacionBase):
    pass


class HistoricoUbicacionOut(_HistoricoUbicacionBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    fecha_inicio: date
    created_at: datetime


# =============================================================================
# TIEMPO ADM PUBLICA
# =============================================================================


class _TiempoAdmPublicaBase(BaseModel):
    institucion: str | None = Field(default=None, max_length=200)
    cargo: str | None = Field(default=None, max_length=120)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    documento_url: str | None = None
    observaciones: str | None = None


class TiempoAdmPublicaCreate(_TiempoAdmPublicaBase):
    institucion: str = Field(..., max_length=200)
    fecha_inicio: date


class TiempoAdmPublicaUpdate(_TiempoAdmPublicaBase):
    pass


class TiempoAdmPublicaOut(_TiempoAdmPublicaBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    institucion: str
    fecha_inicio: date


# =============================================================================
# HABILIDADES
# =============================================================================


class _HabilidadBase(BaseModel):
    grupo: str | None = Field(default=None, max_length=40)
    nombre: str | None = Field(default=None, max_length=120)
    nivel: str | None = Field(default=None, max_length=40)
    certificado: bool | None = None
    documento_url: str | None = None


class HabilidadCreate(_HabilidadBase):
    grupo: str = Field(..., max_length=40)
    nombre: str = Field(..., max_length=120)


class HabilidadUpdate(_HabilidadBase):
    pass


class HabilidadOut(_HabilidadBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    grupo: str
    nombre: str
    certificado: bool


# =============================================================================
# ACTIVIDADES
# =============================================================================


class _ActividadBase(BaseModel):
    tipo: str | None = Field(default=None, pattern=_TIPO_ACTIVIDAD)
    nombre: str | None = Field(default=None, max_length=200)
    descripcion: str | None = None
    institucion: str | None = Field(default=None, max_length=200)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    nivel: str | None = Field(default=None, max_length=40)
    logros: str | None = None
    activo: bool | None = None


class ActividadCreate(_ActividadBase):
    tipo: str = Field(..., pattern=_TIPO_ACTIVIDAD)
    nombre: str = Field(..., max_length=200)


class ActividadUpdate(_ActividadBase):
    pass


class ActividadOut(_ActividadBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    tipo: str
    nombre: str
    activo: bool


# =============================================================================
# CARNETS
# =============================================================================


class _CarnetBase(BaseModel):
    tipo_carnet_id: int | None = None
    numero: str | None = Field(default=None, max_length=80)
    serial: str | None = Field(default=None, max_length=80)
    codigo_qr: str | None = None
    fecha_emision: date | None = None
    fecha_vence: date | None = None
    organismo_emisor: str | None = Field(default=None, max_length=120)
    documento_url: str | None = None
    observaciones: str | None = None
    activo: bool | None = None


class CarnetCreate(_CarnetBase):
    tipo_carnet_id: int


class CarnetUpdate(_CarnetBase):
    # Motivo opcional que se replica al historico cuando cambia el número.
    motivo_cambio: str | None = Field(default=None, max_length=200)


class CarnetOut(_CarnetBase, _SoftDeleteOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    funcionario_id: int
    tipo_carnet_id: int
    activo: bool
    created_at: datetime
    updated_at: datetime


# =============================================================================
# HISTORICO CARNETS (solo lectura — se genera desde POST/PATCH en carnets)
# =============================================================================


class HistoricoCarnetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    carnet_id: int
    numero_anterior: str | None = None
    numero_nuevo: str | None = None
    motivo: str | None = None
    fecha: date
    usuario_id: int | None = None
