<#
.SYNOPSIS
  Fase 2: lista los VALORES UNICOS (con conteo) de columnas opacas del legacy.

.DESCRIPTION
  Para cada par (tabla, columna) hace SELECT TOP 200 valor, COUNT(*).
  No lee filas individuales: solo agrupa y cuenta. No expone PII porque
  todas las columnas pedidas son de estado / clasificacion / flags,
  NO columnas de identidad (cedula, nombres, telefonos, direcciones).

  Output: JSON + Markdown legible. Mandar cualquiera de los dos.

.PARAMETER Server
  Host / instancia de SQL Server. Ej: localhost\SERVIDORDATOS

.PARAMETER Database
  Nombre de la BD. Por defecto PERSONALINTEGRADA.

.PARAMETER User
  Usuario SQL. Si se omite, usa autenticacion Windows.

.PARAMETER Password
  Password. Si no se pasa y hay -User, lo pide por consola.

.PARAMETER OutDir
  Carpeta destino. Por defecto carpeta actual.

.PARAMETER TopN
  Cuantos valores top mostrar por columna. Default 200.

.EXAMPLE
  .\inspeccionar_valores_opacos.ps1 -Server "localhost\SERVIDORDATOS"
#>
param(
    [Parameter(Mandatory=$true)] [string]$Server,
    [string]$Database = "PERSONALINTEGRADA",
    [string]$User,
    [string]$Password,
    [string]$OutDir = ".",
    [int]$TopN = 200
)

$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$jsonPath = Join-Path $OutDir "legacy_values_$ts.json"
$mdPath   = Join-Path $OutDir "legacy_values_$ts.md"

