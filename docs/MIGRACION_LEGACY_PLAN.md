# Plan de migración legacy → nueva — sesión 2026-05-04

Documento generado tras la **Fase 1: inspección estructural** del legacy
`PERSONALINTEGRADA` (SQL Server, instancia `localhost\SERVIDORDATOS`).

> **Fuente de verdad de los hallazgos:** [`apps/migration/legacy_inspection_20260504_174805.json`](../apps/migration/legacy_inspection_20260504_174805.json)
> (2.8 MB, generado por [`scripts/inspeccionar_legacy.ps1`](../apps/migration/scripts/inspeccionar_legacy.ps1)).

---

## 1. Resultado de la inspección

| Métrica | Valor |
|---|---:|
| Tablas totales | **323** |
| Tablas canónicas (reales) | **283** |
| Tablas basura (`_OLD`, `_VIEJA`, `_2017`, `TEMP*`, snapshots) | **40** |
| Filas reales (sin basura) | **~1,133,000** |
| Foreign keys declarados | **0** |
| Primary keys declarados | 121 / 323 |
| Vistas / Stored Procedures | 66 / 43 |

### 1.1. Distribución por dominio (canónicas)

| Dominio | Tablas | Filas | Notas |
|---|---:|---:|---|
| Catálogos | 30 | 74,051 | Mapeo limpio al schema nuevo |
| Personal | 23 | 147,460 | + 27 sin clasificar relevantes |
| Salud | 26 | 110,391 | Diagnostico_Consulta = 39K, REPOSOS = 19K |
| Ops | 22 | 143,127 | ORDEN_GEN_VOLUN = 95K |
| Carrera | 39 | 481,639 | El más voluminoso. HIST_ESTATUS_PROC_ASCENSO = 316K |
| Equipo | 33 | 548 | Casi vacío — equipos no se ha usado mucho |
| Beneficios | 18 | 33,194 | Múltiples snapshots BENEFICIO_* mensuales |
| Vivienda | 16 | 14,768 | DIRECCION_VIVIENDA = 4.9K |
| Egresos | 6 | 1,684 | JUBILADOS = 850 |
| Documentos | 7 | 77,593 | ACERVO_HISTORICO_GENERAL = 70K |
| Auditoría legacy | 7 | 48,705 | **Se descartan** — el destino tiene `aud.log_cambios` propio |

### 1.2. Top 20 tablas por tamaño

| Tabla | Filas |
|---|---:|
| HIST_ESTATUS_PROC_ASCENSO | 316,619 |
| ORDEN_GEN_VOLUN | 95,606 |
| ACERVO_HISTORICO_GENERAL | 70,015 |
| CONDECORACIONES | 58,023 |
| EVALUACIONES | 52,556 |
| AUDIT_FUNCIONARIOS | 51,575 |
| CARGA_FAMILIAR | 51,192 |
| AUDIT_HISTORICO_UBI_ADM | 43,309 |
| VACACIONES | 40,654 |
| Diagnostico_Consulta | 39,420 |
| HISTORICO_JERARQUIA | 30,792 |
| HISTORICO_UBICACION_ADMINISTRATIVA | 26,341 |
| REPOSOS | 19,229 |
| ASCENSOS | 16,234 |
| HOGARES_PATRIA_GDC | 12,609 |
| EVALUACIONES_CURSOS | 11,930 |
| REGISTRO_BENEFICIO | 11,521 |
| RECURRENCIA | 7,436 |
| ACERVO_HISTORICO_NOMINA | 7,390 |
| FUNCIONARIOS | 5,726 |

---

## 2. Decisiones tomadas

### 2.1. Alcance prioritario

Por decisión del cliente, se prioriza **personal + ops** porque son los dominios
más movidos día a día. Salud, carrera, equipo, beneficios, vivienda, egresos y
documentos vienen en una segunda iteración una vez verificada personal+ops.

### 2.2. Qué SÍ se migra

- Las 283 tablas canónicas, agrupadas por dependencia.
- `FUNCIONARIOS` **UNION** `FUNCIONARIOS_EGRESADOS` para preservar el registro
  histórico completo (los egresados están archivados en una tabla aparte en el
  legacy).
- `RECURRENCIA` legacy se mapea a `ops.faltas` del schema nuevo
  (la tabla `FALTAS` legacy está vacía con 1 sola fila — no es la canónica).
- `ENC_GUARDIAS` + `DET_GUARDIAS` legacy → `ops.guardias` + `ops.guardia_funcionarios`.

### 2.3. Qué NO se migra

