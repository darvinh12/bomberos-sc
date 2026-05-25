# SECURITY.md — Sistema Bomberos Caracas

> Especificación de seguridad y plan de remediación para el despliegue del sistema integral del Cuerpo de Bomberos del Distrito Capital.
>
> **Fecha de auditoría:** 2026-05-19
> **Auditado por:** Claude Opus 4.7 con 5 agentes especializados en paralelo (frontend, backend, BD, infra, dependencias).
> **Alcance:** repo `bomberos-caracas-bd` (API FastAPI + frontend Next.js 14 + Postgres 16 + scripts SQL + Docker/Compose + CI).

---

## 0 · Modelo de amenaza acordado

El producto final correrá en **intranet aislada del Cuerpo de Bomberos**, sin salida a internet, en un único servidor que aloja API + Postgres + reverse proxy. El despliegue actual en Render/Vercel/Neon es **demo público con datos ficticios** y se descarta de esta auditoría salvo cuando revela patrones que se replicarán en intranet.

Actores y vectores que SÍ son prioridad:

| Actor | Vector típico |
|---|---|
| **Funcionario con cuenta legítima** | Accede a datos fuera de su zona/estación (IDOR), enumera usuarios, intenta escalada de rol |
| **Atacante en PC desbloqueada** | Aprovecha sesión activa de otro funcionario durante guardia |
| **Admin de TI / contratista de soporte** | Conexión directa a Postgres, manipulación de logs de auditoría, lectura de hashes/secretos |
| **Insider técnico abusivo** | Modifica auditoría post-hoc, borra evidencia de cambios sensibles |
| **Phishing interno con malware en LAN** | Pivoteo lateral desde un endpoint comprometido, captura de tráfico no cifrado |

Actores y vectores que NO son prioridad (descartados):

- DDoS volumétrico desde internet.
- Web scrapers / bots / SEO poisoning.
- IP allowlist anti-internet en la base de datos.
- HSTS preload, CSP súper estricta anti-XSS de internet, CORS estricto contra dominios maliciosos.
- Rate-limit por IP pública anti-scanner.

---

## 1 · Resumen ejecutivo

El sistema tiene una arquitectura razonable y decisiones correctas en muchas capas (bcrypt 12, JWT con tipos separados, scope schema diseñado en BD, audit trail vía trigger PG, frontend con tokens en HttpOnly cookie sin sinks XSS, queries parametrizadas en toda la API, React auto-escaping respetado). Sin embargo, **el modelo de seguridad está en gran parte declarado pero no aplicado**. Los hallazgos críticos forman cuatro grupos:

1. **Autorización rota a nivel API.** `assert_scope_funcionario` y `_scope_filter` existen pero **solo se usan en el router de funcionarios**. Todos los routers de salud, ops, carrera, equipo, beneficios, egresos y dashboard aceptan `funcionario_id` arbitrario sin verificar scope → cualquier usuario autenticado lee reposos médicos, ascensos, sanciones, equipo y beneficios de cualquier funcionario de cualquier estación.

2. **Defensa en profundidad inexistente en la base de datos.** RLS no está activado en ninguna tabla. No existe un rol PostgreSQL para la app — el conector apunta a `postgres` superuser. La auditoría (`aud.log_cambios`, `aud.log_accesos`) es mutable y borrable por cualquier rol con acceso, sin hash chain ni tamper-evidence. El trigger universal de auditoría loguea `password_hash`, `mfa_secret` y `token_recuperacion` en el JSONB diff.

3. **Lockout y audit trail rotos por gestión de transacción.** En login fallido se incrementa `intentos_fallidos` e inserta `LOGIN_FALLIDO` en `aud.log_accesos`, luego se lanza `HTTPException` → `get_session` hace rollback de toda la transacción → ningún intento fallido se persiste, ningún lockout ocurre, y no hay rastro forense.

4. **Stack de despliegue no apto para intranet.** Postgres expuesto a `0.0.0.0:5432`, credenciales por defecto en `docker-compose.yml`, sin reverse proxy con TLS, sin backups automáticos, sin network isolation, contenedores sin hardening (`cap_drop`, `read_only`, `no-new-privileges`), `.dockerignore` arrastra `.git/` al contexto, `BOOTSTRAP_ADMIN_PASSWORD` sin validación de complejidad.

Hay además dos hallazgos importantes en dependencias (`python-jose 3.3.0` con CVE-2024-33663/33664; `passlib` sin mantenimiento desde 2020) y varios P1-P2 en frontend (modo demo activo en producción, server actions sin validación zod, sin auto-logout, sin CSP).

**Estimación de esfuerzo de remediación hasta apto-para-producción-intranet:** 4-6 sprints de un dev senior. Los P0 absorben ~70% del esfuerzo.

---

## 2 · Tabla maestra de hallazgos

Severidades:
- **P0** — bloquea producción. Vulnerabilidad explotable por insider con cuenta legítima.
- **P1** — alto. Debilita controles, hace forense difícil, o permite escalada con esfuerzo.
- **P2** — medio. Defense in depth ausente, no exploit directo.
- **P3** — bajo / informativo. Calidad, deuda técnica, gaps menores.

