# Migración legacy `PERSONALINTEGRADA` — Instrucciones para el día de acceso

**Audiencia:** vos (Ganesh), cuando tengas acceso al servidor del Cuerpo de Bomberos.
**Objetivo:** salir de esa visita con la **mayor cantidad de información posible**, aunque no te dejen extraer la BD entera.

> Regla: **no insistas en lo que no te van a dar**. Empezá por lo que sí van a permitir (mirar) y vas escalando. Cada escenario abajo deja la migración avanzada en un grado distinto.

---

## 0. Antes de ir — preparación (hacela hoy)

1. Pendrive **vacío**, formateado NTFS, etiquetado “BOMBEROS-MIGRACION”.
2. Llevá esta carpeta del proyecto descargada offline:
   - `apps\migration\` (con `.venv` ya instalada)
   - `sql\` (los DDL del nuevo Postgres, por si te piden ver qué les vas a hacer)
   - Este archivo impreso o en el celular.
3. Instalá en tu laptop (si no lo tenés ya):
   - **ODBC Driver 17 for SQL Server** — https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server
   - **SQL Server Management Studio (SSMS)** — opcional pero recomendado para inspeccionar.
4. Revisá que `apps\migration\.venv\Scripts\bomberos-migrate --help` funcione antes de salir.

**Argumento para el custodio de la data** (memorizalo):

> “No necesito copiar la base. Solo necesito **conectarme en modo lectura** para correr un script que cuenta filas y lista nombres de columnas. Genera un `.txt` con el resumen del esquema, sin datos personales. Lo revisamos juntos antes de que me lo lleve. Si no podemos siquiera eso, te pido al menos las **definiciones de tablas** (`.sql` con `CREATE TABLE`) — eso no contiene datos.”

---

## 1. Escenario A — Acceso total (ideal pero raro)

**Te dejan exportar un backup `.bak` o conectarte y leer.**

### A.1 Si te dan un backup `.bak`
1. Copialo al pendrive.
2. En tu laptop, restaurarlo en una instancia local de SQL Server:
   ```powershell
   # SQL Server Express local debe estar instalado
   sqlcmd -S localhost\SQLEXPRESS -Q "RESTORE DATABASE PERSONALINTEGRADA FROM DISK='D:\PERSONALINTEGRADA.bak' WITH MOVE 'PERSONALINTEGRADA' TO 'C:\SQLData\PI.mdf', MOVE 'PERSONALINTEGRADA_log' TO 'C:\SQLData\PI.ldf', REPLACE"
   ```
3. Saltá al paso **§4 (Análisis)**.

### A.2 Si te dejan conectarte en vivo
1. Pediles:
   - IP/hostname del SQL Server
   - Usuario read-only (lectura sobre todas las tablas) o credenciales Windows
   - Que abran el puerto 1433 desde tu IP
2. Editá `apps\migration\.env`:
   ```
   LEGACY_DSN=DRIVER={ODBC Driver 17 for SQL Server};SERVER=10.x.x.x;DATABASE=PERSONALINTEGRADA;UID=lector;PWD=xxx;TrustServerCertificate=yes;
   ```
3. Saltá a **§4**.

---

## 2. Escenario B — Solo on-site, sin sacar datos

**Te dejan entrar, conectarte desde su red, pero no llevarte nada.** Es el más probable.

### B.1 Plan de la visita
1. Llegás con la laptop. Te conectan al WiFi o LAN interna.
2. Pedís acceso ODBC al SQL Server con usuario read-only.
3. Editás `.env` apuntando a su servidor.
4. Corrés **solo el `analyze`**, que **no copia datos** — solo cuenta filas y lista columnas:
   ```powershell
   cd apps\migration
   .venv\Scripts\bomberos-migrate analyze > reporte_legacy.txt
   ```
5. Mostrale `reporte_legacy.txt` al custodio. Es texto plano, sin PII. Si lo aprueba, te lo llevás.
6. **Importante:** el reporte tiene nombres de tabla y columnas, NO valores. Eso es metadata, no data sensible.

### B.2 Si tampoco te dejan llevar el reporte
Anotalo a mano. Necesitamos como mínimo, para cada tabla relevante:
- Nombre exacto de la tabla
- Cantidad aproximada de filas
- Nombres y tipos de columnas

**Tablas que SÍ o SÍ tenés que listar (orden de prioridad):**

| Prioridad | Tabla legacy esperada                      | Mapea a (Postgres)                            |
|-----------|--------------------------------------------|-----------------------------------------------|
| 🔴 1      | `FUNCIONARIOS`                             | `personal.funcionarios` + `periodos_servicio` |
| 🔴 1      | `DETALLE_EGRESO`                           | `personal.periodos_servicio` (cierre)         |
| 🔴 1      | `HISTORICO_JERARQUIA`                      | `personal.historico_jerarquias`               |
| 🔴 1      | `HISTORICO_UBICACION_ADMINISTRATIVA`       | `personal.historico_ubicaciones`              |
| 🟠 2      | `REPOSOS` (la canónica, no las `_VIEJA`)   | `salud.reposos`                               |
| 🟠 2      | `VACACIONES`                               | `ops.vacaciones`                              |
| 🟠 2      | `PERMISOS`                                 | `ops.permisos`                                |
| 🟠 2      | `GUARDIAS` / `ASISTENCIA_GUARDIA`          | `ops.guardias` / `asistencia`                 |
| 🟡 3      | `CARNET*`, `HISTORICO_CARNET`              | `personal.carnets[_vehiculo]`                 |
| 🟡 3      | `EQUIPOS_PROTECCION`, `UNIFORMES`, `RADIOS`| `equipo.*`                                    |
| 🟡 3      | `ASCENSOS`, `EVALUACIONES`, `CURSOS`       | `carrera.*`                                   |
| 🟢 4      | Resto                                      | Mapeo caso a caso                             |

Las que tienen sufijo `_VIEJA`, `_OLD`, `_BACKUP`, `(ORIGINAL)` → **anotá que existen pero las vamos a ignorar** (la `analyze.py` ya las descarta luego).

### B.3 Plan B alternativo: pediles solo el DDL
Si no te dejan ni correr analyze:

> “Solo necesito el archivo de definición del esquema, sin datos. Es el `.sql` con los `CREATE TABLE`. No contiene una sola fila de información personal.”

Lo generan con SSMS:
- Click derecho en la BD → **Tasks → Generate Scripts** → solo *Schema*, no *Data*.

Eso es **metadata pública del sistema** y te permite construir el `mapping.yaml` sin tocar la BD real.

---

## 3. Escenario C — Solo te dan papel

**No te dejan ni mirar el SQL Server.** Pediles entonces:
1. Listado en papel/PDF de las tablas con su propósito (si existe documentación interna).
2. Capturas de pantalla de las pantallas del sistema legacy (form de funcionarios, de reposos, etc.) — eso te dice qué campos usan en la práctica, sin exponer datos.
3. Acordá una **segunda visita** con un objetivo más concreto y autorización escrita.

No te frustres: con DDL + capturas ya podemos avanzar 70% del `mapping.yaml`.

---

## 4. Análisis (cuando ya tengas conexión, en cualquier escenario A o B)

```powershell
cd C:\Users\ADMIN\bomberos-caracas-bd\apps\migration
.venv\Scripts\bomberos-migrate analyze
```

Esto:
- Lista TODAS las tablas con conteo de filas.
- Imprime las columnas de `FUNCIONARIOS`, `REPOSOS`, `VACACIONES`, `DETALLE_EGRESO`.
- **No escribe nada en su servidor** (solo `SELECT` contra `sys.tables` y `SELECT TOP 0`).

Capturá la salida:
```powershell
.venv\Scripts\bomberos-migrate analyze | Tee-Object -FilePath reporte_legacy.txt
```

---

## 5. Migración (cuando ya tengas datos en Postgres destino o en una réplica local)

> Esto NO se hace en su servidor. Se hace en tu laptop **después** de tener la BD legacy accesible (sea por backup restaurado en local, o conexión remota autorizada).

```powershell
# Postgres local debe estar levantado con el schema nuevo aplicado
docker compose up -d postgres
psql -h localhost -U postgres -d bomberos_caracas -f sql\99_run_all.sql

