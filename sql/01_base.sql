-- =============================================================================
-- CUERPO DE BOMBEROS DE CARACAS — BASE DE DATOS  bomberos_caracas
-- Motor: PostgreSQL 16+
-- Archivo 01/04: Extensiones, schemas, ENUMs, catálogos, geografía, organización,
--                seguridad y parámetros del sistema.
-- =============================================================================
-- Convenciones:
--   • Identificadores: snake_case minúscula. Tablas en plural.
--   • PK: columna [id] BIGINT GENERATED ALWAYS AS IDENTITY (BIGSERIAL implícito).
--   • Catálogos pequeños: SMALLINT IDENTITY.
--   • FK: <tabla_singular>_id.
--   • Auditoría: created_at, updated_at, created_by, updated_by en transaccionales.
--   • Soft-delete: solo en tablas con estado de vida (funcionarios.estatus,
--     usuarios.activo). El resto se borra duro o se marca inactivo.
--   • Texto: TEXT por defecto. CITEXT para emails/usuarios. CHECK para límites.
--   • Fechas: DATE para calendario, TIMESTAMPTZ para eventos.
--   • Dinero: NUMERIC(15,2).
--   • Identidad país: nacionalidad CHAR(1) + cedula INT, UNIQUE compuesto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. CREACIÓN DE LA BASE (correr conectado a 'postgres')
-- -----------------------------------------------------------------------------
-- DROP DATABASE IF EXISTS bomberos_caracas;
-- CREATE DATABASE bomberos_caracas
--     WITH ENCODING 'UTF8'
--          LC_COLLATE 'es_VE.UTF-8'
--          LC_CTYPE   'es_VE.UTF-8'
--          TEMPLATE   template0;
-- \c bomberos_caracas

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONES
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid, crypt
CREATE EXTENSION IF NOT EXISTS citext;       -- texto case-insensitive
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- búsqueda fuzzy de nombres
CREATE EXTENSION IF NOT EXISTS unaccent;     -- normalización sin tildes
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- EXCLUDE constraints sobre rangos

-- -----------------------------------------------------------------------------
-- 2. SCHEMAS POR DOMINIO
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS core;        -- catálogos compartidos
CREATE SCHEMA IF NOT EXISTS geo;         -- estados, municipios, parroquias
CREATE SCHEMA IF NOT EXISTS org;         -- zonas, estaciones, áreas, etc.
CREATE SCHEMA IF NOT EXISTS personal;    -- funcionarios, identidad, familia, históricos
CREATE SCHEMA IF NOT EXISTS salud;       -- reposos, diagnósticos, médicos, hcm
CREATE SCHEMA IF NOT EXISTS ops;         -- guardias, permisos, vacaciones, comisiones
CREATE SCHEMA IF NOT EXISTS carrera;     -- ascensos, evaluaciones, cursos, méritos
CREATE SCHEMA IF NOT EXISTS equipo;      -- protección, uniformes, radios
CREATE SCHEMA IF NOT EXISTS beneficios;  -- ayudas económicas, control entrega
CREATE SCHEMA IF NOT EXISTS vivienda;    -- programas habitacionales, refugios
CREATE SCHEMA IF NOT EXISTS egresos;     -- jubilados, fallecidos, tiempo adm pública
CREATE SCHEMA IF NOT EXISTS documentos;  -- actas, encabezados, firmas, oficios
CREATE SCHEMA IF NOT EXISTS seguridad;   -- usuarios, roles, sesiones
CREATE SCHEMA IF NOT EXISTS aud;         -- auditoría genérica
CREATE SCHEMA IF NOT EXISTS sys;         -- parámetros, jobs, versiones

SET search_path = public;

-- -----------------------------------------------------------------------------
-- 3. ENUMs (conjuntos cerrados, raramente cambian)
-- -----------------------------------------------------------------------------
CREATE TYPE core.estatus_funcionario AS ENUM (
    'ACTIVO',
    'REPOSO',
    'COMISION',
    'PRE_JUBILADO',
    'JUBILADO',
    'EGRESADO',
    'FALLECIDO',
    'SUSPENDIDO',
    'BAJA_DESHONROSA',
    'PERMISO_LARGO'
);

