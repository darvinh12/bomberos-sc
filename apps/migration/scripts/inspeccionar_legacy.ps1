<#
.SYNOPSIS
  Inspecciona la BD legacy PERSONALINTEGRADA en SQL Server SIN extraer datos.
  Genera un archivo JSON + un archivo Markdown con el inventario del esquema.

.DESCRIPTION
  Solo ejecuta SELECT contra catalogos del sistema (sys.tables, INFORMATION_SCHEMA).
  No lee ni una fila de datos personales. Salida apta para enviar.

  Compatible con Windows PowerShell 5.1 — no requiere instalar nada.

.PARAMETER Server
  Host o IP del SQL Server. Ej: localhost, 10.0.0.5, SERVIDOR\SQLEXPRESS

.PARAMETER Database
  Nombre de la BD. Por defecto: PERSONALINTEGRADA

.PARAMETER User
  Usuario SQL. Si se omite, usa Windows Authentication.

.PARAMETER Password
  Password SQL. Si se omite y se pasa -User, lo pide por consola.

.PARAMETER OutDir
  Carpeta donde escribir los reportes. Por defecto: carpeta actual.

.EXAMPLE
  # Auth Windows (si la PC esta unida al dominio)
  .\inspeccionar_legacy.ps1 -Server localhost -Database PERSONALINTEGRADA

.EXAMPLE
  # Auth SQL
  .\inspeccionar_legacy.ps1 -Server 10.0.0.5 -Database PERSONALINTEGRADA -User lector
#>
param(
    [Parameter(Mandatory=$true)] [string]$Server,
    [string]$Database = "PERSONALINTEGRADA",
    [string]$User,
    [string]$Password,
    [string]$OutDir = "."
)

$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$jsonPath = Join-Path $OutDir "legacy_inspection_$ts.json"
$mdPath   = Join-Path $OutDir "legacy_inspection_$ts.md"

# ---- Construir cadena de conexion ----
if ($User) {
    if (-not $Password) {
        $sec = Read-Host "Password SQL para $User" -AsSecureString
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    }
    $connStr = "Server=$Server;Database=$Database;User ID=$User;Password=$Password;TrustServerCertificate=True;Encrypt=False;"
} else {
    $connStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;"
}

Add-Type -AssemblyName "System.Data"
$cn = New-Object System.Data.SqlClient.SqlConnection $connStr
Write-Host "Conectando a $Server / $Database ..." -ForegroundColor Cyan
$cn.Open()

function Invoke-Q($sql) {
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 120
    $rd = $cmd.ExecuteReader()
    $rows = New-Object System.Collections.ArrayList
    while ($rd.Read()) {
        $row = @{}
        for ($i = 0; $i -lt $rd.FieldCount; $i++) {
            $row[$rd.GetName($i)] = if ($rd.IsDBNull($i)) { $null } else { $rd.GetValue($i) }
        }
        [void]$rows.Add($row)
    }
    $rd.Close()
    return $rows
}

# ---- 1. Version del servidor ----
Write-Host "  -> version SQL Server" -ForegroundColor DarkGray
$version = (Invoke-Q "SELECT @@VERSION AS v")[0].v

# ---- 2. Tablas + filas ----
Write-Host "  -> tablas + conteos" -ForegroundColor DarkGray
$tablesQ = @"
SELECT s.name AS schema_name,
       t.name AS table_name,
       SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id
WHERE p.index_id IN (0, 1)
GROUP BY s.name, t.name
ORDER BY s.name, t.name
"@
$tables = Invoke-Q $tablesQ

# ---- 3. Columnas de TODAS las tablas ----
Write-Host "  -> columnas (INFORMATION_SCHEMA)" -ForegroundColor DarkGray
$colsQ = @"
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION,
       DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
       NUMERIC_SCALE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
"@
$cols = Invoke-Q $colsQ

# ---- 4. Primary keys ----
Write-Host "  -> primary keys" -ForegroundColor DarkGray
$pksQ = @"
SELECT s.name AS schema_name, t.name AS table_name,
       i.name AS pk_name, c.name AS column_name, ic.key_ordinal
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1
ORDER BY s.name, t.name, ic.key_ordinal
"@
$pks = Invoke-Q $pksQ

# ---- 5. Foreign keys ----
Write-Host "  -> foreign keys" -ForegroundColor DarkGray
$fksQ = @"
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
ORDER BY ss.name, st.name, fk.name
"@
$fks = Invoke-Q $fksQ

# ---- 6. Indices no-PK ----
Write-Host "  -> indices" -ForegroundColor DarkGray
$ixQ = @"
SELECT s.name AS schema_name, t.name AS table_name,
       i.name AS index_name, i.is_unique,
       STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 0 AND i.type > 0 AND i.name IS NOT NULL