| Categoría | Razón |
|---|---|
| Tablas `_OLD`, `_VIEJA`, `_BACKUP`, `_2017`, `TEMP_*`, `(ORIGINAL)` | Snapshots históricos manuales, no canónicos |
| `AUDIT_*` legacy (48K filas) | El destino tiene `aud.log_cambios` propio. Las trazas históricas no afectan operación. |
| `ACCESO` (sistema de usuarios viejo, 200 filas) | Tiene claves en texto plano. Los usuarios se recrean vía admin. |
| Múltiples `BENEFICIO_*` mensuales (`_ENE22`, `_ABRIL2022`, `_oct2021`, etc.) | Snapshots que el cliente sacaba a mano. La canónica es `BENEFICIO`. |
| `Hoja1$`, `MINISTERIO_AGOSTO_2019$`, `LISTA_AGOSTO_2019` | Importaciones puntuales desde Excel — datos ya consolidados en otras tablas |
| `dtproperties`, `sysdiagrams` | Tablas de SQL Server / VS sin valor de negocio |
| BD `ParqueAutomotor` | Confirmado por el cliente: fuera de alcance de esta migración |

---

## 3. Cambios necesarios al schema nuevo (gaps detectados)

Se descubrieron campos/entidades en el legacy que el schema nuevo no contempla.
Para cumplir el requisito **"100% perfecto"** (cero pérdida de información), se
propone una migración SQL incremental:

### 3.1. Archivo propuesto: `sql/06_legacy_extensions.sql`

#### Tablas nuevas

| Tabla | Origen legacy | Filas | Justificación |
|---|---|---:|---|
| `personal.detalles_nacionalidad` | `DETALLES_NACIONALIDAD` | 634 | Datos de naturalización (gaceta, fecha, país origen, idioma) |
| `personal.observaciones` | `DETALLES_OBSERVACIONES` | 691 | Observaciones libres por funcionario × área |
| `ops.orden_general_funcionarios` | `ORDEN_GEN_VOLUN` | 95,606 | Junction n:m: una orden general lista a múltiples funcionarios |
| `ops.apoyo_institucional` | `APOYO_INSTITUCIONAL` | 199 | Apoyo a otras instituciones (semánticamente distinto a comisiones de servicio) |

#### Columnas a agregar

```sql
-- personal.carga_familiar (datos de póliza HCM por familiar)
ALTER TABLE personal.carga_familiar
    ADD COLUMN nro_poliza      TEXT,
    ADD COLUMN ramo_poliza     TEXT,
    ADD COLUMN compania_poliza TEXT,
    ADD COLUMN certificado     TEXT,
    ADD COLUMN vigencia_poliza DATE;

-- ops.vacaciones (datos administrativos legacy)
ALTER TABLE ops.vacaciones
    ADD COLUMN quinquenio          TEXT,
    ADD COLUMN nro_memo            TEXT,
    ADD COLUMN firma               BOOLEAN,
    ADD COLUMN fecha_firma         DATE,
    ADD COLUMN periodos_pendientes TEXT;

-- salud.lesiones (campos de HIGUIENE_SEGURIDAD legacy)
ALTER TABLE salud.lesiones
    ADD COLUMN cedula_testigo1       INT,
    ADD COLUMN cedula_testigo2       INT,
    ADD COLUMN gravedad              TEXT,
    ADD COLUMN cod_actividad         INT,
    ADD COLUMN cod_agente_material   INT,
    ADD COLUMN accion_realizada      TEXT,
    ADD COLUMN portaba_proteccion    BOOLEAN,
    ADD COLUMN utilizo_herramienta   BOOLEAN;
```

### 3.2. Estrategia para columnas opacas

Hay ~30 campos del legacy con propósito **no documentado**:
`CARNET.CHEQUEADO`, `LABORA_AI`, `LABORA_TELE`, `BRIGADISTA`,
`CARGA_FAMILIAR.P_M`, `TIPO_MOVIMIENTO`, `CARNET.LIBRO/FOLIO`,
`COMISION_SERVICIO.RENOSI/RENONO/PTOSI/PTONO`, etc.

#### Plan de tres pasos

1. **Inventario de valores únicos** (pendiente — Fase 2 de la migración):
   correr en el servidor legacy un script que liste **DISTINCT + COUNT por
   columna** para los ~30 campos sospechosos. Esto NO lee filas individuales,
   sólo el menú de valores posibles.

2. **Sesión de clasificación** con cliente (~30 min):
   para cada campo, decidir su **categoría**:

   | Categoría | Acción | Ejemplo |
   |---|---|---|
   | **1. Boolean simple** ('S'/'N', 'SI'/'NO', 'true'/'false') | Columna `BOOLEAN` con nombre claro | `chequeado`, `es_brigadista` |
   | **2. Metadata legal/administrativa** (libros, folios, transacciones) | Columna `TEXT`/`DATE` tipada | `libro_registro`, `folio_registro`, `motivo_impresion` |
   | **3. Genuinamente opaco** (códigos sin diccionario) | Columna `legacy_extra JSONB` | `P_M`, códigos crípticos |