# Dry-run: lee legacy, NO escribe en Postgres
.venv\Scripts\bomberos-migrate migrate

# Migración real
.venv\Scripts\bomberos-migrate migrate --apply

# Solo un dominio (para iterar)
.venv\Scripts\bomberos-migrate migrate --apply --only funcionarios
```

---

## 6. Qué traer de vuelta (en orden de utilidad)

1. **Backup `.bak`** (escenario A.1) — game over, ganamos.
2. **Conexión remota persistente** (A.2) — segundo mejor.
3. **`reporte_legacy.txt` del `analyze`** (B.1) — suficiente para construir mapping.
4. **DDL `.sql` con CREATE TABLE** (B.3) — suficiente para mapping con suposiciones.
5. **Anotaciones manuales + capturas** (C) — punto de partida; requiere segunda visita.

---

## 7. Qué NO hacer

- ❌ No corras `migrate --apply` contra el SQL Server legacy. La herramienta nunca escribe en legacy, pero si te equivocás de DSN podés terminar escribiendo en su Postgres por accidente. Verificá `TARGET_DSN` antes de cada `--apply`.
- ❌ No sacás copia de la BD sin permiso explícito por escrito (correo, oficio).
- ❌ No abrás conexiones a la BD desde redes públicas — usá la red de ellos o VPN.
- ❌ No anotes credenciales en este archivo, en `.env` versionado, ni en chats. `.env` está en `.gitignore`, dejalo así.

---

## 8. Cuando vuelvas — avisame

Mandame en el chat **exactamente uno** de estos:
- Ruta al `.bak` (caso A.1) → genero el restore + analyze + mapping.yaml + tests.
- DSN de conexión (A.2) → idem.
- `reporte_legacy.txt` pegado (B.1) → genero `mapping.yaml` y los `tables/*.py` con las columnas reales.
- DDL `.sql` (B.3) → idem, con suposiciones marcadas como `# VERIFICAR`.
- Notas a mano (C) → armamos plan para segunda visita.

Cualquiera de los cinco casos lo retomo desde acá y te dejo `apps/migration/` lista para `--apply`.
