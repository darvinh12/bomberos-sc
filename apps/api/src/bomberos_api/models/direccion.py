"""Modelo ORM de personal.direcciones.

Una dirección representa el domicilio del funcionario en un momento dado.
La relación con personal.funcionarios es 1:N — un funcionario puede tener
varias direcciones a lo largo de su carrera (historial de mudanzas).

La dirección "actual" se identifica por `es_actual=true`. Un constraint UNIQUE
parcial en la BD (ux_direcciones_actual) garantiza que solo una dirección
puede ser actual por funcionario.

Las columnas de bienestar social (damnificado, reside_alto_riesgo, ayuda_economica)
están ligadas a la residencia y son sensibles: solo RRHH/ADMIN puede editarlas.

Geografía: FK a geo.* (NO a core.* — ver bomberos_api.models.geografia).
Vivienda: FK a core.tipos_vivienda / core.tenencias_vivienda.
"""

from datetime import date, datetime
from decimal import Decimal

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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base
from bomberos_api.models.mixins import SoftDeleteMixin


class Direccion(SoftDeleteMixin, Base):
    __tablename__ = "direcciones"
    __table_args__ = {"schema": "personal"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal.funcionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    es_actual: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Geografía (schema geo, fuente de verdad única)
    estado_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("geo.estados.id")
    )
    municipio_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("geo.municipios.id")
    )
    parroquia_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("geo.parroquias.id")
    )

    # Dirección literal
    sector: Mapped[str | None] = mapped_column(String)
    urbanizacion: Mapped[str | None] = mapped_column(String)
    calle: Mapped[str | None] = mapped_column(String)
    edificio_casa: Mapped[str | None] = mapped_column(String)
    piso: Mapped[str | None] = mapped_column(String)
    apartamento: Mapped[str | None] = mapped_column(String)
    referencia: Mapped[str | None] = mapped_column(String)
    direccion_completa: Mapped[str | None] = mapped_column(String)
    codigo_postal: Mapped[str | None] = mapped_column(String)
    latitud: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    longitud: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))

    # Vivienda — booleanos legacy + FKs canónicas (Ola 1)
    es_propia: Mapped[bool | None] = mapped_column(Boolean)
    es_alquilada: Mapped[bool | None] = mapped_column(Boolean)
    tipo_vivienda_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.tipos_vivienda.id")
    )
    tenencia_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("core.tenencias_vivienda.id")
    )

    # Bienestar social (sensible, solo RRHH/ADMIN)
    damnificado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    damnificado_desde: Mapped[date | None] = mapped_column(Date)
    reside_alto_riesgo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    ayuda_economica: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    fecha_registro: Mapped[date] = mapped_column(Date, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(String)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
