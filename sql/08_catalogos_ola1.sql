-- =============================================================================
-- CUERPO DE BOMBEROS DE CARACAS — Archivo 08: Catálogos Ola 1
--
-- Crea los catálogos planos legítimos de la primera ola y extiende
-- personal.funcionarios con los campos no-domicilio (formación, nacionalización,
-- fechas legacy), además de ampliar personal.direcciones con vivienda y
-- bienestar social.
--
-- IMPORTANTE: la geografía político-territorial vive ÚNICAMENTE en el schema
-- geo (geo.estados, geo.municipios, geo.parroquias) — ver sql/01_base.sql y
-- el seed de Caracas en sql/04_seed.sql. NO se crean tablas duplicadas en core.
--
-- El domicilio del funcionario NO se almacena en personal.funcionarios como
-- columnas planas. Es una relación 1:N en personal.direcciones (con historial
-- de mudanzas vía es_actual + fecha_registro).
--
-- Notas de schema:
--   * core.estatus_funcionario ya existe como ENUM en 01_base.sql.
--     Para evitar colisión de nombre (en PostgreSQL un tipo y una tabla
--     comparten el mismo namespace), este catálogo se materializa como
--     core.estatus_funcionarios (plural).
--
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING en todo.
-- =============================================================================

-- ===========================================
-- 1. CATALOGOS PLANOS (3 tablas)
-- ===========================================

CREATE TABLE IF NOT EXISTS core.tipos_personal (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.estatus_funcionarios (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.instituciones_formadoras (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===========================================
-- 2. VIVIENDA (2 tablas)
-- ===========================================

CREATE TABLE IF NOT EXISTS core.tipos_vivienda (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.tenencias_vivienda (
    id      SMALLSERIAL PRIMARY KEY,
    codigo  TEXT NOT NULL UNIQUE,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===========================================
-- 3. AMPLIAR personal.funcionarios (campos NO-domicilio)
-- ===========================================
-- El domicilio no se modela aquí — es 1:N en personal.direcciones.
-- Solo añadimos: vínculo a institución formadora, fechas legacy, datos de
-- nacionalización y campos sueltos (licencia, factor sanguíneo, idiomas).

ALTER TABLE personal.funcionarios
    -- Vínculo a catálogo formación
    ADD COLUMN IF NOT EXISTS institucion_formadora_id SMALLINT
        REFERENCES core.instituciones_formadoras(id),

    -- Campos legacy faltantes
    ADD COLUMN IF NOT EXISTS licencia_conducir    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS fecha_egreso         DATE,
    ADD COLUMN IF NOT EXISTS fecha_reintegro      DATE,
    ADD COLUMN IF NOT EXISTS factor_sanguineo     VARCHAR(15),
    ADD COLUMN IF NOT EXISTS fecha_este           DATE,
    ADD COLUMN IF NOT EXISTS fecha_ingreso_gdf    DATE,

    -- Nacionalización (si extranjero/naturalizado)
    ADD COLUMN IF NOT EXISTS tipo_nacionalizacion          VARCHAR(40),
    ADD COLUMN IF NOT EXISTS fecha_nacionalizacion         DATE,
    ADD COLUMN IF NOT EXISTS numero_gaceta_nacionalizacion VARCHAR(50),
    ADD COLUMN IF NOT EXISTS pais_origen                   VARCHAR(80),
    ADD COLUMN IF NOT EXISTS idiomas                       VARCHAR(200);

-- ===========================================
-- 4. AMPLIAR personal.direcciones (vivienda + bienestar)
-- ===========================================
-- Las columnas booleanas es_propia / es_alquilada quedan como legacy.
-- Las dos FKs de vivienda son la nueva forma canónica.
-- Las columnas de bienestar son sensibles (solo RRHH/ADMIN puede editarlas).

ALTER TABLE personal.direcciones
    ADD COLUMN IF NOT EXISTS tipo_vivienda_id  SMALLINT
        REFERENCES core.tipos_vivienda(id),
    ADD COLUMN IF NOT EXISTS tenencia_id       SMALLINT
        REFERENCES core.tenencias_vivienda(id),
    ADD COLUMN IF NOT EXISTS damnificado        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS damnificado_desde  DATE,
    ADD COLUMN IF NOT EXISTS reside_alto_riesgo BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ayuda_economica    BOOLEAN NOT NULL DEFAULT FALSE;

-- ===========================================
-- 5. SEEDS pequeños (catálogos planos)
-- ===========================================

INSERT INTO core.tipos_personal (codigo, nombre) VALUES
    ('UNIFORMADO',     'Uniformado'),
    ('ADMINISTRATIVO', 'Administrativo'),
    ('OBRERO',         'Obrero')
ON CONFLICT (codigo) DO NOTHING;

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

INSERT INTO core.instituciones_formadoras (codigo, nombre) VALUES
    ('IUTB', 'Instituto Universitario Tecnológico de Bomberos'),
    ('UNES', 'Universidad Nacional Experimental de la Seguridad')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO core.tipos_vivienda (codigo, nombre) VALUES
    ('CASA',        'Casa'),
    ('APARTAMENTO', 'Apartamento'),
    ('QUINTA',      'Quinta'),
    ('ANEXO',       'Anexo'),
    ('RANCHO',      'Rancho'),
    ('HABITACION',  'Habitación')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO core.tenencias_vivienda (codigo, nombre) VALUES
    ('PROPIA',    'Propia'),
    ('ALQUILADA', 'Alquilada'),
    ('FAMILIAR',  'Familiar'),
    ('CEDIDA',    'Cedida'),
    ('OTRA',      'Otra')
ON CONFLICT (codigo) DO NOTHING;

-- =============================================================================
-- FIN ARCHIVO 08
-- =============================================================================