### P0 — Críticos (bloquean go-live en intranet)

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| P0-1 | API authz | Routers de salud, ops, carrera, equipo, beneficios, egresos, dashboard **no llaman `assert_scope_funcionario`** ni filtran listas por scope. IDOR masivo entre zonas/estaciones. | `routers/salud.py`, `ops.py`, `carrera.py`, `equipo.py`, `beneficios.py`, `egresos.py`, `dashboard.py` |
| P0-2 | API auth | `intentos_fallidos` y `LOGIN_FALLIDO` se rollbackean en login fallido por `get_session` cerrando la tx con `HTTPException`. Brute-force ilimitado y sin rastro. | `database.py:67-76` + `routers/auth.py:113-125` |
| P0-3 | BD | **RLS no activado** en ninguna tabla. Toda la lógica de scope vive solo en la app. Un bypass del API (SQLi futuro, conexión directa, error en código) entrega todo. | `sql/01_base.sql`, `02_dominio.sql` (ningún `ENABLE ROW LEVEL SECURITY`) |
| P0-4 | BD | **Sin rol PostgreSQL separado** para la app. El instalador y la app corren como `postgres` superuser (`BYPASSRLS` implícito). | `sql/99_run_all.sql`, `docker-compose.yml:7` |
| P0-5 | BD | **Auditoría mutable.** `aud.log_cambios` y `aud.log_accesos` sin `REVOKE UPDATE/DELETE`, sin trigger anti-modificación, sin hash chain. Un admin BD borra evidencia sin rastro. | `sql/02_dominio.sql:1634-1668` |
| P0-6 | BD | **`aud.fn_audit` loguea `password_hash`, `mfa_secret`, `token_recuperacion`** en el JSONB de diff. Cualquier auditor con SELECT en `aud.*` extrae todos los hashes y secretos MFA históricos. | `sql/03_funciones_vistas.sql:97-144` |
| P0-7 | API health | `/health/db-diag` y `/health/schema` **sin autenticación** filtran versión Postgres, current_user, estado del admin (`bloqueado`, `intentos_fallidos`, `length(password_hash)`). | `routers/health.py:23-99` |
| P0-8 | API deps | `python-jose >=3.3.0` afectado por **CVE-2024-33663** (algorithm confusion) y **CVE-2024-33664** (DoS por JWE comprimido). Sin upper bound, sin parche upstream confirmado. | `apps/api/pyproject.toml:16` |
| P0-9 | API auth | `JWT_SECRET_KEY` con default `"dev-secret-change-me"` y `min_length=16` permite arrancar producción con secreto débil. HS256 (simétrico) sin `iss`/`aud`/`jti`, sin lista de revocación → logout no invalida tokens. | `config.py:30`, `core/security.py` |
| P0-10 | API auth | **Lockout permanente** sin auto-unlock. 5 fallos → bloqueo definitivo hasta admin. DoS de cuenta admin trivial (5 logins fallidos en `admin`). | `routers/auth.py:114-116` |
| P0-11 | API auth | **Username enumeration por timing.** Path "usuario inexistente" ~5ms; path con bcrypt ~250ms. Un funcionario curioso enumera todos los usernames del sistema. | `routers/auth.py:86-91` |
| P0-12 | Infra | **Postgres expuesto a `0.0.0.0:5432`** en `docker-compose.yml`. Cualquier host de la LAN intranet alcanza Postgres directamente, salta el API. | `docker-compose.yml:11-12` |
| P0-13 | Infra | **Credenciales por defecto** `postgres/postgres` y `JWT_SECRET_KEY=cambiar-esto-...` hardcoded en `docker-compose.yml`. | `docker-compose.yml:7-9, 34-35` |
| P0-14 | Infra | **`BOOTSTRAP_ADMIN_PASSWORD` sin validación de complejidad** (DEPLOY.md miente al afirmar que sí). Acepta `admin`, `1`, vacío. | `scripts/bootstrap.py:107-145`, `DEPLOY.md:42-44` |
| P0-15 | Infra | **`.dockerignore` insuficiente.** Build context = repo root, pero solo hay `apps/api/.dockerignore`. Resultado: `.git/`, `bootstrap_logs.json`, `.vercel/`, `.next/`, `node_modules` se mandan al daemon en cada build. | falta `/.dockerignore` en raíz |
| P0-16 | Infra | **No hay reverse proxy con TLS.** Auth en HTTP plano dentro de la LAN: cualquier `tcpdump` captura passwords. README dice "detrás de un reverse proxy" pero no hay config. | no existe `caddy/nginx` en el repo |
| P0-17 | Infra | **No hay sistema de backups.** Sin `pg_dump` automatizado, sin cifrado, sin off-server. Ransomware en LAN = pérdida total. | no existe en `docker-compose.yml` |

