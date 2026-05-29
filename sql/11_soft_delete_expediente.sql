-- =============================================================================
-- 11. SOFT-DELETE en tablas del expediente personal (8 tablas)
--
-- Decisión: las tablas del expediente del funcionario NO se borran físicamente.
-- Marcamos `deleted_at` con timestamp + `deleted_by` (usuario) + `delete_reason`
-- (motivo obligatorio en frontend, minimo 3 chars validado en API).
--
-- Reglas de aplicación:
--   - GET filtra `deleted_at IS NULL` por defecto.
--   - GET con `?incluir_borrados=true` requiere rol ADMIN.
--   - DELETE marca soft (rol RRHH o ADMIN).
--   - POST `/restaurar` limpia los tres campos (solo ADMIN).
--
-- Índices: parciales `WHERE deleted_at IS NULL` para que el filtro por defecto
-- sea barato (el listado activo es el caso 99% del tráfico).
--
-- NO se aplica a:
--   - personal.funcionarios (su `estatus` ya cubre la baja lógica).
--   - personal.historico_carnets (append-only, derivado).
--   - tablas operativas (reposos/vacaciones/permisos/comisiones/faltas/etc).
--   - catálogos.
-- =============================================================================

-- Carga familiar
ALTER TABLE personal.carga_familiar
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_carga_familiar_active
    ON personal.carga_familiar(funcionario_id) WHERE deleted_at IS NULL;

-- Histórico de jerarquías
ALTER TABLE personal.historico_jerarquias
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_historico_jerarquias_active
    ON personal.historico_jerarquias(funcionario_id) WHERE deleted_at IS NULL;

-- Histórico de ubicaciones
ALTER TABLE personal.historico_ubicaciones
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_historico_ubicaciones_active
    ON personal.historico_ubicaciones(funcionario_id) WHERE deleted_at IS NULL;

-- Tiempo en otras administraciones públicas
ALTER TABLE personal.tiempo_admpublica
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_tiempo_admpublica_active
    ON personal.tiempo_admpublica(funcionario_id) WHERE deleted_at IS NULL;

-- Habilidades
ALTER TABLE personal.habilidades
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_habilidades_active
    ON personal.habilidades(funcionario_id) WHERE deleted_at IS NULL;

-- Actividades
ALTER TABLE personal.actividades
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_actividades_active
    ON personal.actividades(funcionario_id) WHERE deleted_at IS NULL;

-- Carnets
ALTER TABLE personal.carnets
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_carnets_active
    ON personal.carnets(funcionario_id) WHERE deleted_at IS NULL;

-- Direcciones
ALTER TABLE personal.direcciones
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by    BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_direcciones_active
    ON personal.direcciones(funcionario_id) WHERE deleted_at IS NULL;
