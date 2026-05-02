from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class Ayuda(Base):
    __tablename__ = "ayudas"
    __table_args__ = {"schema": "beneficios"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo_solicitud_id: Mapped[int] = mapped_column(SmallInteger)
    monto_solicitado: Mapped[float | None] = mapped_column(Numeric(15, 2))
    monto_aprobado: Mapped[float | None] = mapped_column(Numeric(15, 2))
    monto_pagado: Mapped[float | None] = mapped_column(Numeric(15, 2))
    fecha_solicitud: Mapped[date] = mapped_column(Date)
    fecha_aprobacion: Mapped[date | None] = mapped_column(Date)
    fecha_pago: Mapped[date | None] = mapped_column(Date)
    motivo: Mapped[str] = mapped_column(Text)
    beneficiario_id: Mapped[int | None] = mapped_column(BigInteger)
    estatus: Mapped[str] = mapped_column(String, default="PENDIENTE")
    documento_url: Mapped[str | None] = mapped_column(String)
    soporte_url: Mapped[str | None] = mapped_column(String)
    referencia_pago: Mapped[str | None] = mapped_column(String)
    banco_id: Mapped[int | None] = mapped_column(SmallInteger)
    cuenta: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    aprobado_por: Mapped[int | None] = mapped_column(BigInteger)


class TipoBeneficio(Base):
    __tablename__ = "tipos_beneficio"
    __table_args__ = {"schema": "beneficios"}
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)
    descripcion: Mapped[str | None] = mapped_column(Text)
    monto_default: Mapped[float | None] = mapped_column(Numeric(15, 2))
    periodicidad: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Entrega(Base):
    __tablename__ = "entregas"
    __table_args__ = (
        UniqueConstraint("funcionario_id", "tipo_beneficio_id", "periodo"),
        {"schema": "beneficios"},
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo_beneficio_id: Mapped[int] = mapped_column(SmallInteger)
    periodo: Mapped[str | None] = mapped_column(String)
    monto: Mapped[float | None] = mapped_column(Numeric(15, 2))
    cantidad: Mapped[int | None] = mapped_column(Integer)
    fecha_entrega: Mapped[date] = mapped_column(Date)
    referencia: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    estatus: Mapped[str] = mapped_column(String, default="PAGADO")
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
