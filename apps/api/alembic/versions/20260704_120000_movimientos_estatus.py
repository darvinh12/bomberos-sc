"""movimientos_estatus: historial de suspension / reactivacion / egreso.

Espejo de sql/13_movimientos_estatus.sql. Antes el frontend mandaba motivo,
fechas, resolucion y base legal en el PATCH de funcionarios y Pydantic los
descartaba en silencio. Esta tabla conserva cada transicion con su sustento
administrativo.

Revision ID: 20260704_120000
Revises: 20260601_120000
Create Date: 2026-07-04 12:00:00
"""
from collections.abc import Sequence
from typing import Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260704_120000"
down_revision: Union[str, Sequence[str], None] = "20260601_120000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS ops.movimientos_estatus (
            id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            funcionario_id   BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
            tipo             TEXT NOT NULL CHECK (tipo IN ('SUSPENSION', 'REACTIVACION', 'EGRESO')),
            estatus_anterior core.estatus_funcionario,
            estatus_nuevo    core.estatus_funcionario NOT NULL,
            fecha_efectiva   DATE NOT NULL DEFAULT CURRENT_DATE,
            fecha_fin        DATE,
            motivo           TEXT,
            base_legal       TEXT,
            resolucion       TEXT,
            observaciones    TEXT,
            created_by       BIGINT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_mov_estatus_fechas
                CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_efectiva)
        );
    """))
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_movimientos_estatus_funcionario
            ON ops.movimientos_estatus(funcionario_id, fecha_efectiva DESC);
    """))
    op.execute(text("SELECT sys.fn_attach_audit('ops', 'movimientos_estatus');"))


def downgrade() -> None:
    op.execute(text("DROP TABLE IF EXISTS ops.movimientos_estatus;"))
