from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class AyudaCreate(BaseModel):
    funcionario_id: int
    tipo_solicitud_id: int
    monto_solicitado: float | None = None
    motivo: str = Field(min_length=3)
    beneficiario_id: int | None = None
    documento_url: str | None = None
    soporte_url: str | None = None
    banco_id: int | None = None
    cuenta: str | None = None
    observaciones: str | None = None


class AyudaUpdate(BaseModel):
    monto_aprobado: float | None = None
    monto_pagado: float | None = None
    fecha_aprobacion: date | None = None
    fecha_pago: date | None = None
    estatus: str | None = None
    referencia_pago: str | None = None
    observaciones: str | None = None


class AyudaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    funcionario_id: int
    tipo_solicitud_id: int
    monto_solicitado: float | None
    monto_aprobado: float | None
    monto_pagado: float | None
    fecha_solicitud: date
    fecha_aprobacion: date | None
    fecha_pago: date | None
    motivo: str
    estatus: str


class EntregaCreate(BaseModel):
    funcionario_id: int
    tipo_beneficio_id: int
    periodo: str | None = None
    monto: float | None = None
    cantidad: int | None = None
    fecha_entrega: date
    referencia: str | None = None
    documento_url: str | None = None
    observaciones: str | None = None


class EntregaOut(EntregaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    estatus: str
