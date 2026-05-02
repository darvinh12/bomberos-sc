-- =============================================================================
-- CUERPO DE BOMBEROS DE CARACAS — Archivo 02/04: Dominio operativo
-- Personal core, identidad país, históricos, salud, operaciones, carrera,
-- equipo, beneficios, vivienda, egresos, postulación, documentos.
-- =============================================================================

-- =============================================================================
-- 9. PERSONAL CORE (schema personal)
-- =============================================================================

-- Tabla central. PK surrogate, identidad nacional como UNIQUE compuesto.
CREATE TABLE personal.funcionarios (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Identidad
    nacionalidad        CHAR(1) NOT NULL CHECK (nacionalidad IN ('V','E')),
    cedula              INT NOT NULL CHECK (cedula BETWEEN 1 AND 999999999),
    rif                 TEXT,
    apellidos           TEXT NOT NULL,
    nombres             TEXT NOT NULL,
    nombre_completo     TEXT GENERATED ALWAYS AS (apellidos || ', ' || nombres) STORED,
    fecha_nacimiento    DATE,
    sexo                core.sexo_t,
    estado_civil_id     SMALLINT REFERENCES core.estados_civiles(id),
    grupo_sanguineo_id  SMALLINT REFERENCES core.grupos_sanguineos(id),
    lugar_nacimiento    TEXT,
    pais_nacimiento     TEXT DEFAULT 'Venezuela',

    -- Empleo (snapshot del estado actual; el historial vive en tablas dedicadas)
    --   • fecha_primer_ingreso = primera vez que entró a la institución, INMUTABLE.
    --   • Los ciclos ingreso/egreso/reingreso se registran en personal.periodos_servicio.
    --   • numero_equipo se historiza en personal.historico_numeros_equipo.
    --   • condicion se historiza en personal.historico_condiciones.
    tipo_personal       core.tipo_personal NOT NULL DEFAULT 'BOMBERO',
    numero_empleado     TEXT UNIQUE,
    numero_equipo       TEXT,                            -- snapshot actual
    fecha_primer_ingreso DATE,                           -- inmutable: 1er ingreso histórico (LOTTT)
    promocion           TEXT,
    estatus             core.estatus_funcionario NOT NULL DEFAULT 'ACTIVO',
    condicion_id        SMALLINT REFERENCES core.condiciones(id),  -- snapshot actual
    jerarquia_id        SMALLINT REFERENCES core.jerarquias(id),
    cargo_id            SMALLINT REFERENCES core.cargos(id),

    -- Ubicación administrativa actual (snapshot; histórico en personal.historico_ubicaciones)
    zona_id             SMALLINT REFERENCES org.zonas(id),
    estacion_id         SMALLINT REFERENCES org.estaciones(id),
    area_id             SMALLINT REFERENCES org.areas(id),
    dependencia_id      SMALLINT REFERENCES org.dependencias(id),
    division_id         SMALLINT REFERENCES org.divisiones(id),
    seccion             CHAR(1),
    horario             TEXT,

    -- Contacto
    telefono_habitacion TEXT,
    telefono_movil      TEXT,
    telefono_otros      TEXT,
    correo              CITEXT UNIQUE,
    persona_contacto    TEXT,
    telefono_contacto   TEXT,
    parentesco_contacto TEXT,

    -- Educación / habilidades
    --   • Las licencias de conducir (con renovaciones) viven en personal.licencias_conducir.
    --   • Las cuentas bancarias viven en personal.cuentas_bancarias.
    nivel_educativo_id  SMALLINT REFERENCES core.niveles_educativos(id),
    profesion           TEXT,
    especialidad_id     SMALLINT REFERENCES core.especialidades(id),
    iutb                BOOLEAN NOT NULL DEFAULT FALSE,
    egresado_unes       BOOLEAN NOT NULL DEFAULT FALSE,

    -- Misceláneos
    foto_url            TEXT,
    huella_url          TEXT,
    firma_url           TEXT,
    merito              NUMERIC(5,2),
    pre_jubilado        BOOLEAN NOT NULL DEFAULT FALSE,
    es_voluntario       BOOLEAN NOT NULL DEFAULT FALSE,
    observaciones       TEXT,

    -- Auditoría
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          BIGINT REFERENCES seguridad.usuarios(id),
    updated_by          BIGINT REFERENCES seguridad.usuarios(id),

    CONSTRAINT funcionarios_cedula_uq UNIQUE (nacionalidad, cedula)
);

CREATE INDEX ix_funcionarios_apellidos    ON personal.funcionarios(apellidos);
CREATE INDEX ix_funcionarios_estatus      ON personal.funcionarios(estatus);
CREATE INDEX ix_funcionarios_zona         ON personal.funcionarios(zona_id);
CREATE INDEX ix_funcionarios_estacion     ON personal.funcionarios(estacion_id);
CREATE INDEX ix_funcionarios_jerarquia    ON personal.funcionarios(jerarquia_id);
CREATE INDEX ix_funcionarios_cargo        ON personal.funcionarios(cargo_id);
CREATE INDEX ix_funcionarios_nombre_trgm  ON personal.funcionarios USING gin (nombre_completo gin_trgm_ops);
CREATE INDEX ix_funcionarios_cedula       ON personal.funcionarios(cedula);

-- Cierre del ciclo de FK: usuarios → funcionarios
ALTER TABLE seguridad.usuarios
    ADD CONSTRAINT fk_usuarios_funcionario FOREIGN KEY (funcionario_id)
        REFERENCES personal.funcionarios(id) ON DELETE SET NULL;

ALTER TABLE org.jefes_area_zona
    ADD CONSTRAINT fk_jefes_funcionario FOREIGN KEY (funcionario_id)
        REFERENCES personal.funcionarios(id);

-- Direcciones de vivienda (un funcionario puede tener varias en su historia)
CREATE TABLE personal.direcciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    es_actual       BOOLEAN NOT NULL DEFAULT TRUE,
    estado_id       SMALLINT REFERENCES geo.estados(id),
    municipio_id    INT REFERENCES geo.municipios(id),
    parroquia_id    INT REFERENCES geo.parroquias(id),
    sector          TEXT,
    urbanizacion    TEXT,
    calle           TEXT,
    edificio_casa   TEXT,
    piso            TEXT,
    apartamento     TEXT,
    referencia      TEXT,
    direccion_completa TEXT,
    codigo_postal   TEXT,
    latitud         NUMERIC(10,7),
    longitud        NUMERIC(10,7),
    es_propia       BOOLEAN,
    es_alquilada    BOOLEAN,
    fecha_registro  DATE NOT NULL DEFAULT CURRENT_DATE,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_direcciones_funcionario ON personal.direcciones(funcionario_id);
CREATE UNIQUE INDEX ux_direcciones_actual ON personal.direcciones(funcionario_id) WHERE es_actual;

