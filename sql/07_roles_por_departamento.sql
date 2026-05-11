-- =============================================================
-- Roles asignados con scope por departamento
-- =============================================================
-- Permite asignar a un usuario un rol DENTRO DE un departamento concreto.
-- Ejemplo: Pedro tiene rol SUPERVISOR en Zona 2, y rol LECTURA en Zona 3.
--
-- Si un usuario solo tiene roles globales (seguridad.usuario_roles), siguen
-- aplicando como hasta ahora. Si ademas tiene filas aqui, esas amplian el
-- conjunto efectivo SOLO cuando esta operando sobre datos del departamento
-- correspondiente.
--
-- La logica de evaluacion la decide require_role; este script solo expone
-- el modelo.
-- =============================================================

CREATE TABLE IF NOT EXISTS seguridad.usuario_rol_scope (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id      BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    rol_id          SMALLINT NOT NULL REFERENCES seguridad.roles(id) ON DELETE CASCADE,
    zona_id         SMALLINT REFERENCES org.zonas(id),
    estacion_id     SMALLINT REFERENCES org.estaciones(id),
    division_id     SMALLINT REFERENCES org.divisiones(id),
    area_id         SMALLINT REFERENCES org.areas(id),
    asignado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    asignado_por    BIGINT REFERENCES seguridad.usuarios(id),
    CHECK (
        zona_id IS NOT NULL OR estacion_id IS NOT NULL
        OR division_id IS NOT NULL OR area_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS ix_uros_usuario ON seguridad.usuario_rol_scope(usuario_id);
CREATE INDEX IF NOT EXISTS ix_uros_rol     ON seguridad.usuario_rol_scope(rol_id);

-- Evitar duplicados exactos (mismo usuario, mismo rol, mismo scope tuple)
CREATE UNIQUE INDEX IF NOT EXISTS uq_uros_unique
    ON seguridad.usuario_rol_scope(
        usuario_id, rol_id,
        COALESCE(zona_id, 0), COALESCE(estacion_id, 0),
        COALESCE(division_id, 0), COALESCE(area_id, 0)
    );

-- Auditoria
DROP TRIGGER IF EXISTS tr_aud_usuario_rol_scope ON seguridad.usuario_rol_scope;
CREATE TRIGGER tr_aud_usuario_rol_scope
    AFTER INSERT OR UPDATE OR DELETE ON seguridad.usuario_rol_scope
    FOR EACH ROW EXECUTE FUNCTION aud.fn_audit();
