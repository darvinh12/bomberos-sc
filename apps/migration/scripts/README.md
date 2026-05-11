# Scripts de inspeccion legacy

Dos fases de inspeccion, ambas sin instalar nada en el servidor:

| Fase | Script | Que extrae | Cuando correr |
|---|---|---|---|
| **1. Estructura** | `inspeccionar_legacy.ps1` | Tablas, columnas, tipos, PKs, FKs, vistas, procs | ✅ Hecho el 2026-05-04 |
| **2. Valores opacos** | `inspeccionar_valores_opacos.ps1` | Valores unicos (con conteo) de columnas de estado / flags | ⏳ Pendiente — proxima visita |

La Fase 2 **solo lista valores distintos con conteo** (DISTINCT + COUNT). NO lee filas individuales, NO expone PII (no toca cedula, nombres, telefonos, direcciones).

---

## Fase 2 — Valores opacos (`inspeccionar_valores_opacos.ps1`)

### Para correr en el servidor legacy

```powershell
cd apps\migration\scripts
powershell -ExecutionPolicy Bypass -File .\inspeccionar_valores_opacos.ps1 `
  -Server "localhost\SERVIDORDATOS" `
  -Database PERSONALINTEGRADA
```

Tarda ~30-60 seg. Genera 2 archivos:
- `legacy_values_<timestamp>.json` — machine-readable
- `legacy_values_<timestamp>.md` — legible humano

### Que pregunta exactamente

41 columnas opacas en 9 tablas — todas son de clasificacion / estado / flags. Ninguna es PII:

- **FUNCIONARIOS:** CONDICION, SECCION, HORARIO, ESTADO_CIVIL, PRE_JUBILADOS, ESTATUS, PROMOCION, LICENCIA, NACIONALIDAD, SEXO, GRUPO_SANGUINEO, FACTOR_SANGUINEO
- **CARNET:** CHEQUEADO, LABORA_AI, LABORA_TELE, BRIGADISTA, TIPO_CARNET, MOTIVO_IMPRESION
- **CARGA_FAMILIAR:** P_M, TIPO_MOVIMIENTO, CONDICION, VIVE, ESTUDIA, PARENTESCO, GRADO_INSTRUCCION
- **VACACIONES:** Firma, Periodos, ESTATUS
- **REPOSOS:** TIPOREPOSO, ORIGEN, ESTATUS_CONVALIDADO_IVSS, VERIFICADO_INSPECTORIA, RE_LABORAL, ARCHIVADO
- **HIGUIENE_SEGURIDAD:** GRAVEDAD, PORTABA_EQUIPO_PROTECCION, UTILIZO_HERRAMIENTA_ADECUADA, CASO_ESPECIAL
- **DETALLES_NACIONALIDAD:** TIPO_NACIONALIZACION, PAIS_ORIGEN, IDIOMA

### Por que es necesario

Sin esto no se puede decidir si `CHEQUEADO` (nvarchar) debe modelarse como BOOLEAN o como TEXT en el schema nuevo. Y eso afecta el SQL de extensiones (`06_legacy_extensions.sql`) y el `transform.py` final.

---

## Fase 1 — Estructura (`inspeccionar_legacy.ps1`) — YA HECHO

### Opcion A — PowerShell (recomendada)

**Requisitos:** Windows con PowerShell (cualquier version, ya viene con Windows). **No instala nada.** Usa `System.Data.SqlClient` que ya viene en .NET Framework.

### A.1 Con autenticacion Windows (la PC esta en su dominio)

```powershell
cd apps\migration\scripts
powershell -ExecutionPolicy Bypass -File .\inspeccionar_legacy.ps1 `
  -Server localhost `
  -Database PERSONALINTEGRADA
```

### A.2 Con usuario SQL

```powershell
cd apps\migration\scripts
powershell -ExecutionPolicy Bypass -File .\inspeccionar_legacy.ps1 `
  -Server 10.0.0.5 `
  -Database PERSONALINTEGRADA `
  -User lector
# pide el password por consola
```

### A.3 Si la instancia es nombrada (ej. SQLEXPRESS)

```powershell
.\inspeccionar_legacy.ps1 -Server "SERVIDOR\SQLEXPRESS" -Database PERSONALINTEGRADA
```

### Salida

Genera dos archivos en la carpeta actual:
- `legacy_inspection_<timestamp>.json` — completo, machine-readable
- `legacy_inspection_<timestamp>.md` — resumen legible humano

**Mandame el `.json`.** El `.md` es para que vos veas/aprueben antes de mandarlo.

### Que hace exactamente

Solo `SELECT` contra:
- `sys.tables`, `sys.schemas`, `sys.columns`, `sys.indexes`, `sys.foreign_keys`
- `INFORMATION_SCHEMA.COLUMNS`, `.VIEWS`, `.ROUTINES`

**Nunca** lee filas de tablas de datos. **Nunca** ejecuta INSERT/UPDATE/DELETE.

---

## Opcion B — Solo SSMS (si no te dejan correr scripts)

Si solo te permiten abrir SSMS y mirar:

1. Abrir SSMS, conectar a su servidor.
2. Seleccionar la BD `PERSONALINTEGRADA` en el dropdown.
3. Abrir `inspeccionar_legacy.sql` (File -> Open -> File).
4. Activar **Results to Text**: `Query -> Results To -> Results to Text` (Ctrl+T).
5. F5 (Execute).
6. En la pestana **Messages** + **Results**, copiar todo y pegarlo en un `.txt`.
7. O guardar con `File -> Save Results As...` (en Results-to-Grid hay que hacerlo por cada uno de los 6 sets).

Mandame ese `.txt`.

---

## Opcion C — Si no tenes ni una de las dos

Pedi en SSMS:
- Click derecho en la BD `PERSONALINTEGRADA`
- `Tasks -> Generate Scripts...`
- En "Choose Objects": *Script entire database and all objects*
- En "Set Scripting Options": output a un archivo `.sql`
- En "Advanced -> Types of data to script": **Schema only** (NO data)
- Finish

Te genera un `.sql` con todos los `CREATE TABLE`, `CREATE VIEW`, etc. **Sin datos.**

Mandame ese `.sql`.

---

## Que NO hacen estos scripts

- ❌ No copian filas de tablas de datos.
- ❌ No leen valores de columnas.
- ❌ No exportan a archivo desde el servidor — todo se queda en TU laptop.
- ❌ No abren conexiones extra. Una sola conexion read-only.

## Anti-objeciones del custodio

| Objecion | Respuesta |
|---|---|
| "No se puede sacar data" | "No saco data. Saco solo nombres de tablas y columnas — son metadata, no PII." |
| "Es informacion sensible" | "El JSON no tiene una sola fila de FUNCIONARIOS, REPOSOS, etc. Lo podes abrir y revisar antes." |
| "Vas a romper algo" | "Son SELECT contra system catalogs. Es lo mismo que hace SSMS al expandir el Object Explorer." |
| "Necesitas permisos altos" | "Solo `db_datareader` o el rol equivalente. Read-only." |