-- Carga familiar
CREATE TABLE personal.carga_familiar (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    parentesco          TEXT NOT NULL,                       -- HIJO, CONYUGE, PADRE, MADRE...
    nacionalidad        CHAR(1) CHECK (nacionalidad IN ('V','E')),
    cedula              INT,
    apellidos           TEXT NOT NULL,
    nombres             TEXT NOT NULL,
    fecha_nacimiento    DATE,
    sexo                core.sexo_t,
    estado_civil_id     SMALLINT REFERENCES core.estados_civiles(id),
    nivel_educativo_id  SMALLINT REFERENCES core.niveles_educativos(id),
    estudia             BOOLEAN NOT NULL DEFAULT FALSE,
    institucion_estudio TEXT,
    trabaja             BOOLEAN NOT NULL DEFAULT FALSE,
    lugar_trabajo       TEXT,
    discapacidad        BOOLEAN NOT NULL DEFAULT FALSE,
    detalle_discapacidad TEXT,
    es_beneficiario_hcm BOOLEAN NOT NULL DEFAULT FALSE,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_inclusion     DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_baja          DATE,
    motivo_baja         TEXT,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_carga_familiar_func ON personal.carga_familiar(funcionario_id);
CREATE INDEX ix_carga_familiar_cedula ON personal.carga_familiar(cedula) WHERE cedula IS NOT NULL;

-- Niveles educativos detallados (varios títulos)
CREATE TABLE personal.educacion (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    nivel_id            SMALLINT NOT NULL REFERENCES core.niveles_educativos(id),
    tipo_id             SMALLINT REFERENCES core.tipos_nivel_educativo(id),
    titulo              TEXT,
    institucion         TEXT,
    pais                TEXT DEFAULT 'Venezuela',
    fecha_inicio        DATE,
    fecha_fin           DATE,
    fecha_titulo        DATE,
    documento_url       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_educacion_funcionario ON personal.educacion(funcionario_id);

-- Habilidades (idiomas, software, otros)
CREATE TABLE personal.habilidades (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    grupo               TEXT NOT NULL,                       -- IDIOMA, INFORMATICA, OTRO
    nombre              TEXT NOT NULL,
    nivel               TEXT,                                 -- BASICO, INTERMEDIO, AVANZADO
    certificado         BOOLEAN NOT NULL DEFAULT FALSE,
    documento_url       TEXT
);
CREATE INDEX ix_habilidades_funcionario ON personal.habilidades(funcionario_id);

-- Actividades (culturales, deportivas, etc.)
CREATE TABLE personal.actividades (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo            core.tipo_actividad NOT NULL,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    institucion     TEXT,
    fecha_inicio    DATE,
    fecha_fin       DATE,
    nivel           TEXT,
    logros          TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_actividades_funcionario ON personal.actividades(funcionario_id);

-- Tiempo en otras administraciones públicas (TIEMPOADMPUBLICA legacy)
CREATE TABLE personal.tiempo_admpublica (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    institucion     TEXT NOT NULL,
    cargo           TEXT,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    documento_url   TEXT,
    observaciones   TEXT
);
CREATE INDEX ix_tiempo_admp_funcionario ON personal.tiempo_admpublica(funcionario_id);

-- -----------------------------------------------------------------------------
-- 9.1. PERÍODOS DE SERVICIO (ciclos de ingreso/egreso/reingreso)
--      Un funcionario puede ingresar, egresar y reingresar varias veces.
--      Cada período = un row. El último open (sin fecha_egreso) es el activo.
-- -----------------------------------------------------------------------------
CREATE TABLE personal.periodos_servicio (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    numero_periodo      SMALLINT NOT NULL,               -- 1, 2, 3... (orden de aparición)
    fecha_ingreso       DATE NOT NULL,
    fecha_egreso        DATE,                            -- NULL = período activo
    tipo_ingreso        TEXT,                            -- INGRESO, REINGRESO, REINCORPORACION
    tipo_egreso         TEXT,                            -- RENUNCIA, DESPIDO, JUBILACION, EXCEDENCIA, MILITAR, ABANDONO, FALLECIMIENTO, NO_RATIFICADO
    motivo              TEXT,
    base_legal          TEXT,                             -- artículo, ley, decreto
    numero_resolucion   TEXT,
    nro_memo            TEXT,
    fecha_notificacion  DATE,
    fecha_efectiva_nomina DATE,
    pagaron_prestaciones BOOLEAN,
    monto_prestaciones  NUMERIC(15,2),
    documento_url       TEXT,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          BIGINT REFERENCES seguridad.usuarios(id),
    updated_by          BIGINT REFERENCES seguridad.usuarios(id),
    UNIQUE (funcionario_id, numero_periodo),
    CHECK (fecha_egreso IS NULL OR fecha_egreso >= fecha_ingreso),
    EXCLUDE USING gist (
        funcionario_id WITH =,
        daterange(fecha_ingreso, COALESCE(fecha_egreso, 'infinity'::date), '[)') WITH &&
    )
);
CREATE INDEX ix_periodos_func ON personal.periodos_servicio(funcionario_id);
CREATE INDEX ix_periodos_activos ON personal.periodos_servicio(funcionario_id) WHERE fecha_egreso IS NULL;
CREATE INDEX ix_periodos_egreso ON personal.periodos_servicio(fecha_egreso) WHERE fecha_egreso IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 9.2. HISTÓRICO DE CONDICIONES (FUNCIONARIO ↔ CONTRATADO ↔ JUBILADO ↔ ...)
-- -----------------------------------------------------------------------------
CREATE TABLE personal.historico_condiciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    condicion_id    SMALLINT NOT NULL REFERENCES core.condiciones(id),
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    motivo          TEXT,
    resolucion      TEXT,
    documento_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    EXCLUDE USING gist (
        funcionario_id WITH =,
        daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[)') WITH &&
    )
);
CREATE INDEX ix_hist_cond_func ON personal.historico_condiciones(funcionario_id);

-- -----------------------------------------------------------------------------
-- 9.3. HISTÓRICO DE NÚMEROS DE EQUIPO (radios, vehículos asignados)
-- -----------------------------------------------------------------------------
CREATE TABLE personal.historico_numeros_equipo (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    numero_equipo   TEXT NOT NULL,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    motivo          TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    EXCLUDE USING gist (
        funcionario_id WITH =,
        daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[)') WITH &&
    )
);
CREATE INDEX ix_hist_nequipo_func ON personal.historico_numeros_equipo(funcionario_id);

-- -----------------------------------------------------------------------------
-- 9.4. CUENTAS BANCARIAS (varias en el tiempo; sólo una "actual")
-- -----------------------------------------------------------------------------
CREATE TABLE personal.cuentas_bancarias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    banco_id        SMALLINT NOT NULL REFERENCES core.bancos(id),
    numero_cuenta   TEXT NOT NULL,
    tipo_cuenta     CHAR(1) CHECK (tipo_cuenta IN ('A','C')),  -- A=ahorros, C=corriente
    titular         TEXT,                                  -- por defecto el funcionario
    es_actual       BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_alta      DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_baja      DATE,
    motivo_baja     TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_baja IS NULL OR fecha_baja >= fecha_alta)
);
CREATE INDEX ix_cuentas_func ON personal.cuentas_bancarias(funcionario_id);
CREATE UNIQUE INDEX ux_cuentas_actual ON personal.cuentas_bancarias(funcionario_id) WHERE es_actual;

