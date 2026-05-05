# Sesión de inspección legacy — 2026-05-04

Bitácora de la sesión donde se conectó por AnyDesk al servidor del cliente que
hospeda la BD legacy `PERSONALINTEGRADA`, se ejecutó el inspector de schema y
se trajeron los resultados al repo para análisis.

> **Nota:** este documento es un resumen curado de la conversación operativa.
> Su propósito es dejar trazabilidad de las decisiones tomadas, los problemas
> encontrados y las soluciones aplicadas durante esta sesión.

---

## 1. Contexto

- **Objetivo:** extraer la metadata estructural del legacy sin tocar datos
  personales, para poder armar el `mapping.yaml` real de la migración.
- **Acceso:** AnyDesk a la laptop del cliente (usuario remoto: `serv_datos`).
- **Restricción:** desde la laptop remota **no había acceso a GitHub**.
- **Punto de partida:** repositorio clonado localmente en
  `c:\Users\Darvin PC\Documents\PROYECTOS TRABAJOS\Bomberos SC\bomberos-caracas-bd\`,
  rama `feat/migration-cli-and-funcionario-form`.

---

## 2. Pasos ejecutados

### 2.1. Detección de la instancia SQL Server

```powershell
Get-Service | Where-Object { $_.Name -like 'MSSQL*' } | Format-Table Name, Status, DisplayName -AutoSize
```

**Resultado:**

```
Name                           Status  DisplayName
MSSQL$SERVIDORDATOS           Running SQL Server (SERVIDORDATOS)
MSSQLFDLauncher$SERVIDORDATOS Running SQL Full-text Filter Daemon Launcher (SERVIDORDATOS)
```

→ Instancia nombrada `SERVIDORDATOS`. Conexión: `localhost\SERVIDORDATOS`.

### 2.2. Verificación de acceso y descubrimiento de la BD

Se conectó vía `System.Data.SqlClient` con autenticación integrada Windows
(usuario `serv_datos`). Bases de datos disponibles:

```
master, model, msdb, ParqueAutomotor, PERSONALINTEGRADA,
ReportServer$SERVIDORDATOS, ReportServer$SERVIDORDATOSTempDB, tempdb
```

→ Confirmado: existe `PERSONALINTEGRADA`. También existe `ParqueAutomotor`
(decisión: queda fuera de alcance).

### 2.3. Intento inicial con script externo (fallido)

Se copió [`inspeccionar_legacy.ps1`](../apps/migration/scripts/inspeccionar_legacy.ps1)
vía AnyDesk clipboard a `C:\Temp\bomberos\`. Tamaño correcto (10,736 bytes).

Al ejecutar:

```
En C:\Temp\bomberos\inspeccionar_legacy.ps1: 217 Carácter: 24
+ [void]$md.AppendLine("- Generado: $($report.metadata.generated_at)")
+                        ~
Debe proporcionar una expresión de valor después del operador '-'.
```

**Diagnóstico:** el clipboard de AnyDesk + Notepad reemplazó algunas comillas
regulares `"` por comillas tipográficas `"` `"`, rompiendo el parser de
PowerShell en líneas que comenzaban con `"-`.

**Solución alternativa:** ejecución inline (sin archivo intermedio) usando un
bloque de PowerShell que evita los caracteres problemáticos. Se pegó
directamente en la consola y funcionó.

> **Lección capturada:** para futuras sesiones por AnyDesk, evitar el flujo
> *clipboard → Notepad → save*. Usar siempre uno de estos:
> - Descarga directa con `Invoke-WebRequest` (si hay acceso a internet)
> - Transferencia de archivos nativa de AnyDesk (F4)
> - Bloque inline pegado directo en PowerShell

### 2.4. Ejecución del inspector

Resultado:

```
Conectado.
Tablas...
Columnas...
Primary keys...
Foreign keys...
Vistas y procs...
OK JSON: C:\Temp\bomberos\legacy_inspection_20260504_174805.json
Tablas: 323 / Columnas: 4750 / FKs: 0
```

(Hubo un error cosmético no-fatal: `Measure-Object` no encontró la propiedad
`row_count` por ser clave de hashtable. No afectó la generación del JSON.)

### 2.5. Conteos finales

```
Filas totales estimadas: 1,335,202
Tamaño del JSON: 2,851,431 bytes (2.8 MB)
```

### 2.6. Transferencia y limpieza

- Vía AnyDesk file transfer → guardado en
  [`apps/migration/legacy_inspection_20260504_174805.json`](../apps/migration/legacy_inspection_20260504_174805.json).
