from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base
from bomberos_api.models.enums import ESTATUS_SOLICITUD


class SolicitudJubilacion(Base):
    __tablename__ = "solicitudes_jubilacion"
    __table_args__ = {"schema": "egresos"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    fecha_solicitud: Mapped[date] = mapped_column(Date)
    fecha_efectiva_propuesta: Mapped[date | None] = mapped_column(Date)
    años_servicio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    motivo: Mapped[str | None] = mapped_column(Text)
    estatus: Mapped[str] = mapped_column(ESTATUS_SOLICITUD, default="PENDIENTE")
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)


class Jubilado(Base):
    __tablename__ = "jubilados"
    __table_args__ = {"schema": "egresos"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE"), unique=True
    )
    fecha_jubilacion: Mapped[date] = mapped_column(Date)
    años_servicio: Mapped[float | None] = mapped_column(Numeric(5, 2))
    tipo_jubilacion: Mapped[str | None] = mapped_column(String)
    pension_mensual: Mapped[float | None] = mapped_column(Numeric(15, 2))
    moneda: Mapped[str | None] = mapped_column(String)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Fallecimiento(Base):
    __tablename__ = "fallecimientos"
    __table_args__ = {"schema": "egresos"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE"), unique=True
    )
    fecha_fallecimiento: Mapped[date] = mapped_column(Date)
    en_servicio: Mapped[bool] = mapped_column(Boolean, default=False)
    causa: Mapped[str | None] = mapped_column(Text)
    lugar: Mapped[str | None] = mapped_column(String)
    acta_defuncion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    beneficio_funerario_pagado: Mapped[bool] = mapped_column(Boolean, default=False)
