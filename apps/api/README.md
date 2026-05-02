# Bomberos Caracas — API

Backend FastAPI sobre PostgreSQL 16. La fuente de verdad del esquema vive en
[`../../sql/`](../../sql) — los modelos ORM (SQLAlchemy 2) son una vista parcial
sobre las tablas más usadas; el resto se consulta con SQL directo o reflexión.

## Stack

- **FastAPI 0.115** + Uvicorn — async framework
- **SQLAlchemy 2.0** (async) + asyncpg — ORM/driver
- **Alembic** — migraciones incrementales (cuando aplique)
- **Pydantic v2** + `pydantic-settings`
- **passlib[bcrypt]** + **python-jose** — auth (bcrypt 12 rounds, JWT HS256)
- **structlog** — logs estructurados JSON

## Seguridad implementada

- bcrypt 12 rounds para passwords
- JWT access (30 min) + refresh (7 días) con rotación al refrescar
- Bloqueo de cuenta tras 5 intentos fallidos consecutivos (`MAX_INTENTOS_FALLIDOS`)
- Validación de complejidad al cambiar contraseña (10+ chars, mayús/minús/dígito/especial)
- Rate limit por IP (default 120 req/min, configurable)
- Cabeceras OWASP: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- CORS con whitelist explícita (no `*`)
- Auditoría: cada login/logout/cambio_password va a `aud.log_accesos`. Cada cambio en
  tablas de dominio dispara `aud.log_cambios` (trigger DB) — el API setea
  `app.usuario_id` por sesión PG para que el trigger registre el autor.
- Logs no incluyen request body (evita PII en stdout)
- Mensajes genéricos en login (no revelan si el usuario existe)
- `docs` y `redoc` deshabilitados cuando `APP_ENV=production`

## Pendiente / próxima fase

- MFA TOTP (la columna `mfa_secret` ya existe en BD)
- Lista de revocación de JWT con Redis (para logout inmediato)
- Row-Level Security en PostgreSQL para scope por zona/estación (ya hay tabla
  `seguridad.usuario_scopes`)
- Integración con SIEM / Elastic
- 2FA por correo institucional para acciones críticas

## Desarrollo local

```bash
# 1. Crear venv y dependencias
python -m venv .venv
.venv\Scripts\activate                  # Windows
# source .venv/bin/activate              # Linux/Mac
pip install -e ".[dev]"

# 2. Configurar entorno
copy .env.example .env                   # Windows
# cp .env.example .env                   # Linux/Mac
# Editar JWT_SECRET_KEY con un valor aleatorio largo:
#   python -c "import secrets; print(secrets.token_urlsafe(64))"

# 3. Levantar Postgres + cargar schema (desde la raíz del repo)
docker compose up -d postgres
psql -h localhost -U postgres -d bomberos_caracas -f ../../sql/99_run_all.sql

# 4. Correr API
uvicorn bomberos_api.main:app --reload --port 8000
```

Abrir http://localhost:8000/docs para la UI de Swagger.

## Endpoints v0.2

### Autenticación + perfil
- `POST /auth/login` (OAuth2 form), `/auth/refresh`, `/auth/logout`, `/auth/change-password`
- `GET  /auth/me` — perfil + roles

### Personal
- `GET /funcionarios` — listado con `q`, `estatus`, `zona_id`, `estacion_id`, `jerarquia_id`, paginación
- `GET /funcionarios/{id}` · `POST /funcionarios` (RRHH/ADMIN — crea período #1) · `PATCH /funcionarios/{id}`

### Catálogos (read-only)
- `/catalogos/jerarquias`, `/cargos`, `/condiciones`, `/niveles-educativos`, `/especialidades`,
  `/estados-civiles`, `/grupos-sanguineos`, `/bancos`, `/zonas`, `/estaciones`, `/divisiones`,
  `/areas`, `/dependencias`

### Salud (`MEDICO`/`RRHH`/`ADMIN` para escribir)
- `GET/POST /salud/reposos` · `GET /salud/reposos/{id}` · `PATCH /salud/reposos/{id}`
- `GET/POST /salud/lesiones`
- `GET/POST /salud/evaluacion-fisica`

### Operaciones
- `GET/POST /ops/guardias` · `POST /ops/guardias/{id}/funcionarios` · `POST /ops/guardias/{id}/cerrar`
- `GET/POST /ops/permisos` · `POST /ops/permisos/{id}/autorizar`
- `GET/POST /ops/vacaciones`
- `GET/POST /ops/comisiones`
- `GET/POST /ops/faltas` (INSPECTOR/ADMIN)

### Carrera
- `GET/POST /carrera/cursos-realizados`
- `GET/POST /carrera/evaluaciones` (SUPERVISOR/ADMIN)
- `GET/POST /carrera/ascensos` (RRHH/ADMIN — actualiza la jerarquía actual)
- `GET/POST /carrera/reconocimientos`
- `GET /carrera/meritos` · `POST /carrera/meritos/recalcular/{periodo_id}`

### Equipamiento (LOGISTICA/ADMIN)
- `GET/POST /equipo/proteccion/inventario`
- `POST /equipo/proteccion/asignaciones` · `POST /equipo/proteccion/asignaciones/{id}/devolver`
- `GET/POST /equipo/radios` · `POST /equipo/radios/asignaciones`

### Beneficios
- `GET/POST /beneficios/ayudas` · `PATCH /beneficios/ayudas/{id}` (SUPERVISOR/ADMIN aprueba)
- `GET/POST /beneficios/entregas`

### Egresos (RRHH/ADMIN)
- `GET/POST /egresos/jubilados` (cierra período activo automáticamente)
- `GET/POST /egresos/solicitudes-jubilacion`
- `POST /egresos/fallecimientos`

### Dashboard / vistas
- `GET /dashboard` — resumen institucional (vista `sys.v_dashboard`)
- `GET /dashboard/distribucion-zona`
- `GET /dashboard/inventario-disponible`
- `GET /dashboard/reposos-activos`
- `GET /dashboard/vacaciones-actuales`

### Administración (ADMIN)
- `GET /admin/usuarios` · `POST /admin/usuarios`
- `PATCH /admin/usuarios/{id}` (activar/bloquear)
- `POST /admin/usuarios/{id}/reset-password` (force-change al próximo login)
- `POST/DELETE /admin/usuarios/{id}/roles/{codigo}`

## Tests

```bash
pytest
```

## Estructura

```
src/bomberos_api/
  config.py        Settings (pydantic-settings)
  database.py      Engine async + session factory
  logging.py       structlog config
  main.py          create_app()
  core/
    security.py    bcrypt + JWT
    deps.py        FastAPI dependencies (auth, db, roles)
    middleware.py  Headers OWASP, rate-limit, request-log
  models/          SQLAlchemy ORM (parcial — solo tablas más usadas)
  schemas/         Pydantic v2 (request/response)
  routers/         Endpoints
alembic/           Migraciones (vacío por ahora; el schema vive en ../../sql)
tests/             pytest
```

## Despliegue

- Build imagen: `docker build -t bomberos-api .`
- Producción: detrás de un reverse proxy (nginx/Caddy) con TLS terminado.
  La app solo habla HTTP en `:8000`.
- Variables sensibles vía secret manager (no `.env` en producción).