- Pendiente: limpiar `C:\Temp\bomberos\` en la laptop remota tras confirmar
  que el JSON local está íntegro.

---

## 3. Hallazgos del análisis local

(Resumen — para el detalle ver [MIGRACION_LEGACY_PLAN.md](MIGRACION_LEGACY_PLAN.md))

### 3.1. Composición del legacy

- 323 tablas → 283 canónicas + 40 basura (`_OLD`, `_VIEJA`, `_2017`, `TEMP_*`)
- 1,133,361 filas reales (tras descartar basura)
- 0 foreign keys declaradas — relaciones implícitas vía `CEDULA`
- 121 PKs declaradas (38% de las tablas)

### 3.2. Mismatches contra el código de migración existente

El [`transform.py`](../apps/migration/src/bomberos_migration/transform.py) actual
asume estructura distinta a la real:

- `CEDULA` con prefijo de nacionalidad → en realidad `NACIONALIDAD` es columna separada
- `CORREO`/`EMAIL` → en realidad `CORREO_ELECTRONICO`
- `TELEFONO_MOVIL` → en realidad `TELEFONO_MOBIL`
- `NUMERO_EMPLEADO` → en realidad `N_EMPLEADO`
- `TIPO_PERSONAL` no existe en `FUNCIONARIOS`
- `IUTB`/`EGRESADO_UNES` no existen en `FUNCIONARIOS` (están en `NIVEL_EDUCATIVO`)
- `FUNCIONARIOS` tiene 34 columnas reales, el código mapea 15

→ **El `transform.py` debe refactorizarse antes de migrar datos.**

### 3.3. Tablas con relación 1:N relevante

- `FUNCIONARIOS` (5,726) UNION `FUNCIONARIOS_EGRESADOS` (3,285) = ~9,000 funcionarios
  (incluyendo egresados archivados)
- `HISTORICO_JERARQUIA` (30,792) — un funcionario tiene varios cambios de jerarquía
- `HISTORICO_UBICACION_ADMINISTRATIVA` (26,341) — ídem para ubicación
- `CARGA_FAMILIAR` (51,192) — varios familiares por funcionario
- `ORDEN_GEN_VOLUN` (95,606) — apariciones de funcionarios en órdenes generales
- `RECURRENCIA` (7,436) — la tabla real de **faltas administrativas**
  (la `FALTAS` legacy tiene 1 sola fila, está vacía)

---

## 4. Decisiones tomadas en esta sesión

| # | Decisión | Razón |
|---|---|---|
| 1 | Priorizar **personal + ops** | Son los dominios más movidos día a día (acordado con cliente) |
| 2 | NO migrar `ParqueAutomotor` | Fuera de alcance (acordado con cliente) |
| 3 | Agregar tablas/columnas al schema nuevo si son necesarias | Cliente exige "100% perfecto" — cero pérdida de información |
| 4 | NO migrar tablas `AUDIT_*` legacy (48K filas) | Sistema nuevo tiene `aud.log_cambios` propio |
| 5 | NO migrar `ACCESO` (200 filas, sistema viejo de usuarios) | Tiene claves en texto plano. Se recrean usuarios vía admin. |
| 6 | NO migrar snapshots `BENEFICIO_*`, `_COPIA`, `_RRHH`, `(ANTES_*)`, etc. | Son backups manuales, la canónica está identificada |
| 7 | UNION `FUNCIONARIOS` + `FUNCIONARIOS_EGRESADOS` para `personal.funcionarios` | Preservar el registro histórico completo |
| 8 | Mapear `RECURRENCIA` legacy a `ops.faltas` nuevo | La tabla `FALTAS` legacy está vacía; `RECURRENCIA` es la real |
| 9 | Estrategia híbrida para campos opacos: clasificar primero, JSONB sólo como último recurso | Schema queryable + cero pérdida de info, sin contaminar el modelo |

---

## 5. Próximos pasos acordados

1. **Generar script de inventario de valores únicos** para los ~30 campos
   sospechosos (`CHEQUEADO`, `LABORA_AI`, `BRIGADISTA`, `P_M`,
   `TIPO_MOVIMIENTO`, `RENOSI`, `RENONO`, `LIBRO`, `FOLIO`, etc.).

2. **Volver a AnyDesk ~15 min** para correr ese script en el legacy.
   Sólo `DISTINCT` + `COUNT` por columna, sin leer filas individuales.

3. **Sesión de clasificación** (~30 min) para asignar cada campo opaco a una
   de tres categorías (boolean, metadata legal, JSONB).

4. **Fase 3:** escribir `sql/06_legacy_extensions.sql` con las nuevas tablas
   y columnas finales.

5. **Fase 4:** refactorizar `transform.py` y `migrate.py` con la realidad de
   la BD legacy.

6. **Fase 5:** dry-run + apply contra BD destino limpia.

---

## 6. Artefactos generados en esta sesión

| Archivo | Propósito |
|---|---|
| [`apps/migration/legacy_inspection_20260504_174805.json`](../apps/migration/legacy_inspection_20260504_174805.json) | Metadata completa del legacy (323 tablas, 4,750 columnas, 121 PKs) |
| [`docs/MIGRACION_LEGACY_PLAN.md`](MIGRACION_LEGACY_PLAN.md) | Plan estructurado con decisiones, gaps y roadmap |
| [`docs/MIGRACION_LEGACY_SESION_2026-05-04.md`](MIGRACION_LEGACY_SESION_2026-05-04.md) | Este documento — bitácora de la sesión |