### P1 — Altos

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| P1-1 | API authz | Server Actions de `/admin/*` en Next solo validan `requireAuth()`, no rol. Backend FastAPI **debe** revalidar `require_role("ADMIN")` (lo hace) pero el patrón es frágil. | `apps/web/src/app/(app)/admin/*/actions.ts` |
| P1-2 | API auth | `refresh_token` emite nuevo refresh pero **no revoca el viejo**. Sin reuse detection. Si atacante captura un refresh, lo usa hasta `exp` (7 días) en paralelo al usuario legítimo. | `routers/auth.py:156-187` |
| P1-3 | API auth | `change-password` no rota JWTs ni invalida sesiones activas. Atacante físico cambia password y mantiene sesión paralela. | `routers/auth.py:212-239` |
| P1-4 | API | `integrity_409` devuelve `e.orig` crudo al cliente. Enumera correos, nombres de constraint, columnas. | `core/crud.py:44-48` |
| P1-5 | API | **`X-Forwarded-For` confiado sin validación**. Cualquier cliente falsifica IP de auditoría y de rate-limit. | `core/middleware.py:53`, `routers/auth.py:63` |
| P1-6 | API | **Rate-limit in-memory** se multiplica por workers (`WEB_CONCURRENCY=2` → 240/min real), tiene memory leak (dict crece sin tope), y **no diferencia `/auth/login`** del resto. 120/min en login = brute force friendly. | `core/middleware.py:39` |
| P1-7 | API | `marcar_asistencia` y `devolver_proteccion` usan anti-pattern `Annotated[..., Depends()] = ...` que puede romper inyección en upgrades. | `routers/ops.py:127-134`, `routers/equipo.py:136-143` |
| P1-8 | API | `crear_usuario` permite a cualquier ADMIN crear otro ADMIN ilimitadamente. Sin segregación SUPER_ADMIN. | `routers/admin.py:112-140` |
| P1-9 | Frontend | **Modo demo presente en producción.** `RoleSwitcher` renderizado incondicionalmente, `bcd_demo_role` cookie con `httpOnly: false`, ramas `if (isDemoMode())` en server actions, `src/lib/demo-fixtures.ts`. Limpiar antes del cutover. | `apps/web/src/app/(app)/layout.tsx:150`, `actions/demo.ts:13` |
| P1-10 | Frontend | **Server Actions de admin sin role check propio**. Solo gate en página. Las actions son endpoints reales con ID determinista, invocables vía POST por cualquier autenticado. Depende de backend para no romperse. | `apps/web/src/app/(app)/admin/**/actions.ts` |
| P1-11 | Frontend | **Sin validación zod** en server actions. Zod está en deps pero no se usa. Coerce con `String()`/`Number()` sin schema. | todas las `actions.ts` |
| P1-12 | BD | `mfa_secret` y `token_recuperacion` en **texto plano**. `pgcrypto` cargado pero no usado. Si la BD se filtra, suplantación MFA inmediata. | `sql/01_base.sql:492, 495` |
| P1-13 | BD | **Vistas sin `security_invoker=true`**. En PG 16 las vistas corren con privilegios del owner (probablemente `postgres` superuser) → **bypasean RLS** de las tablas subyacentes cuando RLS se active. | `sql/03_funciones_vistas.sql:204, 294, 322, 350, 370, 388` |
| P1-14 | BD | Funciones (`fn_audit`, `fn_attach_audit`, `fn_sync_*`, `fn_set_updated_at`) **sin `SET search_path` fijo**. Si alguna se promueve a `SECURITY DEFINER`, hijack via objeto homónimo en `public`. | `sql/03_funciones_vistas.sql:97, 147, 452, 614, 676, 706` |
| P1-15 | Infra | **Sin contenedor hardening**: faltan `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, `read_only: true`, `pids_limit`, `mem_limit`, `cpus`. | `docker-compose.yml` completo |
| P1-16 | Infra | **Sin network isolation.** Usa la default bridge. En intranet final debería haber `backend` (`internal: true`) y `frontend`. | `docker-compose.yml` |
| P1-17 | Infra | `bcrypt==4.0.1` pin estricto + `passlib` sin updates desde 2020. Bloquea fixes menores; passlib es supply chain risk creciente. | `apps/api/pyproject.toml:14-15` |
| P1-18 | Infra | CI con `permissions:` no declarado → `GITHUB_TOKEN` con permisos default amplios. Actions sin pin a SHA. JWT_SECRET de test en plaintext. | `.github/workflows/ci.yml` |
| P1-19 | Infra | **`HEALTHCHECK` requiere `curl`** en runtime → paquete extra. Reemplazar por one-liner Python. | `apps/api/Dockerfile:35, 53-54` |
| P1-20 | Infra | **Bootstrap silencia fallos** con `sys.exit(0)` aunque `_apply_sql_files` lance. BD inconsistente, API arranca igual. | `scripts/bootstrap.py:101-103, 199-206` |

### P2 — Medios

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| P2-1 | API | Dashboard agrega **sin scope**. Jefe de zona ve KPIs nacionales. | `routers/dashboard.py`, `sys.v_dashboard` |
| P2-2 | API | **Sin `extra="forbid"` en schemas Pydantic.** Defaults `ignore` permite payloads no documentados sin error. | `apps/api/src/bomberos_api/schemas/*.py` |
| P2-3 | API | `set_audit_ctx` no se llama en GET/listados → contexto `app.usuario_id` ausente en lecturas auditadas (relevante con `pgaudit`). | todos los routers |
| P2-4 | API | `recalcular_meritos` SP largo sin throttling. DoS interno trivial. | `routers/carrera.py:221-230` |
| P2-5 | API | `ChangePasswordRequest` permite oscilar entre 2 passwords históricas. Sin `password_history`. | `schemas/auth.py:24-39` |
| P2-6 | API | `POST /auth/logout` **no revoca** el JWT (best-effort). Modelo "PC desbloqueada": logout no cierra nada hasta expirar. | `routers/auth.py:242-251` |
| P2-7 | API | `/health/db` exento de rate-limit, consume pool con conexión real cada request. | `core/middleware.py:50` |
| P2-8 | API | **CSP con `style-src 'unsafe-inline'`**, falta `connect-src`, `font-src`, `worker-src 'none'`, `base-uri 'none'`. | `core/middleware.py:33` |
| P2-9 | API | CORS con `allow_credentials=True` + lista. Documentar; si migra a cookie HttpOnly añadir CSRF token. | `main.py:62-70` |
| P2-10 | API | `set_config('app.usuario_id', ..., true)` viaja en tx. Verificar que ninguna escritura ocurre fuera de la tx que lo seteó. | `routers/auth.py:36-42` |
| P2-11 | Frontend | **Sin auto-logout por inactividad.** PC desbloqueada = sesión activa indefinida. `sesion_timeout_min` existe como metadato del backend pero no se aplica. | `apps/web/src/app/(app)/layout.tsx` |
| P2-12 | Frontend | **Sin `middleware.ts`**. Toda la autz vive en RSC layout — sin defense in depth ante nuevo route handler que olvide `getAccessToken()`. | falta `apps/web/src/middleware.ts` |
| P2-13 | Frontend | **Sin CSP en Next.** Hay X-Frame-Options, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, pero falta CSP. | `apps/web/next.config.mjs:5-15` |
| P2-14 | Frontend | Cookies `bcd_demo_*` con `httpOnly: false` persisten en navegadores aun después de bajar el flag. Limpiar al desmontar demo. | `apps/web/src/app/(app)/admin/**/actions.ts` (varios) |
| P2-15 | Frontend | **Sin `error.tsx`/`global-error.tsx`**. Genérico funciona pero conviene boundary explícito que asegure no filtrar `error.message`. | falta en `apps/web/src/app/` |
| P2-16 | BD | `seguridad.usuario_scopes` semántica de NULL ambigua ("solo zona X" vs "zona X, cualquier estación"). Documentar y reflejar en policy RLS. | `sql/01_base.sql:526-537` |
| P2-17 | BD | Triggers de sincronización **no bloquean UPDATE directo** a columnas snapshot en `funcionarios`. Admin BD altera estatus saltándose históricos. | `sql/03_funciones_vistas.sql:452, 614, 676, 706` |
| P2-18 | BD | `sys.parametros.sensible BOOLEAN` flag presente pero no se aplica (no filtra vista, no cifra valor). | `sql/01_base.sql:419` |
| P2-19 | BD | `personal.fn_buscar` usa `ILIKE '%'||p_busqueda||'%'` sin longitud mínima → DoS por scan completo. | `sql/03_funciones_vistas.sql:422-424` |
| P2-20 | Infra | Imágenes base sin pin por digest (`python:3.12-slim`, `postgres:16-alpine`). En intranet sin internet no se puede re-pullar la misma. | `apps/api/Dockerfile`, `docker-compose.yml` |
| P2-21 | Infra | `render.yaml`/`railway.toml`/`vercel.json` arrastrarán patrones inseguros a futuras decisiones — eliminar tras cutover. | varios |
| P2-22 | Infra | **Sin log aggregation ni rotación.** Falta `logging:` driver con `max-size`/`max-file` en compose. | `docker-compose.yml` |

### P3 — Bajos / informativos

| # | Área | Hallazgo |
|---|---|---|
| P3-1 | API | `RequestLogMiddleware` sin `request_id` ni `user_id` → correlación difícil con `aud.log_*`. |
| P3-2 | API | `database.py:46` `echo=s.app_debug` → si alguien deja `APP_DEBUG=true`, queries con `password_hash` van a stdout. |
| P3-3 | API | Sin tests de seguridad reales. `test_security.py` solo cubre hash/JWT roundtrip. Falta `test_login_lockout`, `test_scope_bypass`, `test_role_escalation`, `test_admin_only_endpoints`. |
| P3-4 | API | `message === "NEXT_REDIRECT"` repetido en frontend en ~22 archivos. Usar `isRedirectError()` de Next 14. |
| P3-5 | API | `api.ts:10` fallback `http://localhost:8000` si `NEXT_PUBLIC_API_URL` no está. Lanzar excepción en build. |
| P3-6 | BD | `eslint 8` EOL (oct 2024). Sin CVE crítico activo pero sin futuros parches. Migrar a 9. |
| P3-7 | BD | `core.proveedores.correo CITEXT` sin UNIQUE → posibles duplicados. |
| P3-8 | BD | Admin con password literal `Admin#2026*` commiteado en `04_seed.sql:535`. Aunque está `debe_cambiar_password=TRUE`, queda en repo y en `RAISE NOTICE`. |

