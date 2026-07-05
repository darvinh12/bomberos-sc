-- =============================================================================
-- INSTALADOR — Ejecuta todos los scripts en orden.
-- Uso (PowerShell):
--   psql -h localhost -U postgres -d bomberos_caracas -f 99_run_all.sql
-- =============================================================================
\echo '=== 01_base.sql ==='
\i 01_base.sql

\echo '=== 02_dominio.sql ==='
\i 02_dominio.sql

\echo '=== 03_funciones_vistas.sql ==='
\i 03_funciones_vistas.sql

\echo '=== 04_seed.sql ==='
\i 04_seed.sql

\echo '=== 05_campos_custom.sql ==='
\i 05_campos_custom.sql

\echo '=== 07_roles_por_departamento.sql ==='
\i 07_roles_por_departamento.sql

\echo '=== 08_catalogos_ola1.sql ==='
\i 08_catalogos_ola1.sql

\echo '=== 10_catalogos_mini_sprint.sql ==='
\i 10_catalogos_mini_sprint.sql

\echo '=== 11_soft_delete_expediente.sql ==='
\i 11_soft_delete_expediente.sql

\echo '=== 12_permisos_recursos.sql ==='
\i 12_permisos_recursos.sql

\echo '=== 13_movimientos_estatus.sql ==='
\i 13_movimientos_estatus.sql

\echo ''
\echo 'Instalación completa.'