3. **Protocolo de salida del JSONB:**
   - Endpoint admin que muestre qué claves de `legacy_extra` están realmente
     siendo consultadas vs ignoradas.
   - Política: si en 6 meses nadie consulta una clave → se puede borrar.
   - Si alguien la necesita → se promueve a columna real.

---

## 4. Hallazgos sorpresa vs. el código de migración previo

El código existente en [`apps/migration/src/bomberos_migration/transform.py`](../apps/migration/src/bomberos_migration/transform.py)
fue escrito con suposiciones que **no coinciden** con el legacy real:

| Asumido | Real |
|---|---|
| `CEDULA` con prefijo `'V'`/`'E'` parseado | `NACIONALIDAD nvarchar(1)` y `CEDULA numeric(18)` están separadas |
| Buscar `CORREO`/`EMAIL` | Se llama `CORREO_ELECTRONICO` |
| Buscar `TELEFONO_MOVIL`/`CELULAR` | Se llama `TELEFONO_MOBIL` |
| Buscar `NUMERO_EMPLEADO`/`NUM_EMPLEADO` | Se llama `N_EMPLEADO nvarchar(9)` |
| Existe `TIPO_PERSONAL` en `FUNCIONARIOS` | No existe — hay que derivarlo de `COD_CARGO` u otra tabla |
| Existen `IUTB` / `EGRESADO_UNES` en `FUNCIONARIOS` | No existen — están en la tabla `NIVEL_EDUCATIVO` |
| `FUNCIONARIOS` tiene 15 columnas relevantes | `FUNCIONARIOS` tiene **34 columnas** — el código actual perdería >50% de la data |
| `parse_cedula()` con manejo de `'V'`/`'E'`/`'P'` | Sobre-elaborado: ya viene separada en columna |

→ **El `transform.py` actual debe refactorizarse antes de cualquier migración de datos**.

---

## 5. Roadmap de ejecución

### Fase 1 — Inspección estructural ✅ (hecho 2026-05-04)
- Script PowerShell ejecutado en servidor legacy
- JSON con metadata generado y traído al repo
- Análisis y categorización completados

### Fase 2 — Clasificación de campos opacos ⏳ (próxima)
- Generar script de DISTINCT/COUNT por columna sospechosa
- Correr nuevamente por AnyDesk (~15 min)
- Sesión de clasificación con cliente (~30 min)

### Fase 3 — Extensión de schema (después de Fase 2)
- Escribir `sql/06_legacy_extensions.sql` con tablas y columnas finales
- Aplicar a una BD de pruebas vacía
- Validar con `99_run_all.sql`

### Fase 4 — Refactor del código de migración
- Reescribir `transform.py` con los nombres reales de columna y los catálogos lookup
- Reescribir `migrate.py` con orden de dependencia estricto:
  1. Catálogos sin dependencias (`geo`, `org`, `core`, `sys.feriados`, etc.)
  2. `salud.diagnosticos`, `salud.medicos`, `salud.centros_medicos`
  3. `personal.funcionarios` (UNION) + `personal.periodos_servicio`
  4. Históricos personales (`historico_jerarquias`, `historico_ubicaciones`, etc.)
  5. Identidad país (`carnets`, `hogares_patria`, etc.)
  6. Ops (`vacaciones`, `comisiones_servicio`, `guardias`, etc.)
- Tests unitarios para cada transformer

### Fase 5 — Dry-run + apply
- `bomberos-migrate migrate` (dry-run) en BD de pruebas
- Validar reporte de filas leídas/insertadas/descartadas
- `bomberos-migrate migrate --apply` con BD destino limpia
- Validaciones post-migración (counts, integridad referencial, no-orfanos)

### Fase 6 — Cutover
- Apagar app legacy
- Último delta de migración (registros nuevos desde la inspección)
- Encender app nueva
- Plan de rollback documentado

---

## 6. Estado actual del repositorio

Esta rama (`feat/migration-cli-and-funcionario-form`) trae:

- ✅ CLI `bomberos-migrate` ([apps/migration/](../apps/migration/)) con comandos `analyze` y `migrate`
- ✅ Script PowerShell de inspección sin extracción de datos
- ✅ JSON de inspección estructural del legacy real
- ✅ Este plan documentado
- ⏳ Refactor de `transform.py` y `migrate.py` (pendiente Fase 2)
- ⏳ Schema extension `06_legacy_extensions.sql` (pendiente Fase 3)
