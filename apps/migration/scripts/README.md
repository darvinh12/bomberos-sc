# Scripts de inspeccion legacy

Dos formas de generar el inventario sin instalar nada en su servidor.
Cualquiera de los dos genera un archivo que me podes mandar para que yo arme `mapping.yaml` y los `tables/*.py`.

---

## Opcion A — PowerShell (recomendada)

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