CREATE TYPE core.tipo_personal AS ENUM (
    'BOMBERO',          -- uniformado de carrera
    'BOMBERO_VOLUNTARIO',
    'OBRERO',
    'EMPLEADO',         -- administrativo
    'CONTRATADO',
    'PASANTE'
);

CREATE TYPE core.sexo_t AS ENUM ('M', 'F');

CREATE TYPE core.operacion_audit AS ENUM ('I', 'U', 'D');

CREATE TYPE core.estatus_solicitud AS ENUM (
    'PENDIENTE',
    'EN_PROCESO',
    'APROBADO',
    'RECHAZADO',
    'ARCHIVADO',
    'PAGADO',
    'ENTREGADO',
    'ANULADO'
);

CREATE TYPE core.tipo_actividad AS ENUM (
    'CULTURAL',
    'DEPORTIVA',
    'MUSICAL',
    'CIENTIFICA',
    'LABORAL',
    'ACADEMICA'
);

CREATE TYPE core.tipo_movimiento_inventario AS ENUM (
    'INGRESO',
    'EGRESO',
    'AJUSTE',
    'TRANSFERENCIA',
    'BAJA',
    'DEVOLUCION'
);

CREATE TYPE core.tipo_evento_acceso AS ENUM (
    'LOGIN',
    'LOGOUT',
    'LOGIN_FALLIDO',
    'BLOQUEO',
    'CAMBIO_PASSWORD',
    'PASSWORD_RESET'
);

-- =============================================================================
-- 4. CATÁLOGOS COMPARTIDOS (schema core)
-- =============================================================================

