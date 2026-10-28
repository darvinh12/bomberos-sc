# Migración `PERSONALINTEGRADA` → `bomberos_caracas` (`bomberos-migrate`)

Herramienta de línea de comandos que migra el sistema anterior (SQL Server,
`PERSONALINTEGRADA`) al modelo nuevo (PostgreSQL, `bomberos_caracas`), acotable a UNA
zona operativa, con reporte de filas por tabla y validaciones post-carga.

- Nombres de columna **reales** del origen (`legacy_inspection_20260504_174805.json`).
- Mapa explícito tabla → tabla y columna → columna en [`mapping.py`](src/bomberos_migration/mapping.py)
  (`bomberos-migrate mapping --yaml` lo imprime). Lo que no tiene destino claro va a
  `legacy_extra`; nunca se pierde una columna en silencio.
- Lo que el origen no trae está en [`LAGUNAS.md`](LAGUNAS.md).

## Instalación

```powershell
cd apps\migration
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
```

Variables de entorno (o archivo `.env`, que no se versiona):

```
LEGACY_DSN=DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SERVIDORDATOS;DATABASE=PERSONALINTEGRADA;Trusted_Connection=yes;TrustServerCertificate=yes;
TARGET_DSN=postgresql://usuario:clave@localhost:5432/bomberos_caracas
BATCH_SIZE=500
```

El origen se abre en solo lectura.

El destino debe tener el esquema instalado (`psql -f sql\99_run_all.sql`). La herramienta
crea además su propio esquema `migracion` (trazas, descartes y corridas), por lo que el
usuario de `TARGET_DSN` necesita permiso `CREATE` en la base.

## Comandos

```powershell
# 1. Inventario del origen: tablas mapeadas, excluidas (con regla y filas) y pendientes;
#    columnas reales contra el mapa.
.venv\Scripts\bomberos-migrate analyze

# 2. Ensayo (modo por defecto): hace TODA la carga dentro de una transacción y la revierte.
#    El motor valida de verdad (EXCLUDE, CHECK, FK, UNIQUE): el reporte es exacto.
.venv\Scripts\bomberos-migrate migrate --zona Z1

# 3. Aplicar (confirma lote a lote de 500 filas; re-ejecutable).
.venv\Scripts\bomberos-migrate migrate --zona Z1 --apply

# 4. Validaciones post-carga (solo lectura). Sin --zona usa la de la última corrida aplicada.
.venv\Scripts\bomberos-migrate validate --zona Z1 --muestras 5
```

Opciones útiles:

| Opción | Para qué |
|---|---|
| `--zona` | Código del origen (`1`), nombre del origen (`"ZONA 1 CENTRO"`) o código destino (`Z1`). Sin `--zona` se migra todo. |
| `--only` | Fases (`estructura`, `salud_catalogos`, `funcionarios`, `historicos`, `identidad`, `operaciones`, `carrera`, `egresos`) o unidades (`reposos`, `vacaciones`, `guardias`…). Repetible. |
| `--solo-origen` | Ensayo sin base destino: transforma y simula la carga en memoria. |
| `--origen-sql RUTA` | Lee el origen de un script T-SQL de INSERTs en vez de SQL Server (p. ej. el conjunto demostrativo `demo_legacy/datos_legacy.sql`). |
| `--reportes CARPETA` | Dónde guardar `reporte_carga_<fecha>.json` y `reporte_migracion_<fecha>.json`. |

Los reportes JSON contienen cédulas y nombres de la muestra: **no se versionan**
(`.gitignore`).

### Demo sin SQL Server

```powershell
$env:TARGET_DSN = "postgresql://postgres:postgres@localhost:5432/bomberos_demo"
.venv\Scripts\bomberos-migrate migrate  --origen-sql demo_legacy\datos_legacy.sql --zona Z1
.venv\Scripts\bomberos-migrate migrate  --origen-sql demo_legacy\datos_legacy.sql --zona Z1 --apply
.venv\Scripts\bomberos-migrate validate --origen-sql demo_legacy\datos_legacy.sql
```

## Cómo funciona

### Orden de carga (fijo)

1. **estructura** — `ZONAS`, `DIVISIONES`, `AREAS`, `DEPENDENCIAS`, `ESTACIONES` → `org.*`;
   `JERARQUIAS`, `CARGOS`, `CONDICIONES`, `TIPO_NIVEL_EDUCATIVO`, `CURSOS`, tipos de
   reposo → `core.*`/`carrera.cursos`.
2. **salud_catalogos** — `GRUPOSDIAGNOSTICOS`, `DIAGNOSTICOS`, `MEDICO_TRATANTE`,
   `CENTROS_MEDICOS` → `salud.*`.
3. **funcionarios** — `FUNCIONARIOS` ∪ `FUNCIONARIOS_EGRESADOS` → `personal.funcionarios`;
   períodos de servicio reconstruidos (+ `DETALLE_EGRESO`) → `personal.periodos_servicio`.
4. **historicos** — `HISTORICO_JERARQUIA`, `HISTORICO_UBICACION_ADMINISTRATIVA`.
5. **identidad** — `CARGA_FAMILIAR`, `NIVEL_EDUCATIVO` → `personal.carga_familiar`, `personal.educacion`.
6. **operaciones** — `REPOSOS` → `salud.reposos`; `VACACIONES` → `ops.vacaciones`;
   `RECURRENCIA` → `ops.faltas`; `ENC_GUARDIAS` + `DET_GUARDIAS` → `ops.guardias` + `ops.guardia_funcionarios`.
