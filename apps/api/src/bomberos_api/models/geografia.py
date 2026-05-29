"""Modelos ORM de la geografía político-territorial de Venezuela (schema `geo`).

Estructura jerárquica: Estado → Municipio → Parroquia. Fuente de verdad única
en el schema `geo` (ver sql/01_base.sql y seed en sql/04_seed.sql). El schema
`core` NO debe contener tablas de geografía.

Solo lectura desde la API pública (`routers/catalogos.py`); los endpoints de
administración viven en `routers/admin_catalogos.py`.

Nota sobre `activo`: las tres tablas de `geo.*` NO tienen columna `activo`
(la geografía político-territorial no se desactiva: o existe o no existe).
Los routers de admin exponen `activo=True` por convención hacia el frontend.
"""

from sqlalchemy import ForeignKey, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class Estado(Base):
    __tablename__ = "estados"
    __table_args__ = {"schema": "geo"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    capital: Mapped[str | None] = mapped_column(String)


class Municipio(Base):
    __tablename__ = "municipios"
    __table_args__ = (
        UniqueConstraint("estado_id", "codigo", name="municipios_estado_codigo_uq"),
        {"schema": "geo"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    estado_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("geo.estados.id"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(String, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)


class Parroquia(Base):
    __tablename__ = "parroquias"
    __table_args__ = (
        UniqueConstraint("municipio_id", "codigo", name="parroquias_municipio_codigo_uq"),
        {"schema": "geo"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    municipio_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("geo.municipios.id"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(String, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
