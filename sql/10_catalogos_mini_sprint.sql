-- =============================================================================
-- CUERPO DE BOMBEROS DE CARACAS — Archivo 10: Mini-sprint de catálogos
--
-- Convierte 6 campos de texto libre del form de funcionario en catálogos
-- gestionables desde /admin/catalogos.
--
-- Tablas nuevas (schema `core`):
--   * core.parentescos             — usado en contacto emergencia y carga_familiar
--   * core.tipos_nacionalizacion   — usado en sección identidad
--   * core.idiomas                 — multi-select (vía pivote)
--   * core.paises                  — origen y nacimiento (ISO 3166-1 alpha-3)
--   * core.secciones_funcionario   — A, B, C, D (division interna)
--
-- core.tipos_licencia YA EXISTE en sql/01_base.sql (id, codigo, nombre) sin
-- columna `activo`. Aquí solo se le AÑADE `activo BOOLEAN DEFAULT TRUE` para
-- alinearlo con el patrón del resto de catálogos administrables.
--
-- Tabla pivote nueva (schema `personal`):
--   * personal.funcionario_idiomas — relación N:M funcionario ↔ idioma
--
-- Ampliación de personal.funcionarios:
--   * parentesco_contacto_id        FK → core.parentescos
--   * licencia_conducir_id          FK → core.tipos_licencia
--   * tipo_nacionalizacion_id       FK → core.tipos_nacionalizacion
--   * pais_origen_id                FK → core.paises
--   * pais_nacimiento_id            FK → core.paises
--   * seccion_id                    FK → core.secciones_funcionario
--
-- Las columnas viejas (parentesco_contacto, licencia_conducir,
-- tipo_nacionalizacion, pais_origen, pais_nacimiento, seccion, idiomas)
-- se MANTIENEN como legacy para compatibilidad con datos importados.
--
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING en todo.
-- =============================================================================

-- ===========================================
-- 1. CATÁLOGOS PLANOS (5 tablas nuevas)
-- ===========================================

CREATE TABLE IF NOT EXISTS core.parentescos (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.tipos_nacionalizacion (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.idiomas (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.paises (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,    -- ISO 3166-1 alpha-3
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.secciones_funcionario (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===========================================
-- 2. ALINEAR core.tipos_licencia
-- ===========================================
-- Tabla creada en 01_base.sql sin columna `activo`. La agregamos aquí
-- para que el patrón administrable sea uniforme.
ALTER TABLE core.tipos_licencia
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- ===========================================
-- 3. PIVOTE funcionario ↔ idiomas (multi-select)
-- ===========================================
CREATE TABLE IF NOT EXISTS personal.funcionario_idiomas (
    funcionario_id  BIGINT NOT NULL
        REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    idioma_id       SMALLINT NOT NULL
        REFERENCES core.idiomas(id) ON DELETE RESTRICT,
    PRIMARY KEY (funcionario_id, idioma_id)
);
CREATE INDEX IF NOT EXISTS ix_func_idiomas_idioma
    ON personal.funcionario_idiomas(idioma_id);

-- ===========================================
-- 4. AMPLIAR personal.funcionarios con FKs nuevas
-- ===========================================
-- Las columnas legacy (parentesco_contacto, licencia_conducir,
-- tipo_nacionalizacion, pais_origen, pais_nacimiento, seccion) NO se borran.
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

-- ===========================================
-- 5. SEEDS
-- ===========================================

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

INSERT INTO core.tipos_nacionalizacion (codigo, nombre) VALUES
    ('POR_MATRIMONIO',     'Por matrimonio'),
    ('POR_RESIDENCIA',     'Por residencia'),
    ('POR_NACIMIENTO',     'Por nacimiento'),
    ('POR_ADOPCION',       'Por adopción'),
    ('POR_NATURALIZACION', 'Por naturalización')
ON CONFLICT (codigo) DO NOTHING;

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

-- 45 países comunes (ISO 3166-1 alpha-3)
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

INSERT INTO core.secciones_funcionario (codigo, nombre) VALUES
    ('A', 'Sección A'),
    ('B', 'Sección B'),
    ('C', 'Sección C'),
    ('D', 'Sección D')
ON CONFLICT (codigo) DO NOTHING;

-- Seeds adicionales para tipos_licencia que faltaban (A, B, C, D, E
-- como categorías alfabéticas — el seed legacy usa 1..5 + MOTO).
INSERT INTO core.tipos_licencia (codigo, nombre) VALUES
    ('A', 'Categoría A'),
    ('B', 'Categoría B'),
    ('C', 'Categoría C'),
    ('D', 'Categoría D'),
    ('E', 'Categoría E')
ON CONFLICT (codigo) DO NOTHING;

-- =============================================================================
-- FIN ARCHIVO 10
-- =============================================================================
