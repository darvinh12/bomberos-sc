from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReposoBase(BaseModel):
    funcionario_id: int
    tipo_reposo_id: int
    diagnostico_id: int | None = None
    diagnostico_libre: str | None = None
    medico_id: int | None = None
    centro_medico_id: int | None = None
    fecha_inicio: date
    fecha_fin: date
    folio: str | None = None
    documento_url: str | None = None
    observaciones: str | None = None

    @field_validator("fecha_fin")
    @classmethod
    def fin_ge_inicio(cls, v: date, info):
        ini = info.data.get("fecha_inicio")
        if ini and v < ini:
            raise ValueError("fecha_fin debe ser >= fecha_inicio")
        return v


class ReposoCreate(ReposoBase):
    pass


class ReposoUpdate(BaseModel):
    fecha_fin: date | None = None
    diagnostico_id: int | None = None
    diagnostico_libre: str | None = None
    medico_id: int | None = None
    centro_medico_id: int | None = None
    folio: str | None = None
    documento_url: str | None = None
    observaciones: str | None = None
    anulado: bool | None = None
    motivo_anulacion: str | None = None


class ReposoOut(ReposoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dias: int | None
    anulado: bool


class LesionCreate(BaseModel):
    funcionario_id: int
    tipo_accidente_id: int | None = None
    fecha_evento: date
    lugar_evento: str | None = None
    descripcion: str = Field(min_length=3)
    en_servicio: bool = True
    parte_afectada: str | None = None
    centro_medico_id: int | None = None
    medico_id: int | None = None
    diagnostico_id: int | None = None
    dias_incapacidad: int | None = None
    secuelas: str | None = None
    documento_url: str | None = None


class LesionOut(LesionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class EvaluacionFisicaCreate(BaseModel):
    funcionario_id: int
    fecha: date
    peso_kg: float | None = None
    estatura_cm: float | None = None
    presion_sistolica: int | None = None
    presion_diastolica: int | None = None
    pulso: int | None = None
    flexiones: int | None = None
    abdominales: int | None = None
    tiempo_carrera_seg: int | None = None
    apto: bool | None = None
    observaciones: str | None = None
    medico_id: int | None = None


class EvaluacionFisicaOut(EvaluacionFisicaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    imc: float | None = None
