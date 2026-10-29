# Tablas del conjunto demostrativo `PERSONALINTEGRADA_DEMO`

Generado por `generar_datos.py` (no editar a mano). Columnas y filas reales salen de
`apps/migration/legacy_inspection_20260504_174805.json`; las filas demo, de esta corrida
(semilla 20260504, corte 2026-05-04).

| # | Tabla | Rol | Columnas (JSON) | Filas en el real | Filas demo | Uso |
|---:|---|---|---:|---:|---:|---|
| 1 | `ZONAS` | canónica | 2 | 10 | 10 | Catálogo de zonas (10 en el real) |
| 2 | `ESTACIONES` | canónica | 8 | 29 | 29 | Catálogo de estaciones (29 en el real) |
| 3 | `AREAS` | canónica | 2 | 17 | 17 | Catálogo de áreas |
| 4 | `DIVISIONES` | canónica | 3 | 191 | 40 | Catálogo de divisiones (cuelgan de un área) |
| 5 | `DEPENDENCIAS` | canónica | 2 | 76 | 30 | Catálogo de dependencias |
| 6 | `AREA_DEPENDENCIA_OPERATIVA` | canónica | 2 | 10 | 10 | Catálogo área/dependencia operativa (guardias) |
| 7 | `JERARQUIAS` | canónica | 2 | 27 | 27 | Catálogo de jerarquías (27 en el real) |
| 8 | `CARGOS` | canónica | 2 | 110 | 40 | Catálogo de cargos |
| 9 | `CONDICIONES` | canónica | 2 | 11 | 11 | Catálogo de condiciones (11 en el real) |
| 10 | `ESTATUS` | canónica | 2 | 8 | 8 | Catálogo de estatus (8 en el real) |
| 11 | `BANCOS` | canónica | 2 | 0 | 10 | Catálogo de bancos (vacío en el real) |
| 12 | `TIPO_NIVEL_EDUCATIVO` | canónica | 4 | 6 | 6 | Catálogo de niveles educativos (6 en el real) |
| 13 | `GRUPOSDIAGNOSTICOS` | canónica | 2 | 35 | 10 | Catálogo de grupos de diagnóstico |
| 14 | `DIAGNOSTICOS` | canónica | 3 | 5,271 | 26 | Catálogo de diagnósticos |
| 15 | `ESPECIALIDADES` | canónica | 2 | 99 | 8 | Catálogo de especialidades médicas |
| 16 | `MEDICO_TRATANTE` | canónica | 7 | 2,892 | 12 | Catálogo de médicos tratantes |
| 17 | `CENTROS_MEDICOS` | canónica | 4 | 1,232 | 10 | Catálogo de centros médicos |
| 18 | `FALTAS` | canónica | 2 | 1 | 1 | Catálogo de faltas (1 sola fila en el real; no es la fuente de faltas) |
| 19 | `CURSOS` | canónica | 5 | 722 | 20 | Catálogo de cursos |
| 20 | `MARCA_TALLER_RADIO` | canónica | 2 | 4 | 4 | Catálogo de marcas de radio |
| 21 | `MODELO_TALLER_RADIO` | canónica | 2 | 9 | 9 | Catálogo de modelos de radio |
| 22 | `EQUIPOS_TALLER_RADIO` | canónica | 2 | 12 | 12 | Catálogo de tipos de equipo de radio |
| 23 | `EQUIPOS_PROTECCION` | canónica | 5 | 6 | 21 | Inventario de equipos de protección |
| 24 | `UNIFORMES` | canónica | 5 | 76 | 25 | Inventario de uniformes |
| 25 | `FUNCIONARIOS` | canónica | 34 | 5,726 | 150 | Expedientes activos |
| 26 | `FUNCIONARIOS_EGRESADOS` | canónica | 36 | 3,285 | 40 | Expedientes egresados (UNION con FUNCIONARIOS) |
| 27 | `DETALLE_EGRESO` | canónica | 6 | 605 | 53 | Detalle de cada egreso |
| 28 | `UBICACION_ADMINISTRATIVA` | canónica | 14 | 5,522 | 190 | Ubicación vigente por expediente |
| 29 | `HISTORICO_UBICACION_ADMINISTRATIVA` | canónica | 10 | 26,341 | 657 | Histórico de ubicaciones |
| 30 | `HISTORICO_JERARQUIA` | canónica | 11 | 30,792 | 869 | Histórico de jerarquías |
| 31 | `ASCENSOS` | canónica | 5 | 16,234 | 467 | Ascensos |
| 32 | `CARGA_FAMILIAR` | canónica | 23 | 51,192 | 338 | Carga familiar |
| 33 | `NIVEL_EDUCATIVO` | canónica | 11 | 5,617 | 329 | Estudios por expediente (no es catálogo) |
| 34 | `REPOSOS` | canónica | 21 | 19,229 | 315 | Reposos médicos (la canónica) |
| 35 | `Diagnostico_Consulta` | canónica | 15 | 39,420 | 70 | Consultas médicas |
| 36 | `VACACIONES` | canónica | 18 | 40,654 | 1,593 | Vacaciones |
| 37 | `RECURRENCIA` | canónica | 10 | 7,436 | 87 | Faltas disciplinarias -> ops.faltas |
| 38 | `ENC_GUARDIAS` | canónica | 11 | 9 | 10 | Encabezado de guardias |
| 39 | `DET_GUARDIAS` | canónica | 8 | 1,461 | 88 | Detalle de guardias |
| 40 | `EVALUACIONES` | canónica | 10 | 52,556 | 190 | Evaluaciones de desempeño |
| 41 | `EVALUACIONES_CURSOS` | canónica | 10 | 11,930 | 336 | Cursos realizados / notas |
| 42 | `CONDECORACIONES` | canónica | 8 | 58,023 | 90 | Condecoraciones |
| 43 | `JUBILADOS` | canónica | 7 | 850 | 10 | Jubilados |
| 44 | `EQUIPOS_PROTECCION_FUNCIONARIOS` | canónica | 5 | 2 | 122 | Equipos de protección por funcionario |
| 45 | `UNIFORMES_FUNCIONARIOS` | canónica | 5 | 1 | 149 | Uniformes por funcionario |
| 46 | `INVENTARIORADIOS` | canónica | 9 | 15 | 15 | Inventario de radios |
| 47 | `ASIGNACION_RADIO_INDIVIDUAL` | canónica | 14 | 0 | 8 | Asignación de radios (vacía en el real) |
| 48 | `BENEFICIO` | canónica | 5 | 2,069 | 150 | Beneficio (la canónica) |
| 49 | `REGISTRO_BENEFICIO` | canónica | 10 | 11,521 | 666 | Registro de beneficios |
| 50 | `ACERVO_HISTORICO_GENERAL` | canónica | 8 | 70,015 | 476 | Acervo documental |
| 51 | `ACCESO` | **descartar** | 15 | 200 | 10 | Usuarios viejos con clave en texto plano |
| 52 | `AUDIT_FUNCIONARIOS` | **descartar** | 71 | 51,575 | 40 | Auditoría legacy |
| 53 | `AUDIT_HISTORICO_JERARQUIA` | **descartar** | 23 | 4,394 | 20 | Auditoría legacy |
| 54 | `FUNCIONARIOS_VIEJA` | **descartar** | 42 | 3,353 | 60 | Copia vieja (_VIEJA) |
| 55 | `HISTORICO_JERARQUIA_OLD` | **descartar** | 11 | 46,213 | 100 | Copia vieja (_OLD) |
| 56 | `REPOSOS_BD_VIEJA` | **descartar** | 5 | 27,271 | 60 | Copia vieja de reposos (_VIEJA) |
| 57 | `REPOSOS(ORIGINAL)` | **descartar** | 10 | 0 | 15 | Copia vieja de reposos ((ORIGINAL)) |
| 58 | `BENEFICIO_ENE22` | **descartar** | 5 | 2,328 | 100 | Instantánea mensual de BENEFICIO |
| 59 | `Hoja1$` | **descartar** | 5 | 2,199 | 20 | Importación puntual desde Excel |
| 60 | `dtproperties` | **descartar** | 7 | 0 | 3 | Tabla de sistema (diagramas de SQL Server 2000) |

