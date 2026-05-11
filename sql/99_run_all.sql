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

\echo ''
\echo 'Instalación completa.'
