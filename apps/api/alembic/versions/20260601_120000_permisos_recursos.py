"""permisos_recursos: tabla granular de permisos rol × recurso para los tres
tipos que no son módulos: seccion_ficha / sidebar / accion_panel.

Complementa seguridad.rol_permisos (matriz rol × módulo) sin tocarla.

Crea:
    - ENUM seguridad.tipo_recurso_permiso ('seccion_ficha','sidebar','accion_panel')
    - ENUM seguridad.nivel_acceso_recurso ('edit','view','none')
    - TABLE seguridad.permisos_recursos
    - UNIQUE (rol_id, recurso_tipo, recurso_codigo)
    - índices por rol_id y por recurso_tipo

Seeds: espejo de la matriz hardcodeada en apps/web/src/lib/permisos-funcionario.ts
para no romper comportamiento existente. ADMIN se omite a propósito (el helper
de roles le concede edit a todo automáticamente).

Esta migración hace MERGE de las dos cabezas previas (20260530_120000 y
20260530_180000) que comparten parent 20260529_120000, de modo que tras este
upgrade el árbol queda lineal con una sola cabeza.

Revision ID: 20260601_120000
Revises: 20260530_120000, 20260530_180000
Create Date: 2026-06-01 12:00:00
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260601_120000"
down_revision: Union[str, Sequence[str], None] = (
    "20260530_120000",
    "20260530_180000",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. ENUMs (idempotentes vía DO $$ block + pg_type check)
    # -------------------------------------------------------------------------
    op.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE t.typname = 'tipo_recurso_permiso' AND n.nspname = 'seguridad'
            ) THEN
                CREATE TYPE seguridad.tipo_recurso_permiso AS ENUM (
                    'seccion_ficha',
                    'sidebar',
                    'accion_panel'
                );
            END IF;
        END $$;
    """))

    op.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE t.typname = 'nivel_acceso_recurso' AND n.nspname = 'seguridad'
            ) THEN
                CREATE TYPE seguridad.nivel_acceso_recurso AS ENUM (
                    'edit',
                    'view',
                    'none'
                );
            END IF;
        END $$;
    """))

    # -------------------------------------------------------------------------
    # 2. Tabla
    # -------------------------------------------------------------------------
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS seguridad.permisos_recursos (
            id              BIGSERIAL PRIMARY KEY,
            rol_id          SMALLINT NOT NULL
                            REFERENCES seguridad.roles(id) ON DELETE CASCADE,
            recurso_tipo    seguridad.tipo_recurso_permiso NOT NULL,
            recurso_codigo  TEXT NOT NULL,
            nivel           seguridad.nivel_acceso_recurso NOT NULL DEFAULT 'none',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_permisos_recursos
                UNIQUE (rol_id, recurso_tipo, recurso_codigo)
        );
    """))

    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_permisos_recursos_rol
            ON seguridad.permisos_recursos(rol_id);
    """))
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_permisos_recursos_tipo
            ON seguridad.permisos_recursos(recurso_tipo);
    """))

    # -------------------------------------------------------------------------
    # 3. Seeds — espejo de la matriz frontend (excl. ADMIN)
    #    Roles inexistentes no producen filas (el rol de solo lectura es CONSULTA) gracias al INNER JOIN.
    # -------------------------------------------------------------------------

    # 3.1 seccion_ficha
    op.execute(text("""
        WITH datos (rol_codigo, recurso_codigo, nivel) AS (
            VALUES
                ('RRHH','resumen','edit'),
                ('SUPERVISOR','resumen','view'),
                ('LOGISTICA','resumen','view'),
                ('OPERADOR','resumen','view'),
                ('INSPECTOR','resumen','view'),
                ('CONSULTA','resumen','view'),

                ('RRHH','datos','edit'),
                ('SUPERVISOR','datos','view'),
                ('CONSULTA','datos','view'),

                ('RRHH','carrera','edit'),
                ('SUPERVISOR','carrera','view'),
                ('CONSULTA','carrera','view'),

                ('RRHH','operativo','edit'),
                ('SUPERVISOR','operativo','edit'),
                ('OPERADOR','operativo','edit'),
                ('INSPECTOR','operativo','view'),
                ('CONSULTA','operativo','view'),

                ('RRHH','operativo:guardias','edit'),
                ('SUPERVISOR','operativo:guardias','edit'),
                ('OPERADOR','operativo:guardias','edit'),
                ('CONSULTA','operativo:guardias','view'),

                ('RRHH','operativo:vacaciones','edit'),
                ('SUPERVISOR','operativo:vacaciones','edit'),
                ('CONSULTA','operativo:vacaciones','view'),

                ('RRHH','operativo:permisos','edit'),
                ('SUPERVISOR','operativo:permisos','edit'),
                ('OPERADOR','operativo:permisos','edit'),
                ('CONSULTA','operativo:permisos','view'),

                ('RRHH','operativo:comisiones','edit'),
                ('SUPERVISOR','operativo:comisiones','edit'),
                ('INSPECTOR','operativo:comisiones','view'),
                ('CONSULTA','operativo:comisiones','view'),

                ('RRHH','operativo:faltas','view'),
                ('SUPERVISOR','operativo:faltas','edit'),
                ('INSPECTOR','operativo:faltas','edit'),

                ('RRHH','salud','edit'),
                ('SUPERVISOR','salud','view'),

                ('RRHH','equipos','view'),
                ('SUPERVISOR','equipos','view'),
                ('LOGISTICA','equipos','edit'),
                ('CONSULTA','equipos','view'),

                ('RRHH','beneficios','edit'),

                ('RRHH','familia','edit'),
                ('SUPERVISOR','familia','view'),
                ('CONSULTA','familia','view'),

                ('RRHH','habilidades','edit'),
                ('SUPERVISOR','habilidades','view'),
                ('CONSULTA','habilidades','view'),

                ('RRHH','documentos','edit'),
                ('SUPERVISOR','documentos','view'),
                ('CONSULTA','documentos','view'),

                ('RRHH','auditoria','view')
        )
        INSERT INTO seguridad.permisos_recursos
            (rol_id, recurso_tipo, recurso_codigo, nivel)
        SELECT r.id,
               'seccion_ficha'::seguridad.tipo_recurso_permiso,
               d.recurso_codigo,
               d.nivel::seguridad.nivel_acceso_recurso
        FROM datos d
        JOIN seguridad.roles r ON r.codigo = d.rol_codigo
        ON CONFLICT (rol_id, recurso_tipo, recurso_codigo) DO NOTHING;
    """))

    # 3.2 sidebar
    op.execute(text("""
        WITH datos (rol_codigo, recurso_codigo, nivel) AS (
            VALUES
                ('RRHH','dashboard','view'),
                ('SUPERVISOR','dashboard','view'),
                ('OPERADOR','dashboard','view'),
                ('INSPECTOR','dashboard','view'),
                ('LOGISTICA','dashboard','view'),
                ('CONSULTA','dashboard','view'),

                ('RRHH','personal','edit'),
                ('SUPERVISOR','personal','view'),
                ('OPERADOR','personal','view'),
                ('INSPECTOR','personal','view'),
                ('LOGISTICA','personal','view'),
                ('CONSULTA','personal','view'),

                ('RRHH','carrera','edit'),
                ('SUPERVISOR','carrera','view'),
                ('OPERADOR','carrera','view'),
                ('INSPECTOR','carrera','view'),
                ('LOGISTICA','carrera','view'),
                ('CONSULTA','carrera','view'),

                ('RRHH','beneficios','edit'),

                ('RRHH','egresos','edit'),

                ('RRHH','catalogos','view'),
                ('SUPERVISOR','catalogos','view'),
                ('OPERADOR','catalogos','view'),
                ('INSPECTOR','catalogos','view'),
                ('LOGISTICA','catalogos','view'),
                ('CONSULTA','catalogos','view')
        )
        INSERT INTO seguridad.permisos_recursos
            (rol_id, recurso_tipo, recurso_codigo, nivel)
        SELECT r.id,
               'sidebar'::seguridad.tipo_recurso_permiso,
               d.recurso_codigo,
               d.nivel::seguridad.nivel_acceso_recurso
        FROM datos d
        JOIN seguridad.roles r ON r.codigo = d.rol_codigo
        ON CONFLICT (rol_id, recurso_tipo, recurso_codigo) DO NOTHING;
    """))

    # 3.3 accion_panel
    op.execute(text("""
        WITH datos (rol_codigo, recurso_codigo, nivel) AS (
            VALUES
                ('RRHH','reposo','edit'),
                ('SUPERVISOR','reposo','edit'),
                ('OPERADOR','reposo','edit'),

                ('RRHH','vacaciones','edit'),
                ('SUPERVISOR','vacaciones','edit'),
                ('OPERADOR','vacaciones','edit'),

                ('RRHH','permiso','edit'),
                ('SUPERVISOR','permiso','edit'),
                ('OPERADOR','permiso','edit'),

                ('RRHH','comision','edit'),
                ('SUPERVISOR','comision','edit'),
                ('INSPECTOR','comision','edit'),

                ('SUPERVISOR','falta','edit'),
                ('INSPECTOR','falta','edit'),

                ('RRHH','suspender','edit'),
                ('SUPERVISOR','suspender','edit'),

                ('RRHH','reactivar','edit'),
                ('SUPERVISOR','reactivar','edit'),

                ('RRHH','ascender','edit'),
                ('RRHH','trasladar','edit'),

                ('RRHH','pre-jubilar','edit'),
                ('RRHH','jubilar','edit'),
                ('RRHH','fallecimiento','edit'),
                ('RRHH','egresar','edit')
        )
        INSERT INTO seguridad.permisos_recursos
            (rol_id, recurso_tipo, recurso_codigo, nivel)
        SELECT r.id,
               'accion_panel'::seguridad.tipo_recurso_permiso,
               d.recurso_codigo,
               d.nivel::seguridad.nivel_acceso_recurso
        FROM datos d
        JOIN seguridad.roles r ON r.codigo = d.rol_codigo
        ON CONFLICT (rol_id, recurso_tipo, recurso_codigo) DO NOTHING;
    """))


def downgrade() -> None:
    # Tabla primero (depende de los enums), luego enums.
    op.execute(text("DROP TABLE IF EXISTS seguridad.permisos_recursos;"))
    op.execute(text("DROP TYPE IF EXISTS seguridad.nivel_acceso_recurso;"))
    op.execute(text("DROP TYPE IF EXISTS seguridad.tipo_recurso_permiso;"))
