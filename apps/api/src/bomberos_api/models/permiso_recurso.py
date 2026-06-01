"""Permisos granulares rol × recurso para tres tipos de recursos que no son
módulos (seccion_ficha, sidebar, accion_panel).

Complementa seguridad.rol_permisos (matriz rol × módulo) sin alterarla.
La ausencia de fila para una combinación (rol, tipo, codigo) equivale a
nivel = 'none'.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class PermisoRecurso(Base):
    __tablename__ = "permisos_recursos"
    __table_args__ = (
        UniqueConstraint(
            "rol_id",
            "recurso_tipo",
            "recurso_codigo",
            name="uq_permisos_recursos",
        ),
        {"schema": "seguridad"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rol_id: Mapped[int] = mapped_column(
        SmallInteger,
        ForeignKey("seguridad.roles.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Los enums viven en PostgreSQL; aquí los mapeamos como string para que
    # SQLAlchemy no intente recrearlos y para mantener la portabilidad de los
    # schemas Pydantic (Literal[...]).
    recurso_tipo: Mapped[str] = mapped_column(String, nullable=False)
    recurso_codigo: Mapped[str] = mapped_column(String, nullable=False)
    nivel: Mapped[str] = mapped_column(String, nullable=False, default="none")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()"
    )
