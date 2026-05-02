from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ProteccionInventarioCreate(BaseModel):
    tipo_id: int
    proveedor_id: int | None = None
    talla_id: int | None = None
    marca: str | None = None
    modelo: str | None = None
    color: str | None = None
    numero_serie: str | None = None
    lote: str | None = None
    fecha_adquisicion: date | None = None
    fecha_vence: date | None = None
    costo: float | None = None
    estatus: str = "DISPONIBLE"
    estacion_id: int | None = None
    observaciones: str | None = None


class ProteccionInventarioOut(ProteccionInventarioCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ProteccionAsignacionCreate(BaseModel):
    inventario_id: int
    funcionario_id: int
    fecha_entrega: date
    estado_entrega: str | None = None
    documento_url: str | None = None
    observaciones: str | None = None


class ProteccionAsignacionOut(ProteccionAsignacionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fecha_devolucion: date | None
    estado_devolucion: str | None
    devuelto: bool


class RadioCreate(BaseModel):
    modelo_id: int
    serial: str = Field(min_length=3)
    placa_inv: str | None = None
    frecuencia: str | None = None
    canal: str | None = None
    fecha_adquisicion: date | None = None
    costo: float | None = None
    estacion_id: int | None = None
    estatus: str = "DISPONIBLE"
    observaciones: str | None = None


class RadioOut(RadioCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class RadioAsignacionCreate(BaseModel):
    radio_id: int
    funcionario_id: int | None = None
    estacion_id: int | None = None
    fecha_asignacion: date
    documento_url: str | None = None
    observaciones: str | None = None


class RadioAsignacionOut(RadioAsignacionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fecha_devolucion: date | None