-- Estados civiles
CREATE TABLE core.estados_civiles (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Grupos sanguíneos
CREATE TABLE core.grupos_sanguineos (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL
);

-- Niveles educativos
CREATE TABLE core.niveles_educativos (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    orden       SMALLINT NOT NULL DEFAULT 0
);

-- Tipos de nivel educativo (graduado, cursando, abandonó)
CREATE TABLE core.tipos_nivel_educativo (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL
);

-- Especialidades operativas
CREATE TABLE core.especialidades (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Jerarquías (rangos)
CREATE TABLE core.jerarquias (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    nombre_corto TEXT,
    orden       SMALLINT NOT NULL DEFAULT 0,
    es_oficial  BOOLEAN NOT NULL DEFAULT FALSE,
    es_tropa    BOOLEAN NOT NULL DEFAULT FALSE,
    es_estado_mayor BOOLEAN NOT NULL DEFAULT FALSE,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_jerarquias_orden ON core.jerarquias(orden);

-- Cargos administrativos
CREATE TABLE core.cargos (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    es_jefatura BOOLEAN NOT NULL DEFAULT FALSE,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Condiciones laborales
CREATE TABLE core.condiciones (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tipos de reposo
CREATE TABLE core.tipos_reposo (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    dias_max    SMALLINT,
    requiere_diagnostico BOOLEAN NOT NULL DEFAULT TRUE,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tipos de solicitud (ayudas, permisos, jubilación, etc.)
CREATE TABLE core.tipos_solicitud (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    monto_max   NUMERIC(15,2),
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tipos de documento (acervo personal)
CREATE TABLE core.tipos_documento (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    plantilla_url TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tipos de carnet (cívico, vehículo, votación, patria, militar, arma, etc.)
CREATE TABLE core.tipos_carnet (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Tipos de licencia de conducir
CREATE TABLE core.tipos_licencia (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL
);

-- Tipos de accidente
CREATE TABLE core.tipos_accidente (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL
);

-- Tallas (uniformes, calzado)
CREATE TABLE core.tallas (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    grupo       TEXT NOT NULL,                       -- ROPA, CALZADO, CASCO
    orden       SMALLINT NOT NULL DEFAULT 0
);

-- Bancos
CREATE TABLE core.bancos (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,                -- código BCV
    nombre      TEXT NOT NULL,
    swift       TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Proveedores (uniformes, equipos, médicos)
CREATE TABLE core.proveedores (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rif         TEXT UNIQUE,
    razon_social TEXT NOT NULL,
    nombre_comercial TEXT,
    direccion   TEXT,
    telefono    TEXT,
    correo      CITEXT,
    contacto    TEXT,
    rubro       TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Instituciones externas (para apoyo institucional, jurados, condecoraciones)
CREATE TABLE core.instituciones (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT UNIQUE,
    nombre      TEXT NOT NULL,
    siglas      TEXT,
    direccion   TEXT,
    telefono    TEXT,
    correo      CITEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- 5. GEOGRAFÍA (schema geo)
-- =============================================================================

CREATE TABLE geo.estados (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,                -- DC, MI, AR, etc.
    nombre      TEXT NOT NULL,
    capital     TEXT
);

CREATE TABLE geo.municipios (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estado_id   SMALLINT NOT NULL REFERENCES geo.estados(id),
    codigo      TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    UNIQUE(estado_id, codigo)
);
CREATE INDEX ix_municipios_estado ON geo.municipios(estado_id);

CREATE TABLE geo.parroquias (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    municipio_id INT NOT NULL REFERENCES geo.municipios(id),
    codigo      TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    UNIQUE(municipio_id, codigo)
);
CREATE INDEX ix_parroquias_municipio ON geo.parroquias(municipio_id);

-- =============================================================================
-- 6. ESTRUCTURA ORGANIZACIONAL (schema org)
-- =============================================================================

-- Zonas (división geográfica del cuerpo)
CREATE TABLE org.zonas (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Estaciones de bomberos
CREATE TABLE org.estaciones (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zona_id     SMALLINT NOT NULL REFERENCES org.zonas(id),
    parroquia_id INT REFERENCES geo.parroquias(id),
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    nombre_corto TEXT,
    direccion   TEXT,
    telefono    TEXT,
    latitud     NUMERIC(10,7),
    longitud    NUMERIC(10,7),
    activa      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_estaciones_zona ON org.estaciones(zona_id);

-- Divisiones (operativa, administrativa, logística, salud, etc.)
CREATE TABLE org.divisiones (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Áreas (subdivisión funcional dentro de una división)
CREATE TABLE org.areas (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    division_id SMALLINT REFERENCES org.divisiones(id),
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Dependencias (oficinas, despachos)
CREATE TABLE org.dependencias (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    area_id     SMALLINT REFERENCES org.areas(id),
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Mapeo área → dependencia operativa (para guardias / despachos)
CREATE TABLE org.areas_operativas (
    area_id        SMALLINT NOT NULL REFERENCES org.areas(id),
    dependencia_id SMALLINT NOT NULL REFERENCES org.dependencias(id),
    PRIMARY KEY (area_id, dependencia_id)
);

-- Jefes de área / zona (asignación administrativa)
CREATE TABLE org.jefes_area_zona (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zona_id         SMALLINT REFERENCES org.zonas(id),
    area_id         SMALLINT REFERENCES org.areas(id),
    funcionario_id  BIGINT NOT NULL,                 -- FK añadida luego
    cargo_id        SMALLINT REFERENCES core.cargos(id),
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (zona_id IS NOT NULL OR area_id IS NOT NULL),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

-- =============================================================================
-- 7. PARÁMETROS DEL SISTEMA (schema sys)
-- =============================================================================

CREATE TABLE sys.parametros (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    valor       TEXT NOT NULL,
    tipo_dato   TEXT NOT NULL DEFAULT 'string'
                  CHECK (tipo_dato IN ('string','int','decimal','boolean','date','json')),
    descripcion TEXT,
    editable    BOOLEAN NOT NULL DEFAULT TRUE,
    sensible    BOOLEAN NOT NULL DEFAULT FALSE,      -- ocultar en UI
    grupo       TEXT NOT NULL DEFAULT 'general',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sys.versiones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version         TEXT NOT NULL,
    aplicada_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    descripcion     TEXT,
    script_origen   TEXT
);

CREATE TABLE sys.feriados (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha       DATE NOT NULL,
    nombre      TEXT NOT NULL,
    es_nacional BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (fecha, nombre)
);
CREATE INDEX ix_feriados_fecha ON sys.feriados(fecha);

-- =============================================================================
-- 8. SEGURIDAD (schema seguridad)
--    Definida temprano porque created_by/updated_by referencian a usuarios.
-- =============================================================================

CREATE TABLE seguridad.roles (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    es_sistema  BOOLEAN NOT NULL DEFAULT FALSE,      -- no editable
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE seguridad.modulos (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    icono       TEXT,
    orden       SMALLINT NOT NULL DEFAULT 0,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Permisos: matriz rol × módulo (CRUD + exportar)
CREATE TABLE seguridad.rol_permisos (
    rol_id          SMALLINT NOT NULL REFERENCES seguridad.roles(id) ON DELETE CASCADE,
    modulo_id       SMALLINT NOT NULL REFERENCES seguridad.modulos(id) ON DELETE CASCADE,
    puede_ver       BOOLEAN NOT NULL DEFAULT FALSE,
    puede_crear     BOOLEAN NOT NULL DEFAULT FALSE,
    puede_editar    BOOLEAN NOT NULL DEFAULT FALSE,
    puede_eliminar  BOOLEAN NOT NULL DEFAULT FALSE,
    puede_exportar  BOOLEAN NOT NULL DEFAULT FALSE,
    puede_aprobar   BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (rol_id, modulo_id)
);

CREATE TABLE seguridad.usuarios (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT,                          -- FK añadida tras crear personal.funcionarios
    usuario         CITEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                   -- bcrypt/argon2
    nombre_completo TEXT NOT NULL,
    correo          CITEXT UNIQUE,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    bloqueado       BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_bloqueo  TEXT,
    intentos_fallidos SMALLINT NOT NULL DEFAULT 0,
    debe_cambiar_password BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_activo      BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret      TEXT,
    ultimo_acceso   TIMESTAMPTZ,
    ultimo_ip       INET,
    token_recuperacion TEXT,
    token_expira    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      BIGINT,
    updated_by      BIGINT
);
CREATE INDEX ix_usuarios_funcionario ON seguridad.usuarios(funcionario_id);

CREATE TABLE seguridad.usuario_roles (
    usuario_id      BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    rol_id          SMALLINT NOT NULL REFERENCES seguridad.roles(id),
    asignado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    asignado_por    BIGINT REFERENCES seguridad.usuarios(id),
    PRIMARY KEY (usuario_id, rol_id)
);

-- Permisos extra a nivel usuario (override del rol — granularidad fina opcional)
CREATE TABLE seguridad.usuario_permisos (
    usuario_id      BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    modulo_id       SMALLINT NOT NULL REFERENCES seguridad.modulos(id),
    puede_ver       BOOLEAN,
    puede_crear     BOOLEAN,
    puede_editar    BOOLEAN,
    puede_eliminar  BOOLEAN,
    puede_exportar  BOOLEAN,
    puede_aprobar   BOOLEAN,
    PRIMARY KEY (usuario_id, modulo_id)
);

-- Restricciones de scope (ej: usuario solo ve cierta zona / estación)
CREATE TABLE seguridad.usuario_scopes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id      BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    zona_id         SMALLINT REFERENCES org.zonas(id),
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    division_id     SMALLINT REFERENCES org.divisiones(id),
    area_id         SMALLINT REFERENCES org.areas(id),
    CHECK (
        zona_id IS NOT NULL OR estacion_id IS NOT NULL
        OR division_id IS NOT NULL OR area_id IS NOT NULL
    )
);

CREATE TABLE seguridad.sesiones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    ip              INET,
    user_agent      TEXT,
    creada_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_at       TIMESTAMPTZ NOT NULL,
    cerrada_at      TIMESTAMPTZ,
    motivo_cierre   TEXT
);
CREATE INDEX ix_sesiones_usuario ON seguridad.sesiones(usuario_id);
CREATE INDEX ix_sesiones_expira  ON seguridad.sesiones(expira_at);

-- FKs de auditoría en usuarios (auto-referenciales)
ALTER TABLE seguridad.usuarios
    ADD CONSTRAINT fk_usuarios_created_by FOREIGN KEY (created_by) REFERENCES seguridad.usuarios(id),
    ADD CONSTRAINT fk_usuarios_updated_by FOREIGN KEY (updated_by) REFERENCES seguridad.usuarios(id);

-- =============================================================================
-- FIN ARCHIVO 01
-- Continúa en 02_dominio.sql con personal, identidad, salud, ops, carrera,
-- equipo, beneficios, vivienda, egresos, documentos.
-- =============================================================================
