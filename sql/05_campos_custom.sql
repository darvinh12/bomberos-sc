-- =============================================================
-- Campos personalizados extensibles por entidad
-- =============================================================
-- Permite al ADMIN definir nuevos campos sin migración de schema.
-- Los valores se guardan como JSONB en una columna `metadata` que
-- cada entidad principal expone, validados contra la definición.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.campos_custom (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entidad TEXT NOT NULL,
    codigo TEXT NOT NULL,
    etiqueta TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN (
        'texto', 'texto_largo', 'numero', 'fecha', 'booleano', 'seleccion'
    )),
    opciones JSONB,
    requerido BOOLEAN NOT NULL DEFAULT FALSE,
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ayuda_descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT REFERENCES seguridad.usuarios(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES seguridad.usuarios(id),
    UNIQUE (entidad, codigo),
    CHECK (codigo ~ '^[a-z][a-z0-9_]*$'),
    CHECK (entidad IN (
        'funcionario','reposo','vacaciones','permiso','comision','falta',
        'guardia','ayuda','ascenso','curso','evaluacion','proteccion','radio',
        'reconocimiento','jubilado','solicitud_jubilacion','fallecimiento'
    )),
    CHECK (tipo <> 'seleccion' OR jsonb_array_length(opciones) > 0)
);

CREATE INDEX IF NOT EXISTS ix_campos_custom_entidad ON core.campos_custom(entidad)
    WHERE activo;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION core.fn_touch_campos_custom() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_touch_campos_custom ON core.campos_custom;
CREATE TRIGGER tr_touch_campos_custom
    BEFORE UPDATE ON core.campos_custom
    FOR EACH ROW EXECUTE FUNCTION core.fn_touch_campos_custom();

-- Auditoría
DROP TRIGGER IF EXISTS tr_aud_campos_custom ON core.campos_custom;
CREATE TRIGGER tr_aud_campos_custom
    AFTER INSERT OR UPDATE OR DELETE ON core.campos_custom
    FOR EACH ROW EXECUTE FUNCTION aud.fn_audit();

-- =============================================================
-- Columnas metadata JSONB en cada entidad principal
-- (idempotente — solo crea si no existe)
-- =============================================================

ALTER TABLE personal.funcionarios   ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE salud.reposos           ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ops.vacaciones          ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ops.permisos            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ops.comisiones_servicio ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ops.faltas              ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ops.guardias            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE beneficios.ayudas       ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE carrera.ascensos        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE carrera.cursos_realizados ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE carrera.evaluaciones    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE equipo.proteccion_inventario ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE equipo.radios           ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Seed de ejemplo (opcional, solo si no hay registros)
INSERT INTO core.campos_custom (entidad, codigo, etiqueta, tipo, opciones, requerido, orden, ayuda_descripcion)
VALUES
    ('funcionario', 'talla_uniforme', 'Talla de uniforme', 'seleccion',
     '["XS","S","M","L","XL","XXL"]'::jsonb, false, 1, 'Talla del uniforme operativo asignado'),
    ('funcionario', 'alergias', 'Alergias conocidas', 'texto_largo',
     NULL, false, 2, 'Alergias o restricciones médicas relevantes'),
    ('reposo', 'reincidente', 'Reincidente', 'booleano',
     NULL, false, 1, 'Marca si es 3er reposo del año por la misma causa')
ON CONFLICT (entidad, codigo) DO NOTHING;
