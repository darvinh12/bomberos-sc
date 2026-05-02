# Sistema Bomberos Caracas — Base de Datos

Rediseño completo de la base de datos del Cuerpo de Bomberos del Distrito Capital,
migrando desde un sistema legacy en Visual Basic + SQL Server (`PERSONALINTEGRADA`,
~230 tablas) hacia **PostgreSQL 16+** modernizado.

## Estructura

```
sql/
  01_base.sql              Extensiones, schemas, ENUMs, catálogos, geo, org, seguridad
  02_dominio.sql           Personal, identidad país, salud, ops, carrera, equipo,
                           beneficios, vivienda, egresos, documentos, auditoría
  03_funciones_vistas.sql  Funciones, triggers, vistas, SPs, sincronización
  04_seed.sql              Datos iniciales (catálogos, usuario admin, parámetros)
  99_run_all.sql           Orquestador
```

## Schemas (15)

| Schema       | Descripción                                              |
|--------------|----------------------------------------------------------|
| `core`       | Catálogos compartidos (jerarquías, cargos, etc.)         |
| `geo`        | Estados, municipios, parroquias                          |
| `org`        | Zonas, estaciones, áreas, divisiones, dependencias       |
| `personal`   | Funcionarios, identidad país, períodos de servicio       |
| `salud`      | Reposos, diagnósticos, médicos, lesiones, HCM            |
| `ops`        | Guardias, permisos, vacaciones, comisiones, faltas       |
| `carrera`    | Ascensos, evaluaciones, cursos, condecoraciones, méritos |
| `equipo`     | Protección, uniformes, radios                            |
| `beneficios` | Ayudas económicas, control de entrega                    |
| `vivienda`   | Programas habitacionales, refugios, casos sociales       |
| `egresos`    | Pre-jubilados, jubilados, fallecimientos                 |
| `documentos` | Acervo personal, oficios, actas, firmas autorizadas      |
| `seguridad`  | Usuarios, roles, módulos, permisos, sesiones             |
| `aud`        | Auditoría genérica (JSONB)                               |
| `sys`        | Parámetros, versiones, feriados                          |

## Decisiones clave

- **PostgreSQL 16+** con extensiones `pgcrypto`, `citext`, `pg_trgm`, `unaccent`, `btree_gist`.
- **PK surrogate** `BIGINT IDENTITY` + `UNIQUE(nacionalidad, cedula)` en funcionarios.
- **Períodos de servicio** (`personal.periodos_servicio`) para soportar múltiples
  ingresos/egresos/reingresos por funcionario; `funcionarios.fecha_primer_ingreso` se
  mantiene inmutable.
- **Históricos efectivo-datados** para condición, número de equipo, jerarquía y
  ubicación administrativa con `EXCLUDE` constraints temporales.
- **Cuentas bancarias y licencias de conducir** como tablas con `es_actual` (índice
  único parcial) para trackear renovaciones / cambios.
- **Identidad país conservada**: `carnets`, `carnets_vehiculo`, `historico_carnets`,
  `registro_votacion`, `hogares_patria`, `gdc_habitacional`.
- **Auditoría única** vía `aud.log_cambios` con JSONB diffs y trigger automático
  aplicado a todas las tablas de dominio.
- **`pg_trgm` + GIN** para búsqueda fuzzy de nombres y diagnósticos.
- **Triggers de sincronización** mantienen los snapshots en `funcionarios` (estatus,
  numero_equipo, condicion_id) consistentes con sus tablas históricas.

## Instalación

```powershell
createdb -h localhost -U postgres bomberos_caracas
psql -h localhost -U postgres -d bomberos_caracas -f sql/99_run_all.sql
```

Login inicial: `admin` / `Admin#2026*` (forzado a cambiar al primer ingreso).

## Estado

Versión `2.0.0` — DDL inicial completo. Próximos pasos:
- Script de migración desde el legacy `PERSONALINTEGRADA`
- API / backend
- Frontend (web app sustituye el sistema VB)
