-- =============================================================================
-- LIMPIEZA DE DATOS DEMO
-- Borra todo lo introducido por demo_data.sql.
-- Identifica los registros por:
--   - personal.funcionarios.apellidos LIKE '%DEMO'
--   - salud.reposos.folio LIKE 'DEMO-%'
-- =============================================================================

\echo 'Limpiando datos demo...'

BEGIN;

-- 1. Salud
DELETE FROM salud.reposos WHERE folio LIKE 'DEMO-%';
DELETE FROM salud.lesiones WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM salud.evaluacion_fisica WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);

-- 2. Operaciones
DELETE FROM ops.guardia_funcionarios WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
-- Solo borramos guardias creadas para demo (las que no tienen otros funcionarios asignados)
DELETE FROM ops.guardias g
 WHERE NOT EXISTS (
    SELECT 1 FROM ops.guardia_funcionarios gf WHERE gf.guardia_id = g.id
 ) AND g.fecha >= CURRENT_DATE - INTERVAL '1 day';
DELETE FROM ops.permisos WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM ops.vacaciones WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM ops.comisiones_servicio WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM ops.faltas WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);

-- 3. Carrera
DELETE FROM carrera.cursos_realizados WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM carrera.evaluaciones WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM carrera.ascensos WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM carrera.reconocimientos WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM carrera.meritos WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);

-- 4. Beneficios
DELETE FROM beneficios.ayudas WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM beneficios.entregas WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);

-- 5. Egresos
DELETE FROM egresos.solicitudes_jubilacion WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM egresos.jubilados WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM egresos.fallecimientos WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);

-- 6. Equipo (asignaciones)
DELETE FROM equipo.proteccion_asignaciones WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);
DELETE FROM equipo.radio_asignaciones WHERE funcionario_id IN (
    SELECT id FROM personal.funcionarios WHERE apellidos LIKE '%DEMO'
);

-- 7. Personal (cascadas a periodos_servicio, carga_familiar, etc.)
DELETE FROM personal.funcionarios WHERE apellidos LIKE '%DEMO';

COMMIT;

\echo 'Datos demo eliminados.'
