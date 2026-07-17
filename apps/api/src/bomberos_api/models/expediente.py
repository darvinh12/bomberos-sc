"""Modelos ORM del expediente personal: carga familiar, historial de jerarquías
y ubicaciones, tiempo en otras administraciones públicas, habilidades, actividades
y carnets (con su histórico).

Todas las relaciones son 1:N con `personal.funcionarios`, con `ON DELETE CASCADE`.
El histórico de carnets cuelga de `personal.carnets` (no de funcionarios) y registra
los cambios de número/serial a lo largo del tiempo.

Convenciones:
- Tipos ENUM de Postgres (`core.sexo_t`, `core.tipo_actividad`) se mapean a `String`
  y la BD valida el dominio.
- `CHAR(1)` para nacionalidad ('V','E') replicando el patrón de Funcionario.
- Las columnas se declaran en el mismo orden que el DDL para que sea fácil auditar.
"""

from datetime import date, datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base
from bomberos_api.models.enums import SEXO_T, TIPO_ACTIVIDAD
from bomberos_api.models.mixins import SoftDeleteMixin

# =============================================================================
# CARGA FAMILIAR
# =============================================================================


class CargaFamiliar(SoftDeleteMixin, Base):
    """personal.carga_familiar — dependientes del funcionario."""

    __tablename__ = "carga_familiar"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    parentesco: Mapped[str] = mapped_column(String, nullable=False)
    nacionalidad: Mapped[str | None] = mapped_column(CHAR(1))
    cedula: Mapped[int | None] = mapped_column(Integer)
    apellidos: Mapped[str] = mapped_column(String, nullable=False)
    nombres: Mapped[str] = mapped_column(String, nullable=False)
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date)
    sexo: Mapped[str | None] = mapped_column(SEXO_T)
    estado_civil_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.estados_civiles.id")
    )
    nivel_educativo_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.niveles_educativos.id")
    )
    estudia: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    institucion_estudio: Mapped[str | None] = mapped_column(String)
    trabaja: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    lugar_trabajo: Mapped[str | None] = mapped_column(String)
    discapacidad: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    detalle_discapacidad: Mapped[str | None] = mapped_column(String)
    es_beneficiario_hcm: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    fecha_inclusion: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_baja: Mapped[date | None] = mapped_column(Date)
    motivo_baja: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# =============================================================================
# HISTÓRICOS DE CARRERA
# =============================================================================


class HistoricoJerarquia(SoftDeleteMixin, Base):
    """personal.historico_jerarquias — línea de tiempo de jerarquías."""

    __tablename__ = "historico_jerarquias"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    jerarquia_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("core.jerarquias.id"), nullable=False
    )
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    motivo: Mapped[str | None] = mapped_column(String)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HistoricoUbicacion(SoftDeleteMixin, Base):
    """personal.historico_ubicaciones — línea de tiempo de ubicaciones administrativas."""

    __tablename__ = "historico_ubicaciones"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    zona_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("org.zonas.id"))
    estacion_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("org.estaciones.id")
    )
    area_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("org.areas.id"))
    dependencia_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("org.dependencias.id")
    )
    division_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("org.divisiones.id")
    )
    cargo_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("core.cargos.id"))
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    motivo: Mapped[str | None] = mapped_column(String)
    resolucion: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TiempoAdmPublica(SoftDeleteMixin, Base):
    """personal.tiempo_admpublica — tiempo previo en otras administraciones públicas."""

    __tablename__ = "tiempo_admpublica"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    institucion: Mapped[str] = mapped_column(String, nullable=False)
    cargo: Mapped[str | None] = mapped_column(String)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(String)


# =============================================================================
# HABILIDADES Y ACTIVIDADES
# =============================================================================


class Habilidad(SoftDeleteMixin, Base):
    """personal.habilidades — idiomas, software u otras destrezas."""

    __tablename__ = "habilidades"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    grupo: Mapped[str] = mapped_column(String, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    nivel: Mapped[str | None] = mapped_column(String)
    certificado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    documento_url: Mapped[str | None] = mapped_column(String)


class Actividad(SoftDeleteMixin, Base):
    """personal.actividades — actividades culturales, deportivas, etc."""

    __tablename__ = "actividades"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    # core.tipo_actividad ENUM — la BD valida el dominio.
    tipo: Mapped[str] = mapped_column(TIPO_ACTIVIDAD, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String)
    institucion: Mapped[str | None] = mapped_column(String)
    fecha_inicio: Mapped[date | None] = mapped_column(Date)
    fecha_fin: Mapped[date | None] = mapped_column(Date)
    nivel: Mapped[str | None] = mapped_column(String)
    logros: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )


# =============================================================================
# CARNETS
# =============================================================================


class Carnet(SoftDeleteMixin, Base):
    """personal.carnets — carnets emitidos al funcionario (cívico, militar, etc.)."""

    __tablename__ = "carnets"
    __table_args__ = (
        UniqueConstraint(
            "funcionario_id", "tipo_carnet_id", "numero", name="carnets_func_tipo_num_uq"
        ),
        {"schema": "personal"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo_carnet_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("core.tipos_carnet.id"), nullable=False
    )
    numero: Mapped[str | None] = mapped_column(String)
    serial: Mapped[str | None] = mapped_column(String)
    codigo_qr: Mapped[str | None] = mapped_column(String)
    fecha_emision: Mapped[date | None] = mapped_column(Date)
    fecha_vence: Mapped[date | None] = mapped_column(Date)
    organismo_emisor: Mapped[str | None] = mapped_column(String)
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(String)
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HistoricoCarnet(Base):
    """personal.historico_carnets — registra cambios de número/serial de un carnet."""

    __tablename__ = "historico_carnets"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    carnet_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.carnets.id", ondelete="CASCADE"),
        nullable=False,
    )
    numero_anterior: Mapped[str | None] = mapped_column(String)
    numero_nuevo: Mapped[str | None] = mapped_column(String)
    motivo: Mapped[str | None] = mapped_column(String)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    usuario_id: Mapped[int | None] = mapped_column(BigInteger)