---

## 3 · Plan de remediación priorizado

### Sprint 0 — Antes de empezar codificación (1-2 días)

Acciones de housekeeping antes de meter mano al código:

- [ ] Decidir si la rama `main` actual se sigue desplegando en Render o se apaga el demo (no hay impacto técnico al cerrarlo: BD ficticia).
- [ ] Documentar este `SECURITY.md` en el README principal del repo como gate obligatorio para producción.
- [ ] Crear `apps/api/SECURITY-TESTS.md` con la lista de tests de seguridad a escribir (P3-3 amplificado).
- [ ] Reemplazar `python-jose` por `PyJWT` y `passlib` por `bcrypt` directo en una rama experimental para validar drop-in (afecta `core/security.py`).

### Sprint 1 — P0 de aplicación (1 semana, 1 dev senior)

Bloquea: cualquier deploy en intranet. Sin esto el sistema es inseguro por diseño.

**Backend API:**
- [ ] **P0-1:** Aplicar `assert_scope_funcionario` en todos los endpoints que aceptan `funcionario_id` (salud, ops, carrera, equipo, beneficios, egresos). Aplicar `_scope_filter` en listados. Cubrir con tests E2E que verifiquen 403 cross-scope.
- [ ] **P0-2:** Refactor de `get_session` para que `LOGIN_FALLIDO` y `intentos_fallidos` se persistan aun con `HTTPException`. Opción simple: `session.commit()` explícito antes de `raise` en `routers/auth.py`. Opción robusta: sesión separada solo para audit inserts.
- [ ] **P0-7:** Mover `/health/db-diag` y `/health/schema` detrás de `require_role("ADMIN")`, o eliminarlos cuando `is_production`.
- [ ] **P0-8:** Reemplazar `python-jose` por `PyJWT>=2.10.0`. Pin con upper bound (`pyjwt>=2.10,<3`). Mantener algoritmo HS256 por ahora (migración a RS256 en Sprint 2).
- [ ] **P0-9:** Eliminar default `dev-secret-change-me`. Forzar `JWT_SECRET_KEY` como required con `Field(...)` sin default; fallo de arranque si falta. Min length 64.
- [ ] **P0-10:** Lockout temporal exponencial. Añadir `seguridad.usuarios.bloqueado_hasta TIMESTAMPTZ`. 5 fallos → 5 min; siguiente serie → 15 min; siguiente → 1 h; tras 3 escaladas → bloqueo permanente. Auto-unlock cuando `bloqueado_hasta < now()`.
- [ ] **P0-11:** Timing-safe login. En la rama "usuario inexistente" ejecutar `verify_password("dummy", FAKE_HASH)` para igualar tiempos.

