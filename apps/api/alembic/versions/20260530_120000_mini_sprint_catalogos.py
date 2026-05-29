"""mini-sprint: 6 catálogos administrables para los inputs libres del form.

Crea 5 catálogos planos nuevos (core.parentescos, core.tipos_nacionalizacion,
core.idiomas, core.paises, core.secciones_funcionario), agrega `activo` a
core.tipos_licencia (ya existente en sql/01_base.sql), crea la tabla pivote
personal.funcionario_idiomas para multi-select de idiomas, y amplía
personal.funcionarios con 6 columnas FK (manteniendo las viejas string como
legacy).

Idempotente. Los seeds usan ON CONFLICT DO NOTHING.

Revision ID: 20260530_120000
Revises: 20260529_120000
Create Date: 2026-05-30 12:00:00
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260530_120000"
down_revision: Union[str, None] = "20260529_120000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # 1. CATÁLOGOS PLANOS (5 tablas nuevas)
    # =========================================================================
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.parentescos (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.tipos_nacionalizacion (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.idiomas (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.paises (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    op.execute(text("""
        CREATE TABLE IF NOT EXISTS core.secciones_funcionario (
            id      SMALLSERIAL PRIMARY KEY,
            codigo  TEXT NOT NULL UNIQUE,
            nombre  TEXT NOT NULL,
            activo  BOOLEAN NOT NULL DEFAULT TRUE
        );
    """))

    # =========================================================================
    # 2. ALINEAR core.tipos_licencia (agregar `activo`)
    # =========================================================================
    op.execute(text("""
        ALTER TABLE core.tipos_licencia
            ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
    """))

    # =========================================================================
    # 3. PIVOTE funcionario ↔ idiomas
    # =========================================================================
    op.execute(text("""
        CREATE TABLE IF NOT EXISTS personal.funcionario_idiomas (
            funcionario_id  BIGINT NOT NULL
                REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
            idioma_id       SMALLINT NOT NULL
                REFERENCES core.idiomas(id) ON DELETE RESTRICT,
            PRIMARY KEY (funcionario_id, idioma_id)
        );
    """))
    op.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_func_idiomas_idioma
            ON personal.funcionario_idiomas(idioma_id);
    """))

    # =========================================================================
    # 4. AMPLIAR personal.funcionarios con FKs
    # =========================================================================
    op.execute(text("""
        ALTER TABLE personal.funcionarios
            ADD COLUMN IF NOT EXISTS parentesco_contacto_id   SMALLINT
                REFERENCES core.parentescos(id),
            ADD COLUMN IF NOT EXISTS licencia_conducir_id     SMALLINT
                REFERENCES core.tipos_licencia(id),
            ADD COLUMN IF NOT EXISTS tipo_nacionalizacion_id  SMALLINT
                REFERENCES core.tipos_nacionalizacion(id),
            ADD COLUMN IF NOT EXISTS pais_origen_id           SMALLINT
                REFERENCES core.paises(id),
            ADD COLUMN IF NOT EXISTS pais_nacimiento_id       SMALLINT
                REFERENCES core.paises(id),
            ADD COLUMN IF NOT EXISTS seccion_id               SMALLINT
                REFERENCES core.secciones_funcionario(id);
    """))

    # =========================================================================
    # 5. SEEDS
    # =========================================================================
    op.execute(text("""
        INSERT INTO core.parentescos (codigo, nombre) VALUES
            ('CONYUGE',  'Cónyuge'),
            ('HIJO',     'Hijo'),
            ('HIJA',     'Hija'),
            ('PADRE',    'Padre'),
            ('MADRE',    'Madre'),
            ('HERMANO',  'Hermano'),
            ('HERMANA',  'Hermana'),
            ('ABUELO',   'Abuelo'),
            ('ABUELA',   'Abuela'),
            ('TIO',      'Tío'),
            ('TIA',      'Tía'),
            ('NIETO',    'Nieto'),
            ('NIETA',    'Nieta'),
            ('OTRO',     'Otro')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.tipos_nacionalizacion (codigo, nombre) VALUES
            ('POR_MATRIMONIO',     'Por matrimonio'),
            ('POR_RESIDENCIA',     'Por residencia'),
            ('POR_NACIMIENTO',     'Por nacimiento'),
            ('POR_ADOPCION',       'Por adopción'),
            ('POR_NATURALIZACION', 'Por naturalización')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.idiomas (codigo, nombre) VALUES
            ('ESPANOL',   'Español'),
            ('INGLES',    'Inglés'),
            ('FRANCES',   'Francés'),
            ('PORTUGUES', 'Portugués'),
            ('ITALIANO',  'Italiano'),
            ('ALEMAN',    'Alemán'),
            ('CHINO',     'Chino'),
            ('JAPONES',   'Japonés'),
            ('ARABE',     'Árabe'),
            ('RUSO',      'Ruso')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.paises (codigo, nombre) VALUES
            ('VEN', 'Venezuela'),
            ('COL', 'Colombia'),
            ('ECU', 'Ecuador'),
            ('PER', 'Perú'),
            ('CHL', 'Chile'),
            ('ARG', 'Argentina'),
            ('BRA', 'Brasil'),
            ('MEX', 'México'),
            ('ESP', 'España'),
            ('USA', 'Estados Unidos'),
            ('ITA', 'Italia'),
            ('PRT', 'Portugal'),
            ('FRA', 'Francia'),
            ('GBR', 'Reino Unido'),
            ('DEU', 'Alemania'),
            ('NLD', 'Países Bajos'),
            ('CHE', 'Suiza'),
            ('BEL', 'Bélgica'),
            ('CHN', 'China'),
            ('JPN', 'Japón'),
            ('KOR', 'Corea del Sur'),
            ('IND', 'India'),
            ('LBN', 'Líbano'),
            ('SYR', 'Siria'),
            ('EGY', 'Egipto'),
            ('MAR', 'Marruecos'),
            ('ZAF', 'Sudáfrica'),
            ('NGA', 'Nigeria'),
            ('CRI', 'Costa Rica'),
            ('PAN', 'Panamá'),
            ('DOM', 'República Dominicana'),
            ('CUB', 'Cuba'),
            ('HND', 'Honduras'),
            ('GTM', 'Guatemala'),
            ('SLV', 'El Salvador'),
            ('NIC', 'Nicaragua'),
            ('BOL', 'Bolivia'),
            ('URY', 'Uruguay'),
            ('PRY', 'Paraguay'),
            ('CAN', 'Canadá'),
            ('AUS', 'Australia'),
            ('NZL', 'Nueva Zelanda'),
            ('ISR', 'Israel'),
            ('TUR', 'Turquía'),
            ('RUS', 'Rusia')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.secciones_funcionario (codigo, nombre) VALUES
            ('A', 'Sección A'),
            ('B', 'Sección B'),
            ('C', 'Sección C'),
            ('D', 'Sección D')
        ON CONFLICT (codigo) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO core.tipos_licencia (codigo, nombre) VALUES
            ('A', 'Categoría A'),
            ('B', 'Categoría B'),
            ('C', 'Categoría C'),
            ('D', 'Categoría D'),
            ('E', 'Categoría E')
        ON CONFLICT (codigo) DO NOTHING;
    """))


def downgrade() -> None:
    # 1. Revertir FKs en personal.funcionarios
    op.execute(text("""
        ALTER TABLE personal.funcionarios
            DROP COLUMN IF EXISTS seccion_id,
            DROP COLUMN IF EXISTS pais_nacimiento_id,
            DROP COLUMN IF EXISTS pais_origen_id,
            DROP COLUMN IF EXISTS tipo_nacionalizacion_id,
            DROP COLUMN IF EXISTS licencia_conducir_id,
            DROP COLUMN IF EXISTS parentesco_contacto_id;
    """))

    # 2. DROP pivote
    op.execute(text("DROP TABLE IF EXISTS personal.funcionario_idiomas CASCADE;"))

    # 3. Quitar `activo` de tipos_licencia (lo dejamos: es no-destructivo y
    #    01_base.sql tampoco lo tiene — bajar a estado original).
    op.execute(text("""
        ALTER TABLE core.tipos_licencia
            DROP COLUMN IF EXISTS activo;
    """))

    # 4. DROP de las 5 tablas
    op.execute(text("DROP TABLE IF EXISTS core.secciones_funcionario CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.paises CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.idiomas CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.tipos_nacionalizacion CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS core.parentescos CASCADE;"))
