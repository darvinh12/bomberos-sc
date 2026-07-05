from datetime import date, datetime, time

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class Guardia(Base):
    __tablename__ = "guardias"
    __table_args__ = (
        UniqueConstraint("fecha", "estacion_id", "seccion", "turno"),
        {"schema": "ops"},
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    fecha: Mapped[date] = mapped_column(Date)
    estacion_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("org.estaciones.id"))
    seccion: Mapped[str | None] = mapped_column(CHAR(1))
    turno: Mapped[str] = mapped_column(String)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    jefe_guardia_id: Mapped[int | None] = mapped_column(BigInteger)
    observaciones: Mapped[str | None] = mapped_column(Text)
    cerrada: Mapped[bool] = mapped_column(Boolean, default=False)
    cerrada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cerrada_por: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class GuardiaFuncionario(Base):
    __tablename__ = "guardia_funcionarios"
    __table_args__ = (
        UniqueConstraint("guardia_id", "funcionario_id"),
        {"schema": "ops"},
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    guardia_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ops.guardias.id", ondelete="CASCADE")
    )
    funcionario_id: Mapped[int] = mapped_column(BigInteger)
    rol_guardia: Mapped[str | None] = mapped_column(String)
    asistio: Mapped[bool | None] = mapped_column(Boolean)
    motivo_inasistencia: Mapped[str | None] = mapped_column(Text)
    hora_llegada: Mapped[time | None] = mapped_column(Time)
    hora_salida: Mapped[time | None] = mapped_column(Time)
    observaciones: Mapped[str | None] = mapped_column(Text)


class Permiso(Base):
    __tablename__ = "permisos"
    __table_args__ = {"schema": "ops"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo: Mapped[str] = mapped_column(String)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    horas: Mapped[float | None] = mapped_column(Numeric(5, 2))
    motivo: Mapped[str] = mapped_column(Text)
    autorizado: Mapped[bool] = mapped_column(Boolean, default=False)
    autorizado_por: Mapped[int | None] = mapped_column(BigInteger)
    autorizado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Vacaciones(Base):
    __tablename__ = "vacaciones"
    __table_args__ = {"schema": "ops"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    periodo_anio: Mapped[int] = mapped_column(SmallInteger)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    dias_habiles: Mapped[int | None] = mapped_column(SmallInteger)
    dias_calendario: Mapped[int | None] = mapped_column(SmallInteger)
    bono_pagado: Mapped[bool] = mapped_column(Boolean, default=False)
    monto_bono: Mapped[float | None] = mapped_column(Numeric(15, 2))
    fecha_pago_bono: Mapped[date | None] = mapped_column(Date)
    fraccionada: Mapped[bool] = mapped_column(Boolean, default=False)
    autorizado: Mapped[bool] = mapped_column(Boolean, default=False)
    autorizado_por: Mapped[int | None] = mapped_column(BigInteger)
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ComisionServicio(Base):
    __tablename__ = "comisiones_servicio"
    __table_args__ = {"schema": "ops"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    institucion_id: Mapped[int | None] = mapped_column(BigInteger)
    institucion_libre: Mapped[str | None] = mapped_column(String)
    cargo_comision: Mapped[str | None] = mapped_column(String)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Falta(Base):
    __tablename__ = "faltas"
    __table_args__ = {"schema": "ops"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo_falta: Mapped[str] = mapped_column(String)
    fecha: Mapped[date] = mapped_column(Date)
    descripcion: Mapped[str] = mapped_column(Text)
    sancion: Mapped[str | None] = mapped_column(Text)
    dias_suspension: Mapped[int | None] = mapped_column(SmallInteger)
    fecha_inicio_susp: Mapped[date | None] = mapped_column(Date)
    fecha_fin_susp: Mapped[date | None] = mapped_column(Date)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    apelada: Mapped[bool] = mapped_column(Boolean, default=False)
    resultado_apelacion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MovimientoEstatus(Base):
    __tablename__ = "movimientos_estatus"
    __table_args__ = {"schema": "ops"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo: Mapped[str] = mapped_column(String)
    estatus_anterior: Mapped[str | None] = mapped_column(String)
    estatus_nuevo: Mapped[str] = mapped_column(String)
    fecha_efectiva: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    motivo: Mapped[str | None] = mapped_column(Text)
    base_legal: Mapped[str | None] = mapped_column(Text)
    resolucion: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
