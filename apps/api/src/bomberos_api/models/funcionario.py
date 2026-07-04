from datetime import date, datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bomberos_api.models.base import Base


class Funcionario(Base):
    __tablename__ = "funcionarios"
    __table_args__ = (
        UniqueConstraint("nacionalidad", "cedula", name="funcionarios_cedula_uq"),
        {"schema": "personal"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    # Identidad
    nacionalidad: Mapped[str] = mapped_column(CHAR(1), nullable=False)
    cedula: Mapped[int] = mapped_column(Integer, nullable=False)
    rif: Mapped[str | None] = mapped_column(String)
    apellidos: Mapped[str] = mapped_column(String, nullable=False)
    nombres: Mapped[str] = mapped_column(String, nullable=False)
    nombre_completo: Mapped[str | None] = mapped_column(String)  # GENERATED en DB
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date)
    sexo: Mapped[str | None] = mapped_column(CHAR(1))
    estado_civil_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.estados_civiles.id")
    )
    grupo_sanguineo_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.grupos_sanguineos.id")
    )
    lugar_nacimiento: Mapped[str | None] = mapped_column(String)
    pais_nacimiento: Mapped[str | None] = mapped_column(String)  # legacy
    pais_nacimiento_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.paises.id")
    )

    # Nacionalización (para nacidos en el extranjero)
    # NOTA: las columnas string son legacy. Se mantienen por compatibilidad con
    # datos importados; los formularios nuevos deben usar las columnas *_id.
    tipo_nacionalizacion: Mapped[str | None] = mapped_column(String(40))  # legacy
    fecha_nacionalizacion: Mapped[date | None] = mapped_column(Date)
    numero_gaceta_nacionalizacion: Mapped[str | None] = mapped_column(String(50))
    pais_origen: Mapped[str | None] = mapped_column(String(80))  # legacy
    idiomas: Mapped[str | None] = mapped_column(String(200))  # legacy (string CSV)

    # FK al catálogo (mini-sprint). pais_nacimiento_id está más abajo junto a
    # pais_nacimiento legacy.
    tipo_nacionalizacion_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.tipos_nacionalizacion.id")
    )
    pais_origen_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.paises.id")
    )

    # Empleo
    tipo_personal: Mapped[str] = mapped_column(String, default="BOMBERO")
    numero_empleado: Mapped[str | None] = mapped_column(String, unique=True)
    numero_equipo: Mapped[str | None] = mapped_column(String)
    fecha_primer_ingreso: Mapped[date | None] = mapped_column(Date)
    promocion: Mapped[str | None] = mapped_column(String)
    estatus: Mapped[str] = mapped_column(String, default="ACTIVO")
    condicion_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.condiciones.id")
    )
    jerarquia_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.jerarquias.id")
    )
    cargo_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("core.cargos.id"))
    institucion_formadora_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.instituciones_formadoras.id")
    )
    fecha_egreso: Mapped[date | None] = mapped_column(Date)
    fecha_reintegro: Mapped[date | None] = mapped_column(Date)
    fecha_este: Mapped[date | None] = mapped_column(Date)
    fecha_ingreso_gdf: Mapped[date | None] = mapped_column(Date)

    # Ubicación administrativa (snapshot)
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
    seccion: Mapped[str | None] = mapped_column(CHAR(1))  # legacy
    seccion_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.secciones_funcionario.id")
    )
    horario: Mapped[str | None] = mapped_column(String)

    # Domicilio del funcionario: NO se modela aquí. Es 1:N en
    # personal.direcciones (ver bomberos_api.models.direccion.Direccion),
    # con historial de mudanzas (es_actual, fecha_registro). El bienestar
    # social (damnificado, reside_alto_riesgo, ayuda_economica) también
    # vive en esa tabla porque está atado a la residencia.

    # Contacto
    telefono_habitacion: Mapped[str | None] = mapped_column(String)
    telefono_movil: Mapped[str | None] = mapped_column(String)
    telefono_otros: Mapped[str | None] = mapped_column(String)
    correo: Mapped[str | None] = mapped_column(CITEXT, unique=True)
    persona_contacto: Mapped[str | None] = mapped_column(String)
    telefono_contacto: Mapped[str | None] = mapped_column(String)
    parentesco_contacto: Mapped[str | None] = mapped_column(String)  # legacy
    parentesco_contacto_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.parentescos.id")
    )

    # Educación / habilidades
    nivel_educativo_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.niveles_educativos.id")
    )
    profesion: Mapped[str | None] = mapped_column(String)
    especialidad_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.especialidades.id")
    )
    iutb: Mapped[bool] = mapped_column(Boolean, default=False)
    egresado_unes: Mapped[bool] = mapped_column(Boolean, default=False)
    licencia_conducir: Mapped[str | None] = mapped_column(String(20))  # legacy
    licencia_conducir_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.tipos_licencia.id")
    )
    factor_sanguineo: Mapped[str | None] = mapped_column(String(15))

    # Misceláneos
    foto_url: Mapped[str | None] = mapped_column(String)
    huella_url: Mapped[str | None] = mapped_column(String)
    firma_url: Mapped[str | None] = mapped_column(String)
    merito: Mapped[float | None] = mapped_column(Numeric(5, 2))
    pre_jubilado: Mapped[bool] = mapped_column(Boolean, default=False)
    es_voluntario: Mapped[bool] = mapped_column(Boolean, default=False)
    observaciones: Mapped[str | None] = mapped_column(String)

    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    updated_by: Mapped[int | None] = mapped_column(BigInteger)

    # Relaciones (lazy=raise por defecto; cargar con selectinload cuando se necesite)
    periodos: Mapped[list["PeriodoServicio"]] = relationship(
        "PeriodoServicio", back_populates="funcionario", lazy="raise"
    )


class PeriodoServicio(Base):
    __tablename__ = "periodos_servicio"
    __table_args__ = (
        UniqueConstraint(
            "funcionario_id", "numero_periodo", name="uq_periodos_servicio_funcionario_periodo"
        ),
        {"schema": "personal"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("personal.funcionarios.id", ondelete="CASCADE"), nullable=False
    )
    numero_periodo: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    fecha_ingreso: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_egreso: Mapped[date | None] = mapped_column(Date)
    tipo_ingreso: Mapped[str | None] = mapped_column(String)
    tipo_egreso: Mapped[str | None] = mapped_column(String)
    motivo: Mapped[str | None] = mapped_column(String)
    base_legal: Mapped[str | None] = mapped_column(String)
    numero_resolucion: Mapped[str | None] = mapped_column(String)
    nro_memo: Mapped[str | None] = mapped_column(String)
    fecha_notificacion: Mapped[date | None] = mapped_column(Date)
    fecha_efectiva_nomina: Mapped[date | None] = mapped_column(Date)
    pagaron_prestaciones: Mapped[bool | None] = mapped_column(Boolean)
    monto_prestaciones: Mapped[float | None] = mapped_column(Numeric(15, 2))
    documento_url: Mapped[str | None] = mapped_column(String)
    observaciones: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    funcionario: Mapped[Funcionario] = relationship(
        "Funcionario", back_populates="periodos", lazy="raise"
    )


class FuncionarioIdioma(Base):
    """Pivote N:M para idiomas (multi-select del form)."""

    __tablename__ = "funcionario_idiomas"
    __table_args__ = {"schema": "personal"}

    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        primary_key=True,
    )
    idioma_id: Mapped[int] = mapped_column(
        SmallInteger,
        ForeignKey("core.idiomas.id", ondelete="RESTRICT"),
        primary_key=True,
    )
