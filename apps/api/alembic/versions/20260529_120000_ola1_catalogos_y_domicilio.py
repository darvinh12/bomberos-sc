"""ola1: catálogos planos, vivienda, ampliación legacy de funcionarios y
ampliación de personal.direcciones con vivienda + bienestar.

Crea las 5 tablas de catálogo planos legítimos (3 administrativos + 2 vivienda),
amplía personal.funcionarios con los campos NO-domicilio de la Ola 1 (formación,
fechas legacy, nacionalización) y amplía personal.direcciones con tipo/tenencia
de vivienda y los 4 flags de bienestar social.

NO crea tablas de geografía en el schema `core`: la única fuente de verdad
político-territorial son geo.estados / geo.municipios / geo.parroquias (definidos
en sql/01_base.sql, seed en sql/04_seed.sql). El domicilio del funcionario es
1:N en personal.direcciones — no columnas planas en personal.funcionarios.

Notas:
  - core.estatus_funcionario existe como TYPE ENUM (sql/01_base.sql); el catálogo
    plural core.estatus_funcionarios no entra en colisión.
  - core.tipo_personal existe como TYPE ENUM; el catálogo plural
    core.tipos_personal tampoco entra en colisión.

Revision ID: 20260529_120000
Revises:
Create Date: 2026-05-29 12:00:00
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260529_120000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # 1. CATÁLOGOS PLANOS (3 tablas)
    # =========================================================================
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.tipos_personal (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.estatus_funcionarios (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.instituciones_formadoras (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    # =========================================================================
    # 2. VIVIENDA (2 tablas)
    # =========================================================================
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.tipos_vivienda (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.tenencias_vivienda (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    # =========================================================================
    # 3. AMPLIAR personal.funcionarios (campos NO-domicilio)
    # =========================================================================
    # El domicilio NO se modela aquí — vive 1:N en personal.direcciones.
    op.execute(text("""
        ALTER TABLE personal.funcionarios
            ADD COLUMN IF NOT EXISTS institucion_formadora_id SMALLINT
                REFERENCES core.instituciones_formadoras(id),

            ADD COLUMN IF NOT EXISTS licencia_conducir    VARCHAR(20),
            ADD COLUMN IF NOT EXISTS fecha_egreso         DATE,
            ADD COLUMN IF NOT EXISTS fecha_reintegro      DATE,
            ADD COLUMN IF NOT EXISTS factor_sanguineo     VARCHAR(15),
            ADD COLUMN IF NOT EXISTS fecha_este           DATE,
            ADD COLUMN IF NOT EXISTS fecha_ingreso_gdf    DATE,

            ADD COLUMN IF NOT EXISTS tipo_nacionalizacion          VARCHAR(40),
            ADD COLUMN IF NOT EXISTS fecha_nacionalizacion         DATE,
            ADD COLUMN IF NOT EXISTS numero_gaceta_nacionalizacion VARCHAR(50),
            ADD COLUMN IF NOT EXISTS pais_origen                   VARCHAR(80),
            ADD COLUMN IF NOT EXISTS idiomas                       VARCHAR(200);
    """))

    # =========================================================================
    # 4. AMPLIAR personal.direcciones (vivienda + bienestar social)
    # =========================================================================
    op.execute(text("""
        ALTER TABLE personal.direcciones
            ADD COLUMN IF NOT EXISTS tipo_vivienda_id  SMALLINT
                REFERENCES core.tipos_vivienda(id),
            ADD COLUMN IF NOT EXISTS tenencia_id       SMALLINT
                REFERENCES core.tenencias_vivienda(id),
            ADD COLUMN IF NOT EXISTS damnificado        BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS damnificado_desde  DATE,
            ADD COLUMN IF NOT EXISTS reside_alto_riesgo BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS ayuda_economica    BOOLEAN NOT NULL DEFAULT FALSE;
    """))

    # =========================================================================
    # 5. SEEDS pequeños
    # =========================================================================
    op.execute(text("""
        INSERT INTO core.tipos_personal (codigo, nombre) VALUES
            ('UNIFORMADO',     'Uniformado'),
            ('ADMINISTRATIVO', 'Administrativo'),
            ('OBRERO',         'Obrero')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.estatus_funcionarios (codigo, nombre) VALUES
            ('ACTIVO',       'Activo'),
            ('REPOSO',       'En reposo'),
            ('COMISION',     'En comisión'),
            ('PRE_JUBILADO', 'Pre-jubilado'),
            ('JUBILADO',     'Jubilado'),
            ('EGRESADO',     'Egresado'),
            ('FALLECIDO',    'Fallecido'),
            ('SUSPENDIDO',   'Suspendido')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.instituciones_formadoras (codigo, nombre) VALUES
            ('IUTB', 'Instituto Universitario Tecnológico de Bomberos'),
            ('UNES', 'Universidad Nacional Experimental de la Seguridad')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.tipos_vivienda (codigo, nombre) VALUES
            ('CASA',        'Casa'),
            ('APARTAMENTO', 'Apartamento'),
            ('QUINTA',      'Quinta'),
            ('ANEXO',       'Anexo'),
            ('RANCHO',      'Rancho'),
            ('HABITACION',  'Habitación')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.tenencias_vivienda (codigo, nombre) VALUES
            ('PROPIA',    'Propia'),
            ('ALQUILADA', 'Alquilada'),
            ('FAMILIAR',  'Familiar'),
            ('CEDIDA',    'Cedida'),
            ('OTRA',      'Otra')
        ON CONFLICT (codigo) DO NOTHING;
    """))


def downgrade() -> None:
    # =========================================================================
    # 1. Revertir ampliación de personal.direcciones
    # =========================================================================
    op.execute(text("""
        ALTER TABLE personal.direcciones
            DROP COLUMN IF EXISTS ayuda_economica,
            DROP COLUMN IF EXISTS reside_alto_riesgo,
            DROP COLUMN IF EXISTS damnificado_desde,
            DROP COLUMN IF EXISTS damnificado,
            DROP COLUMN IF EXISTS tenencia_id,
            DROP COLUMN IF EXISTS tipo_vivienda_id;
    """))

    # =========================================================================
    # 2. Revertir ampliación de personal.funcionarios (campos NO-domicilio)
    # =========================================================================
    op.execute(text("""
        ALTER TABLE personal.funcionarios
            DROP COLUMN IF EXISTS idiomas,
            DROP COLUMN IF EXISTS pais_origen,
            DROP COLUMN IF EXISTS numero_gaceta_nacionalizacion,
            DROP COLUMN IF EXISTS fecha_nacionalizacion,
            DROP COLUMN IF EXISTS tipo_nacionalizacion,
            DROP COLUMN IF EXISTS fecha_ingreso_gdf,
            DROP COLUMN IF EXISTS fecha_este,
            DROP COLUMN IF EXISTS factor_sanguineo,
            DROP COLUMN IF EXISTS fecha_reintegro,
            DROP COLUMN IF EXISTS fecha_egreso,
            DROP COLUMN IF EXISTS licencia_conducir,
            DROP COLUMN IF EXISTS institucion_formadora_id;
    """))

    # =========================================================================
    # 3. DROP de las 5 tablas (orden inverso por FK)
    # =========================================================================
    op.execute(text("DROP TABLE IF EXISTS core.tenencias_vivienda CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.tipos_vivienda CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.instituciones_formadoras CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.estatus_funcionarios CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.tipos_personal CASCADE;"))
