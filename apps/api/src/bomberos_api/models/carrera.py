from datetime import date

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


class Curso(Base):
    __tablename__ = "cursos"
    __table_args__ = {"schema": "carrera"}
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)
    descripcion: Mapped[str | None] = mapped_column(Text)
    horas: Mapped[int | None] = mapped_column(SmallInteger)
    institucion: Mapped[str | None] = mapped_column(String)
    es_ascenso: Mapped[bool] = mapped_column(Boolean, default=False)
    nivel_jerarquia_destino_id: Mapped[int | None] = mapped_column(SmallInteger)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class CursoRealizado(Base):
    __tablename__ = "cursos_realizados"
    __table_args__ = {"schema": "carrera"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    curso_id: Mapped[int | None] = mapped_column(SmallInteger)
    nombre_libre: Mapped[str | None] = mapped_column(String)
    institucion: Mapped[str | None] = mapped_column(String)
    fecha_inicio: Mapped[date | None] = mapped_column(Date)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    horas: Mapped[int | None] = mapped_column(SmallInteger)
    nota: Mapped[float | None] = mapped_column(Numeric(5, 2))
    aprobado: Mapped[bool | None] = mapped_column(Boolean)
    certificado_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)


class PeriodoEvaluacion(Base):
    __tablename__ = "periodos_evaluacion"
    __table_args__ = {"schema": "carrera"}
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Evaluacion(Base):
    __tablename__ = "evaluaciones"
    __table_args__ = (
        UniqueConstraint("funcionario_id", "periodo_id", "tipo"),
        {"schema": "carrera"},
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    periodo_id: Mapped[int] = mapped_column(SmallInteger)
    tipo: Mapped[str] = mapped_column(String)
    evaluador_id: Mapped[int | None] = mapped_column(BigInteger)
    nota_total: Mapped[float | None] = mapped_column(Numeric(5, 2))
    estatus: Mapped[str] = mapped_column(String, default="BORRADOR")
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(Text)


class Ascenso(Base):
    __tablename__ = "ascensos"
    __table_args__ = {"schema": "carrera"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    proceso_id: Mapped[int | None] = mapped_column(BigInteger)
    jerarquia_anterior_id: Mapped[int | None] = mapped_column(SmallInteger)
    jerarquia_nueva_id: Mapped[int] = mapped_column(SmallInteger)
    fecha_efectiva: Mapped[date] = mapped_column(Date)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    nota_evaluacion: Mapped[float | None] = mapped_column(Numeric(5, 2))
    posicion_lista: Mapped[int | None] = mapped_column(Integer)
    observaciones: Mapped[str | None] = mapped_column(Text)


class Reconocimiento(Base):
    __tablename__ = "reconocimientos"
    __table_args__ = {"schema": "carrera"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    condecoracion_id: Mapped[int | None] = mapped_column(SmallInteger)
    institucion_id: Mapped[int | None] = mapped_column(BigInteger)
    nombre_libre: Mapped[str | None] = mapped_column(String)
    fecha_otorgamiento: Mapped[date] = mapped_column(Date)
    motivo: Mapped[str | None] = mapped_column(Text)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)


class Merito(Base):
    __tablename__ = "meritos"
    __table_args__ = (
        UniqueConstraint("funcionario_id", "periodo_id"),
        {"schema": "carrera"},
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(BigInteger)
    periodo_id: Mapped[int | None] = mapped_column(SmallInteger)
    puntaje_evaluacion: Mapped[float | None] = mapped_column(Numeric(7, 2))
    puntaje_cursos: Mapped[float | None] = mapped_column(Numeric(7, 2))
    puntaje_actividades: Mapped[float | None] = mapped_column(Numeric(7, 2))
    puntaje_condecoraciones: Mapped[float | None] = mapped_column(Numeric(7, 2))
    puntaje_faltas: Mapped[float | None] = mapped_column(Numeric(7, 2))
    puntaje_total: Mapped[float | None] = mapped_column(Numeric(7, 2))
    posicion: Mapped[int | None] = mapped_column(Integer)