# ---- Lista de columnas opacas a inventariar ----
# Cada entrada: { table; column; note } — solo columnas de estado / flags / clasificacion.
# NO incluir cedula, nombres, telefonos, direcciones, fechas (no son opacas).
$targets = @(
    # FUNCIONARIOS - flags y clasificaciones
    @{ table = "FUNCIONARIOS";        column = "CONDICION";        note = "categoria laboral?" },
    @{ table = "FUNCIONARIOS";        column = "SECCION";          note = "departamento / unidad" },
    @{ table = "FUNCIONARIOS";        column = "HORARIO";          note = "tipo de horario" },
    @{ table = "FUNCIONARIOS";        column = "ESTADO_CIVIL";     note = "" },
    @{ table = "FUNCIONARIOS";        column = "PRE_JUBILADOS";    note = "nchar(1) - S/N o flag?" },
    @{ table = "FUNCIONARIOS";        column = "ESTATUS";          note = "ACTIVO/JUBILADO/etc" },
    @{ table = "FUNCIONARIOS";        column = "PROMOCION";        note = "nombre o codigo de promocion?" },
    @{ table = "FUNCIONARIOS";        column = "LICENCIA";         note = "tipo de licencia conducir?" },
    @{ table = "FUNCIONARIOS";        column = "NACIONALIDAD";     note = "V / E / P?" },
    @{ table = "FUNCIONARIOS";        column = "SEXO";             note = "M/F/otros?" },
    @{ table = "FUNCIONARIOS";        column = "GRUPO_SANGUINEO";  note = "A/B/AB/O" },
    @{ table = "FUNCIONARIOS";        column = "FACTOR_SANGUINEO"; note = "+/-" },

    # CARNET - flags y clasificaciones
    @{ table = "CARNET";              column = "CHEQUEADO";        note = "boolean? S/N?" },
    @{ table = "CARNET";              column = "LABORA_AI";        note = "que significa AI?" },
    @{ table = "CARNET";              column = "LABORA_TELE";      note = "teletrabajo?" },
    @{ table = "CARNET";              column = "BRIGADISTA";       note = "boolean? rol?" },
    @{ table = "CARNET";              column = "TIPO_CARNET";      note = "" },
    @{ table = "CARNET";              column = "MOTIVO_IMPRESION"; note = "categorias o texto libre?" },

    # CARGA_FAMILIAR - flags y clasificaciones
    @{ table = "CARGA_FAMILIAR";      column = "P_M";              note = "que significa P_M?" },
    @{ table = "CARGA_FAMILIAR";      column = "TIPO_MOVIMIENTO";  note = "alta/baja/modif?" },
    @{ table = "CARGA_FAMILIAR";      column = "CONDICION";        note = "activo/inactivo?" },
    @{ table = "CARGA_FAMILIAR";      column = "VIVE";             note = "S/N - vive con funcionario?" },
    @{ table = "CARGA_FAMILIAR";      column = "ESTUDIA";          note = "S/N" },
    @{ table = "CARGA_FAMILIAR";      column = "PARENTESCO";       note = "hijo/conyuge/padre/etc" },
    @{ table = "CARGA_FAMILIAR";      column = "GRADO_INSTRUCCION"; note = "nivel educativo familiar" },

    # VACACIONES - flags
    @{ table = "VACACIONES";          column = "Firma";            note = "S/N - firmadas?" },
    @{ table = "VACACIONES";          column = "Periodos";         note = "formato del campo" },
    @{ table = "VACACIONES";          column = "ESTATUS";          note = "aprobada/pendiente?" },

    # REPOSOS - clasificaciones
    @{ table = "REPOSOS";             column = "TIPOREPOSO";       note = "" },
    @{ table = "REPOSOS";             column = "ORIGEN";           note = "IVSS/privado?" },
    @{ table = "REPOSOS";             column = "ESTATUS_CONVALIDADO_IVSS"; note = "S/N?" },
    @{ table = "REPOSOS";             column = "VERIFICADO_INSPECTORIA";   note = "S/N?" },
    @{ table = "REPOSOS";             column = "RE_LABORAL";       note = "nchar - flag?" },
    @{ table = "REPOSOS";             column = "ARCHIVADO";        note = "S/N?" },

    # HIGUIENE_SEGURIDAD (lesiones) - clasificaciones
    @{ table = "HIGUIENE_SEGURIDAD";  column = "GRAVEDAD";         note = "leve/moderada/grave?" },
    @{ table = "HIGUIENE_SEGURIDAD";  column = "PORTABA_EQUIPO_PROTECCION";    note = "S/N" },
    @{ table = "HIGUIENE_SEGURIDAD";  column = "UTILIZO_HERRAMIENTA_ADECUADA"; note = "S/N" },
    @{ table = "HIGUIENE_SEGURIDAD";  column = "CASO_ESPECIAL";    note = "" },

    # DETALLES_NACIONALIDAD - clasificaciones (no expone PII porque son tipos genericos)
    @{ table = "DETALLES_NACIONALIDAD"; column = "TIPO_NACIONALIZACION"; note = "categorias legales" },
    @{ table = "DETALLES_NACIONALIDAD"; column = "PAIS_ORIGEN";     note = "texto libre o catalogo?" },
    @{ table = "DETALLES_NACIONALIDAD"; column = "IDIOMA";           note = "lista de idiomas" }
)

# ---- Conexion ----
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

function Test-ColumnExists($table, $column) {
    $q = "SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '$table' AND COLUMN_NAME = '$column'"
    $r = Invoke-Q $q
    return $r.Count -gt 0
}

# ---- Loop por cada target ----
$results = New-Object System.Collections.ArrayList
$skipped = New-Object System.Collections.ArrayList

