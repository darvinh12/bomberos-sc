# Reporte de pruebas — checkpoint nocturno

**Fecha:** 2026-05-02 (sesión nocturna autónoma)

## Backend (apps/api)

### Compilación e importación
- ✅ Python 3.11 venv creado
- ✅ Package instalable con `pip install -e .`
- ✅ Importación de `bomberos_api.main:app` sin errores
- ✅ OpenAPI schema generado: **60 paths**, 11 routers (`auth`, `funcionarios`,
  `catalogos`, `salud`, `ops`, `carrera`, `equipo`, `beneficios`, `egresos`,
  `dashboard`, `admin`)
- ✅ `openapi.json` versionado en `docs/api/openapi.json` (282 KB)

### Tests unitarios
```
tests/test_health.py::test_health                          PASSED
tests/test_health.py::test_security_headers                PASSED
tests/test_health.py::test_openapi_schema_has_all_routers  PASSED
tests/test_security.py::test_password_hash_and_verify      PASSED
tests/test_security.py::test_jwt_roundtrip                 PASSED
tests/test_security.py::test_jwt_wrong_type                PASSED
tests/test_security.py::test_password_complexity_validator PASSED

7 passed in 19.44s
```

### Validaciones de seguridad
- ✅ `bcrypt` cifra y verifica passwords correctamente
- ✅ JWT round-trip (access/refresh) firma y valida
- ✅ JWT rechaza tokens del tipo equivocado
- ✅ Validador de complejidad rechaza:
  - `"12345678aA"` (sin especial)
  - `"abcdefghi1!"` (sin mayúscula)
  - `"ABCDEFGHI1!"` (sin minúscula)
  - `"Abcdefghij!"` (sin dígito)
  - `"Abcdefghi1"` (sin especial)
- ✅ Acepta `"Sup3rPass!2026"` (cumple política)
- ✅ Cabeceras OWASP presentes en respuestas: `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`

### Pruebas pendientes (requieren PostgreSQL en ejecución)
- Login real con `admin` / `Admin#2026*`
- Endpoints CRUD contra BD viva
- Trigger de auditoría (`aud.fn_audit`) registrando cambios

El servicio `postgresql-x64-18` está instalado pero detenido en este sistema.
La política de la sesión bloquea iniciar servicios Windows. Las pruebas E2E
de DB se pueden correr con:
```powershell
Start-Service postgresql-x64-18    # como administrador
psql -U postgres -d bomberos_caracas -f sql/99_run_all.sql
psql -U postgres -d bomberos_caracas -f sql/demo_data.sql
cd apps\api
.venv\Scripts\uvicorn bomberos_api.main:app --reload
```
o vía Docker:
```bash
docker compose up -d postgres
psql -h localhost -U postgres -d bomberos_caracas -f sql/99_run_all.sql
docker compose up -d api
```

## Frontend (apps/web)

### Compilación
- ✅ `npm install`: 487 paquetes (Next 14.2.35 patcheado)
- ✅ `npm run typecheck`: TypeScript sin errores
- ✅ `npm run build`: build de producción exitoso

### Rutas generadas
```
/                       (redirige según sesión)
/_not-found
/dashboard              (server-rendered, autenticado)
/funcionarios           (server-rendered, paginado, búsqueda)
/funcionarios/[id]      (detalle dinámico)
/login                  (estática, server action OAuth2)
/ops/guardias
/ops/vacaciones
/salud/reposos
```

Bundle de primera carga: **87.4 kB** (compartido entre rutas)

### Pruebas pendientes
- Iteración E2E (Playwright) cuando esté la API corriendo
- Test de login real → dashboard

## Datos demo

- ✅ `sql/demo_data.sql` listo (50 funcionarios + reposos + vacaciones + guardias)
- ✅ `sql/demo_data_clean.sql` listo (limpieza idempotente por marcador `%DEMO`)

Pendiente: ejecución real cuando esté Postgres iniciado.

## Documentación

- ✅ Landing institucional: `docs/landing.html`
- ✅ Swagger UI estático: `docs/api/index.html`
- ✅ ReDoc estático: `docs/api/redoc.html`
- ✅ Diagrama ER (Mermaid): `docs/ER.md`
- ✅ Schema DBML: `docs/schema.dbml`
- ✅ Pendientes y bloqueos: `docs/PENDING.md`

## CI / GitHub Actions

- ✅ `.github/workflows/ci.yml` — corre lint + tests con Postgres servicio
- ✅ `.github/workflows/pages.yml` — listo para activar cuando upgrade plan

## Bloqueos externos identificados

1. **GitHub Pages no disponible en repo privado plan free** — usar Vercel/Cloudflare Pages
2. **Servicio Postgres requiere admin** para iniciar
3. **BD legacy `PERSONALINTEGRADA`** — disponible Lunes