Total de filas demo: **8,292** en 60 tablas (10 para descartar).

## Expedientes por zona de la ubicación vigente

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

Reingresos (ingreso → egreso → reintegro): 12 activos y 3 egresados con dos ciclos.

## Anomalías sembradas a propósito

| Tabla | Casos | Descripción |
|---|---:|---|
| `FUNCIONARIOS` | 2 | Dos expedientes comparten CORREO_ELECTRONICO (destino: correo UNIQUE) |
| `FUNCIONARIOS` | 3 | CORREO_ELECTRONICO = 'NO POSEE' (no es correo) |
| `HISTORICO_UBICACION_ADMINISTRATIVA` | 2 | Fila histórica (no vigente) con COD_ZONA distinta a la zona de su estación |
| `DETALLE_EGRESO` | 2 | Reingresos (FECHA_EGRESO+FECHA_REINTEGRO en FUNCIONARIOS) sin fila en DETALLE_EGRESO |
| `REPOSOS` | 6 | Reposo que se solapa parcialmente con otro del mismo funcionario |
| `REPOSOS` | 2 | Reposo duplicado exacto (mismas fechas y NROORDEN, otro ID) |
| `REPOSOS` | 2 | FECHA_FIN anterior a FECHA_INICIO |
| `REPOSOS` | 3 | Reposo de una cédula que no existe en FUNCIONARIOS ni en egresados |
| `VACACIONES` | 2 | Vacación registrada dos veces (mismo período y fechas) |

## Desviaciones respecto al JSON

- `Hoja1$`: dos columnas del real se llaman con el nombre y la cédula de una persona
  real (fila de encabezado de Excel). Se renombraron a `FICTICIO DEMO NOMBRE APELLIDO `
  y `90999999` conservando tipo, posición y el espacio final. Es la única desviación.
- Sin `IDENTITY`, índices ni claves foráneas: el JSON no los reporta (0 FK en el real).

Nota: los catálogos `ZONAS` usan nombres de zona que no son datos personales; las zonas 7–10 (COMANDANCIA GENERAL, SEDE ADMINISTRATIVA, ACADEMIA, GRUPOS ESPECIALES) no existen en el destino.