foreach ($t in $targets) {
    $tbl = $t.table
    $col = $t.column
    Write-Host ("  -> {0}.{1}" -f $tbl, $col) -ForegroundColor DarkGray

    if (-not (Test-ColumnExists $tbl $col)) {
        [void]$skipped.Add(@{ table = $tbl; column = $col; reason = "no existe en este servidor" })
        continue
    }

    # Conteo total + nulls
    $totalQ = "SELECT COUNT(*) AS total, SUM(CASE WHEN [$col] IS NULL THEN 1 ELSE 0 END) AS nulls FROM dbo.[$tbl]"
    try {
        $totRow = (Invoke-Q $totalQ)[0]
        $total = [int64]$totRow.total
        $nulls = [int64]$totRow.nulls

        # Conteo de distintos
        $cntDistQ = "SELECT COUNT(DISTINCT [$col]) AS d FROM dbo.[$tbl]"
        $distinct = [int64](Invoke-Q $cntDistQ)[0].d

        # Top N valores (recortados a 200 chars por seguridad)
        $topQ = @"
SELECT TOP $TopN
    LEFT(CAST([$col] AS NVARCHAR(MAX)), 200) AS valor,
    COUNT(*) AS cnt
FROM dbo.[$tbl]
WHERE [$col] IS NOT NULL
GROUP BY LEFT(CAST([$col] AS NVARCHAR(MAX)), 200)
ORDER BY COUNT(*) DESC
"@
        $top = Invoke-Q $topQ

        [void]$results.Add([ordered]@{
            table         = $tbl
            column        = $col
            note          = $t.note
            total_rows    = $total
            null_count    = $nulls
            distinct_count = $distinct
            top_values    = $top
        })
    } catch {
        [void]$skipped.Add(@{ table = $tbl; column = $col; reason = "error: $($_.Exception.Message)" })
    }
}

$cn.Close()

# ---- Reporte JSON ----
$report = [ordered]@{
    metadata = [ordered]@{
        generated_at  = (Get-Date).ToString("o")
        host          = $env:COMPUTERNAME
        run_by        = $env:USERNAME
        sql_server    = $Server
        database      = $Database
        script_version = "1.0.0"
        top_n         = $TopN
    }
    columns = $results
    skipped = $skipped
}

$report | ConvertTo-Json -Depth 10 | Out-File -FilePath $jsonPath -Encoding utf8
Write-Host "OK - JSON escrito: $jsonPath" -ForegroundColor Green

# ---- Reporte Markdown ----
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# Inspeccion de valores opacos - legacy $Database")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generado: $($report.metadata.generated_at)")
[void]$md.AppendLine("- Servidor: $Server")
[void]$md.AppendLine("- Por: $($report.metadata.run_by)@$($report.metadata.host)")
[void]$md.AppendLine("- Top N por columna: $TopN")
[void]$md.AppendLine("")
[void]$md.AppendLine("Cada seccion lista los valores distintos (con conteo) de una columna del legacy")
[void]$md.AppendLine("cuyo significado no es evidente. Sirve para decidir si la columna nueva debe ser")
[void]$md.AppendLine("BOOLEAN, TEXT clasificado, FK a catalogo, o JSONB legacy_extra.")
[void]$md.AppendLine("")

foreach ($r in $results) {
    [void]$md.AppendLine("## $($r.table).$($r.column)")
    [void]$md.AppendLine("")
    if ($r.note) { [void]$md.AppendLine("> $($r.note)") ; [void]$md.AppendLine("") }
    [void]$md.AppendLine("- Filas totales: $($r.total_rows)")
    [void]$md.AppendLine("- Nulls: $($r.null_count)")
    [void]$md.AppendLine("- Valores distintos: $($r.distinct_count)")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("| Valor | Conteo |")
    [void]$md.AppendLine("|---|---:|")
    foreach ($v in $r.top_values) {
        $val = if ($v.valor -eq $null) { "(NULL)" } else { "``$($v.valor)``" }
        [void]$md.AppendLine("| $val | $($v.cnt) |")
    }
    [void]$md.AppendLine("")
}

if ($skipped.Count -gt 0) {
    [void]$md.AppendLine("## Columnas omitidas")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("| Tabla | Columna | Motivo |")
    [void]$md.AppendLine("|---|---|---|")
    foreach ($s in $skipped) {
        [void]$md.AppendLine("| $($s.table) | $($s.column) | $($s.reason) |")
    }
    [void]$md.AppendLine("")
}

$md.ToString() | Out-File -FilePath $mdPath -Encoding utf8
Write-Host "OK - Markdown escrito: $mdPath" -ForegroundColor Green
Write-Host ""
Write-Host "Mandame cualquiera de los dos archivos (el JSON tiene mas info)." -ForegroundColor Cyan
