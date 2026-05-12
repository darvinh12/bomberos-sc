from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GuardiaCreate(BaseModel):
    fecha: date
    estacion_id: int
    seccion: str | None = Field(default=None, max_length=1)
    turno: str = Field(pattern=r"^(DIURNO|NOCTURNO|24H)$")
    hora_inicio: time
    hora_fin: time
    jefe_guardia_id: int | None = None
    observaciones: str | None = None


class GuardiaOut(GuardiaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cerrada: bool


class GuardiaFuncionarioCreate(BaseModel):
    funcionario_id: int
    rol_guardia: str | None = None
    asistio: bool | None = None
    motivo_inasistencia: str | None = None
    hora_llegada: time | None = None
    hora_salida: time | None = None


class GuardiaFuncionarioOut(GuardiaFuncionarioCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class GuardiaDetalle(GuardiaOut):
    funcionarios_asignados: list[GuardiaFuncionarioOut] = []


class VacacionesUpdate(BaseModel):
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    dias_habiles: int | None = None
    fraccionada: bool | None = None
    autorizado: bool | None = None
    observaciones: str | None = None


class PermisoCreate(BaseModel):
    funcionario_id: int
    tipo: str
    fecha_inicio: date
    fecha_fin: date
    horas: float | None = None
    motivo: str = Field(min_length=3)
    autorizado: bool = False
    documento_url: str | None = None

    @field_validator("fecha_fin")
    @classmethod
    def fin_ge_inicio(cls, v: date, info):
        ini = info.data.get("fecha_inicio")
        if ini and v < ini:
            raise ValueError("fecha_fin debe ser >= fecha_inicio")
        return v


class PermisoOut(PermisoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class VacacionesCreate(BaseModel):
    funcionario_id: int
    periodo_anio: int = Field(ge=2000, le=2100)
    fecha_inicio: date
    fecha_fin: date
    dias_habiles: int | None = None
    fraccionada: bool = False
    autorizado: bool = False
    documento_url: str | None = None
    observaciones: str | None = None


class VacacionesOut(VacacionesCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dias_calendario: int | None
    bono_pagado: bool


class ComisionCreate(BaseModel):
    funcionario_id: int
    institucion_id: int | None = None
    institucion_libre: str | None = None
    cargo_comision: str | None = None
    fecha_inicio: date
    fecha_fin: date | None = None
    resolucion: str | None = None
    documento_url: str | None = None


class ComisionOut(ComisionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activo: bool


class FaltaCreate(BaseModel):
    funcionario_id: int
    tipo_falta: str = Field(pattern=r"^(LEVE|MEDIA|GRAVE)$")
    fecha: date
    descripcion: str
    sancion: str | None = None
    dias_suspension: int | None = None
    fecha_inicio_susp: date | None = None
    fecha_fin_susp: date | None = None
    resolucion: str | None = None
    documento_url: str | None = None


class FaltaOut(FaltaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    apelada: bool
