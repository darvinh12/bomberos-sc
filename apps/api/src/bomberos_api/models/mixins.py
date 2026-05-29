"""Mixins reutilizables para modelos SQLAlchemy.

`SoftDeleteMixin` añade los tres campos del patrón soft-delete con auditoría:
`deleted_at`, `deleted_by` y `delete_reason`. Las clases que lo heredan ganan
las columnas en su tabla; el filtrado por `deleted_at IS NULL` queda a cargo
de los routers (no usamos un `Query` global ni un mixin de evento porque
necesitamos que ADMIN pueda ver borrados explícitamente).

Convenciones:
- La FK a `seguridad.usuarios.id` usa `ON DELETE SET NULL` para no perder el
  registro de auditoría si el usuario se elimina.
- `delete_reason` es nullable a nivel BD para no obligar a backfill en tablas
  con datos previos; la obligatoriedad se valida en API (>= 3 chars).
- No incluimos índice aquí: cada migración crea el índice parcial
  `WHERE deleted_at IS NULL` con el nombre `ix_<tabla>_active`.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("seguridad.usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    delete_reason: Mapped[str | None] = mapped_column(String, nullable=True)
