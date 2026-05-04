/*
 * Inspeccionar_legacy.sql
 * Inventario del esquema PERSONALINTEGRADA sin extraer datos.
 * Para correr en SSMS contra la BD legacy.
 *
 * USO:
 *   1. Abrir SSMS, conectarse al servidor.
 *   2. Click en "PERSONALINTEGRADA" en el Object Explorer (o lo que se llame).
 *   3. Pegar este script y darle F5 (Execute).
 *   4. En la pestania Results, click derecho -> "Save Results As..." -> .csv
 *      (hacer eso para CADA SET de resultados, hay 6).
 *   5. O bien: ejecutar con "Results to Text" (Ctrl+T) y guardar todo
 *      como un solo .txt al final.
 *
 * NO escribe nada. Solo SELECT contra system catalogs.
 */

PRINT '=== METADATA ===';
SELECT @@VERSION AS sql_version,
       DB_NAME() AS database_name,
       SUSER_SNAME() AS run_by,
       HOST_NAME() AS host,
       GETDATE() AS generated_at;

PRINT '';
PRINT '=== TABLAS Y CONTEOS ===';
SELECT s.name AS schema_name,
       t.name AS table_name,
       SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id
WHERE p.index_id IN (0, 1)
GROUP BY s.name, t.name
ORDER BY row_count DESC, t.name;

PRINT '';
PRINT '=== COLUMNAS (todas las tablas) ===';
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION,
       DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
       NUMERIC_SCALE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;

PRINT '';
PRINT '=== PRIMARY KEYS ===';
SELECT s.name AS schema_name, t.name AS table_name,
       i.name AS pk_name, c.name AS column_name, ic.key_ordinal
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1
ORDER BY s.name, t.name, ic.key_ordinal;

PRINT '';
PRINT '=== FOREIGN KEYS ===';
SELECT  fk.name AS fk_name,
        ss.name AS src_schema, st.name AS src_table, sc.name AS src_column,
        ts.name AS tgt_schema, tt.name AS tgt_table, tc.name AS tgt_column
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables  st ON st.object_id = fkc.parent_object_id
JOIN sys.schemas ss ON ss.schema_id = st.schema_id
JOIN sys.columns sc ON sc.object_id = fkc.parent_object_id AND sc.column_id = fkc.parent_column_id
JOIN sys.tables  tt ON tt.object_id = fkc.referenced_object_id
JOIN sys.schemas ts ON ts.schema_id = tt.schema_id
JOIN sys.columns tc ON tc.object_id = fkc.referenced_object_id AND tc.column_id = fkc.referenced_column_id
ORDER BY ss.name, st.name, fk.name;

PRINT '';
PRINT '=== VISTAS (nombres) ===';
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.VIEWS
ORDER BY TABLE_SCHEMA, TABLE_NAME;

PRINT '';
PRINT '=== PROCEDIMIENTOS (nombres) ===';
SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE
FROM INFORMATION_SCHEMA.ROUTINES
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME;