-- -----------------------------------------------------------------------------
-- 9.5. LICENCIAS DE CONDUCIR (renovaciones múltiples)
-- -----------------------------------------------------------------------------
CREATE TABLE personal.licencias_conducir (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_licencia_id SMALLINT NOT NULL REFERENCES core.tipos_licencia(id),
    numero          TEXT,
    fecha_emision   DATE NOT NULL,
    fecha_vence     DATE,
    organismo       TEXT DEFAULT 'INTT',
    es_actual       BOOLEAN NOT NULL DEFAULT TRUE,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_licencias_func ON personal.licencias_conducir(funcionario_id);
CREATE INDEX ix_licencias_vence ON personal.licencias_conducir(fecha_vence) WHERE es_actual;

-- =============================================================================
-- 10. IDENTIDAD PAÍS (carnets, programas sociales gubernamentales)
--     Conserva trazabilidad de carnet de la patria, GDC, hogares de la patria,
--     registro de votación, etc. — requeridos por reportes gubernamentales.
-- =============================================================================

-- Carnets en general (cívico, militar, votación, patria, arma, vehículo)
CREATE TABLE personal.carnets (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_carnet_id      SMALLINT NOT NULL REFERENCES core.tipos_carnet(id),
    numero              TEXT,
    serial              TEXT,
    codigo_qr           TEXT,
    fecha_emision       DATE,
    fecha_vence         DATE,
    organismo_emisor    TEXT,
    documento_url       TEXT,
    observaciones       TEXT,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (funcionario_id, tipo_carnet_id, numero)
);
CREATE INDEX ix_carnets_funcionario ON personal.carnets(funcionario_id);
CREATE INDEX ix_carnets_tipo ON personal.carnets(tipo_carnet_id);

-- Histórico de carnets (cambios de número/serial)
CREATE TABLE personal.historico_carnets (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carnet_id       BIGINT NOT NULL REFERENCES personal.carnets(id) ON DELETE CASCADE,
    numero_anterior TEXT,
    numero_nuevo    TEXT,
    motivo          TEXT,
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    usuario_id      BIGINT REFERENCES seguridad.usuarios(id)
);
CREATE INDEX ix_hist_carnets_carnet ON personal.historico_carnets(carnet_id);

-- Carnets vehículo (tabla específica con detalles del vehículo)
CREATE TABLE personal.carnets_vehiculo (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    placa           TEXT NOT NULL,
    marca           TEXT,
    modelo          TEXT,
    anio            SMALLINT,
    color           TEXT,
    serial_carroceria TEXT,
    serial_motor    TEXT,
    tipo_vehiculo   TEXT,
    fecha_emision   DATE,
    fecha_vence     DATE,
    documento_url   TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_carnets_veh_func ON personal.carnets_vehiculo(funcionario_id);
CREATE INDEX ix_carnets_veh_placa ON personal.carnets_vehiculo(placa);

-- Registro de carnet de votación (mesa, centro electoral)
CREATE TABLE personal.registro_votacion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL UNIQUE REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    centro_electoral TEXT,
    parroquia_id    INT REFERENCES geo.parroquias(id),
    municipio_id    INT REFERENCES geo.municipios(id),
    estado_id       SMALLINT REFERENCES geo.estados(id),
    mesa            TEXT,
    direccion_centro TEXT,
    fecha_registro  DATE,
    actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hogares de la Patria / GDC (gran misión vivienda Venezuela)
CREATE TABLE personal.hogares_patria (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    serial_carnet_patria TEXT,
    codigo_hogar    TEXT,
    cantidad_personas SMALLINT,
    cantidad_menores  SMALLINT,
    cantidad_adultos_mayores SMALLINT,
    es_jefe_hogar   BOOLEAN NOT NULL DEFAULT FALSE,
    recibe_clap     BOOLEAN,
    recibe_bono     BOOLEAN,
    direccion       TEXT,
    parroquia_id    INT REFERENCES geo.parroquias(id),
    fecha_registro  DATE,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_hogares_func ON personal.hogares_patria(funcionario_id);

-- GDC habitacional (asignaciones / postulaciones a vivienda gubernamental)
CREATE TABLE personal.gdc_habitacional (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    codigo_postulacion TEXT,
    programa        TEXT,                                -- GMVV, FONDUR, etc.
    estado          TEXT,                                 -- POSTULADO, EVALUADO, ADJUDICADO, ENTREGADO
    proyecto        TEXT,
    direccion_proyecto TEXT,
    parroquia_id    INT REFERENCES geo.parroquias(id),
    fecha_postulacion DATE,
    fecha_adjudicacion DATE,
    fecha_entrega   DATE,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_gdc_func ON personal.gdc_habitacional(funcionario_id);

-- =============================================================================
-- 11. HISTÓRICOS DE PERSONAL (jerarquía, ubicación administrativa)
-- =============================================================================

CREATE TABLE personal.historico_jerarquias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    jerarquia_id    SMALLINT NOT NULL REFERENCES core.jerarquias(id),
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    motivo          TEXT,                                 -- ASCENSO, DEGRADACION, REINSCRIPCION
    resolucion      TEXT,
    documento_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    EXCLUDE USING gist (
        funcionario_id WITH =,
        daterange(fecha_inicio, COALESCE(fecha_fin,'infinity'::date), '[)') WITH &&
    )
);
CREATE INDEX ix_hist_jer_func ON personal.historico_jerarquias(funcionario_id);

CREATE TABLE personal.historico_ubicaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    zona_id         SMALLINT REFERENCES org.zonas(id),
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    area_id         SMALLINT REFERENCES org.areas(id),
    dependencia_id  SMALLINT REFERENCES org.dependencias(id),
    division_id     SMALLINT REFERENCES org.divisiones(id),
    cargo_id        SMALLINT REFERENCES core.cargos(id),
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    motivo          TEXT,
    resolucion      TEXT,
    documento_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
CREATE INDEX ix_hist_ubi_func ON personal.historico_ubicaciones(funcionario_id);

-- =============================================================================
-- 12. POSTULACIÓN / INGRESO (postulados, voluntarios, agentes en formación)
-- =============================================================================

CREATE TABLE personal.postulados (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nacionalidad        CHAR(1) NOT NULL CHECK (nacionalidad IN ('V','E')),
    cedula              INT NOT NULL,
    apellidos           TEXT NOT NULL,
    nombres             TEXT NOT NULL,
    fecha_nacimiento    DATE,
    sexo                core.sexo_t,
    telefono            TEXT,
    correo              CITEXT,
    direccion           TEXT,
    nivel_educativo_id  SMALLINT REFERENCES core.niveles_educativos(id),
    fecha_postulacion   DATE NOT NULL DEFAULT CURRENT_DATE,
    estatus             core.estatus_solicitud NOT NULL DEFAULT 'PENDIENTE',
    promocion_destino   TEXT,
    nota_examen_fisico  NUMERIC(5,2),
    nota_examen_medico  NUMERIC(5,2),
    nota_examen_psico   NUMERIC(5,2),
    nota_examen_acad    NUMERIC(5,2),
    aprobado            BOOLEAN,
    funcionario_id      BIGINT REFERENCES personal.funcionarios(id),  -- al ingresar
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nacionalidad, cedula)
);
CREATE INDEX ix_postulados_estatus ON personal.postulados(estatus);

-- =============================================================================
-- 13. SALUD (schema salud)
-- =============================================================================

-- Diagnósticos (CIE-10 + grupos)
CREATE TABLE salud.grupos_diagnosticos (
    id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL
);

CREATE TABLE salud.diagnosticos (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_cie  TEXT UNIQUE,
    grupo_id    SMALLINT REFERENCES salud.grupos_diagnosticos(id),
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_diagnosticos_nombre_trgm ON salud.diagnosticos USING gin (nombre gin_trgm_ops);

-- Médicos tratantes
CREATE TABLE salud.medicos (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nacionalidad CHAR(1) CHECK (nacionalidad IN ('V','E')),
    cedula      INT,
    apellidos   TEXT NOT NULL,
    nombres     TEXT NOT NULL,
    nombre_completo TEXT GENERATED ALWAYS AS (apellidos || ', ' || nombres) STORED,
    mpps        TEXT UNIQUE,                          -- nº matrícula MPPS
    cm          TEXT,                                 -- nº colegio médico
    especialidad TEXT,
    telefono    TEXT,
    correo      CITEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (nacionalidad, cedula)
);

-- Centros médicos / clínicas
CREATE TABLE salud.centros_medicos (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rif         TEXT UNIQUE,
    nombre      TEXT NOT NULL,
    tipo        TEXT,                                 -- HOSPITAL, CLINICA, AMBULATORIO, IVSS, IPSFA
    direccion   TEXT,
    telefono    TEXT,
    parroquia_id INT REFERENCES geo.parroquias(id),
    es_publico  BOOLEAN NOT NULL DEFAULT TRUE,
    convenio_hcm BOOLEAN NOT NULL DEFAULT FALSE,
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Reposos médicos (un funcionario puede tener varios; sin solapamiento)
CREATE TABLE salud.reposos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_reposo_id  SMALLINT NOT NULL REFERENCES core.tipos_reposo(id),
    diagnostico_id  INT REFERENCES salud.diagnosticos(id),
    diagnostico_libre TEXT,
    medico_id       BIGINT REFERENCES salud.medicos(id),
    centro_medico_id BIGINT REFERENCES salud.centros_medicos(id),
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    dias            SMALLINT GENERATED ALWAYS AS (fecha_fin - fecha_inicio + 1) STORED,
    folio           TEXT,                              -- folio del IVSS
    documento_url   TEXT,
    es_continuacion BOOLEAN NOT NULL DEFAULT FALSE,
    reposo_padre_id BIGINT REFERENCES salud.reposos(id),
    anulado         BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_anulacion TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      BIGINT REFERENCES seguridad.usuarios(id),
    CHECK (fecha_fin >= fecha_inicio),
    EXCLUDE USING gist (
        funcionario_id WITH =,
        daterange(fecha_inicio, fecha_fin, '[]') WITH &&
    ) WHERE (NOT anulado)
);
CREATE INDEX ix_reposos_funcionario ON salud.reposos(funcionario_id);
CREATE INDEX ix_reposos_fechas ON salud.reposos(fecha_inicio, fecha_fin);
CREATE INDEX ix_reposos_diag ON salud.reposos(diagnostico_id);

-- Recurrencia (análisis de reposos repetitivos)
CREATE TABLE salud.recurrencias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    diagnostico_id  INT REFERENCES salud.diagnosticos(id),
    cantidad_episodios SMALLINT NOT NULL,
    total_dias      INT NOT NULL,
    primer_episodio DATE,
    ultimo_episodio DATE,
    observaciones   TEXT,
    actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_recurrencias_func ON salud.recurrencias(funcionario_id);

-- Lesiones (en servicio o no)
CREATE TABLE salud.lesiones (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_accidente_id   SMALLINT REFERENCES core.tipos_accidente(id),
    fecha_evento        DATE NOT NULL,
    lugar_evento        TEXT,
    descripcion         TEXT NOT NULL,
    en_servicio         BOOLEAN NOT NULL DEFAULT TRUE,
    parte_afectada      TEXT,
    centro_medico_id    BIGINT REFERENCES salud.centros_medicos(id),
    medico_id           BIGINT REFERENCES salud.medicos(id),
    diagnostico_id      INT REFERENCES salud.diagnosticos(id),
    dias_incapacidad    SMALLINT,
    secuelas            TEXT,
    documento_url       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_lesiones_funcionario ON salud.lesiones(funcionario_id);

-- Hospitalizaciones (funcionario y su carga familiar)
CREATE TABLE salud.hospitalizaciones (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    es_funcionario      BOOLEAN NOT NULL DEFAULT TRUE,        -- false = familiar
    carga_familiar_id   BIGINT REFERENCES personal.carga_familiar(id),
    centro_medico_id    BIGINT REFERENCES salud.centros_medicos(id),
    medico_id           BIGINT REFERENCES salud.medicos(id),
    diagnostico_id      INT REFERENCES salud.diagnosticos(id),
    fecha_ingreso       DATE NOT NULL,
    fecha_egreso        DATE,
    motivo              TEXT,
    procedimiento       TEXT,
    monto_estimado      NUMERIC(15,2),
    cubierto_hcm        BOOLEAN,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_egreso IS NULL OR fecha_egreso >= fecha_ingreso),
    CHECK (
        (es_funcionario = TRUE AND carga_familiar_id IS NULL) OR
        (es_funcionario = FALSE AND carga_familiar_id IS NOT NULL)
    )
);
CREATE INDEX ix_hosp_funcionario ON salud.hospitalizaciones(funcionario_id);

-- Consultas (registro de atenciones médicas en sede)
CREATE TABLE salud.consultas (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    medico_id       BIGINT REFERENCES salud.medicos(id),
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
    motivo          TEXT,
    sintomas        TEXT,
    diagnostico_id  INT REFERENCES salud.diagnosticos(id),
    tratamiento     TEXT,
    observaciones   TEXT,
    documento_url   TEXT
);
CREATE INDEX ix_consultas_funcionario ON salud.consultas(funcionario_id);

-- HCM (servicio de seguro)
CREATE TABLE salud.hcm (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    poliza              TEXT,
    aseguradora         TEXT,
    fecha_inicio        DATE,
    fecha_fin           DATE,
    monto_cobertura     NUMERIC(15,2),
    incluye_familiares  BOOLEAN NOT NULL DEFAULT TRUE,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones       TEXT
);
CREATE INDEX ix_hcm_funcionario ON salud.hcm(funcionario_id);

-- Evaluación física (anual / pre-ascenso)
CREATE TABLE salud.evaluacion_fisica (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    peso_kg         NUMERIC(5,2),
    estatura_cm     NUMERIC(5,2),
    imc             NUMERIC(5,2) GENERATED ALWAYS AS
                        (CASE WHEN estatura_cm > 0
                              THEN peso_kg / ((estatura_cm/100.0) * (estatura_cm/100.0))
                              ELSE NULL END) STORED,
    presion_sistolica  SMALLINT,
    presion_diastolica SMALLINT,
    pulso              SMALLINT,
    flexiones          SMALLINT,
    abdominales        SMALLINT,
    tiempo_carrera_seg INT,
    apto               BOOLEAN,
    observaciones      TEXT,
    medico_id          BIGINT REFERENCES salud.medicos(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_eval_fisica_func ON salud.evaluacion_fisica(funcionario_id);

-- =============================================================================
-- 14. OPERACIONES (schema ops)
-- =============================================================================

-- Encabezado de guardias (planificación)
CREATE TABLE ops.guardias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha           DATE NOT NULL,
    estacion_id     SMALLINT NOT NULL REFERENCES org.estaciones(id),
    seccion         CHAR(1),
    turno           TEXT NOT NULL CHECK (turno IN ('DIURNO','NOCTURNO','24H')),
    hora_inicio     TIME NOT NULL,
    hora_fin        TIME NOT NULL,
    jefe_guardia_id BIGINT REFERENCES personal.funcionarios(id),
    observaciones   TEXT,
    cerrada         BOOLEAN NOT NULL DEFAULT FALSE,
    cerrada_at      TIMESTAMPTZ,
    cerrada_por     BIGINT REFERENCES seguridad.usuarios(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fecha, estacion_id, seccion, turno)
);
CREATE INDEX ix_guardias_fecha ON ops.guardias(fecha);
CREATE INDEX ix_guardias_estacion ON ops.guardias(estacion_id);

-- Detalle de guardias (funcionarios asignados)
CREATE TABLE ops.guardia_funcionarios (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    guardia_id      BIGINT NOT NULL REFERENCES ops.guardias(id) ON DELETE CASCADE,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id),
    rol_guardia     TEXT,                                 -- CONDUCTOR, JEFE_UNIDAD, RASO
    asistio         BOOLEAN,
    motivo_inasistencia TEXT,
    hora_llegada    TIME,
    hora_salida     TIME,
    observaciones   TEXT,
    UNIQUE (guardia_id, funcionario_id)
);
CREATE INDEX ix_g_func_guardia ON ops.guardia_funcionarios(guardia_id);
CREATE INDEX ix_g_func_funcionario ON ops.guardia_funcionarios(funcionario_id);

-- Apertura/cierre diario por estación
CREATE TABLE ops.apertura_cierre_diaria (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha           DATE NOT NULL,
    estacion_id     SMALLINT NOT NULL REFERENCES org.estaciones(id),
    abierta_at      TIMESTAMPTZ,
    cerrada_at      TIMESTAMPTZ,
    abierta_por     BIGINT REFERENCES personal.funcionarios(id),
    cerrada_por     BIGINT REFERENCES personal.funcionarios(id),
    novedades       TEXT,
    UNIQUE (fecha, estacion_id)
);

-- Permisos (ausencias autorizadas no-vacaciones, no-reposo)
CREATE TABLE ops.permisos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo            TEXT NOT NULL,                       -- DIA_LIBRE, MEDIO_DIA, MATRIMONIO, DUELO, ESTUDIO
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    horas           NUMERIC(5,2),
    motivo          TEXT NOT NULL,
    autorizado      BOOLEAN NOT NULL DEFAULT FALSE,
    autorizado_por  BIGINT REFERENCES personal.funcionarios(id),
    autorizado_at   TIMESTAMPTZ,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin >= fecha_inicio)
);
CREATE INDEX ix_permisos_funcionario ON ops.permisos(funcionario_id);
CREATE INDEX ix_permisos_fecha ON ops.permisos(fecha_inicio, fecha_fin);

-- Solicitudes de permiso (flujo previo a aprobación)
CREATE TABLE ops.solicitudes_permiso (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    motivo          TEXT NOT NULL,
    estatus         core.estatus_solicitud NOT NULL DEFAULT 'PENDIENTE',
    permiso_id      BIGINT REFERENCES ops.permisos(id),
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sol_perm_func ON ops.solicitudes_permiso(funcionario_id);

-- Vacaciones (períodos de disfrute)
CREATE TABLE ops.vacaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    periodo_anio    SMALLINT NOT NULL,                   -- año al que corresponde
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    dias_habiles    SMALLINT,
    dias_calendario SMALLINT GENERATED ALWAYS AS (fecha_fin - fecha_inicio + 1) STORED,
    bono_pagado     BOOLEAN NOT NULL DEFAULT FALSE,
    monto_bono      NUMERIC(15,2),
    fecha_pago_bono DATE,
    fraccionada     BOOLEAN NOT NULL DEFAULT FALSE,
    autorizado      BOOLEAN NOT NULL DEFAULT FALSE,
    autorizado_por  BIGINT REFERENCES personal.funcionarios(id),
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin >= fecha_inicio),
    EXCLUDE USING gist (
        funcionario_id WITH =,
        daterange(fecha_inicio, fecha_fin, '[]') WITH &&
    )
);
CREATE INDEX ix_vacaciones_func ON ops.vacaciones(funcionario_id);
CREATE INDEX ix_vacaciones_periodo ON ops.vacaciones(periodo_anio);

