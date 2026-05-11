<#
.SYNOPSIS
  Visita 2 - Inspector completo: catalogos + valores opacos + vistas + procs.
  Genera un unico JSON + Markdown con todo lo necesario para terminar el analisis.

.DESCRIPTION
  Secciones:
  1. Tablas catalogo  -- extrae TODAS las filas de tablas con <= MaxCatalogRows filas.
                         No toca tablas grandes (evita leer FUNCIONARIOS, HISTORICO_*, etc.).
  2. Columnas opacas  -- DISTINCT + COUNT para ~47 columnas de estado / flags.
  3. Vistas           -- definicion SQL de las vistas del legacy.
  4. Procedimientos   -- definicion SQL de los stored procs del legacy.

  Solo SELECT. No escribe nada en la BD.
  La seccion 1 puede contener nombres de zonas / cargos / jerarquias, pero
  NO cedulas, nombres de personas, telefonos ni direcciones.

.PARAMETER Server
  Instancia SQL Server. Ej: localhost\SERVIDORDATOS

.PARAMETER Database
  Nombre de la BD. Default: PERSONALINTEGRADA

.PARAMETER User
  Usuario SQL. Si se omite usa autenticacion Windows.

.PARAMETER Password
  Password SQL. Si no se pasa y hay -User, lo pide por consola.

.PARAMETER OutDir
  Carpeta destino. Default: carpeta actual.

.PARAMETER MaxCatalogRows
  Umbral de filas para extraer una tabla completa. Default: 2000.
  Tablas con mas filas no se extraen (se registran en catalogs_skipped).

.PARAMETER TopNOpacos
  Cuantos valores distintos mostrar por columna opaca. Default: 200.

.EXAMPLE
  .\inspeccionar_visita2.ps1 -Server "localhost\SERVIDORDATOS"

.EXAMPLE
  .\inspeccionar_visita2.ps1 -Server "localhost\SERVIDORDATOS" -MaxCatalogRows 5000
#>
param(
    [Parameter(Mandatory=$true)] [string]$Server,
    [string]$Database        = "PERSONALINTEGRADA",
    [string]$User,
    [string]$Password,
    [string]$OutDir          = ".",
    [int]$MaxCatalogRows     = 2000,
    [int]$TopNOpacos         = 200
)

$ErrorActionPreference = "Stop"
$ts       = Get-Date -Format "yyyyMMdd_HHmmss"
$jsonPath = Join-Path $OutDir "legacy_visita2_$ts.json"
$mdPath   = Join-Path $OutDir "legacy_visita2_$ts.md"

