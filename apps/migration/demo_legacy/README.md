# `demo_legacy` — base anterior de demostración (`PERSONALINTEGRADA_DEMO`)

Conjunto de datos **ficticio** que reproduce la estructura real de la base anterior del
Cuerpo de Bomberos (`PERSONALINTEGRADA`, SQL Server), para correr `bomberos-migrate` de punta
a punta sin un solo dato personal.

- **Estructura real.** Tablas, columnas, tipos, longitudes, NULL/NOT NULL, DEFAULT y claves
  primarias salen tal cual de `../legacy_inspection_20260504_174805.json`, los metadatos
  que se tomaron del servidor el 04-05-2026. Hay 60 tablas: 50 que la migración debe leer
  y 10 que debe descartar.
- **Datos ficticios, deterministas y coherentes.** Usan una semilla fija (`20260504`) y una
  fecha de corte (`2026-05-04`). Las cédulas van desde V-90.000.001 y los nombres salen de
  un diccionario propio. Las referencias entre tablas cuadran: cédulas, zonas, estaciones,
  jerarquías, cargos y catálogos.
- **Anomalías sembradas a propósito**, en cantidades exactas, para probar el motor:
  reposos solapados, duplicados, con fechas invertidas o huérfanos; vacaciones repetidas;
  correos duplicados; reingresos sin detalle de egreso; y la fecha centinela `1900-01-01`.

El detalle tabla por tabla está en [`TABLAS.md`](TABLAS.md).

## Archivos

| Archivo | Qué es |
|---|---|
| `metadatos.py` | Lee el JSON real y define las 60 tablas del demo y su rol (canónica / descartar). |
| `catalogos.py` | Catálogos ficticios (zonas, estaciones, jerarquías, cargos…) elegidos para mapear al destino. |
| `generar_ddl.py` → `ddl_legacy.sql` | `CREATE TABLE` T-SQL con los tipos exactos del JSON. |
| `generar_datos.py` → `datos_legacy.sql`, `conteos_esperados.json`, `TABLAS.md` | `INSERT` por lotes de 100 filas; cada fila se valida contra el JSON (columna existente, longitud, precisión, NOT NULL). |
| `verificar_datos.py` | Analiza la sintaxis T-SQL con sqlglot, carga todo en SQLite en memoria y corre 216 comprobaciones de coherencia. |
| `cargar.py` | Carga el DDL y los datos en SQL Server con pyodbc y compara los conteos. |

## Generar

```powershell
cd apps\migration\demo_legacy
python generar_ddl.py      # ddl_legacy.sql
python generar_datos.py    # datos_legacy.sql + conteos_esperados.json + TABLAS.md
```

Dos corridas producen archivos idénticos byte a byte. Requiere Python 3.12, sin dependencias
externas.

## Verificar (sin SQL Server)

```powershell
python -m pip install sqlglot
python verificar_datos.py               # sintaxis + carga en SQLite + coherencia
python verificar_datos.py --sin-sqlglot # solo carga y coherencia
```

El script comprueba que:

- las cédulas sean únicas por tabla y que ninguna esté a la vez en activos y en egresados;
- cada histórico, reposo, vacación, falta, guardia, etc. apunte a un expediente existente;
- cada ubicación apunte a una zona, estación, área y división existentes, y que la estación
  pertenezca a la zona;
- los conteos por zona sean 90/60 (activos) y 25/15 (egresados);
- la ubicación vigente sea la última del histórico, y la jerarquía y el cargo del
  expediente sean los de la última fila de `HISTORICO_JERARQUIA`;
- los históricos tengan entre 3 y 6 filas de jerarquía y entre 2 y 5 de ubicación, y
  caigan dentro del período de servicio;
- haya 12 reingresos activos y 3 egresados con dos ciclos;
- cada anomalía aparezca exactamente las veces declaradas.

Si algo falla, sale con código 1.

## Cargar en SQL Server

```powershell
python -m pip install pyodbc        # cargar.py lo instala solo si falta
python cargar.py --server "localhost\SQLEXPRESS" --database PERSONALINTEGRADA_DEMO `
                 --driver "ODBC Driver 17 for SQL Server"