**Base de datos:**
- [ ] **P0-3 + P0-4:** Crear rol `bomberos_app` (`NOSUPERUSER`, `NOBYPASSRLS`). Activar RLS en `personal.funcionarios`, `salud.*`, `ops.*`, `carrera.*`, `beneficios.*`, `egresos.*`, `documentos.*`, `seguridad.usuarios`. Policies basadas en `current_setting('app.usuario_id')` + `seguridad.usuario_scopes`. Documentar políticas en `sql/06_rls.sql` nuevo.
- [ ] **P0-5:** `REVOKE UPDATE, DELETE, TRUNCATE ON aud.* FROM PUBLIC`. Trigger `BEFORE UPDATE OR DELETE OR TRUNCATE` que lanza excepción. Añadir columnas `prev_hash`, `record_hash` a `aud.log_cambios` y `aud.log_accesos`. Modificar `fn_audit` para encadenar hashes SHA-256.
- [ ] **P0-6:** Filtrar columnas sensibles en `aud.fn_audit`:
  ```sql
  v_old := to_jsonb(OLD) - ARRAY['password_hash','mfa_secret','token_recuperacion','token_hash'];
  v_new := to_jsonb(NEW) - ARRAY['password_hash','mfa_secret','token_recuperacion','token_hash'];
  ```
  Verificar que ningún campo nuevo agregado al esquema se filtre.

**Infraestructura:**
- [ ] **P0-12:** Eliminar `ports: 5432:5432` en `docker-compose.yml`. Postgres solo accesible por red interna del compose.
- [ ] **P0-13:** Convertir defaults a `${VAR:?required}`. Mover credenciales a `env_file: /etc/bomberos/secrets/api.env` con perms 600.
- [ ] **P0-14:** Validar `BOOTSTRAP_ADMIN_PASSWORD` con la misma regex de `change-password` (10+ chars con clases). Rechazar arranque si débil.
- [ ] **P0-15:** Crear `/.dockerignore` en raíz que excluya todo salvo `apps/api/`, `sql/`, `pyproject.toml`, `alembic/`.
- [ ] **P0-16:** Añadir servicio `caddy` al compose con TLS auto-firmado (CA interna del Distrito Capital). Postgres y API jamás expuestos al host.
- [ ] **P0-17:** Añadir servicio `pgbackup` (alpine + `pg_dump` + `gpg`). Cron 6h. Output a volumen separado, cifrado con clave en cold storage. Documentar restore en `docs/RESTORE.md`.

**Frontend:**
- [ ] **P1-9:** Eliminar `src/lib/demo-fixtures.ts`, `src/app/actions/demo.ts`, `components/layout/RoleSwitcher.tsx`. Limpiar todas las ramas `if (isDemoMode())` en server actions. Commit independiente, fácil de revisar.

### Sprint 2 — P1 importantes (2 semanas)

**Backend API:**
- [ ] **P1-2:** Tabla `seguridad.refresh_tokens(jti, usuario_id, emitido_en, revocado_en, usado_en)`. Endpoint `/auth/refresh` marca el viejo `usado`; si llega un `usado` de nuevo → revocar TODA la familia. Reuse detection clásico.
- [ ] **P1-3:** En `change-password` invalidar todos los refresh del usuario (`UPDATE seguridad.refresh_tokens SET revocado_en=now()`). Emitir nuevo par de tokens.
- [ ] **P1-4:** En `core/crud.py` reemplazar `f"... {e.orig}"` por mensaje genérico; log `e.orig` solo a structlog.
- [ ] **P1-5:** Confiar en `X-Forwarded-For` solo si la conexión viene de un proxy de allowlist. Usar último valor del header cuando la cadena de proxies es conocida.
- [ ] **P1-6:** Rate-limit dedicado para `/auth/login`: 5/min por IP **y** por username. Fallback in-memory aceptable en single-host, pero con barrido periódico para evitar leak.
- [ ] **P1-7:** Quitar `= ...` de los `Annotated[..., Depends()]`. Mover `asistio`/`motivo_inasistencia` de query a body.
- [ ] **P1-8:** Introducir rol `SUPER_ADMIN`. Solo SUPER_ADMIN puede asignar `ADMIN`. ADMIN regular asigna roles operativos. Migration en `sql/04_seed.sql`.

**Frontend:**
- [ ] **P1-10:** Helper `requireServerRole(["ADMIN"])` que llama `/auth/me` y verifica rol al inicio de cada server action sensible.
- [ ] **P1-11:** Schema zod por server action. `schema.safeParse(payload)` antes de `api.post`. Tipos derivados con `z.infer<>`.