# ---- Conexion ---------------------------------------------------------------
if ($User) {
    if (-not $Password) {
        $sec      = Read-Host "Password SQL para $User" -AsSecureString
        $bstr     = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
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
Write-Host "Conectado." -ForegroundColor Green

# Devuelve ArrayList de hashtables ordenados (preserva orden de columnas del query)
function Invoke-Q([string]$sql, [int]$timeout = 120) {
    $cmd = $cn.CreateCommand()
    $cmd.CommandText  = $sql
    $cmd.CommandTimeout = $timeout
    $rd   = $cmd.ExecuteReader()
    $rows = New-Object System.Collections.ArrayList
    while ($rd.Read()) {
        $row = [ordered]@{}
        for ($i = 0; $i -lt $rd.FieldCount; $i++) {
            $row[$rd.GetName($i)] = if ($rd.IsDBNull($i)) { $null } else { $rd.GetValue($i) }
        }
        [void]$rows.Add($row)
    }
    $rd.Close()
    return $rows
}

function Test-ColExists([string]$tblName, [string]$colName) {
    $q = "SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '$tblName' AND COLUMN_NAME = '$colName'"
    return (Invoke-Q $q).Count -gt 0
}

# =============================================================================
# SECCION 1 : TABLAS CATALOGO
# =============================================================================
Write-Host ""
Write-Host "=== Seccion 1: Tablas catalogo (<= $MaxCatalogRows filas) ===" -ForegroundColor Yellow

$allTablesQ = @"
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
$allTables = Invoke-Q $allTablesQ

$catalogResults  = New-Object System.Collections.ArrayList
$skippedCatalogs = New-Object System.Collections.ArrayList

foreach ($tbl in $allTables) {
    $rowCount = [int64]$tbl.row_count
    $tblName  = $tbl.table_name
    $schName  = $tbl.schema_name

    if ($rowCount -gt $MaxCatalogRows) {
        [void]$skippedCatalogs.Add([ordered]@{
            schema    = $schName
            table     = $tblName
            row_count = $rowCount
            reason    = "excede MaxCatalogRows ($MaxCatalogRows)"
        })
        continue
    }

    Write-Host ("  -> {0}.{1}  ({2} filas)" -f $schName, $tblName, $rowCount) -ForegroundColor DarkGray

    try {
        $rows = Invoke-Q "SELECT TOP $MaxCatalogRows * FROM [$schName].[$tblName]"
        [void]$catalogResults.Add([ordered]@{
            schema    = $schName
            table     = $tblName
            row_count = $rowCount
            rows      = $rows
        })
    } catch {
        [void]$skippedCatalogs.Add([ordered]@{
            schema    = $schName
            table     = $tblName
            row_count = $rowCount
            reason    = "error: $($_.Exception.Message)"
        })
    }
}
Write-Host ("  Extraidas: {0}  |  Omitidas: {1}" -f $catalogResults.Count, $skippedCatalogs.Count) -ForegroundColor Cyan

# =============================================================================
# SECCION 2 : COLUMNAS OPACAS
# =============================================================================
Write-Host ""
Write-Host "=== Seccion 2: Columnas opacas (DISTINCT + COUNT) ===" -ForegroundColor Yellow

$targets = @(
    # FUNCIONARIOS - flags y clasificaciones
    @{ table = "FUNCIONARIOS";          column = "CONDICION";                    note = "categoria laboral?" },
    @{ table = "FUNCIONARIOS";          column = "SECCION";                      note = "departamento / unidad" },
    @{ table = "FUNCIONARIOS";          column = "HORARIO";                      note = "tipo de horario" },
    @{ table = "FUNCIONARIOS";          column = "ESTADO_CIVIL";                 note = "" },
    @{ table = "FUNCIONARIOS";          column = "PRE_JUBILADOS";                note = "nchar(1) S/N o flag?" },
    @{ table = "FUNCIONARIOS";          column = "ESTATUS";                      note = "ACTIVO/JUBILADO/etc" },
    @{ table = "FUNCIONARIOS";          column = "PROMOCION";                    note = "nombre o codigo de promocion?" },
    @{ table = "FUNCIONARIOS";          column = "LICENCIA";                     note = "tipo de licencia conducir?" },
    @{ table = "FUNCIONARIOS";          column = "NACIONALIDAD";                 note = "V / E / P?" },
    @{ table = "FUNCIONARIOS";          column = "SEXO";                         note = "M/F/otros?" },
    @{ table = "FUNCIONARIOS";          column = "GRUPO_SANGUINEO";              note = "A/B/AB/O" },
    @{ table = "FUNCIONARIOS";          column = "FACTOR_SANGUINEO";             note = "+/-" },
    # CARNET
    @{ table = "CARNET";                column = "CHEQUEADO";                    note = "boolean? S/N?" },
    @{ table = "CARNET";                column = "LABORA_AI";                    note = "que significa AI?" },
    @{ table = "CARNET";                column = "LABORA_TELE";                  note = "teletrabajo?" },
    @{ table = "CARNET";                column = "BRIGADISTA";                   note = "boolean? rol?" },
    @{ table = "CARNET";                column = "TIPO_CARNET";                  note = "" },
    @{ table = "CARNET";                column = "MOTIVO_IMPRESION";             note = "categorias o texto libre?" },
    # CARGA_FAMILIAR
    @{ table = "CARGA_FAMILIAR";        column = "P_M";                          note = "que significa P_M?" },
    @{ table = "CARGA_FAMILIAR";        column = "TIPO_MOVIMIENTO";              note = "alta/baja/modificacion?" },
    @{ table = "CARGA_FAMILIAR";        column = "CONDICION";                    note = "activo/inactivo?" },
    @{ table = "CARGA_FAMILIAR";        column = "VIVE";                         note = "S/N - vive con el funcionario?" },
    @{ table = "CARGA_FAMILIAR";        column = "ESTUDIA";                      note = "S/N" },
    @{ table = "CARGA_FAMILIAR";        column = "PARENTESCO";                   note = "hijo/conyuge/padre/etc" },
    @{ table = "CARGA_FAMILIAR";        column = "GRADO_INSTRUCCION";            note = "nivel educativo del familiar" },
    # VACACIONES
    @{ table = "VACACIONES";            column = "Firma";                        note = "S/N - firmadas?" },
    @{ table = "VACACIONES";            column = "Periodos";                     note = "formato del campo" },
    @{ table = "VACACIONES";            column = "ESTATUS";                      note = "aprobada/pendiente/etc?" },
    # REPOSOS
    @{ table = "REPOSOS";               column = "TIPOREPOSO";                   note = "" },
    @{ table = "REPOSOS";               column = "ORIGEN";                       note = "IVSS / privado?" },
    @{ table = "REPOSOS";               column = "ESTATUS_CONVALIDADO_IVSS";     note = "S/N?" },
    @{ table = "REPOSOS";               column = "VERIFICADO_INSPECTORIA";       note = "S/N?" },
    @{ table = "REPOSOS";               column = "RE_LABORAL";                   note = "nchar - flag?" },
    @{ table = "REPOSOS";               column = "ARCHIVADO";                    note = "S/N?" },
    # HIGUIENE_SEGURIDAD (lesiones)
    @{ table = "HIGUIENE_SEGURIDAD";    column = "GRAVEDAD";                     note = "leve/moderada/grave?" },
    @{ table = "HIGUIENE_SEGURIDAD";    column = "PORTABA_EQUIPO_PROTECCION";    note = "S/N" },
    @{ table = "HIGUIENE_SEGURIDAD";    column = "UTILIZO_HERRAMIENTA_ADECUADA"; note = "S/N" },
    @{ table = "HIGUIENE_SEGURIDAD";    column = "CASO_ESPECIAL";                note = "" },
    # DETALLES_NACIONALIDAD
    @{ table = "DETALLES_NACIONALIDAD"; column = "TIPO_NACIONALIZACION";         note = "categorias legales" },
    @{ table = "DETALLES_NACIONALIDAD"; column = "PAIS_ORIGEN";                  note = "texto libre o catalogo?" },
    @{ table = "DETALLES_NACIONALIDAD"; column = "IDIOMA";                       note = "lista de idiomas" },
    # COMISION_SERVICIO - campos bit sospechosos
    @{ table = "COMISION_SERVICIO";     column = "PTOSI";                        note = "bit - punto cuenta SI?" },
    @{ table = "COMISION_SERVICIO";     column = "PTONO";                        note = "bit - punto cuenta NO?" },
    @{ table = "COMISION_SERVICIO";     column = "RENOSI";                       note = "bit - renovacion SI?" },
    @{ table = "COMISION_SERVICIO";     column = "RENONO";                       note = "bit - renovacion NO?" },
    @{ table = "COMISION_SERVICIO";     column = "FIN_SI";                       note = "bit - finalizacion SI?" },
    @{ table = "COMISION_SERVICIO";     column = "FIN_NO";                       note = "bit - finalizacion NO?" }
)

$opacoResults = New-Object System.Collections.ArrayList
$opacoSkipped = New-Object System.Collections.ArrayList

foreach ($t in $targets) {
    $tbl = $t.table
    $col = $t.column
    Write-Host ("  -> {0}.{1}" -f $tbl, $col) -ForegroundColor DarkGray

    if (-not (Test-ColExists $tbl $col)) {
        [void]$opacoSkipped.Add([ordered]@{ table = $tbl; column = $col; reason = "columna no existe" })
        continue
    }

    try {
        $totRow   = (Invoke-Q "SELECT COUNT(*) AS total, SUM(CASE WHEN [$col] IS NULL THEN 1 ELSE 0 END) AS nulls FROM dbo.[$tbl]")[0]
        $total    = [int64]$totRow.total
        $nulls    = [int64]$totRow.nulls
        $distinct = [int64](Invoke-Q "SELECT COUNT(DISTINCT [$col]) AS d FROM dbo.[$tbl]")[0].d

        $topQ = @"
SELECT TOP $TopNOpacos
    LEFT(CAST([$col] AS NVARCHAR(MAX)), 200) AS valor,
    COUNT(*) AS cnt
FROM dbo.[$tbl]
WHERE [$col] IS NOT NULL
GROUP BY LEFT(CAST([$col] AS NVARCHAR(MAX)), 200)
ORDER BY COUNT(*) DESC
"@
        $top = Invoke-Q $topQ

        [void]$opacoResults.Add([ordered]@{
            table          = $tbl
            column         = $col
            note           = $t.note
            total_rows     = $total
            null_count     = $nulls
            distinct_count = $distinct
            top_values     = $top
        })
    } catch {
        [void]$opacoSkipped.Add([ordered]@{ table = $tbl; column = $col; reason = "error: $($_.Exception.Message)" })
    }
}
Write-Host ("  Procesadas: {0}  |  Omitidas: {1}" -f $opacoResults.Count, $opacoSkipped.Count) -ForegroundColor Cyan

# =============================================================================
# SECCION 3 : VISTAS
# =============================================================================
Write-Host ""
Write-Host "=== Seccion 3: Vistas (definicion SQL) ===" -ForegroundColor Yellow

$viewDefsQ = @"
SELECT v.name AS view_name,
       s.name AS schema_name,
       m.definition
FROM sys.views v
JOIN sys.schemas s ON s.schema_id = v.schema_id
JOIN sys.sql_modules m ON m.object_id = v.object_id
ORDER BY s.name, v.name
"@
$viewDefs = Invoke-Q $viewDefsQ
Write-Host ("  Vistas: {0}" -f $viewDefs.Count) -ForegroundColor Cyan

# =============================================================================
# SECCION 4 : STORED PROCEDURES
# =============================================================================
Write-Host ""
Write-Host "=== Seccion 4: Stored Procedures (definicion SQL) ===" -ForegroundColor Yellow

$procDefsQ = @"
SELECT p.name AS proc_name,
       s.name AS schema_name,
       m.definition
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id = p.schema_id
JOIN sys.sql_modules m ON m.object_id = p.object_id
ORDER BY s.name, p.name
"@
$procDefs = Invoke-Q $procDefsQ
Write-Host ("  Procedimientos: {0}" -f $procDefs.Count) -ForegroundColor Cyan

$cn.Close()

# =============================================================================
# JSON
# =============================================================================
Write-Host ""
Write-Host "Generando JSON ..." -ForegroundColor Yellow

$report = [ordered]@{
    metadata = [ordered]@{
        generated_at     = (Get-Date).ToString("o")
        host             = $env:COMPUTERNAME
        run_by           = $env:USERNAME
        sql_server       = $Server
        database         = $Database
        script_version   = "2.0.0"
        max_catalog_rows = $MaxCatalogRows
        top_n_opacos     = $TopNOpacos
    }
    summary = [ordered]@{
        catalogs_extracted = $catalogResults.Count
        catalogs_skipped   = $skippedCatalogs.Count
        opaque_processed   = $opacoResults.Count
        opaque_skipped     = $opacoSkipped.Count
        views              = $viewDefs.Count
        procedures         = $procDefs.Count
    }
    catalogs         = $catalogResults
    catalogs_skipped = $skippedCatalogs
    opaque_columns   = $opacoResults
    opaque_skipped   = $opacoSkipped
    views            = $viewDefs
    procedures       = $procDefs
}

$report | ConvertTo-Json -Depth 15 | Out-File -FilePath $jsonPath -Encoding utf8
Write-Host ("OK JSON: {0}" -f $jsonPath) -ForegroundColor Green

# =============================================================================
# MARKDOWN
# =============================================================================
Write-Host "Generando Markdown ..." -ForegroundColor Yellow

$md = New-Object System.Text.StringBuilder

[void]$md.AppendLine("# Inspeccion Visita 2 - $Database")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generado: $($report.metadata.generated_at)")
[void]$md.AppendLine("- Servidor: $Server")
[void]$md.AppendLine("- Por: $($report.metadata.run_by)@$($report.metadata.host)")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Resumen")
[void]$md.AppendLine("")
[void]$md.AppendLine("| Seccion | Resultado |")
[void]$md.AppendLine("|---|---:|")
[void]$md.AppendLine("| Tablas catalogo extraidas | $($catalogResults.Count) |")
[void]$md.AppendLine("| Tablas omitidas (> $MaxCatalogRows filas) | $($skippedCatalogs.Count) |")
[void]$md.AppendLine("| Columnas opacas procesadas | $($opacoResults.Count) |")
[void]$md.AppendLine("| Columnas opacas omitidas | $($opacoSkipped.Count) |")
[void]$md.AppendLine("| Vistas | $($viewDefs.Count) |")
[void]$md.AppendLine("| Procedimientos | $($procDefs.Count) |")
[void]$md.AppendLine("")

# ---- Seccion 1: Catalogos ----
[void]$md.AppendLine("---")
[void]$md.AppendLine("")
[void]$md.AppendLine("## 1. Tablas catalogo")
[void]$md.AppendLine("")

foreach ($c in $catalogResults) {
    [void]$md.AppendLine("### $($c.schema).$($c.table)  ($($c.row_count) filas)")
    [void]$md.AppendLine("")
    if ($c.rows.Count -eq 0) {
        [void]$md.AppendLine("_Tabla vacia._")
        [void]$md.AppendLine("")
        continue
    }
    $keys = @($c.rows[0].Keys)
    [void]$md.AppendLine("| " + ($keys -join " | ") + " |")
    [void]$md.AppendLine("|" + (($keys | ForEach-Object { "---" }) -join "|") + "|")
    $shown = 0
    foreach ($row in $c.rows) {
        if ($shown -ge 100) { break }
        $cells = $keys | ForEach-Object {
            $v = $row[$_]
            if ($null -eq $v) { "_null_" }
            else { ([string]$v).Replace("|", "/").Replace("`n", " ").Replace("`r", "") }
        }
        [void]$md.AppendLine("| " + ($cells -join " | ") + " |")
        $shown++
    }
    if ($c.rows.Count -gt 100) {
        [void]$md.AppendLine("")
        [void]$md.AppendLine("_... y $($c.rows.Count - 100) filas mas en el JSON._")
    }
    [void]$md.AppendLine("")
}

if ($skippedCatalogs.Count -gt 0) {
    [void]$md.AppendLine("### Tablas omitidas por tamano")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("| Schema | Tabla | Filas | Motivo |")
    [void]$md.AppendLine("|---|---|---:|---|")
    foreach ($s in $skippedCatalogs) {
        [void]$md.AppendLine("| $($s.schema) | $($s.table) | $($s.row_count) | $($s.reason) |")
    }
    [void]$md.AppendLine("")
}

# ---- Seccion 2: Opacas ----
[void]$md.AppendLine("---")
[void]$md.AppendLine("")
[void]$md.AppendLine("## 2. Columnas opacas")
[void]$md.AppendLine("")

foreach ($r in $opacoResults) {
    [void]$md.AppendLine("### $($r.table).$($r.column)")
    [void]$md.AppendLine("")
    if ($r.note) { [void]$md.AppendLine("> $($r.note)") ; [void]$md.AppendLine("") }
    [void]$md.AppendLine("- Filas totales: $($r.total_rows)")
    [void]$md.AppendLine("- Nulls: $($r.null_count)")
    [void]$md.AppendLine("- Valores distintos: $($r.distinct_count)")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("| Valor | Conteo |")
    [void]$md.AppendLine("|---|---:|")
    foreach ($v in $r.top_values) {
        $val = if ($null -eq $v.valor) { "(NULL)" } else { "``$($v.valor)``" }
        [void]$md.AppendLine("| $val | $($v.cnt) |")
    }
    [void]$md.AppendLine("")
}

if ($opacoSkipped.Count -gt 0) {
    [void]$md.AppendLine("### Columnas omitidas")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("| Tabla | Columna | Motivo |")
    [void]$md.AppendLine("|---|---|---|")
    foreach ($s in $opacoSkipped) {
        [void]$md.AppendLine("| $($s.table) | $($s.column) | $($s.reason) |")
    }
    [void]$md.AppendLine("")
}

# ---- Seccion 3: Vistas ----
[void]$md.AppendLine("---")
[void]$md.AppendLine("")
[void]$md.AppendLine("## 3. Vistas")
[void]$md.AppendLine("")

foreach ($v in $viewDefs) {
    [void]$md.AppendLine("### $($v.schema_name).$($v.view_name)")
    [void]$md.AppendLine("")
    [void]$md.AppendLine('```sql')
    $def = [string]$v.definition
    if ($def.Length -gt 8000) { $def = $def.Substring(0, 8000) + "`n-- [truncado a 8000 chars - ver JSON para version completa]" }
    [void]$md.AppendLine($def)
    [void]$md.AppendLine('```')
    [void]$md.AppendLine("")
}

# ---- Seccion 4: Procs ----
[void]$md.AppendLine("---")
[void]$md.AppendLine("")
[void]$md.AppendLine("## 4. Stored Procedures")
[void]$md.AppendLine("")

foreach ($p in $procDefs) {
    [void]$md.AppendLine("### $($p.schema_name).$($p.proc_name)")
    [void]$md.AppendLine("")
    [void]$md.AppendLine('```sql')
    $def = [string]$p.definition
    if ($def.Length -gt 8000) { $def = $def.Substring(0, 8000) + "`n-- [truncado a 8000 chars - ver JSON para version completa]" }
    [void]$md.AppendLine($def)
    [void]$md.AppendLine('```')
    [void]$md.AppendLine("")
}

$md.ToString() | Out-File -FilePath $mdPath -Encoding utf8
Write-Host ("OK Markdown: {0}" -f $mdPath) -ForegroundColor Green
Write-Host ""
Write-Host "Listo. Trae los dos archivos por file transfer de AnyDesk (F4)." -ForegroundColor Cyan
Write-Host "El JSON tiene la informacion completa; el Markdown es para leer rapido." -ForegroundColor Cyan