# Volver a cargar desde cero:
python cargar.py --server "localhost\SQLEXPRESS" --recrear
# Solo contar filas de una base ya cargada:
python cargar.py --server "localhost\SQLEXPRESS" --solo-conteo
```

- **Autenticación.** Por defecto se usa la integrada de Windows. Para usar autenticación
  SQL, añada `--usuario sa`; la clave se lee de `PERSONALINTEGRADA_DEMO_CLAVE` o se pide por
  teclado, nunca por argumento.
- **Driver.** Si el driver pedido no está instalado, se usa el mejor disponible (18, 17,
  Native Client o `SQL Server`) y se avisa.
- **Base.** Se crea si no existe. Por seguridad, el script se niega a escribir en una base
  llamada `PERSONALINTEGRADA`.
- **Cierre.** Al terminar imprime los conteos por tabla frente a `conteos_esperados.json`
  y el reparto por zona.

Con `sqlcmd`, la alternativa es:
`sqlcmd -S localhost\SQLEXPRESS -E -d PERSONALINTEGRADA_DEMO -f 65001 -i ddl_legacy.sql,datos_legacy.sql`
(la base tiene que existir antes).

## Correr la migración contra el demo

En `apps\migration\.env`:

```
LEGACY_DSN=DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=PERSONALINTEGRADA_DEMO;Trusted_Connection=yes;TrustServerCertificate=yes;
```

Luego: `bomberos-migrate analyze`, `bomberos-migrate migrate` (dry-run) y
`bomberos-migrate migrate --apply`.

## Conteos

### Por tabla (filas demo)

<!-- CONTEOS:INICIO -->
| Tabla | Rol | Filas demo |
|---|---|---:|
| `ZONAS` | canónica | 10 |
| `ESTACIONES` | canónica | 29 |
| `AREAS` | canónica | 17 |
| `DIVISIONES` | canónica | 40 |
| `DEPENDENCIAS` | canónica | 30 |
| `AREA_DEPENDENCIA_OPERATIVA` | canónica | 10 |
| `JERARQUIAS` | canónica | 27 |
| `CARGOS` | canónica | 40 |
| `CONDICIONES` | canónica | 11 |
| `ESTATUS` | canónica | 8 |
| `BANCOS` | canónica | 10 |
| `TIPO_NIVEL_EDUCATIVO` | canónica | 6 |
| `GRUPOSDIAGNOSTICOS` | canónica | 10 |
| `DIAGNOSTICOS` | canónica | 26 |
| `ESPECIALIDADES` | canónica | 8 |
| `MEDICO_TRATANTE` | canónica | 12 |
| `CENTROS_MEDICOS` | canónica | 10 |
| `FALTAS` | canónica | 1 |
| `CURSOS` | canónica | 20 |
| `MARCA_TALLER_RADIO` | canónica | 4 |
| `MODELO_TALLER_RADIO` | canónica | 9 |
| `EQUIPOS_TALLER_RADIO` | canónica | 12 |
| `EQUIPOS_PROTECCION` | canónica | 21 |
| `UNIFORMES` | canónica | 25 |
| `FUNCIONARIOS` | canónica | 150 |
| `FUNCIONARIOS_EGRESADOS` | canónica | 40 |
| `DETALLE_EGRESO` | canónica | 53 |
| `UBICACION_ADMINISTRATIVA` | canónica | 190 |
| `HISTORICO_UBICACION_ADMINISTRATIVA` | canónica | 657 |
| `HISTORICO_JERARQUIA` | canónica | 869 |
| `ASCENSOS` | canónica | 467 |
| `CARGA_FAMILIAR` | canónica | 338 |
| `NIVEL_EDUCATIVO` | canónica | 329 |
| `REPOSOS` | canónica | 315 |
| `Diagnostico_Consulta` | canónica | 70 |
| `VACACIONES` | canónica | 1,593 |
| `RECURRENCIA` | canónica | 87 |
| `ENC_GUARDIAS` | canónica | 10 |
| `DET_GUARDIAS` | canónica | 88 |
| `EVALUACIONES` | canónica | 190 |
| `EVALUACIONES_CURSOS` | canónica | 336 |
| `CONDECORACIONES` | canónica | 90 |
| `JUBILADOS` | canónica | 10 |
| `EQUIPOS_PROTECCION_FUNCIONARIOS` | canónica | 122 |
| `UNIFORMES_FUNCIONARIOS` | canónica | 149 |
| `INVENTARIORADIOS` | canónica | 15 |
| `ASIGNACION_RADIO_INDIVIDUAL` | canónica | 8 |
| `BENEFICIO` | canónica | 150 |
| `REGISTRO_BENEFICIO` | canónica | 666 |
| `ACERVO_HISTORICO_GENERAL` | canónica | 476 |
| `ACCESO` | descartar | 10 |
| `AUDIT_FUNCIONARIOS` | descartar | 40 |
| `AUDIT_HISTORICO_JERARQUIA` | descartar | 20 |
| `FUNCIONARIOS_VIEJA` | descartar | 60 |
| `HISTORICO_JERARQUIA_OLD` | descartar | 100 |
| `REPOSOS_BD_VIEJA` | descartar | 60 |
| `REPOSOS(ORIGINAL)` | descartar | 15 |
| `BENEFICIO_ENE22` | descartar | 100 |
| `Hoja1$` | descartar | 20 |
| `dtproperties` | descartar | 3 |
| **Total** | | **8,292** |
<!-- CONTEOS:FIN -->

### Por zona de la ubicación vigente

<!-- ZONAS:INICIO -->
| Zona | Activos (`FUNCIONARIOS`) | Egresados (`FUNCIONARIOS_EGRESADOS`) |
|---|---:|---:|
| 1 — ZONA 1 CENTRO | **90** | **25** |
| 2 — ZONA 2 OESTE | 10 | 1 |
| 3 — ZONA 3 SUROESTE | 9 | 5 |
| 4 — ZONA 4 SUR | 8 | 2 |
| 5 — ZONA 5 ESTE | 8 | 1 |
| 6 — ZONA 6 CARICUAO | 5 | 1 |
| 7 — COMANDANCIA GENERAL | 7 | 2 |
| 8 — SEDE ADMINISTRATIVA | 8 | 2 |
| 9 — ACADEMIA | 3 | 1 |
| 10 — GRUPOS ESPECIALES | 2 | 0 |
| **Total** | **150** (60 fuera de Z1) | **40** (15 fuera de Z1) |
<!-- ZONAS:FIN -->

Para probar la acotación por zona hay expedientes que estuvieron en la Zona 1 y hoy están
en otra, y al revés. La zona vigente es la que dice `UBICACION_ADMINISTRATIVA`, que coincide
con la última fila de `HISTORICO_UBICACION_ADMINISTRATIVA`.

## Decisiones sobre la estructura

- **`FUNCIONARIOS.COD_UBICACION`.** Se interpreta como el `ID` de la fila del expediente
  en `UBICACION_ADMINISTRATIVA`, que guarda la ubicación vigente (una por cédula).
  `HISTORICO_UBICACION_ADMINISTRATIVA` guarda la trayectoria. Hay que confirmarlo contra el
  real.
- **`CARGA_FAMILIAR.CEDULA`.** Es la cédula del titular, no la del familiar: la tabla no
  tiene otra columna de cédula y sí tiene `TELEFONO_FUN`.
- **`NIVEL_EDUCATIVO`.** No es un catálogo: tiene registros por expediente (5.617 filas en el
  real). El catálogo es `TIPO_NIVEL_EDUCATIVO`, y `FUNCIONARIOS.NIVEL_EDUCATIVO` apunta a su
  `COD_NIVEL`.
- **Textos libres.** `ESTATUS` y `CONDICION` son textos en `FUNCIONARIOS`, no códigos.
  Coinciden con `ESTATUS.DESCRIPCION` y `CONDICIONES.DESCRIPCION` tras `UPPER(TRIM())`; hay
  tres variantes de escritura de «ACTIVO» a propósito.
- **Zonas.** Las zonas 1 a 6 corresponden a Z1–Z6 del destino. Las zonas 7 a 10
  (Comandancia, Sede administrativa, Academia y Grupos especiales) no existen en el
  destino; la migración debe decidir cómo tratarlas.
- **Jerarquías.** Del código 1 al 17 coinciden una a una con `core.jerarquias`, de
  BOMBERO a MAYOR GENERAL. Del 18 al 27 son especiales o de personal no uniformado
  (EMPLEADO ADMINISTRATIVO, OBRERO, ASIMILADO…).
- **Columnas con caracteres especiales.** Se conservan con sus nombres exactos:
  `EVALUACIONES.[DESEMPEÑO]`, `Diagnostico_Consulta.[Código]` y
  `[Centro Asistencial Quien confirma]`, `HISTORICO_JERARQUIA.[Fecha Ultimo Ascenso]`,
  `[REPOSOS(ORIGINAL)]`, `[Hoja1$]`.
- **Única desviación del JSON.** En `Hoja1$`, dos columnas del real llevan el nombre y la
  cédula de una persona real (fila de encabezado de Excel). Se renombraron a valores
  ficticios con el mismo tipo y patrón.
- **Lo que el JSON no informa no se declara.** No hay `IDENTITY`, índices ni claves
  foráneas (el real tiene 0 FK). Los identificadores se insertan de forma explícita.
- **`BANCOS` y `ASIGNACION_RADIO_INDIVIDUAL`.** Están vacías en el real; aquí llevan unas
  pocas filas para que el mapeo se pueda probar.
