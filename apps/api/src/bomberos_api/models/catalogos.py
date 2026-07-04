"""Modelos ORM de los catálogos del schema `core`. Solo lectura desde la API."""

from sqlalchemy import Boolean, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from bomberos_api.models.base import Base


class _CatalogoMixin:
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class EstadoCivil(_CatalogoMixin, Base):
    __tablename__ = "estados_civiles"
    __table_args__ = {"schema": "core"}


class GrupoSanguineo(_CatalogoMixin, Base):
    __tablename__ = "grupos_sanguineos"
    __table_args__ = {"schema": "core"}


class NivelEducativo(_CatalogoMixin, Base):
    __tablename__ = "niveles_educativos"
    __table_args__ = {"schema": "core"}
    orden: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")


class Especialidad(_CatalogoMixin, Base):
    __tablename__ = "especialidades"
    __table_args__ = {"schema": "core"}
    descripcion: Mapped[str | None] = mapped_column(String)


class Jerarquia(_CatalogoMixin, Base):
    __tablename__ = "jerarquias"
    __table_args__ = {"schema": "core"}
    nombre_corto: Mapped[str | None] = mapped_column(String)
    orden: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    es_oficial: Mapped[bool] = mapped_column(Boolean, default=False)
    es_tropa: Mapped[bool] = mapped_column(Boolean, default=False)
    es_estado_mayor: Mapped[bool] = mapped_column(Boolean, default=False)


class Cargo(_CatalogoMixin, Base):
    __tablename__ = "cargos"
    __table_args__ = {"schema": "core"}
    descripcion: Mapped[str | None] = mapped_column(String)
    es_jefatura: Mapped[bool] = mapped_column(Boolean, default=False)


class Condicion(_CatalogoMixin, Base):
    __tablename__ = "condiciones"
    __table_args__ = {"schema": "core"}


class TipoReposo(_CatalogoMixin, Base):
    __tablename__ = "tipos_reposo"
    __table_args__ = {"schema": "core"}
    dias_max: Mapped[int | None] = mapped_column(SmallInteger)
    requiere_diagnostico: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )


class Banco(_CatalogoMixin, Base):
    __tablename__ = "bancos"
    __table_args__ = {"schema": "core"}
    swift: Mapped[str | None] = mapped_column(String)


class TipoPersonal(_CatalogoMixin, Base):
    __tablename__ = "tipos_personal"
    __table_args__ = {"schema": "core"}


class EstatusFuncionario(_CatalogoMixin, Base):
    # Schema SQL: core.estatus_funcionarios (plural) — el singular existe como
    # ENUM (core.estatus_funcionario) y colisiona si se reusa para la tabla.
    __tablename__ = "estatus_funcionarios"
    __table_args__ = {"schema": "core"}


class InstitucionFormadora(_CatalogoMixin, Base):
    __tablename__ = "instituciones_formadoras"
    __table_args__ = {"schema": "core"}


class TipoVivienda(_CatalogoMixin, Base):
    __tablename__ = "tipos_vivienda"
    __table_args__ = {"schema": "core"}


class TenenciaVivienda(_CatalogoMixin, Base):
    __tablename__ = "tenencias_vivienda"
    __table_args__ = {"schema": "core"}


# ---------------------------------------------------------------------------
# Mini-sprint catálogos (sql/10_catalogos_mini_sprint.sql)
# ---------------------------------------------------------------------------


class Parentesco(_CatalogoMixin, Base):
    __tablename__ = "parentescos"
    __table_args__ = {"schema": "core"}


class TipoLicencia(_CatalogoMixin, Base):
    """core.tipos_licencia preexistente (sql/01_base.sql) ampliada con `activo`."""

    __tablename__ = "tipos_licencia"
    __table_args__ = {"schema": "core"}


class TipoNacionalizacion(_CatalogoMixin, Base):
    __tablename__ = "tipos_nacionalizacion"
    __table_args__ = {"schema": "core"}


class Idioma(_CatalogoMixin, Base):
    __tablename__ = "idiomas"
    __table_args__ = {"schema": "core"}


class Pais(_CatalogoMixin, Base):
    __tablename__ = "paises"
    __table_args__ = {"schema": "core"}


class SeccionFuncionario(_CatalogoMixin, Base):
    __tablename__ = "secciones_funcionario"
    __table_args__ = {"schema": "core"}
