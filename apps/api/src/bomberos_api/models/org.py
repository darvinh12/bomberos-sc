from sqlalchemy import Boolean, ForeignKey, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class Zona(Base):
    __tablename__ = "zonas"
    __table_args__ = {"schema": "org"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Estacion(Base):
    __tablename__ = "estaciones"
    __table_args__ = {"schema": "org"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    zona_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("org.zonas.id"), nullable=False
    )
    parroquia_id: Mapped[int | None] = mapped_column(SmallInteger)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    nombre_corto: Mapped[str | None] = mapped_column(String)
    direccion: Mapped[str | None] = mapped_column(String)
    telefono: Mapped[str | None] = mapped_column(String)
    latitud: Mapped[float | None] = mapped_column(Numeric(10, 7))
    longitud: Mapped[float | None] = mapped_column(Numeric(10, 7))
    activa: Mapped[bool] = mapped_column(Boolean, default=True)


class Division(Base):
    __tablename__ = "divisiones"
    __table_args__ = {"schema": "org"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Area(Base):
    __tablename__ = "areas"
    __table_args__ = {"schema": "org"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    division_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("org.divisiones.id")
    )
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Dependencia(Base):
    __tablename__ = "dependencias"
    __table_args__ = {"schema": "org"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    area_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("org.areas.id"))
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
