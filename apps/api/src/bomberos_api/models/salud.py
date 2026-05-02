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
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class GrupoDiagnostico(Base):
    __tablename__ = "grupos_diagnosticos"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)


class Diagnostico(Base):
    __tablename__ = "diagnosticos"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo_cie: Mapped[str | None] = mapped_column(String, unique=True)
    grupo_id: Mapped[int | None] = mapped_column(SmallInteger)
    nombre: Mapped[str] = mapped_column(String)
    descripcion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Medico(Base):
    __tablename__ = "medicos"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nacionalidad: Mapped[str | None] = mapped_column(String)
    cedula: Mapped[int | None] = mapped_column(Integer)
    apellidos: Mapped[str] = mapped_column(String)
    nombres: Mapped[str] = mapped_column(String)
    nombre_completo: Mapped[str | None] = mapped_column(String)
    mpps: Mapped[str | None] = mapped_column(String, unique=True)
    cm: Mapped[str | None] = mapped_column(String)
    especialidad: Mapped[str | None] = mapped_column(String)
    telefono: Mapped[str | None] = mapped_column(String)
    correo: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class CentroMedico(Base):
    __tablename__ = "centros_medicos"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rif: Mapped[str | None] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)
    tipo: Mapped[str | None] = mapped_column(String)
    direccion: Mapped[str | None] = mapped_column(String)
    telefono: Mapped[str | None] = mapped_column(String)
    parroquia_id: Mapped[int | None] = mapped_column(Integer)
    es_publico: Mapped[bool] = mapped_column(Boolean, default=True)
    convenio_hcm: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Reposo(Base):
    __tablename__ = "reposos"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo_reposo_id: Mapped[int] = mapped_column(SmallInteger)
    diagnostico_id: Mapped[int | None] = mapped_column(Integer)
    diagnostico_libre: Mapped[str | None] = mapped_column(Text)
    medico_id: Mapped[int | None] = mapped_column(BigInteger)
    centro_medico_id: Mapped[int | None] = mapped_column(BigInteger)
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    dias: Mapped[int | None] = mapped_column(SmallInteger)
    folio: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    es_continuacion: Mapped[bool] = mapped_column(Boolean, default=False)
    reposo_padre_id: Mapped[int | None] = mapped_column(BigInteger)
    anulado: Mapped[bool] = mapped_column(Boolean, default=False)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text)
    observaciones: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(BigInteger)


class Lesion(Base):
    __tablename__ = "lesiones"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    tipo_accidente_id: Mapped[int | None] = mapped_column(SmallInteger)
    fecha_evento: Mapped[date] = mapped_column(Date)
    lugar_evento: Mapped[str | None] = mapped_column(String)
    descripcion: Mapped[str] = mapped_column(Text)
    en_servicio: Mapped[bool] = mapped_column(Boolean, default=True)
    parte_afectada: Mapped[str | None] = mapped_column(String)
    centro_medico_id: Mapped[int | None] = mapped_column(BigInteger)
    medico_id: Mapped[int | None] = mapped_column(BigInteger)
    diagnostico_id: Mapped[int | None] = mapped_column(Integer)
    dias_incapacidad: Mapped[int | None] = mapped_column(SmallInteger)
    secuelas: Mapped[str | None] = mapped_column(Text)
    documento_url: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EvaluacionFisica(Base):
    __tablename__ = "evaluacion_fisica"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    fecha: Mapped[date] = mapped_column(Date)
    peso_kg: Mapped[float | None] = mapped_column(Numeric(5, 2))
    estatura_cm: Mapped[float | None] = mapped_column(Numeric(5, 2))
    imc: Mapped[float | None] = mapped_column(Numeric(5, 2))
    presion_sistolica: Mapped[int | None] = mapped_column(SmallInteger)
    presion_diastolica: Mapped[int | None] = mapped_column(SmallInteger)
    pulso: Mapped[int | None] = mapped_column(SmallInteger)
    flexiones: Mapped[int | None] = mapped_column(SmallInteger)
    abdominales: Mapped[int | None] = mapped_column(SmallInteger)
    tiempo_carrera_seg: Mapped[int | None] = mapped_column(Integer)
    apto: Mapped[bool | None] = mapped_column(Boolean)
    observaciones: Mapped[str | None] = mapped_column(Text)
    medico_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class HCM(Base):
    __tablename__ = "hcm"
    __table_args__ = {"schema": "salud"}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE")
    )
    poliza: Mapped[str | None] = mapped_column(String)
    aseguradora: Mapped[str | None] = mapped_column(String)
    fecha_inicio: Mapped[date | None] = mapped_column(Date)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    monto_cobertura: Mapped[float | None] = mapped_column(Numeric(15, 2))
    incluye_familiares: Mapped[bool] = mapped_column(Boolean, default=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    observaciones: Mapped[str | None] = mapped_column(Text)