**Base de datos:**
- [ ] **P1-12:** Cifrar `mfa_secret` y `token_recuperacion` con `pgp_sym_encrypt(secret, current_setting('app.kms_key'))`. Key en `/etc/bomberos/kms.key` propiedad `root` 600.
- [ ] **P1-13:** `ALTER VIEW ... SET (security_invoker = true)` en todas las vistas de schemas con datos personales.
- [ ] **P1-14:** `SET search_path = pg_catalog, <schema>, public` en `fn_audit`, `fn_attach_audit`, `fn_sync_*`, `fn_set_updated_at`, `fn_buscar`, `fn_calcular_merito`, `fn_recalcular_meritos_periodo`, `fn_registrar_ingreso`, `fn_registrar_egreso`.

**Infra:**
- [ ] **P1-15:** Añadir a cada servicio del compose:
  ```yaml
  security_opt: ["no-new-privileges:true"]
  cap_drop: ["ALL"]
  read_only: true
  tmpfs: ["/tmp", "/run"]
  pids_limit: 200
  mem_limit: 1g
  cpus: 1.0
  ```
- [ ] **P1-16:** Definir `networks: backend (internal: true)`, `frontend`. Postgres solo en `backend`. Caddy en `frontend`+`backend`. API en ambas.
- [ ] **P1-17:** Eliminar `passlib`. Migrar `core/security.py` a `bcrypt` directo (`bcrypt.hashpw`, `bcrypt.checkpw`). Subir a `bcrypt>=4.2.1,<5`.
- [ ] **P1-18:** En `.github/workflows/ci.yml` añadir `permissions: contents: read` top-level. Pinear actions con SHA full. Cambiar `JWT_SECRET_KEY` de test a `${{ secrets.JWT_SECRET_TEST }}`.
- [ ] **P1-19:** Reemplazar HEALTHCHECK por `python -c "import urllib.request,os; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/health')"`. Eliminar `curl` del apt-get.
- [ ] **P1-20:** Bootstrap: fallar duro (`raise SystemExit(1)`) si `_apply_sql_files` o `_ensure_admin_user` lanzan.

### Sprint 3 — Hardening avanzado (1-2 semanas)

**API:**
- [ ] **MFA TOTP obligatorio** para roles ADMIN, RRHH, MEDICO. Flujo `/auth/mfa/enroll` (genera secret + QR), `/auth/mfa/verify` (confirma 6-dígitos), `/auth/login` exige código si `mfa_activo`. Usar `pyotp`.
- [ ] **JWT RS256** o **EdDSA**. Llave privada en `/etc/bomberos/jwt-private.pem` 600 root. Verificar con pública. Soporte de key rotation con `kid`.
- [ ] **Denylist de JWT** por `jti` en tabla `seguridad.tokens_revocados`. Logout real.
- [ ] **Password history** últimas 10. Rechazar reuso.
- [ ] **Tests de seguridad completos** (`test_login_lockout`, `test_scope_bypass`, `test_role_escalation`, `test_admin_only_endpoints`, `test_idor_*`).
- [ ] **`extra="forbid"`** en todos los schemas `*Create`/`*Update` (P2-2).
- [ ] **Request ID middleware** que correlaciona logs con audit (P3-1).
- [ ] **Dashboard scope-aware** — vistas parametrizadas o filtro en SQL recibiendo scope (P2-1).

**Frontend:**
- [ ] **Auto-logout por inactividad.** Hook `useIdleLogout(N)` en `(app)/layout.tsx`. Leer N de `/auth/me` (parámetro `sesion_timeout_min`).
- [ ] **`middleware.ts`** con matcher `/((?!login|api/auth|_next).*)` que redirija si falta cookie `bcd_access`. Defense in depth.
- [ ] **CSP en Next** con nonce dinámico para scripts. `connect-src` apuntando solo al dominio interno de la API.
- [ ] **`error.tsx` + `global-error.tsx`** con mensaje neutro.

**Infra:**
- [ ] **TLS interno con CA propia.** Generar CA del Cuerpo de Bomberos con `step-ca`. Distribuir root cert a las PCs vía GPO/script. Caddy emite leaf certs.
- [ ] **Log aggregation:** Loki + Promtail en el mismo host. Rotación en compose (`max-size: 10m max-file: 7`).
- [ ] **Mirror local de PyPI y npm.** `devpi` para PyPI (paquetes pinneados con hashes), `Verdaccio` para npm. Sin internet, sin mirror = sin actualizaciones.
- [ ] **Registry Docker local.** `registry:2` en LAN. `docker save`/`docker load` con USB curado para nuevas versiones.
- [ ] **SBOM en CI:** `cyclonedx-py` y `@cyclonedx/cyclonedx-npm`. Guardar con cada release.
- [ ] **`pip-audit` y `npm audit` en CI** con falla bloqueante por severidad ≥ High.

### Sprint 4 — Operación y políticas (paralelo)

- [ ] **Hardening del SO** (Debian 12 / RHEL 9): LUKS con TPM, SSH llave-only, fail2ban, `auditd` con reglas para `/etc/bomberos/`, `nftables` con default deny, `unattended-upgrades` con mirror Debian local, AppArmor enforcing.
- [ ] **Docker daemon:** `userns-remap`, `live-restore`, `icc: false`, `no-new-privileges: true` en `/etc/docker/daemon.json`.
- [ ] **NTP interno** del Distrito Capital — sin NTP confiable la auditoría temporal es inútil.
- [ ] **Particiones separadas:** `/var/lib/docker`, `/srv/bomberos/data`, `/srv/bomberos/backups` con `noexec,nodev,nosuid` donde aplique.
- [ ] **Backups offline rotados** a medio extraíble cifrado.
- [ ] **Runbook de respuesta a incidentes:** quién hace qué cuando se detecta intrusión, rotación de credenciales, restore desde backup.
- [ ] **Política de actualización trimestral** documentada: técnico llega con USB curado, aplica security patches Debian, actualiza imágenes Docker desde mirror local, corre tests, reinicia.
- [ ] **Auditoría periódica externa** (anual mínimo).