GROUP BY s.name, t.name, i.name, i.is_unique
ORDER BY s.name, t.name, i.name
"@
try { $idx = Invoke-Q $ixQ } catch {
    # STRING_AGG necesita SQL 2017+. Fallback sin agregar columnas:
    Write-Host "  (STRING_AGG no soportado, usando version sin columnas)" -ForegroundColor Yellow
    $ixQ2 = @"
SELECT s.name AS schema_name, t.name AS table_name,
       i.name AS index_name, i.is_unique, NULL AS columns
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE i.is_primary_key = 0 AND i.type > 0 AND i.name IS NOT NULL
ORDER BY s.name, t.name, i.name
"@
    $idx = Invoke-Q $ixQ2
}

# ---- 7. Vistas + Stored Procedures (solo nombres) ----
Write-Host "  -> vistas y procedimientos (nombres)" -ForegroundColor DarkGray
$views = Invoke-Q "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS ORDER BY TABLE_SCHEMA, TABLE_NAME"
$procs = Invoke-Q "SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE FROM INFORMATION_SCHEMA.ROUTINES ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME"

$cn.Close()

# ---- Construir reporte ----
$report = [ordered]@{
    metadata = [ordered]@{
        generated_at  = (Get-Date).ToString("o")
        host          = $env:COMPUTERNAME
        run_by        = $env:USERNAME
        sql_server    = $Server
        database      = $Database
        sql_version   = $version
        script_version = "1.0.0"
    }
    summary = [ordered]@{
        tables_count   = $tables.Count
        columns_count  = $cols.Count
        fks_count      = $fks.Count
        views_count    = $views.Count
        procs_count    = $procs.Count
        rows_total     = ($tables | Measure-Object -Property row_count -Sum).Sum
    }
    tables  = $tables
    columns = $cols
    primary_keys = $pks
    foreign_keys = $fks
    indexes = $idx
    views = $views
    procedures = $procs
}

$report | ConvertTo-Json -Depth 10 | Out-File -FilePath $jsonPath -Encoding utf8
Write-Host "OK - JSON escrito: $jsonPath" -ForegroundColor Green

# ---- Markdown legible ----
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# Inspeccion legacy `$Database`")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generado: $($report.metadata.generated_at)")
[void]$md.AppendLine("- Servidor: $Server")
[void]$md.AppendLine("- Por: $($report.metadata.run_by)@$($report.metadata.host)")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Resumen")
[void]$md.AppendLine("")
[void]$md.AppendLine("| Metrica | Cantidad |")
[void]$md.AppendLine("|---|---:|")
[void]$md.AppendLine("| Tablas | $($report.summary.tables_count) |")
[void]$md.AppendLine("| Columnas | $($report.summary.columns_count) |")
[void]$md.AppendLine("| Foreign keys | $($report.summary.fks_count) |")
[void]$md.AppendLine("| Vistas | $($report.summary.views_count) |")
[void]$md.AppendLine("| Procedimientos | $($report.summary.procs_count) |")
[void]$md.AppendLine("| Filas totales (estimado) | $($report.summary.rows_total) |")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Tablas (top 50 por filas)")
[void]$md.AppendLine("")
[void]$md.AppendLine("| Schema | Tabla | Filas |")
[void]$md.AppendLine("|---|---|---:|")
$tables | Sort-Object @{e={[int64]$_.row_count}; d=$true} | Select-Object -First 50 | ForEach-Object {
    [void]$md.AppendLine("| $($_.schema_name) | $($_.table_name) | $($_.row_count) |")
}
[void]$md.AppendLine("")
[void]$md.AppendLine("## Tablas clave - columnas")
[void]$md.AppendLine("")
$claves = @("FUNCIONARIOS","DETALLE_EGRESO","HISTORICO_JERARQUIA","HISTORICO_UBICACION_ADMINISTRATIVA","REPOSOS","VACACIONES","PERMISOS","GUARDIAS","ASISTENCIA_GUARDIA")
foreach ($k in $claves) {
    $cs = $cols | Where-Object { $_.TABLE_NAME -eq $k }
    if ($cs.Count -gt 0) {
        [void]$md.AppendLine("### $k")
        [void]$md.AppendLine("")
        [void]$md.AppendLine("| Columna | Tipo | Null | Default |")
        [void]$md.AppendLine("|---|---|---|---|")
        foreach ($c in $cs) {
            $t = $c.DATA_TYPE
            if ($c.CHARACTER_MAXIMUM_LENGTH) { $t = "$t($($c.CHARACTER_MAXIMUM_LENGTH))" }
            elseif ($c.NUMERIC_PRECISION)  { $t = "$t($($c.NUMERIC_PRECISION),$($c.NUMERIC_SCALE))" }
            [void]$md.AppendLine("| $($c.COLUMN_NAME) | $t | $($c.IS_NULLABLE) | $($c.COLUMN_DEFAULT) |")
        }
        [void]$md.AppendLine("")
    } else {
        [void]$md.AppendLine("### $k")
        [void]$md.AppendLine("")
        [void]$md.AppendLine("> _No encontrada en este servidor._")
        [void]$md.AppendLine("")
    }
}
$md.ToString() | Out-File -FilePath $mdPath -Encoding utf8
Write-Host "OK - Markdown escrito: $mdPath" -ForegroundColor Green
Write-Host ""
Write-Host "ENVIA cualquiera de los dos archivos. El JSON es el que mas info tiene." -ForegroundColor Cyan
