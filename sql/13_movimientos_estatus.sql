-- =============================================================================
-- 13 — Movimientos de estatus (suspensión / reactivación / egreso)
--
-- Historial de las transiciones de estatus que aplica el panel de acciones.
-- Antes el frontend mandaba motivo, fechas, resolución y base legal en el
-- PATCH de funcionarios y Pydantic los descartaba en silencio: el estatus
-- cambiaba pero el sustento administrativo se perdía. Esta tabla conserva
-- cada evento con su respaldo, consistente con el diseño histórico del
-- resto del sistema (reposos, ascensos, períodos de servicio).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.movimientos_estatus (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    funcionario_id   BIGINT NOT NULL REFERENCES personal.funcionarios(id) ON DELETE CASCADE,
    tipo             TEXT NOT NULL CHECK (tipo IN ('SUSPENSION', 'REACTIVACION', 'EGRESO')),
    estatus_anterior core.estatus_funcionario,
    estatus_nuevo    core.estatus_funcionario NOT NULL,
    fecha_efectiva   DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_fin        DATE,           -- suspensiones con término definido
    motivo           TEXT,
    base_legal       TEXT,           -- egresos: artículo / normativa aplicada
    resolucion       TEXT,           -- número de resolución administrativa
    observaciones    TEXT,
    created_by       BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_mov_estatus_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_efectiva)
);

CREATE INDEX IF NOT EXISTS ix_movimientos_estatus_funcionario
    ON ops.movimientos_estatus(funcionario_id, fecha_efectiva DESC);

-- Auditoría estándar (aud.log_cambios vía trigger genérico)
SELECT sys.fn_attach_audit('ops', 'movimientos_estatus');
