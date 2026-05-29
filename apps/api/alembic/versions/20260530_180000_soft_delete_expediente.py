"""soft_delete_expediente: añade columnas de auditoría de borrado lógico a las
8 tablas del expediente personal del funcionario.

Tablas afectadas (schema personal):
    - carga_familiar
    - historico_jerarquias
    - historico_ubicaciones
    - tiempo_admpublica
    - habilidades
    - actividades
    - carnets
    - direcciones

Columnas nuevas en cada tabla:
    - deleted_at    TIMESTAMPTZ NULL
    - deleted_by    BIGINT NULL → seguridad.usuarios(id) ON DELETE SET NULL
    - delete_reason TEXT NULL

Índice parcial WHERE deleted_at IS NULL por funcionario_id en cada tabla, para
que el filtro por defecto (registros activos) sea O(log n) y no se degrade
cuando crezca la papelera.

NO se aplica a:
    - personal.funcionarios (su `estatus` ya cubre la baja lógica).
    - personal.historico_carnets (append-only, derivado de personal.carnets).
    - tablas operativas (reposos, vacaciones, permisos, etc).
    - catálogos.

Revision ID: 20260530_180000
Revises: 20260529_120000
Create Date: 2026-05-30 18:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260530_180000"
down_revision: Union[str, None] = "20260529_120000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mantenemos un único origen de verdad para iterar sobre las 8 tablas. Si en el
# futuro hay que agregar más, se añaden aquí y la migración cubre el resto.
TABLAS_EXPEDIENTE: tuple[str, ...] = (
    "carga_familiar",
    "historico_jerarquias",
    "historico_ubicaciones",
    "tiempo_admpublica",
    "habilidades",
    "actividades",
    "carnets",
    "direcciones",
)


def upgrade() -> None:
    for tabla in TABLAS_EXPEDIENTE:
        op.add_column(
            tabla,
            sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
            schema="personal",
        )
        op.add_column(
            tabla,
            sa.Column(
                "deleted_by",
                sa.BigInteger(),
                sa.ForeignKey("seguridad.usuarios.id", ondelete="SET NULL"),
                nullable=True,
            ),
            schema="personal",
        )
        op.add_column(
            tabla,
            sa.Column("delete_reason", sa.Text(), nullable=True),
            schema="personal",
        )
        op.create_index(
            f"ix_{tabla}_active",
            tabla,
            ["funcionario_id"],
            unique=False,
            postgresql_where=sa.text("deleted_at IS NULL"),
            schema="personal",
        )


def downgrade() -> None:
    # Orden inverso: primero índices, luego columnas (las FKs viajan con sus columnas).
    for tabla in reversed(TABLAS_EXPEDIENTE):
        op.drop_index(f"ix_{tabla}_active", table_name=tabla, schema="personal")
        op.drop_column(tabla, "delete_reason", schema="personal")
        op.drop_column(tabla, "deleted_by", schema="personal")
        op.drop_column(tabla, "deleted_at", schema="personal")