7. **carrera** — `EVALUACIONES_CURSOS`, `ASCENSOS`, `EVALUACIONES` → `carrera.*`.
8. **egresos** — `JUBILADOS` → `egresos.jubilados`.

Los catálogos se resuelven contra lo sembrado (`sql/04_seed.sql`, `08`, `10`) por nombre,
código o sinónimo (`Cabo Segundo` ≡ `CABO_2DO`, `ZONA 1 CENTRO` ≡ `Zona 1 - Centro`); lo que
no casa se crea con un código `LEG_…`/`Z<n>`/`EST_<n>` y el reporte lo lista.

### Acotación por zona

La **ubicación vigente** de una cédula es su fila de `UBICACION_ADMINISTRATIVA` (la tabla de
ubicación actual, una por funcionario; si hubiera varias, la de `FECHA_DESDE` más reciente)
y, si no tiene —lo normal en egresados—, la última fila de
`HISTORICO_UBICACION_ADMINISTRATIVA` (`FECHA_DESDE` más reciente, desempate por
`ID_UBIADM`). La zona es su `COD_ZONA`, o la de su `COD_ESTACION` si viene vacía.
`FUNCIONARIOS.COD_UBICACION` no se usa (significado sin confirmar).

Entran los expedientes activos y egresados cuya zona vigente es la pedida, con todos sus
registros dependientes; las guardias, solo las que tienen algún funcionario del alcance.
Catálogos y estructura organizativa se migran completos. Las filas huérfanas (cédula sin
expediente) no tienen zona: con `--zona` quedan fuera y se avisan; sin `--zona` se
descartan con motivo.

### Tablas excluidas

Se descartan y se reportan con nombre, filas y regla: `*_OLD`/`…OLD`, `*_VIEJA`, `*_BACKUP`,
`*_2017`, `TEMP*`, `*_TEMP`, `(ORIGINAL)`, `(ANTES …)`, `AUDIT_*`, `ACCESO`,
`BENEFICIO_*`/`BENEFICIO2`, `*_COPIA`, hojas de Excel (`…$`), `*_2019`, `dtproperties`,
`sysdiagrams` (`mapping.REGLAS_EXCLUSION`). Las canónicas que aún no tienen mapeo se
listan aparte.

### Idempotencia y trazabilidad

- `personal.funcionarios` se fusiona por `(nacionalidad, cedula)`; `estatus` y
  `fecha_primer_ingreso` no se pisan al re-ejecutar (los gobiernan los períodos).
- Cada fila del origen queda enlazada a su fila destino en `migracion.trazas`
  (`tabla_origen`, `clave_origen` → `id_destino`, más su `legacy_extra` si la tabla destino
  no tiene `metadata`). Re-ejecutar actualiza solo lo que cambió; nunca duplica.
- Lo rechazado (por la herramienta o por el motor) queda en `migracion.descartes` con su
  motivo: p. ej. `rechazado por el motor: solapamiento (reposos_funcionario_id_daterange_excl)`.
- `numero_empleado` y `correo` repetidos entre personas: el segundo queda vacío y el valor
  va a `legacy_extra` (el destino los exige únicos).

### Reporte de `migrate`

Por tabla: leídas, en alcance, insertadas, actualizadas, sin cambios, vinculadas a
semilla y descartadas **con motivo** (y ejemplos de claves); columnas guardadas en
`legacy_extra`, columnas no previstas, entradas de catálogo creadas, tablas excluidas y
pendientes. En pantalla y en `reporte_carga_<fecha>.json`.

### Validaciones de `validate`

1. Cuadre origen ↔ destino por tabla con la misma acotación: alcance = migradas +
   descartadas; las «faltantes» hacen fallar la validación.
2. Integridad: trazas sin fila, hijos sin funcionario, funcionarios sin períodos o con
   varios abiertos, estatus incoherente con los períodos.
3. Solapamientos de períodos, reposos y vacaciones en el destino (deben ser 0) y cuántas
   filas rechazó el motor por solapamiento.
4. Antigüedad del sistema nuevo (`personal.fn_antiguedad_dias`) frente a la registrada en
   el origen (`FECHA_INGRESO` → `FECHA_EGRESO`/hoy) y `fecha_primer_ingreso`.
5. Muestreo de N expedientes con origen y destino lado a lado.

Sale con código 1 si algo no cuadra. Texto en pantalla y `reporte_migracion_<fecha>.json`.

## Pruebas

```powershell
.venv\Scripts\python -m pytest          # unitarias + migración completa en memoria
.venv\Scripts\ruff check src tests
# Integración contra PostgreSQL de PRUEBAS (escribe en esa base):
$env:MIGRACION_TEST_DSN = "postgresql://postgres:postgres@localhost:5432/bomberos_prueba"
.venv\Scripts\python -m pytest tests\test_integracion_pg.py
```

## Estructura

```
src/bomberos_migration/
  __main__.py   CLI (analyze | mapping | migrate | validate)
  mapping.py    mapa origen→destino, fases, exclusiones, catálogos y parámetros
  transform.py  transformaciones puras (sin BD)
  alcance.py    ubicación vigente y acotación por zona
  origen.py     lectura de SQL Server (solo lectura), de script T-SQL y en memoria
  destino.py    escritura en PostgreSQL (ensayo/apply, lotes, trazas) y destino simulado
  migrate.py    orquestador por unidades en orden fijo
  reporte.py    reporte de la carga
  validate.py   validaciones post-carga
  analyze.py    inventario del origen
```
