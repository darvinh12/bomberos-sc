# Sistema Bomberos Caracas

Rediseño integral del sistema del Cuerpo de Bomberos del Distrito Capital,
migrando desde el sistema legacy en Visual Basic + SQL Server
(`PERSONALINTEGRADA`, ~230 tablas) hacia un stack moderno:

- **BD:** PostgreSQL 16+ (~85 tablas, 15 schemas)
- **API:** FastAPI 0.115 + SQLAlchemy 2 + asyncpg
- **Frontend:** Next.js 14 + TypeScript (próximamente)
- **Infra:** Docker Compose, reverse proxy con TLS, SIEM/audit centralizado

## Estructura (monorepo)

```
sql/                       Esquema PostgreSQL — fuente de verdad de la BD
  01_base.sql              Extensiones, schemas, ENUMs, catálogos, geo, org, seguridad
  02_dominio.sql           Personal, identidad, salud, ops, carrera, equipo, beneficios...
  03_funciones_vistas.sql  Funciones, triggers, vistas, SPs, sincronización
  04_seed.sql              Datos iniciales
  99_run_all.sql           Orquestador

apps/
  api/                     Backend FastAPI (ver apps/api/README.md)
  web/                     Frontend (próximamente)

docs/
  ER.md                    Diagrama entidad-relación (Mermaid)
  schema.dbml              DBML para dbdiagram.io

docker-compose.yml         Stack local (Postgres + API)
```

## Diagrama Entidad-Relación

- **GitHub nativo:** abre [`docs/ER.md`](./docs/ER.md) — se renderiza automáticamente.
- **Interactivo:** copia [`docs/schema.dbml`](./docs/schema.dbml) y pégalo en
  https://dbdiagram.io/d (File → Import → DBML). Permite zoom, pan y exportar a PNG/PDF.

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

## Instalación rápida (Docker)

```powershell
$env:JWT_SECRET_KEY = (python -c "import secrets; print(secrets.token_urlsafe(64))")
docker compose up -d postgres
psql -h localhost -U postgres -d bomberos_caracas -f sql/99_run_all.sql
docker compose up -d api
```

- API: http://localhost:8000/docs
- Login inicial: `admin` / `Admin#2026*` (forzado a cambiar al primer login)

## Seguridad (resumen)

- Credenciales con bcrypt 12 rounds, JWT access (30 min) + refresh (7 días) con rotación
- Bloqueo automático tras 5 intentos fallidos
- Auditoría completa: `aud.log_accesos` (autenticación) + `aud.log_cambios` (datos, JSONB diff)
- Cabeceras OWASP, CORS whitelist, rate-limit, sin docs en producción
- Roles + scopes (zona/estación) preparados para Row-Level Security
- Detalle completo en [`apps/api/README.md`](./apps/api/README.md)

## Estado

| Componente | Estado |
|---|---|
| Esquema BD v2.0.0 (PostgreSQL, 15 schemas, ~85 tablas) | ✅ completo |
| Diagramas ER (Mermaid) + DBML (dbdiagram.io) | ✅ completo |
| API FastAPI v0.2 (~60 endpoints, 11 routers) | ✅ completo |
| Frontend Next.js v0.1 (login + dashboard + 4 módulos) | ✅ scaffolding |
| Datos demo (carga + limpieza) | ✅ scripts SQL listos |
| CI / GitHub Actions (lint + tests) | ✅ |
| Devcontainer (Codespaces ready) | ✅ |
| Documentación pública (Swagger UI estático) | ✅ archivos en `docs/api/` |
| Migración legacy → nueva (BD legacy disponible Lunes) | ⏳ scaffolding en `apps/migration/` |
| Frontend de módulos restantes (carrera, equipo, etc.) | ⏳ |
| MFA TOTP / Redis revocation | ⏳ |

## Vista rápida de la API documentada

Como GitHub Pages no soporta repos privados en plan free, la documentación
estática se sirve abriendo localmente o desde otro hosting:

```bash
# Local — abre el archivo directamente
start docs/api/index.html        # Windows
xdg-open docs/api/index.html     # Linux

# O desde un servidor estático
cd docs && python -m http.server 8080
# → http://localhost:8080/api/   (Swagger UI)
# → http://localhost:8080/api/redoc.html  (ReDoc)
```

Para hosting público (sin pagar GitHub Pro): conectar el repo a **Vercel**
o **Cloudflare Pages** — soportan repos privados gratis. Ver
[`docs/PENDING.md`](./docs/PENDING.md).

## Datos demo

```bash
# Carga 50 funcionarios + reposos + vacaciones + guardias ficticios
psql -d bomberos_caracas -f sql/demo_data.sql

# Limpia todo lo identificable como demo (apellido = '%DEMO')
psql -d bomberos_caracas -f sql/demo_data_clean.sql
```
