"""Modelos del schema `sys` (parámetros del sistema y metadatos)."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class Parametro(Base):
    __tablename__ = "parametros"
    __table_args__ = {"schema": "sys"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    valor: Mapped[str] = mapped_column(String, nullable=False)
    tipo_dato: Mapped[str] = mapped_column(String, default="string")
    descripcion: Mapped[str | None] = mapped_column(String)
    editable: Mapped[bool] = mapped_column(Boolean, default=True)
    sensible: Mapped[bool] = mapped_column(Boolean, default=False)
    grupo: Mapped[str] = mapped_column(String, default="general")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
