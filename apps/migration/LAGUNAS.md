# Lagunas de la migración `PERSONALINTEGRADA` → `bomberos_caracas`

Datos que el destino necesita y que el origen **no trae** según los metadatos reales
(`legacy_inspection_20260504_174805.json`), o cuyo significado no está documentado.
Ninguno se inventa: o se deja en el valor por defecto del destino, o se toma de un
parámetro explícito, o se deriva de otro dato del origen (y se dice de cuál). Las
columnas sin destino claro se conservan en `metadata.legacy_extra` o en
`migracion.trazas.legacy_extra`.

Estado: **VERIFICAR** = hay que confirmarlo con el cliente (visita 2, inventario de valores
opacos de `scripts/inspeccionar_valores_opacos.ps1`).

## 1. Columnas obligatorias del destino sin origen

| Destino | Qué falta en el origen | Qué hace la herramienta | Estado |
|---|---|---|---|
| `personal.funcionarios.tipo_personal` | No existe en `FUNCIONARIOS` (34 columnas). | Queda el valor por defecto del destino (`BOMBERO`). Habría que derivarlo de `COD_CARGO`/`COD_JERARQUIA` con una tabla de equivalencias que el cliente no ha dado (en el demo, jerarquías como `EMPLEADO ADMINISTRATIVO` u `OBRERO` lo sugieren). | VERIFICAR |
| `ops.guardias.hora_inicio` / `hora_fin` (NOT NULL) | `ENC_GUARDIAS` solo trae `HORARIO` (texto: «24 HORAS», «DIURNO»…). | Se toman de `mapping.HORAS_POR_TURNO` (24H 07:00–07:00, DIURNO 07:00–19:00, NOCTURNO 19:00–07:00) y el reporte lo avisa en cada guardia. | VERIFICAR |
| `egresos.jubilados.fecha_jubilacion` (NOT NULL) | `JUBILADOS` no trae fecha de jubilación (solo `FECHA_INGRESO`). | Se usa la `fecha_egreso` del último período de servicio reconstruido; si no hay egreso, la fila se descarta con motivo. | Decisión documentada |
| `carrera.evaluaciones.periodo_id` (NOT NULL) | `EVALUACIONES` no se enlaza con `PERIODOS_EVALUACION` (2 filas). | Período anual `LEG_<año>` según `FECHA`. | Decisión documentada |
| `carrera.evaluaciones.nota_total`, `evaluador_id` | Solo hay notas parciales (`CAPACITACION`, `FISICA`, `DESEMPEÑO`) y `NUMERO_EVALUADOR` de significado desconocido. | `nota_total` queda NULL (no se suma sin regla del cliente); las parciales y el evaluador van a `legacy_extra`. `estatus = APROBADA` por ser histórico cerrado. | VERIFICAR |
| `salud.reposos.tipo_reposo_id` (NOT NULL) | `TIPOREPOSO` viene vacío en algunas filas. | Entrada de catálogo `LEG_NO_ESPECIFICADO` («No especificado (migrado)»). | Decisión documentada |
| `ops.faltas.tipo_falta` / `descripcion` (NOT NULL) | `RECURRENCIA` puede no traer `DESCRIPCION_FALTA` ni `OBSERVACIONES`. | `NO_ESPECIFICADO` y «(sin descripción en el sistema anterior)», con aviso. | Decisión documentada |
| `personal.funcionarios.nacionalidad` | `NACIONALIDAD` puede venir vacía. | Se asume `V` y se avisa. Valores distintos de V/E (p. ej. `P`) se descartan: el destino solo admite V/E. | VERIFICAR |

## 2. Datos del origen cuyo significado no está claro