---

## 4 · Decisiones de arquitectura recomendadas

Algunas decisiones que conviene tomar formalmente antes de Sprint 1:

### 4.1 · Estrategia de autenticación

| Decisión | Recomendado | Alternativa |
|---|---|---|
| Algoritmo JWT | **RS256** con llave privada local | HS256 (más simple, menos seguro ante filtración) |
| Storage de token | **HttpOnly cookie** (ya implementado en frontend) | Authorization header |
| Refresh strategy | **Rotation con reuse detection** vía tabla DB | Rotation sin detección |
| MFA | **TOTP obligatorio** para ADMIN/RRHH/MEDICO | Opcional |
| Logout | **Denylist `jti` en DB** | Best-effort actual |
| Lockout | **Exponencial temporal con auto-unlock** | Permanente actual |

### 4.2 · Estrategia de autorización

| Capa | Control |
|---|---|
| **Frontend** | `requireRoleOrRedirect` en página + role check explícito al inicio de cada server action sensible |
| **API** | `require_role()` + `assert_scope_funcionario()` o `_scope_filter()` en cada endpoint |
| **Base de datos** | **RLS activado y FORCE** en todas las tablas con datos personales, con policies basadas en `app.usuario_id` y `seguridad.usuario_scopes` |

Tres capas redundantes. Si una falla, las otras dos detienen. Este es el principio fundamental para insiders.

### 4.3 · Estrategia de auditoría

- **Append-only obligatorio**: `REVOKE UPDATE/DELETE/TRUNCATE` + trigger anti-modificación + hash chain SHA-256.
- **Filtrar columnas sensibles** del JSONB diff (`password_hash`, `mfa_secret`, `token_recuperacion`, `token_hash`).
- **Export periódico a host separado** (WORM storage si presupuesto lo permite, o segundo servidor físico append-only con logs replicados vía syslog).
- **Verificación de integridad** mensual: recalcular hash chain y comparar.
- **Retención mínima 5 años** (sector público venezolano).

### 4.4 · Estrategia de despliegue

```
┌────────────────────────────────────────────────────────────┐
│ Servidor único (Debian 12, LUKS, firewall nftables)        │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Docker (userns-remap, no-new-privileges)             │   │
│ │                                                       │   │
│ │  ┌────────┐    ┌─────┐    ┌──────────┐              │   │
│ │  │ caddy  │───▶│ api │───▶│ postgres │              │   │
│ │  │ :443   │    │:8000│    │  :5432   │              │   │
│ │  └────────┘    └─────┘    └──────────┘              │   │
│ │  network:      network:    network:                  │   │
│ │  frontend      both        backend (internal:true)   │   │
│ │                                                       │   │
│ │              ┌──────────┐                            │   │
│ │              │ pgbackup │───▶ /srv/bomberos/backups/ │   │
│ │              └──────────┘     (GPG, cron 6h)         │   │
│ │                                                       │   │
│ │  ┌──────────┐                                        │   │
│ │  │ loki +   │ logs estructurados                     │   │
│ │  │ promtail │                                        │   │
│ │  └──────────┘                                        │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│  Solo :443 expuesto a la LAN intranet                      │
│  Solo :22 (puerto custom) desde subred de administración   │
└────────────────────────────────────────────────────────────┘
```

### 4.5 · Estrategia de actualización offline

Sin internet, las dependencias se actualizan en ciclos planificados:

1. Técnico llega con USB curado en máquina conectada a internet.
2. Genera bundle: `docker save` de imágenes nuevas + `devpi` snapshot + `verdaccio` snapshot + parches Debian.
3. Verifica firmas/hashes contra registro de control.
4. En servidor intranet: `docker load`, tests, swap atómico.
5. Rollback plan documentado: imagen anterior se mantiene 30 días.

---

## 5 · Checklist de aceptación pre-producción

Antes de declarar al sistema apto para datos reales en intranet, **todo lo siguiente debe estar verificado y probado**:

### Autenticación
- [ ] `JWT_SECRET_KEY` generado con `secrets.token_urlsafe(64)`, sin default.
- [ ] Algoritmo RS256 con llaves separadas (público/privado).
- [ ] Refresh token rotation con reuse detection.
- [ ] Denylist de `jti` activa en logout.
- [ ] MFA TOTP obligatorio para ADMIN/RRHH/MEDICO, probado end-to-end.
- [ ] Lockout temporal exponencial verificado con test.
- [ ] Timing-safe login verificado con benchmark (≤10% diferencia entre rama existente/inexistente).
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` validado por complejidad.

### Autorización
- [ ] `assert_scope_funcionario` en todos los endpoints que toman `funcionario_id`.
- [ ] Tests E2E `test_idor_*` cubren cada router sensible.
- [ ] RLS activado y FORCE en personal, salud, ops, carrera, equipo, beneficios, egresos, documentos, seguridad.usuarios, aud.*.
- [ ] Rol `bomberos_app` sin BYPASSRLS, con permisos mínimos por tabla.
- [ ] Vistas con `security_invoker = true`.
- [ ] SUPER_ADMIN segregado de ADMIN.

### Auditoría
- [ ] `aud.log_*` con triggers anti-UPDATE/DELETE/TRUNCATE.
- [ ] Hash chain SHA-256 verificable.
- [ ] Columnas sensibles filtradas del JSONB diff.
- [ ] Export append-only a host separado funcionando.
- [ ] Verificación de integridad pasa en CI.

### Base de datos
- [ ] `mfa_secret`, `token_recuperacion` cifrados con `pgcrypto`.
- [ ] `password_history` con últimas 10.
- [ ] `pg_hba.conf` con `hostssl ... scram-sha-256`, sin `trust`/`md5`.
- [ ] `postgresql.conf` con `ssl=on`, `password_encryption=scram-sha-256`, `log_connections=on`, `pgaudit` cargado.
- [ ] Disco cifrado con LUKS+TPM.

### Frontend
- [ ] Modo demo completamente eliminado (`grep isDemoMode src/` → vacío).
- [ ] Auto-logout por inactividad con timeout del backend.
- [ ] `middleware.ts` activo con matcher.
- [ ] CSP definida en `next.config.mjs`.
- [ ] Zod validation en todas las server actions.
- [ ] `error.tsx` y `global-error.tsx` presentes.

### Infraestructura
- [ ] Postgres sin `ports` expuestos.
- [ ] Networks `backend` (internal) y `frontend` separadas.
- [ ] Caddy con TLS interno; HTTP redirige a HTTPS.
- [ ] Contenedores con `no-new-privileges`, `cap_drop: ALL`, `read_only`.
- [ ] Imágenes pinneadas con SHA256 digest.
- [ ] `.dockerignore` raíz creado y excluyente.
- [ ] Backups cifrados verificados con restore mensual.
- [ ] Log rotation configurado.
- [ ] CI con `permissions: contents: read` y actions pinneadas a SHA.

### Operación
- [ ] Mirrors locales PyPI, npm, Debian, Docker registry funcionando.
- [ ] SBOM generado y guardado por release.
- [ ] `pip-audit` y `npm audit` en CI con bloqueo por High+.
- [ ] Runbook de respuesta a incidentes en `docs/INCIDENT_RESPONSE.md`.
- [ ] Política de actualización trimestral documentada.
- [ ] Auditoría externa anual planificada.

### Dependencias
- [ ] `python-jose` reemplazado por `PyJWT>=2.10`.
- [ ] `passlib` eliminado, `bcrypt>=4.2.1` directo.
- [ ] Next.js en LTS más reciente de su rama.
- [ ] `eslint` migrado a 9 con flat config.
- [ ] Lock files commiteados (`uv.lock` o `requirements.txt --hashes`, `package-lock.json`).

---

## 6 · Apéndice — Referencias de los hallazgos

Cada hallazgo fue verificado en al menos uno de los siguientes:

- `apps/api/src/bomberos_api/` — código fuente Python
- `apps/web/src/` — código fuente TypeScript/React
- `sql/01_base.sql` a `sql/07_roles_por_departamento.sql` — esquema PostgreSQL
- `docker-compose.yml`, `apps/api/Dockerfile`, `.dockerignore` — empaquetado
- `apps/api/pyproject.toml`, `apps/web/package.json`, `apps/web/package-lock.json` — dependencias
- `.github/workflows/ci.yml` — CI
- `.devcontainer/devcontainer.json` — entorno de desarrollo
- `DEPLOY.md`, `AUTO_DEPLOY.md`, `apps/api/README.md`, `apps/web/README.md` — documentación

### Hallazgos verificados manualmente por el auditor principal
P0-9, P0-10, P0-11, P0-13, P1-5, P1-6, P2-8, P2-9 — en lectura directa de `core/security.py`, `core/middleware.py`, `routers/auth.py`, `main.py`, `config.py`.

### Hallazgos verificados por agente especializado API backend
P0-1, P0-2, P0-7, P0-8, P1-2, P1-3, P1-4, P1-7, P1-8, P2-1, P2-2, P2-3, P2-4, P2-5, P2-6, P2-7, P2-10, P3-1, P3-2, P3-3.

### Hallazgos verificados por agente especializado PostgreSQL
P0-3, P0-4, P0-5, P0-6, P1-12, P1-13, P1-14, P2-16, P2-17, P2-18, P2-19, P3-7, P3-8.

### Hallazgos verificados por agente especializado infraestructura
P0-12, P0-13, P0-14, P0-15, P0-16, P0-17, P1-15, P1-16, P1-18, P1-19, P1-20, P2-20, P2-21, P2-22.

### Hallazgos verificados por agente especializado frontend
P1-1, P1-9, P1-10, P1-11, P2-11, P2-12, P2-13, P2-14, P2-15, P3-4, P3-5.

### Hallazgos verificados por agente especializado dependencias
P0-8 (CVEs `python-jose`), P1-17 (`bcrypt`/`passlib`), P3-6 (`eslint 8 EOL`).

---

## 7 · Glosario rápido

- **IDOR** (Insecure Direct Object Reference): atacante autorizado a recurso A accede a recurso B cambiando el ID.
- **RLS** (Row-Level Security): PostgreSQL filtra filas a nivel BD según condiciones definidas en policies.
- **Reuse detection**: política de refresh tokens que invalida toda la familia si se detecta uso de un refresh ya consumido.
- **Defense in depth**: redundancia deliberada de controles en capas; si una falla las otras detienen el ataque.
- **WORM storage**: Write-Once-Read-Many, almacenamiento inmutable post-escritura.
- **Tamper-evidence**: la manipulación deja rastro detectable (típicamente hash chain).

---

**Fin del documento.**

Este `SECURITY.md` debe vivir bajo control de versiones y actualizarse cada vez que se cierre un hallazgo (marcar checkbox + commit con referencia al hallazgo). En cada release mayor, hacer una pasada completa y añadir nueva sección "Audit 2027-XX-XX" si aparecen hallazgos nuevos. La auditoría no es un evento único, es un proceso continuo.
