from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CursoRealizadoCreate(BaseModel):
    funcionario_id: int
    curso_id: int | None = None
    nombre_libre: str | None = None
    institucion: str | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    horas: int | None = None
    nota: float | None = Field(default=None, ge=0, le=100)
    aprobado: bool | None = None
    certificado_url: str | None = None
    observaciones: str | None = None


class CursoRealizadoOut(CursoRealizadoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class EvaluacionCreate(BaseModel):
    funcionario_id: int
    periodo_id: int
    tipo: str = Field(pattern=r"^(DESEMPENO|FISICA|INTEGRAL|ESTADO_MAYOR)$")
    evaluador_id: int | None = None
    nota_total: float | None = None
    estatus: str = "BORRADOR"
    documento_url: str | None = None
    observaciones: str | None = None


class EvaluacionOut(EvaluacionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class AscensoCreate(BaseModel):
    funcionario_id: int
    proceso_id: int | None = None
    jerarquia_anterior_id: int | None = None
    jerarquia_nueva_id: int
    fecha_efectiva: date
    resolucion: str | None = None
    documento_url: str | None = None
    nota_evaluacion: float | None = None
    posicion_lista: int | None = None
    observaciones: str | None = None


class AscensoOut(AscensoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ReconocimientoCreate(BaseModel):
    funcionario_id: int
    condecoracion_id: int | None = None
    institucion_id: int | None = None
    nombre_libre: str | None = None
    fecha_otorgamiento: date
    motivo: str | None = None
    resolucion: str | None = None
    documento_url: str | None = None


class ReconocimientoOut(ReconocimientoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class MeritoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    funcionario_id: int
    periodo_id: int | None
    puntaje_evaluacion: float | None
    puntaje_cursos: float | None
    puntaje_actividades: float | None
    puntaje_condecoraciones: float | None
    puntaje_faltas: float | None
    puntaje_total: float | None
    posicion: int | None
