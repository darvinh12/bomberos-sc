from datetime import date

from pydantic import BaseModel, ConfigDict


class SolicitudJubilacionCreate(BaseModel):
    funcionario_id: int
    fecha_solicitud: date
    fecha_efectiva_propuesta: date | None = None
    años_servicio: float | None = None
    motivo: str | None = None


class SolicitudJubilacionOut(SolicitudJubilacionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    estatus: str
    resolucion: str | None
    documento_url: str | None


class JubiladoCreate(BaseModel):
    funcionario_id: int
    fecha_jubilacion: date
    años_servicio: float | None = None
    tipo_jubilacion: str | None = None
    pension_mensual: float | None = None
    moneda: str | None = "VES"
    resolucion: str | None = None


class JubiladoOut(JubiladoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activo: bool


class FallecimientoCreate(BaseModel):
    funcionario_id: int
    fecha_fallecimiento: date
    en_servicio: bool = False
    causa: str | None = None
    lugar: str | None = None
    acta_defuncion: str | None = None
    documento_url: str | None = None


class FallecimientoOut(FallecimientoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    beneficio_funerario_pagado: bool
