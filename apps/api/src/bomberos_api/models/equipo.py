from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class TipoProteccion(Base):
    __tablename__ = "tipos_proteccion"
    __table_args__ = {"schema": "equipo"}
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)
    descripcion: Mapped[str | None] = mapped_column(Text)
    requiere_talla: Mapped[bool] = mapped_column(Boolean, default=True)
    grupo_talla: Mapped[str | None] = mapped_column(String)
    vida_util_meses: Mapped[int | None] = mapped_column(SmallInteger)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class ProteccionInventario(Base):
    __tablename__ = "proteccion_inventario"
    __table_args__ = {"schema": "equipo"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tipo_id: Mapped[int] = mapped_column(SmallInteger)
    proveedor_id: Mapped[int | None] = mapped_column(BigInteger)
    talla_id: Mapped[int | None] = mapped_column(SmallInteger)
    marca: Mapped[str | None] = mapped_column(String)
    modelo: Mapped[str | None] = mapped_column(String)
    color: Mapped[str | None] = mapped_column(String)
    numero_serie: Mapped[str | None] = mapped_column(String, unique=True)
    lote: Mapped[str | None] = mapped_column(String)
    fecha_adquisicion: Mapped[date | None] = mapped_column(Date)
    fecha_vence: Mapped[date | None] = mapped_column(Date)
    costo: Mapped[float | None] = mapped_column(Numeric(15, 2))
    estatus: Mapped[str] = mapped_column(String, default="DISPONIBLE")
    estacion_id: Mapped[int | None] = mapped_column(SmallInteger)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProteccionAsignacion(Base):
    __tablename__ = "proteccion_asignaciones"
    __table_args__ = {"schema": "equipo"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    inventario_id: Mapped[int] = mapped_column(BigInteger)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    fecha_entrega: Mapped[date] = mapped_column(Date)
    fecha_devolucion: Mapped[date | None] = mapped_column(Date)
    estado_entrega: Mapped[str | None] = mapped_column(String)
    estado_devolucion: Mapped[str | None] = mapped_column(String)
    devuelto: Mapped[bool] = mapped_column(Boolean, default=False)
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Radio(Base):
    __tablename__ = "radios"
    __table_args__ = {"schema": "equipo"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    modelo_id: Mapped[int] = mapped_column(SmallInteger)
    serial: Mapped[str] = mapped_column(String, unique=True)
    placa_inv: Mapped[str | None] = mapped_column(String)
    frecuencia: Mapped[str | None] = mapped_column(String)
    canal: Mapped[str | None] = mapped_column(String)
    fecha_adquisicion: Mapped[date | None] = mapped_column(Date)
    costo: Mapped[float | None] = mapped_column(Numeric(15, 2))
    estacion_id: Mapped[int | None] = mapped_column(SmallInteger)
    estatus: Mapped[str] = mapped_column(String, default="DISPONIBLE")
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RadioAsignacion(Base):
    __tablename__ = "radio_asignaciones"
    __table_args__ = {"schema": "equipo"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    radio_id: Mapped[int] = mapped_column(BigInteger)
    funcionario_id: Mapped[int | None] = mapped_column(BigInteger)
    estacion_id: Mapped[int | None] = mapped_column(SmallInteger)
    fecha_asignacion: Mapped[date] = mapped_column(Date)
    fecha_devolucion: Mapped[date | None] = mapped_column(Date)
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
