-- =============================================================================
-- 12. PERMISOS DE RECURSOS GRANULARES (seccion_ficha / sidebar / accion_panel)
--
-- Complementa seguridad.rol_permisos (matriz rol × módulo) con tres tipos de
-- recursos que no son módulos:
--
--   1. seccion_ficha → secciones (y sub-secciones) de la ficha del funcionario
--      ej: "resumen", "datos", "operativo:faltas", "auditoria"
--   2. sidebar       → items globales del sidebar
--      ej: "dashboard", "personal", "egresos"
--   3. accion_panel  → acciones del panel del funcionario
--      ej: "reposo", "ascender", "jubilar"
--
-- Niveles: edit / view / none. ADMIN obtiene edit por convención del helper
-- (no se insertan filas para ADMIN aquí). La ausencia de fila = 'none'.
--
-- Idempotente: usa IF NOT EXISTS y ON CONFLICT DO NOTHING.
-- =============================================================================

-- =============================================================================
-- 1. ENUMs
-- =============================================================================

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

-- =============================================================================
-- 2. TABLA
-- =============================================================================

CREATE TABLE IF NOT EXISTS seguridad.permisos_recursos (
    id              BIGSERIAL PRIMARY KEY,
    rol_id          SMALLINT NOT NULL
                    REFERENCES seguridad.roles(id) ON DELETE CASCADE,
    recurso_tipo    seguridad.tipo_recurso_permiso NOT NULL,
    recurso_codigo  TEXT NOT NULL,
    nivel           seguridad.nivel_acceso_recurso NOT NULL DEFAULT 'none',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_permisos_recursos UNIQUE (rol_id, recurso_tipo, recurso_codigo)
);

CREATE INDEX IF NOT EXISTS ix_permisos_recursos_rol
    ON seguridad.permisos_recursos(rol_id);
CREATE INDEX IF NOT EXISTS ix_permisos_recursos_tipo
    ON seguridad.permisos_recursos(recurso_tipo);

-- =============================================================================
-- 3. SEEDS
--    Espejo de la matriz hardcodeada en apps/web/src/lib/permisos-funcionario.ts
--    para no romper comportamiento existente.
--
--    ADMIN se omite (el helper de roles le da edit a todo automáticamente).
--    Roles que no existen en seguridad.roles no producen filas gracias al
--    INNER JOIN con seguridad.roles (el rol de solo lectura es CONSULTA,
--    tal como lo siembra 04_seed.sql).
-- =============================================================================

-- ----- 3.1 seccion_ficha -----------------------------------------------------
WITH datos (rol_codigo, recurso_codigo, nivel) AS (
    VALUES
        -- resumen
        ('RRHH',       'resumen',                'edit'),
        ('SUPERVISOR', 'resumen',                'view'),
        ('LOGISTICA',  'resumen',                'view'),
        ('OPERADOR',   'resumen',                'view'),
        ('INSPECTOR',  'resumen',                'view'),
        ('CONSULTA',    'resumen',                'view'),

        -- datos
        ('RRHH',       'datos',                  'edit'),
        ('SUPERVISOR', 'datos',                  'view'),
        ('CONSULTA',    'datos',                  'view'),

        -- carrera
        ('RRHH',       'carrera',                'edit'),
        ('SUPERVISOR', 'carrera',                'view'),
        ('CONSULTA',    'carrera',                'view'),

        -- operativo (padre)
        ('RRHH',       'operativo',              'edit'),
        ('SUPERVISOR', 'operativo',              'edit'),
        ('OPERADOR',   'operativo',              'edit'),
        ('INSPECTOR',  'operativo',              'view'),
        ('CONSULTA',    'operativo',              'view'),

        -- operativo:guardias
        ('RRHH',       'operativo:guardias',     'edit'),
        ('SUPERVISOR', 'operativo:guardias',     'edit'),
        ('OPERADOR',   'operativo:guardias',     'edit'),
        ('CONSULTA',    'operativo:guardias',     'view'),

        -- operativo:vacaciones
        ('RRHH',       'operativo:vacaciones',   'edit'),
        ('SUPERVISOR', 'operativo:vacaciones',   'edit'),
        ('CONSULTA',    'operativo:vacaciones',   'view'),

        -- operativo:permisos
        ('RRHH',       'operativo:permisos',     'edit'),
        ('SUPERVISOR', 'operativo:permisos',     'edit'),
        ('OPERADOR',   'operativo:permisos',     'edit'),
        ('CONSULTA',    'operativo:permisos',     'view'),

        -- operativo:comisiones
        ('RRHH',       'operativo:comisiones',   'edit'),
        ('SUPERVISOR', 'operativo:comisiones',   'edit'),
        ('INSPECTOR',  'operativo:comisiones',   'view'),
        ('CONSULTA',    'operativo:comisiones',   'view'),

        -- operativo:faltas
        ('RRHH',       'operativo:faltas',       'view'),
        ('SUPERVISOR', 'operativo:faltas',       'edit'),
        ('INSPECTOR',  'operativo:faltas',       'edit'),

        -- salud
        ('RRHH',       'salud',                  'edit'),
        ('SUPERVISOR', 'salud',                  'view'),

        -- equipos
        ('RRHH',       'equipos',                'view'),
        ('SUPERVISOR', 'equipos',                'view'),
        ('LOGISTICA',  'equipos',                'edit'),
        ('CONSULTA',    'equipos',                'view'),

        -- beneficios
        ('RRHH',       'beneficios',             'edit'),

        -- familia
        ('RRHH',       'familia',                'edit'),
        ('SUPERVISOR', 'familia',                'view'),
        ('CONSULTA',    'familia',                'view'),

        -- habilidades
        ('RRHH',       'habilidades',            'edit'),
        ('SUPERVISOR', 'habilidades',            'view'),
        ('CONSULTA',    'habilidades',            'view'),

        -- documentos
        ('RRHH',       'documentos',             'edit'),
        ('SUPERVISOR', 'documentos',             'view'),
        ('CONSULTA',    'documentos',             'view'),

        -- auditoria
        ('RRHH',       'auditoria',              'view')
)
INSERT INTO seguridad.permisos_recursos (rol_id, recurso_tipo, recurso_codigo, nivel)
SELECT r.id, 'seccion_ficha'::seguridad.tipo_recurso_permiso, d.recurso_codigo,
       d.nivel::seguridad.nivel_acceso_recurso