| Origen | Duda | Tratamiento |
|---|---|---|
| `FUNCIONARIOS.COD_UBICACION` | ¿Es el `ID` de `UBICACION_ADMINISTRATIVA`? No hay FK declarada (el origen tiene 0 FK). | No se usa para la zona; va a `legacy_extra`. La ubicación vigente sale de `UBICACION_ADMINISTRATIVA` (ver README). |
| `CARGA_FAMILIAR.CEDULA` | Es la única cédula de la tabla: se interpreta como la del **titular**. La cédula del familiar no existe. | `carga_familiar.cedula`/`nacionalidad` quedan NULL. VERIFICAR. |
| `CARGA_FAMILIAR.FECHA_INGRESO` | Se interpreta como fecha de inclusión. | → `fecha_inclusion`; si falta, el destino pone la fecha del día (se avisa). |
| `REPOSOS.NROREPOSO` / `NROORDEN` | Cuál es el «folio». | `NROREPOSO` → `folio`; `NROORDEN` → `legacy_extra`. |
| `REPOSOS.COD_INSTITUCION` (`nvarchar(100)`) vs `CENTROS_MEDICOS.COD_INSTITUCION` (`numeric`) | Tipos distintos. | Se intenta como código y, si no es numérico, por nombre. |
| `DIAGNOSTICOS.CODDIAGNOSTICO` | Código interno, **no** CIE-10. | `codigo_cie` queda NULL; se resuelve por nombre (dos códigos con el mismo nombre comparten entrada). |
| `MEDICO_TRATANTE` | No trae nacionalidad. | `salud.medicos.nacionalidad` NULL; `MSAS` → `mpps` (si se repite, el duplicado queda en `legacy_extra`). |
| `TIPO_NIVEL_EDUCATIVO` | Se interpreta como niveles (primaria, bachillerato…), no como «graduado/cursando». | → `core.niveles_educativos`. VERIFICAR (el demo usa esa lectura). |
| `HISTORICO_JERARQUIA.TIPO_DOCUMENTO`, `NIVELACION`, `REFERENCIA` | Sin columna equivalente. | `TIPO_DOCUMENTO` → `motivo`, `NUMERO_DOCUMENTO` → `resolucion`; el resto a la traza. |
| `VACACIONES.FIRMA`, `QUINQUENIO`, `NROMEMO`, `PERIODOSPENDIENTES`… | El plan (§3) propone columnas nuevas en `sql/06_legacy_extensions.sql`, que **no existe**. | Todo a `metadata.legacy_extra`; `autorizado` queda en su valor por defecto (FALSE). Cuando exista el 06 hay que actualizar `mapping.py`. |
| `ESTATUS`, `CONDICION`, `ESTADO_CIVIL`, `PARENTESCO`, `LICENCIA`… | Valores reales sin inventariar (Fase 2 pendiente). | Normalización tolerante con sinónimos; lo desconocido no aborta: queda NULL o en el valor por defecto, el valor original va a `legacy_extra` y el reporte lo avisa. |
| `REPOSOS_ANULADOS` (1.023 filas) | `NROANULADO` ¿apunta a `NROORDEN` o a `NROREPOSO`? | No se marca `anulado`; por eso un reposo anulado que se solape con otro lo rechazará el EXCLUDE (queda en el reporte). Pendiente de confirmar. |
| `UBICACION_ADMINISTRATIVA.DEPENDENCIA` | Texto libre (`nvarchar(max)`), no código. | `dependencia_id` queda NULL; el texto va a `legacy_extra`. |
| `ENC_GUARDIAS.COD_AREA_DEPENDENCIA`, `DET_GUARDIAS.COD_DEPENDENCIA_OPERATIVA` | Catálogo `AREA_DEPENDENCIA_OPERATIVA` sin equivalente directo (`org.areas_operativas` es una tabla puente). | A `legacy_extra`. |
| `OFICIAL_COMANDO` (`ENC_GUARDIAS`) | Es un nombre, no una cédula. | `jefe_guardia_id` queda NULL; el nombre a `legacy_extra`. |

## 3. Diferencias de modelo

- **Jerarquía organizativa invertida.** En el origen la división cuelga del área
  (`DIVISIONES.COD_AREA`); en el destino el área cuelga de la división
  (`org.areas.division_id`). No se fuerza: `division_id` queda NULL y `COD_AREA` de cada
  división se guarda en la traza.
- **Último histórico de un egresado** queda abierto (`fecha_fin` NULL): el origen no dice
  cuándo terminó esa ubicación o jerarquía.
- **Tabla 4.39 del TEG**: no está en el repositorio; el mapa sigue la correspondencia
  descrita en el encargo y en `docs/MIGRACION_LEGACY_PLAN.md`.

## 4. Efectos de los disparadores del destino (`sql/03_funciones_vistas.sql`)

- `tr_periodos_sync` (al insertar períodos) recalcula `funcionarios.estatus` y
  `fecha_primer_ingreso`. Si el estatus del origen contradice sus fechas, gana el de los
  períodos; `validate` lista esos casos en «estatus incoherente».
- `tr_reposos_sync_estatus` pone `REPOSO` a quien tenga un reposo vigente hoy.
- `tr_funcionarios_sync_historicos` solo actúa en UPDATE: en la primera carga no hace nada.
  En una re-ejecución con cambios de jerarquía o ubicación (delta del día del corte)
  inserta una fila `CAMBIO` con la fecha del día, como haría la aplicación.
- La auditoría (`aud.log_cambios`) registra cada alta con `usuario_nombre = 'migracion_legacy'`.

## 5. Fuera del alcance de esta entrega

Las tablas canónicas no mapeadas (carnets, higiene y seguridad, vivienda, condecoraciones,
permisos, comisiones, tiempo en la administración pública, detalles de nacionalidad,
órdenes generales, beneficios, equipo…) se listan con sus filas en cada reporte
(`tablas_canonicas_no_mapeadas`) y en `bomberos-migrate analyze`. No se pierden: no se tocan.