-- Bonos vacacionales / firmantes
CREATE TABLE ops.firmantes_vacaciones (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id),
    cargo_firma     TEXT NOT NULL,
    orden           SMALLINT NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Comisiones de servicio (préstamo a otra institución)
CREATE TABLE ops.comisiones_servicio (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    institucion_id      BIGINT REFERENCES core.instituciones(id),
    institucion_libre   TEXT,
    cargo_comision      TEXT,
    fecha_inicio        DATE NOT NULL,
    fecha_fin           DATE,
    resolucion          TEXT,
    documento_url       TEXT,
    observaciones       TEXT,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
CREATE INDEX ix_com_serv_func ON ops.comisiones_servicio(funcionario_id);

-- Faltas administrativas
CREATE TABLE ops.faltas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_falta          TEXT NOT NULL,                   -- LEVE, MEDIA, GRAVE
    fecha               DATE NOT NULL,
    descripcion         TEXT NOT NULL,
    sancion             TEXT,
    dias_suspension     SMALLINT,
    fecha_inicio_susp   DATE,
    fecha_fin_susp      DATE,
    resolucion          TEXT,
    documento_url       TEXT,
    apelada             BOOLEAN NOT NULL DEFAULT FALSE,
    resultado_apelacion TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_faltas_funcionario ON ops.faltas(funcionario_id);

-- Procesos administrativos (expedientes disciplinarios)
CREATE TABLE ops.procesos_administrativos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    expediente      TEXT NOT NULL UNIQUE,
    fecha_apertura  DATE NOT NULL,
    fecha_cierre    DATE,
    motivo          TEXT NOT NULL,
    resultado       TEXT,
    estatus         TEXT NOT NULL DEFAULT 'ABIERTO',
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_procesos_func ON ops.procesos_administrativos(funcionario_id);

-- Órdenes generales (boletín / órdenes diarias)
CREATE TABLE ops.ordenes_generales (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero          TEXT NOT NULL,
    fecha           DATE NOT NULL,
    asunto          TEXT NOT NULL,
    cuerpo          TEXT,
    firmada_por_id  BIGINT REFERENCES personal.funcionarios(id),
    es_voluntarios  BOOLEAN NOT NULL DEFAULT FALSE,
    documento_url   TEXT,
    publicada       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (numero, fecha)
);

-- Actividades operativas registradas (eventos atendidos por estación)
CREATE TABLE ops.actividades_operativas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estacion_id         SMALLINT REFERENCES org.estaciones(id),
    fecha               TIMESTAMPTZ NOT NULL,
    fecha_fin           TIMESTAMPTZ,
    tipo                TEXT NOT NULL,                   -- INCENDIO, RESCATE, EMERG_MED, etc.
    direccion           TEXT,
    parroquia_id        INT REFERENCES geo.parroquias(id),
    descripcion         TEXT,
    danos_personales    TEXT,
    danos_materiales    TEXT,
    funcionarios_count  SMALLINT,
    unidades_count      SMALLINT,
    documento_url       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_act_op_fecha ON ops.actividades_operativas(fecha);
CREATE INDEX ix_act_op_estacion ON ops.actividades_operativas(estacion_id);

-- =============================================================================
-- 15. CARRERA (schema carrera)
-- =============================================================================

-- Catálogo de cursos
CREATE TABLE carrera.cursos (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    horas           SMALLINT,
    institucion     TEXT,
    es_ascenso      BOOLEAN NOT NULL DEFAULT FALSE,      -- requerido para ascender
    nivel_jerarquia_destino_id SMALLINT REFERENCES core.jerarquias(id),
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Cursos realizados por funcionario
CREATE TABLE carrera.cursos_realizados (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    curso_id        SMALLINT REFERENCES carrera.cursos(id),
    nombre_libre    TEXT,                                 -- si curso no está en catálogo
    institucion     TEXT,
    fecha_inicio    DATE,
    fecha_fin       DATE,
    horas           SMALLINT,
    nota            NUMERIC(5,2),
    aprobado        BOOLEAN,
    certificado_url TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_cursos_real_func ON carrera.cursos_realizados(funcionario_id);

-- Períodos de evaluación (anual, semestral, etc.)
CREATE TABLE carrera.periodos_evaluacion (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Categorías y factores de evaluación
CREATE TABLE carrera.categorias_evaluar (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    peso            NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    orden           SMALLINT NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE carrera.factores_porcentajes (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    categoria_id    SMALLINT NOT NULL REFERENCES carrera.categorias_evaluar(id),
    codigo          TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    porcentaje      NUMERIC(5,2) NOT NULL,
    UNIQUE (categoria_id, codigo)
);

-- Evaluación de desempeño
CREATE TABLE carrera.evaluaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    periodo_id      SMALLINT NOT NULL REFERENCES carrera.periodos_evaluacion(id),
    tipo            TEXT NOT NULL,                       -- DESEMPEÑO, FISICA, INTEGRAL, ESTADO_MAYOR
    evaluador_id    BIGINT REFERENCES personal.funcionarios(id),
    nota_total      NUMERIC(5,2),
    estatus         TEXT NOT NULL DEFAULT 'BORRADOR',    -- BORRADOR, ENVIADA, APROBADA
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (funcionario_id, periodo_id, tipo)
);
CREATE INDEX ix_eval_funcionario ON carrera.evaluaciones(funcionario_id);

-- Detalle por categoría/factor
CREATE TABLE carrera.evaluaciones_detalle (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    evaluacion_id   BIGINT NOT NULL REFERENCES carrera.evaluaciones(id) ON DELETE CASCADE,
    categoria_id    SMALLINT REFERENCES carrera.categorias_evaluar(id),
    factor_id       SMALLINT REFERENCES carrera.factores_porcentajes(id),
    puntaje         NUMERIC(5,2),
    observacion     TEXT
);
CREATE INDEX ix_eval_det_eval ON carrera.evaluaciones_detalle(evaluacion_id);

-- Procesos de ascenso (campañas)
CREATE TABLE carrera.procesos_ascenso (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          TEXT NOT NULL,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,
    jerarquia_origen_id SMALLINT REFERENCES core.jerarquias(id),
    jerarquia_destino_id SMALLINT REFERENCES core.jerarquias(id),
    estatus         TEXT NOT NULL DEFAULT 'ABIERTO',
    resolucion      TEXT,
    observaciones   TEXT
);

-- Ascensos individuales
CREATE TABLE carrera.ascensos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    proceso_id      BIGINT REFERENCES carrera.procesos_ascenso(id),
    jerarquia_anterior_id SMALLINT REFERENCES core.jerarquias(id),
    jerarquia_nueva_id    SMALLINT NOT NULL REFERENCES core.jerarquias(id),
    fecha_efectiva  DATE NOT NULL,
    resolucion      TEXT,
    documento_url   TEXT,
    nota_evaluacion NUMERIC(5,2),
    posicion_lista  INT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ascensos_func ON carrera.ascensos(funcionario_id);

-- Catálogo de condecoraciones / reconocimientos
CREATE TABLE carrera.condecoraciones (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    nivel           TEXT,                                 -- 1ra, 2da, 3ra clase
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Reconocimientos otorgados
CREATE TABLE carrera.reconocimientos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    condecoracion_id SMALLINT REFERENCES carrera.condecoraciones(id),
    institucion_id  BIGINT REFERENCES core.instituciones(id),
    nombre_libre    TEXT,
    fecha_otorgamiento DATE NOT NULL,
    motivo          TEXT,
    resolucion      TEXT,
    documento_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_reco_funcionario ON carrera.reconocimientos(funcionario_id);

-- Cálculo de mérito (puntaje acumulado para ascensos)
CREATE TABLE carrera.meritos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    periodo_id      SMALLINT REFERENCES carrera.periodos_evaluacion(id),
    puntaje_evaluacion NUMERIC(7,2),
    puntaje_cursos     NUMERIC(7,2),
    puntaje_actividades NUMERIC(7,2),
    puntaje_condecoraciones NUMERIC(7,2),
    puntaje_faltas      NUMERIC(7,2),       -- penaliza
    puntaje_total       NUMERIC(7,2),
    posicion            INT,
    fecha_calculo       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (funcionario_id, periodo_id)
);
CREATE INDEX ix_meritos_func ON carrera.meritos(funcionario_id);

-- =============================================================================
-- 16. EQUIPAMIENTO (schema equipo)
-- =============================================================================

-- Catálogo de tipos de equipo de protección
CREATE TABLE equipo.tipos_proteccion (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    requiere_talla  BOOLEAN NOT NULL DEFAULT TRUE,
    grupo_talla     TEXT,                                 -- ROPA, CALZADO, CASCO
    vida_util_meses SMALLINT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Inventario de equipos de protección
CREATE TABLE equipo.proteccion_inventario (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_id         SMALLINT NOT NULL REFERENCES equipo.tipos_proteccion(id),
    proveedor_id    BIGINT REFERENCES core.proveedores(id),
    talla_id        SMALLINT REFERENCES core.tallas(id),
    marca           TEXT,
    modelo          TEXT,
    color           TEXT,
    numero_serie    TEXT UNIQUE,
    lote            TEXT,
    fecha_adquisicion DATE,
    fecha_vence     DATE,
    costo           NUMERIC(15,2),
    estatus         TEXT NOT NULL DEFAULT 'DISPONIBLE',   -- DISPONIBLE, ASIGNADO, BAJA, REPARACION
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_prot_inv_tipo ON equipo.proteccion_inventario(tipo_id);
CREATE INDEX ix_prot_inv_estatus ON equipo.proteccion_inventario(estatus);

-- Asignaciones de equipo de protección a funcionarios
CREATE TABLE equipo.proteccion_asignaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inventario_id   BIGINT NOT NULL REFERENCES equipo.proteccion_inventario(id),
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha_entrega   DATE NOT NULL,
    fecha_devolucion DATE,
    estado_entrega  TEXT,                                 -- NUEVO, USADO
    estado_devolucion TEXT,
    devuelto        BOOLEAN NOT NULL DEFAULT FALSE,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    EXCLUDE USING gist (
        inventario_id WITH =,
        daterange(fecha_entrega, COALESCE(fecha_devolucion,'infinity'::date), '[)') WITH &&
    )
);
CREATE INDEX ix_prot_asig_func ON equipo.proteccion_asignaciones(funcionario_id);

-- Despachos de equipos (movimientos masivos)
CREATE TABLE equipo.proteccion_despachos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero          TEXT NOT NULL UNIQUE,
    fecha           DATE NOT NULL,
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    tipo_movimiento core.tipo_movimiento_inventario NOT NULL,
    motivo          TEXT,
    documento_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      BIGINT REFERENCES seguridad.usuarios(id)
);

CREATE TABLE equipo.proteccion_despacho_detalle (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    despacho_id     BIGINT NOT NULL REFERENCES equipo.proteccion_despachos(id) ON DELETE CASCADE,
    inventario_id   BIGINT REFERENCES equipo.proteccion_inventario(id),
    tipo_id         SMALLINT REFERENCES equipo.tipos_proteccion(id),
    talla_id        SMALLINT REFERENCES core.tallas(id),
    cantidad        INT NOT NULL DEFAULT 1,
    funcionario_id  BIGINT REFERENCES personal.funcionarios(id),
    observaciones   TEXT
);
CREATE INDEX ix_prot_desp_det_desp ON equipo.proteccion_despacho_detalle(despacho_id);

-- Uniformes (estructura paralela a protección)
CREATE TABLE equipo.tipos_uniforme (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    grupo_talla     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE equipo.uniformes_inventario (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_id         SMALLINT NOT NULL REFERENCES equipo.tipos_uniforme(id),
    proveedor_id    BIGINT REFERENCES core.proveedores(id),
    talla_id        SMALLINT REFERENCES core.tallas(id),
    color           TEXT,
    cantidad_disponible INT NOT NULL DEFAULT 0,
    cantidad_total  INT NOT NULL DEFAULT 0,
    fecha_adquisicion DATE,
    costo_unitario  NUMERIC(15,2),
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tipo_id, talla_id, color, estacion_id)
);

CREATE TABLE equipo.uniformes_asignaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_id         SMALLINT NOT NULL REFERENCES equipo.tipos_uniforme(id),
    talla_id        SMALLINT REFERENCES core.tallas(id),
    cantidad        INT NOT NULL DEFAULT 1,
    fecha_entrega   DATE NOT NULL,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_unif_asig_func ON equipo.uniformes_asignaciones(funcionario_id);

CREATE TABLE equipo.uniformes_despachos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero          TEXT NOT NULL UNIQUE,
    fecha           DATE NOT NULL,
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    tipo_movimiento core.tipo_movimiento_inventario NOT NULL,
    motivo          TEXT,
    documento_url   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE equipo.uniformes_despacho_detalle (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    despacho_id     BIGINT NOT NULL REFERENCES equipo.uniformes_despachos(id) ON DELETE CASCADE,
    tipo_id         SMALLINT REFERENCES equipo.tipos_uniforme(id),
    talla_id        SMALLINT REFERENCES core.tallas(id),
    cantidad        INT NOT NULL DEFAULT 1,
    funcionario_id  BIGINT REFERENCES personal.funcionarios(id),
    observaciones   TEXT
);

-- Radios (comunicaciones)
CREATE TABLE equipo.radio_marcas (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL
);

CREATE TABLE equipo.radio_modelos (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marca_id        SMALLINT NOT NULL REFERENCES equipo.radio_marcas(id),
    codigo          TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    UNIQUE (marca_id, codigo)
);

CREATE TABLE equipo.radios (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    modelo_id       SMALLINT NOT NULL REFERENCES equipo.radio_modelos(id),
    serial          TEXT NOT NULL UNIQUE,
    placa_inv       TEXT,
    frecuencia      TEXT,
    canal           TEXT,
    fecha_adquisicion DATE,
    costo           NUMERIC(15,2),
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    estatus         TEXT NOT NULL DEFAULT 'DISPONIBLE',
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_radios_estatus ON equipo.radios(estatus);

CREATE TABLE equipo.radio_asignaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    radio_id        BIGINT NOT NULL REFERENCES equipo.radios(id),
    funcionario_id  BIGINT REFERENCES personal.funcionarios(id),
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    fecha_asignacion DATE NOT NULL,
    fecha_devolucion DATE,
    documento_url   TEXT,
    observaciones   TEXT,
    EXCLUDE USING gist (
        radio_id WITH =,
        daterange(fecha_asignacion, COALESCE(fecha_devolucion,'infinity'::date), '[)') WITH &&
    ),
    CHECK (funcionario_id IS NOT NULL OR estacion_id IS NOT NULL)
);
CREATE INDEX ix_radio_asig_func ON equipo.radio_asignaciones(funcionario_id);

-- Mantenimiento de radios (taller)
CREATE TABLE equipo.radio_mantenimientos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    radio_id        BIGINT NOT NULL REFERENCES equipo.radios(id),
    fecha_ingreso   DATE NOT NULL,
    fecha_salida    DATE,
    motivo          TEXT,
    diagnostico     TEXT,
    repuestos       TEXT,
    costo           NUMERIC(15,2),
    tecnico         TEXT,
    estatus         TEXT NOT NULL DEFAULT 'EN_TALLER',
    observaciones   TEXT
);
CREATE INDEX ix_radio_mant_radio ON equipo.radio_mantenimientos(radio_id);

-- Higiene y seguridad (incidentes / inspecciones)
CREATE TABLE equipo.higiene_seguridad (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    fecha           DATE NOT NULL,
    tipo            TEXT NOT NULL,                       -- INSPECCION, INCIDENTE, ACCION_CORRECTIVA
    descripcion     TEXT NOT NULL,
    responsable_id  BIGINT REFERENCES personal.funcionarios(id),
    documento_url   TEXT,
    cerrada         BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_cierre    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 17. BENEFICIOS (schema beneficios)
-- =============================================================================

-- Solicitudes de ayuda económica (médica, funeraria, materiales, etc.)
CREATE TABLE beneficios.ayudas (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_solicitud_id SMALLINT NOT NULL REFERENCES core.tipos_solicitud(id),
    monto_solicitado NUMERIC(15,2),
    monto_aprobado  NUMERIC(15,2),
    monto_pagado    NUMERIC(15,2),
    fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_aprobacion DATE,
    fecha_pago      DATE,
    motivo          TEXT NOT NULL,
    beneficiario_id BIGINT REFERENCES personal.carga_familiar(id),
    estatus         core.estatus_solicitud NOT NULL DEFAULT 'PENDIENTE',
    documento_url   TEXT,
    soporte_url     TEXT,                                 -- factura, presupuesto
    referencia_pago TEXT,
    banco_id        SMALLINT REFERENCES core.bancos(id),
    cuenta          TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      BIGINT REFERENCES seguridad.usuarios(id),
    aprobado_por    BIGINT REFERENCES seguridad.usuarios(id)
);
CREATE INDEX ix_ayudas_funcionario ON beneficios.ayudas(funcionario_id);
CREATE INDEX ix_ayudas_estatus ON beneficios.ayudas(estatus);
CREATE INDEX ix_ayudas_fecha ON beneficios.ayudas(fecha_solicitud);

-- Detalle de ayuda (conceptos / subitems)
CREATE TABLE beneficios.ayuda_detalle (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ayuda_id        BIGINT NOT NULL REFERENCES beneficios.ayudas(id) ON DELETE CASCADE,
    concepto        TEXT NOT NULL,
    cantidad        NUMERIC(10,2) NOT NULL DEFAULT 1,
    monto_unitario  NUMERIC(15,2) NOT NULL,
    monto_total     NUMERIC(15,2) GENERATED ALWAYS AS (cantidad * monto_unitario) STORED,
    observaciones   TEXT
);
CREATE INDEX ix_ayuda_det_ayuda ON beneficios.ayuda_detalle(ayuda_id);

-- Catálogo de beneficios fijos (CESTA-TICKET, BONO_FIN_AÑO, JUGUETES)
CREATE TABLE beneficios.tipos_beneficio (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    monto_default   NUMERIC(15,2),
    periodicidad    TEXT,                                 -- MENSUAL, ANUAL, ESPECIAL
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Registro de beneficios entregados
CREATE TABLE beneficios.entregas (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_beneficio_id SMALLINT NOT NULL REFERENCES beneficios.tipos_beneficio(id),
    periodo         TEXT,                                 -- '2026-04', '2026', 'NAVIDAD-2025'
    monto           NUMERIC(15,2),
    cantidad        INT,
    fecha_entrega   DATE NOT NULL DEFAULT CURRENT_DATE,
    referencia      TEXT,
    documento_url   TEXT,
    estatus         core.estatus_solicitud NOT NULL DEFAULT 'PAGADO',
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (funcionario_id, tipo_beneficio_id, periodo)
);
CREATE INDEX ix_entregas_func ON beneficios.entregas(funcionario_id);
CREATE INDEX ix_entregas_tipo_periodo ON beneficios.entregas(tipo_beneficio_id, periodo);

-- Pagos de control de entrega (parciales)
CREATE TABLE beneficios.entrega_pagos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entrega_id      BIGINT NOT NULL REFERENCES beneficios.entregas(id) ON DELETE CASCADE,
    monto           NUMERIC(15,2) NOT NULL,
    fecha           DATE NOT NULL,
    referencia      TEXT,
    banco_id        SMALLINT REFERENCES core.bancos(id),
    observaciones   TEXT
);

-- =============================================================================
-- 18. VIVIENDA (schema vivienda)
--     Programas habitacionales del cuerpo (no GDC nacional, ya cubierto en personal.gdc_habitacional).
-- =============================================================================

CREATE TABLE vivienda.programas (
    id              SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          TEXT NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    cupos_total     INT,
    cupos_adjudicados INT NOT NULL DEFAULT 0,
    fecha_inicio    DATE,
    fecha_fin       DATE,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE vivienda.postulaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    programa_id     SMALLINT NOT NULL REFERENCES vivienda.programas(id),
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha_postulacion DATE NOT NULL DEFAULT CURRENT_DATE,
    puntaje_socio_economico NUMERIC(5,2),
    estatus         core.estatus_solicitud NOT NULL DEFAULT 'PENDIENTE',
    observaciones   TEXT,
    UNIQUE (programa_id, funcionario_id)
);

CREATE TABLE vivienda.adjudicaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    postulacion_id  BIGINT NOT NULL UNIQUE REFERENCES vivienda.postulaciones(id),
    fecha_adjudicacion DATE NOT NULL,
    fecha_entrega   DATE,
    direccion       TEXT,
    parroquia_id    INT REFERENCES geo.parroquias(id),
    documento_url   TEXT,
    observaciones   TEXT
);

-- Casos sociales (familias en alto riesgo, refugios, madres solteras)
CREATE TABLE vivienda.casos_sociales (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_caso       TEXT NOT NULL,                       -- ALTO_RIESGO, REFUGIO, MADRE_SOLTERA, JUBILADO
    descripcion     TEXT,
    fecha_apertura  DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_cierre    DATE,
    estatus         TEXT NOT NULL DEFAULT 'ACTIVO',
    direccion_actual TEXT,
    parroquia_id    INT REFERENCES geo.parroquias(id),
    cantidad_familiares SMALLINT,
    visitas         SMALLINT NOT NULL DEFAULT 0,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_casos_func ON vivienda.casos_sociales(funcionario_id);
CREATE INDEX ix_casos_tipo ON vivienda.casos_sociales(tipo_caso);

CREATE TABLE vivienda.visitas_sociales (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    caso_id         BIGINT NOT NULL REFERENCES vivienda.casos_sociales(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    visitador_id    BIGINT REFERENCES personal.funcionarios(id),
    hallazgos       TEXT,
    recomendaciones TEXT,
    documento_url   TEXT
);

-- =============================================================================
-- 19. EGRESOS (schema egresos)
-- =============================================================================

-- Solicitudes de jubilación
CREATE TABLE egresos.solicitudes_jubilacion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_efectiva_propuesta DATE,
    años_servicio   NUMERIC(5,2),
    motivo          TEXT,
    estatus         core.estatus_solicitud NOT NULL DEFAULT 'PENDIENTE',
    resolucion      TEXT,
    documento_url   TEXT,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Funcionarios pre-jubilados (en proceso)
CREATE TABLE egresos.pre_jubilados (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL UNIQUE REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha_inicio    DATE NOT NULL,
    fecha_estimada_jubilacion DATE,
    años_servicio   NUMERIC(5,2),
    pension_estimada NUMERIC(15,2),
    observaciones   TEXT
);

-- Jubilados activos
CREATE TABLE egresos.jubilados (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id  BIGINT NOT NULL UNIQUE REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    fecha_jubilacion DATE NOT NULL,
    años_servicio   NUMERIC(5,2),
    tipo_jubilacion TEXT,                                 -- ORDINARIA, ESPECIAL, INCAPACIDAD
    pension_mensual NUMERIC(15,2),
    moneda          CHAR(3) DEFAULT 'VES',
    resolucion      TEXT,
    documento_url   TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones   TEXT
);
CREATE INDEX ix_jubilados_activo ON egresos.jubilados(activo);

-- NOTA: la tabla genérica egresos.egresos fue eliminada.
-- Los egresos canónicos viven en personal.periodos_servicio (cada cierre de período
-- es un egreso). Esta tabla complementa con datos específicos sólo para fallecimientos
-- y jubilaciones.

-- Fallecimientos (con detalles)
CREATE TABLE egresos.fallecimientos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL UNIQUE REFERENCES personal.funcionarios(id),
    fecha_fallecimiento DATE NOT NULL,
    en_servicio         BOOLEAN NOT NULL DEFAULT FALSE,
    causa               TEXT,
    lugar               TEXT,
    acta_defuncion      TEXT,
    documento_url       TEXT,
    beneficio_funerario_pagado BOOLEAN NOT NULL DEFAULT FALSE,
    observaciones       TEXT
);

-- =============================================================================
-- 20. DOCUMENTOS (schema documentos)
-- =============================================================================

-- Acervo personal (documentos varios del funcionario)
CREATE TABLE documentos.acervo (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo_documento_id   SMALLINT NOT NULL REFERENCES core.tipos_documento(id),
    titulo              TEXT NOT NULL,
    numero              TEXT,
    referencia          TEXT,
    fecha_documento     DATE,
    documento_url       TEXT,
    tamano_bytes        BIGINT,
    hash_sha256         TEXT,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          BIGINT REFERENCES seguridad.usuarios(id)
);
CREATE INDEX ix_acervo_funcionario ON documentos.acervo(funcionario_id);
CREATE INDEX ix_acervo_tipo ON documentos.acervo(tipo_documento_id);

-- Encabezados de documentos institucionales (oficios, memos)
CREATE TABLE documentos.oficios (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero              TEXT NOT NULL UNIQUE,
    fecha               DATE NOT NULL,
    tipo                TEXT NOT NULL,                   -- OFICIO, MEMO, CIRCULAR, RESOLUCION
    asunto              TEXT NOT NULL,
    cuerpo              TEXT,
    remitente_id        BIGINT REFERENCES personal.funcionarios(id),
    documento_url       TEXT,
    archivado           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_oficios_fecha ON documentos.oficios(fecha);

CREATE TABLE documentos.oficios_destinatarios (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    oficio_id           BIGINT NOT NULL REFERENCES documentos.oficios(id) ON DELETE CASCADE,
    funcionario_id      BIGINT REFERENCES personal.funcionarios(id),
    institucion_id      BIGINT REFERENCES core.instituciones(id),
    nombre_libre        TEXT,
    es_copia            BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_ofic_dest_oficio ON documentos.oficios_destinatarios(oficio_id);

-- Actas de reunión
CREATE TABLE documentos.actas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero              TEXT NOT NULL,
    fecha               DATE NOT NULL,
    tipo                TEXT NOT NULL DEFAULT 'GENERAL', -- GENERAL, ESPECIAL, COMITE
    lugar               TEXT,
    motivo              TEXT,
    resumen             TEXT,
    acuerdos            TEXT,
    documento_url       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (numero, fecha, tipo)
);

CREATE TABLE documentos.actas_asistentes (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    acta_id             BIGINT NOT NULL REFERENCES documentos.actas(id) ON DELETE CASCADE,
    funcionario_id      BIGINT REFERENCES personal.funcionarios(id),
    nombre_libre        TEXT,
    rol                 TEXT,
    firmo               BOOLEAN NOT NULL DEFAULT FALSE,
    observacion         TEXT
);
CREATE INDEX ix_act_asis_acta ON documentos.actas_asistentes(acta_id);

-- Firmas autorizadas (jefes, directores)
CREATE TABLE documentos.firmas_autorizadas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id      BIGINT NOT NULL REFERENCES personal.funcionarios(id),
    cargo_firma         TEXT NOT NULL,
    contexto            TEXT,                            -- VACACIONES, REPOSOS, OFICIOS, etc.
    fecha_inicio        DATE NOT NULL,
    fecha_fin           DATE,
    activa              BOOLEAN NOT NULL DEFAULT TRUE,
    firma_url           TEXT,
    sello_url           TEXT
);
CREATE INDEX ix_firmas_func ON documentos.firmas_autorizadas(funcionario_id);

-- =============================================================================
-- 21. AUDITORÍA (schema aud)
-- =============================================================================

CREATE TABLE aud.log_cambios (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_name     TEXT NOT NULL,
    table_name      TEXT NOT NULL,
    registro_id     TEXT,
    operacion       core.operacion_audit NOT NULL,
    valor_anterior  JSONB,
    valor_nuevo     JSONB,
    campos_cambiados JSONB,
    usuario_id      BIGINT,
    usuario_nombre  TEXT,
    ip              INET,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_log_cambios_tabla     ON aud.log_cambios(schema_name, table_name);
CREATE INDEX ix_log_cambios_registro  ON aud.log_cambios(schema_name, table_name, registro_id);
CREATE INDEX ix_log_cambios_usuario   ON aud.log_cambios(usuario_id);
CREATE INDEX ix_log_cambios_fecha     ON aud.log_cambios(fecha);
CREATE INDEX ix_log_cambios_diff      ON aud.log_cambios USING gin (campos_cambiados);

CREATE TABLE aud.log_accesos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id      BIGINT REFERENCES seguridad.usuarios(id),
    usuario         CITEXT,
    ip              INET,
    user_agent      TEXT,
    sistema_op      TEXT,
    navegador       TEXT,
    tipo_evento     core.tipo_evento_acceso NOT NULL,
    detalle         TEXT,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_log_accesos_usuario ON aud.log_accesos(usuario_id);
CREATE INDEX ix_log_accesos_fecha   ON aud.log_accesos(fecha);
CREATE INDEX ix_log_accesos_tipo    ON aud.log_accesos(tipo_evento);

-- =============================================================================
-- FIN ARCHIVO 02
-- Continúa en 03_funciones_vistas.sql con triggers, funciones, vistas y SPs.
-- =============================================================================
