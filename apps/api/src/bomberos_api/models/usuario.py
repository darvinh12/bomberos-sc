from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
)
from sqlalchemy.dialects.postgresql import CITEXT, INET
from sqlalchemy.orm import Mapped, mapped_column, relationship

from bomberos_api.models.base import Base


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = {"schema": "seguridad"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    funcionario_id: Mapped[int | None] = mapped_column(BigInteger)
    usuario: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    nombre_completo: Mapped[str] = mapped_column(String, nullable=False)
    correo: Mapped[str | None] = mapped_column(CITEXT, unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    bloqueado: Mapped[bool] = mapped_column(Boolean, default=False)
    motivo_bloqueo: Mapped[str | None] = mapped_column(String)
    intentos_fallidos: Mapped[int] = mapped_column(SmallInteger, default=0)
    debe_cambiar_password: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_activo: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String)
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_ip: Mapped[str | None] = mapped_column(INET)
    token_recuperacion: Mapped[str | None] = mapped_column(String)
    token_expira: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(BigInteger)
    updated_by: Mapped[int | None] = mapped_column(BigInteger)

    roles: Mapped[list["UsuarioRol"]] = relationship(
        "UsuarioRol", back_populates="usuario", lazy="selectin"
    )


class Rol(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "seguridad"}

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(String)
    es_sistema: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class UsuarioRol(Base):
    __tablename__ = "usuario_roles"
    __table_args__ = {"schema": "seguridad"}

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("seguridad.usuarios.id", ondelete="CASCADE"),
        primary_key=True,
    )
    rol_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("seguridad.roles.id"), primary_key=True
    )
    asignado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    asignado_por: Mapped[int | None] = mapped_column(BigInteger)

    usuario: Mapped[Usuario] = relationship("Usuario", back_populates="roles")
    rol: Mapped[Rol] = relationship("Rol", lazy="joined")