FROM datos d
JOIN seguridad.roles r ON r.codigo = d.rol_codigo
ON CONFLICT (rol_id, recurso_tipo, recurso_codigo) DO NOTHING;

-- ----- 3.2 sidebar -----------------------------------------------------------
WITH datos (rol_codigo, recurso_codigo, nivel) AS (
    VALUES
        -- dashboard → todos los roles operativos lo ven
        ('RRHH',       'dashboard',  'view'),
        ('SUPERVISOR', 'dashboard',  'view'),
        ('OPERADOR',   'dashboard',  'view'),
        ('INSPECTOR',  'dashboard',  'view'),
        ('LOGISTICA',  'dashboard',  'view'),
        ('CONSULTA',    'dashboard',  'view'),

        -- personal → RRHH edit, resto view
        ('RRHH',       'personal',   'edit'),
        ('SUPERVISOR', 'personal',   'view'),
        ('OPERADOR',   'personal',   'view'),
        ('INSPECTOR',  'personal',   'view'),
        ('LOGISTICA',  'personal',   'view'),
        ('CONSULTA',    'personal',   'view'),

        -- carrera → RRHH edit, resto view
        ('RRHH',       'carrera',    'edit'),
        ('SUPERVISOR', 'carrera',    'view'),
        ('OPERADOR',   'carrera',    'view'),
        ('INSPECTOR',  'carrera',    'view'),
        ('LOGISTICA',  'carrera',    'view'),
        ('CONSULTA',    'carrera',    'view'),

        -- beneficios → solo RRHH/ADMIN
        ('RRHH',       'beneficios', 'edit'),

        -- egresos → solo RRHH/ADMIN
        ('RRHH',       'egresos',    'edit'),

        -- catalogos → todos view
        ('RRHH',       'catalogos',  'view'),
        ('SUPERVISOR', 'catalogos',  'view'),
        ('OPERADOR',   'catalogos',  'view'),
        ('INSPECTOR',  'catalogos',  'view'),
        ('LOGISTICA',  'catalogos',  'view'),
        ('CONSULTA',    'catalogos',  'view')
)
INSERT INTO seguridad.permisos_recursos (rol_id, recurso_tipo, recurso_codigo, nivel)
SELECT r.id, 'sidebar'::seguridad.tipo_recurso_permiso, d.recurso_codigo,
       d.nivel::seguridad.nivel_acceso_recurso
FROM datos d
JOIN seguridad.roles r ON r.codigo = d.rol_codigo
ON CONFLICT (rol_id, recurso_tipo, recurso_codigo) DO NOTHING;

-- ----- 3.3 accion_panel ------------------------------------------------------
WITH datos (rol_codigo, recurso_codigo, nivel) AS (
    VALUES
        -- reposo / vacaciones / permiso → RRHH, SUPERVISOR, OPERADOR
        ('RRHH',       'reposo',        'edit'),
        ('SUPERVISOR', 'reposo',        'edit'),
        ('OPERADOR',   'reposo',        'edit'),

        ('RRHH',       'vacaciones',    'edit'),
        ('SUPERVISOR', 'vacaciones',    'edit'),
        ('OPERADOR',   'vacaciones',    'edit'),

        ('RRHH',       'permiso',       'edit'),
        ('SUPERVISOR', 'permiso',       'edit'),
        ('OPERADOR',   'permiso',       'edit'),

        -- comision → RRHH, SUPERVISOR, INSPECTOR
        ('RRHH',       'comision',      'edit'),
        ('SUPERVISOR', 'comision',      'edit'),
        ('INSPECTOR',  'comision',      'edit'),

        -- falta → SUPERVISOR, INSPECTOR
        ('SUPERVISOR', 'falta',         'edit'),
        ('INSPECTOR',  'falta',         'edit'),

        -- suspender / reactivar → RRHH, SUPERVISOR
        ('RRHH',       'suspender',     'edit'),
        ('SUPERVISOR', 'suspender',     'edit'),

        ('RRHH',       'reactivar',     'edit'),
        ('SUPERVISOR', 'reactivar',     'edit'),

        -- ascender / trasladar → solo RRHH
        ('RRHH',       'ascender',      'edit'),
        ('RRHH',       'trasladar',     'edit'),

        -- pre-jubilar / jubilar / fallecimiento / egresar → solo RRHH
        ('RRHH',       'pre-jubilar',   'edit'),
        ('RRHH',       'jubilar',       'edit'),
        ('RRHH',       'fallecimiento', 'edit'),
        ('RRHH',       'egresar',       'edit')
)
INSERT INTO seguridad.permisos_recursos (rol_id, recurso_tipo, recurso_codigo, nivel)
SELECT r.id, 'accion_panel'::seguridad.tipo_recurso_permiso, d.recurso_codigo,
       d.nivel::seguridad.nivel_acceso_recurso
FROM datos d
JOIN seguridad.roles r ON r.codigo = d.rol_codigo
ON CONFLICT (rol_id, recurso_tipo, recurso_codigo) DO NOTHING;
