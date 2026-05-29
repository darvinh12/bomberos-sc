# ROADMAP — Sistema Bomberos Caracas

> **Documento maestro de plan de implementación.** Define todas las fases que faltan para llevar el sistema desde su estado actual (demo funcional en Render/Vercel/Neon con datos ficticios) hasta un producto **listo para producción en intranet aislada** del Cuerpo de Bomberos del Distrito Capital.
>
> **Generado:** 2026-05-19
> **Última revisión:** 2026-05-19
> **Owner:** equipo de desarrollo
> **Audiencia:** ingeniero(s) que ejecutarán las fases siguientes, hoy o dentro de meses, con o sin contexto previo.

---

## 0 · Cómo leer este documento

Este roadmap tiene tres niveles:

1. **Visión general** (§1-§3) — el qué, el por qué, el orden recomendado. Léelo de principio a fin.
2. **Fases puntualizadas** (§4-§9) — una sección por fase con objetivo, entregables, prerrequisitos, definición de "hecho", esfuerzo estimado y referencia al plan detallado.
3. **Planes hijos detallados** — un `.md` por fase en `docs/superpowers/plans/` con tareas paso a paso, código exacto, tests y comandos. Solo se abren cuando va a ejecutarse esa fase.

Cuando llegue el momento de ejecutar una fase, **se abre su plan detallado** y se ejecuta tarea por tarea. El roadmap maestro **no se modifica** salvo para marcar fases completadas o agregar fases nuevas.

---

## 1 · Estado actual del proyecto (snapshot 2026-05-19)

### Qué está hecho

| Componente | Estado | Notas |
|---|---|---|
| **BD PostgreSQL** | Esquema v2.0.0 completo | 15 schemas, ~85 tablas, triggers, vistas, funciones. Falta RLS, roles, append-only. |
| **API FastAPI** | v0.2, 60+ endpoints | Auth JWT HS256, bcrypt 12, audit trigger-based. Sin scope checks fuera de funcionarios. |
| **Frontend Next.js 14** | Scaffolding + 7 módulos parciales | App Router, RSC, shadcn/ui, tokens en HttpOnly cookie. Módulos completos: funcionarios, salud/reposos, dashboard, admin. Parciales: ops, carrera, equipo, beneficios, egresos. |
| **CI GitHub Actions** | Lint + tests | Sin scan de seguridad, sin pin de actions, sin SBOM. |
| **Devcontainer** | Codespaces-ready | Sin hardening. |
| **Demo público** | Render + Vercel + Neon | Datos ficticios. Sirve para mostrar al cliente. **No es el producto final.** |
| **Migration tool** | CLI funcional con tests | `bomberos-migrate analyze/migrate`. Listo para correr contra BD legacy cuando esté disponible. |
| **Audit de seguridad** | Completo, 67 hallazgos | Ver `docs/SECURITY.md` (17 P0, 20 P1, 22 P2, 8 P3). |

### Qué falta

| Frente | Estado | Bloqueante para |
|---|---|---|
| **Hardening de seguridad** | 67 hallazgos sin remediar | Cualquier deploy con datos reales |
| **Módulos frontend pendientes** | ~5 módulos en estados varios | Funcionalidad completa al usuario final |
| **Migración legacy** | CLI lista, falta correr contra BD real | Cutover desde sistema antiguo |
| **Despliegue intranet** | No iniciado | Producto final en sede del cliente |
| **Capacitación y handover** | No iniciado | Operación autónoma del cliente |

---

## 2 · Visión general de las 7 fases

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORDEN RECOMENDADO                             │
└─────────────────────────────────────────────────────────────────┘

  Fase 0 ──┬── Fase 1 ──┬── Fase 2 ──┬── Fase 3 ──────────────┐
  Upgrade  │  Sec. P0   │  Sec. P1   │  Hardening avanzado    │
  stack    │  (1 sem)   │  (2 sem)   │  (MFA, RS256, denylist)│
  (1 sem)  │            │            │  (1-2 sem)             │
           │            │            │                        │
           │            └── Fase 4 ──┘                        │
           │               Frontend                           │
           │               módulos                            │
           │               (2-3 sem)                          │
           │                                                  │
           │                                                  ▼
           │                                          Fase 5 ──┐
           │                                          Migración│
           │                                          legacy   │
           │                                          (1-2 sem)│
           │                                                   │
           │                                                   ▼
           │                                          Fase 6 ───
           │                                          Deploy
           │                                          intranet
           │                                          + handover
           │                                          (2-3 sem)

  Total: 10-14 semanas calendario con 1 dev senior full-time
        o 6-8 semanas con 2 devs paralelos coordinados
```

**Reglas de orden:**

1. **Fase 0 (upgrade stack) va primero.** Subir Next 14 → 15, React 18 → 19, Tailwind 3 → 4 antes de escribir los 15 módulos pendientes. Si no, todo lo que se escriba después es deuda técnica desde el día 1: `useFormState` → `useActionState`, `forwardRef` → `ref` prop, `cookies()` síncrono → async. El costo de migrar 6 módulos existentes hoy es bajo; migrar 21 módulos después es mucho mayor.
2. **Fase 1 (P0 críticos) bloquea TODO lo que toque código de producción.** Hasta que los scope checks, RLS, auditoría append-only y secret management estén resueltos, agregar features sobre la base actual es agregar deuda de seguridad.
3. **Fase 2 (P1) puede arrancar en paralelo con Fase 4 (frontend módulos)** una vez Fase 1 esté terminada, con dos devs.
4. **Fase 3 (hardening avanzado)** puede solaparse con Fase 4 si hay capacidad.
5. **Fase 5 (migración legacy) requiere acceso a la BD legacy real.** Es bloqueante para cutover pero NO para preparar el resto.
6. **Fase 6 (deploy intranet)** requiere todas las anteriores cerradas. No empezar antes.

**Lo que se hace primero, siempre:**

- Antes de cualquier código nuevo: cerrar Fase 0 (upgrade stack) y Fase 1 (P0).
- Antes de tocar nuevos módulos del frontend: Fase 0 cerrada (stack moderno) + Fase 1 (scope checks del backend).
- Antes de migrar datos reales: Fase 1 + 2 cerradas.
- Antes de instalar en sede: TODAS cerradas.

---

## 3 · Principios transversales

Estos principios aplican a TODAS las fases. Cualquier tarea que los viole, no se cierra.

### 3.1 · Disciplina de commits

- Un commit = un cambio cohesivo y verificable. Nada de "WIP: muchas cosas".
- Mensaje en imperativo en español: `feat:`, `fix:`, `refactor:`, `security:`, `test:`, `docs:`, `chore:`.
- Si un cambio toca varios subsistemas y se puede separar, se separa.
- Commits **firmados con GPG** cuando se entre a Fase 3 en adelante.

### 3.2 · TDD para todo lo de seguridad

- Cada fix de seguridad **empieza con un test que falla** demostrando la vulnerabilidad.
- Solo después se escribe el código que hace pasar el test.
- El test queda en el repo para siempre — regression prevention.
- Aplicable a: lockout, scope checks, RLS policies, password policy, MFA, refresh rotation.

### 3.3 · Definition of Done

Una tarea está **terminada** solo cuando se cumplen, en orden:

1. Tests automatizados pasan localmente.
2. Tests automatizados pasan en CI.
3. Type checks (`mypy`, `tsc`) pasan.
4. Linters (`ruff`, `eslint`) pasan.
5. Cambio probado manualmente en al menos un escenario nominal.
6. Documentación actualizada si el cambio afecta interfaz pública.
7. Commit firmado y push hecho.
8. En tareas de seguridad: review por segundo par de ojos (otro dev o auditor).

### 3.4 · No tomar atajos en producción

- Nunca `--no-verify`, `--force`, `git push --force-with-lease` en `main`.
- Nunca disable de tests "temporalmente".
- Nunca skip de un step del DoD.
- Si una tarea no se puede cerrar limpia, se documenta el bloqueo y se escala.

### 3.5 · Trazabilidad

- Cada PR/commit que cierra un hallazgo del audit cita el ID: `security: fix P0-2 lockout rollback`.
- Cada hallazgo en `SECURITY.md` se marca con checkbox al cerrarse.
- Releases versionados (`v0.3.0`, `v0.4.0`, ...) con changelog mantenido.

---

## 4 · Fase 0 — Upgrade Stack (Next 15 + React 19 + Tailwind 4)

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-fase-0-upgrade-stack.md`](./superpowers/plans/2026-05-19-fase-0-upgrade-stack.md)

**Objetivo:** subir el frontend desde Next 14 + React 18 + Tailwind 3 hacia **Next 15 + React 19 + Tailwind 4** antes de escribir los 15 módulos pendientes. Aprovechar también para subir ESLint 8 → 9 (flat config) cerrando una deuda técnica documentada en `SECURITY.md` P3-6.

**Justificación:**
- Los 6 módulos del frontend actual son chicos: el costo de migrar **ahora** es de ~5-7 días. Migrar **después** de tener 21 módulos sería 2-3 semanas distribuidas en reescritura.
- React 19 trae `useActionState` (reemplaza `useFormState`/`useFormStatus` que el código actual usa), `ref` como prop directa (no más `forwardRef`), y mejor hidratación RSC.
- Next 15 trae caching predecible (no más "todo se cachea por default", relevante para un sistema con datos sensibles que NO debería cachear respuestas con datos de funcionarios).
- Tailwind 4 trae builds ~5× más rápidos (Oxide en Rust) y CSS-first config, que habilita theming dinámico sin gymnastics.

**Esfuerzo:** 5-7 días × 1 dev senior (40-56 h). Buffer de 2 días para imprevistos con `tailwindcss-animate` (no es drop-in en Tailwind 4) y dependencias indirectas que puedan requerir `--legacy-peer-deps` temporalmente con React 19.

**Prerrequisitos:** ninguno. Es la primera fase ejecutable.

### Puntualización

#### Preparación

- [ ] **0.1** Crear branch `chore/upgrade-stack`. Confirmar baseline: `npm run lint && typecheck && build` pasan en `main`. Anotar tamaño de bundle y tiempos de build.
- [ ] **0.2** Instalar Playwright. Escribir `e2e/smoke.spec.ts` con tests básicos (login, dashboard, funcionarios listado, funcionarios detalle). Son el "antes/después" baseline.
- [ ] **0.3** Snapshot visual: 10 screenshots de páginas clave guardados en `e2e/baselines/`.

#### Upgrade Next 14 → 15 + React 18 → 19

- [ ] **0.4** Correr `npx @next/codemod@canary upgrade latest`. Aplica codemods automáticos.
- [ ] **0.5** Inspección manual de `lib/session.ts`: `cookies()` ahora es async (`await cookies()`).
- [ ] **0.6** Para cada `page.tsx` con `params` o `searchParams`: typing nuevo `params: Promise<{ id: string }>` + `await params`.
- [ ] **0.7** Revisar fetch calls en `lib/api.ts` y server actions: si dependían del cache default de Next 14, agregar `cache: 'force-cache'` o `next: { revalidate: N }` explícito.
- [ ] **0.8** `npm run typecheck && build && npx playwright test`. Arreglar errores uno a uno.
- [ ] **0.9** Commit: `chore: upgrade Next 14 → 15 + React 18 → 19`.

#### Refactor forwardRef → ref como prop

- [ ] **0.10** Grep `forwardRef` en `apps/web/src/components/`. Refactor de Button, Input, Card, Dialog, DropdownMenu, Select, Tabs, Toast, Label.
- [ ] **0.11** Tests + commit: `refactor: replace forwardRef with ref prop (React 19)`.

#### Refactor useFormState → useActionState

- [ ] **0.12** Grep `useFormState\|useFormStatus`. Para cada formulario (login, funcionarios/nuevo, salud/reposos/nuevo, admin/usuarios/nuevo, etc.): cambiar import a `import { useActionState } from 'react'`; usar `isPending` del hook en lugar de `useFormStatus()` separado.
- [ ] **0.13** Tests + commit: `refactor: migrate to useActionState (React 19)`.

#### Upgrade Tailwind 3 → 4

- [ ] **0.14** `npx @tailwindcss/upgrade`. Aceptar cambios.
- [ ] **0.15** Migrar `tailwindcss-animate` a `tw-animate-css` (o reemplazar utilities con CSS keyframes en `globals.css`).
- [ ] **0.16** Revisar sintaxis cambiada: `bg-opacity-X` → `bg-black/X`, `text-opacity-X` → `text-black/X`, `placeholder-X` → `placeholder:text-X`.
- [ ] **0.17** Redefinir variables CSS de shadcn en `@theme { ... }`: `--background`, `--foreground`, `--primary`, etc.
- [ ] **0.18** Comparar screenshots vs baseline. Diferencias permitidas: **ninguna**. Iterar si hay regresión visual.
- [ ] **0.19** Commit: `chore: upgrade Tailwind 3 → 4 (CSS-first config)`.

#### Upgrade ESLint 8 → 9 (cierra P3-6)

- [ ] **0.20** `npm install -D eslint@9 eslint-config-next@15`. Crear `eslint.config.mjs` (flat config) reemplazando `.eslintrc.json`.
- [ ] **0.21** `npm run lint`. Arreglar warnings nuevos. Commit: `chore: upgrade eslint 8 → 9 (flat config)`.

#### Validación final

- [ ] **0.22** `npx playwright test`: 100% green.
- [ ] **0.23** `npm run build`. Comparar bundle vs baseline. Esperado: igual o menor.
- [ ] **0.24** `typecheck && lint`: 0 errores.
- [ ] **0.25** Recorrido manual: login, listado funcionarios, detalle, crear nuevo, salud reposos, admin usuarios, logout.
- [ ] **0.26** Lighthouse mobile en 3 páginas: Performance ≥90, Accessibility ≥90.
- [ ] **0.27** Documento `rollback-fase-0.md` con plan B (`git checkout main && git revert <merge-sha>`).
- [ ] **0.28** Merge a `main`. Tag `v0.2.0-stack-upgraded`. Verificar demo Render desplegado y smoke manual.

#### Documentación

- [ ] **0.29** Actualizar `apps/web/README.md` con stack nuevo.
- [ ] **0.30** Marcar Fase 0 cerrada en este ROADMAP. Actualizar nota en Fase 4 indicando que los módulos nuevos se escriben sobre React 19 nativo.

### Definition of Done de Fase 0

- [ ] Stack en `apps/web/package.json`: `next ^15`, `react ^19`, `tailwindcss ^4`, `eslint ^9`.
- [ ] `npm run lint && typecheck && build` pasan limpio.
- [ ] Smoke tests Playwright 100% green.
- [ ] Screenshots manuales coinciden con baselines (sin regresión visual).
- [ ] Demo Render funcional con stack nuevo.
- [ ] Tag `v0.2.0-stack-upgraded`.

### Riesgos conocidos y mitigación

| Riesgo | Mitigación |
|---|---|
| `tailwindcss-animate` no compatible directo con Tailwind 4 | Cambiar a `tw-animate-css` o keyframes manuales; bloque 4.3 del plan |
| Dependencias indirectas piden React 18 (peerDependencies) | `--legacy-peer-deps` temporal + documentar para update post-release |
| shadcn tokens visualmente cambian tras Tailwind 4 | Comparación con screenshots baseline obligatoria en step 0.18 |
| Regresión funcional en server actions tras Next 15 | Smoke tests Playwright + recorrido manual en steps 0.22 y 0.25 |
| Demo Render se rompe en deploy automático tras merge | Plan de rollback documentado en 0.27 |

---

## 5 · Fase 1 — Security Sprint 1 (P0 críticos)

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-security-sprint-1.md`](./superpowers/plans/2026-05-19-security-sprint-1.md)

**Objetivo:** cerrar los 17 hallazgos P0 que bloquean cualquier deploy con datos reales. Al terminar esta fase el sistema **NO** está listo para producción, pero **SÍ** está listo para empezar a recibir datos reales en entornos de pre-producción.

**Esfuerzo:** 1 semana × 1 dev senior (40 h).

**Prerrequisitos:** ninguno. Es la primera fase ejecutable.

### Puntualización (entregables verificables)

#### Backend API (Python / FastAPI)

- [ ] **1.1** — Refactor de `core/deps.py:get_session()`: separar transacción de audit de la transacción de negocio, garantizar que `LOGIN_FALLIDO` y `intentos_fallidos++` se commitean ante `HTTPException`. (Hallazgo **P0-2**.)
- [ ] **1.2** — Crear helper `apply_scope()` reutilizable y aplicar `assert_scope_funcionario()` en cada endpoint de los routers: `salud.py`, `ops.py`, `carrera.py`, `equipo.py`, `beneficios.py`, `egresos.py`. (**P0-1**.)
- [ ] **1.3** — Aplicar `_scope_filter()` a los listados (`GET /salud/reposos`, `GET /ops/guardias`, etc.) — mismo patrón que `routers/funcionarios.py:40-71`. (**P0-1**.)
- [ ] **1.4** — Tests E2E `test_idor_*` por cada router: usuario con scope zona 1 recibe 403 al pedir recurso de zona 2. (**P0-1**.)
- [ ] **1.5** — Mover `/health/db-diag` y `/health/schema` detrás de `require_role("ADMIN")` o eliminarlos cuando `is_production`. (**P0-7**.)
- [ ] **1.6** — Reemplazar `python-jose` por `PyJWT>=2.10,<3` en `pyproject.toml`. Actualizar `core/security.py` (`jwt.encode`/`jwt.decode` con `algorithms=["HS256"]` explícito). (**P0-8**.)
- [ ] **1.7** — Eliminar default `"dev-secret-change-me"` en `config.py`. `JWT_SECRET_KEY: str = Field(..., min_length=64)` (sin default, sin permisos para arrancar sin él). (**P0-9**.)
- [ ] **1.8** — Lockout temporal exponencial: añadir columna `bloqueado_hasta TIMESTAMPTZ` en `seguridad.usuarios`, lógica de auto-unlock en `routers/auth.py:login`. (**P0-10**.)
- [ ] **1.9** — Timing-safe login: en rama "usuario inexistente" ejecutar `verify_password("dummy", FAKE_HASH)` para igualar tiempos. Benchmark verifica ≤10% diferencia. (**P0-11**.)
- [ ] **1.10** — Tests: `test_login_lockout`, `test_login_timing_safe`, `test_jwt_pyjwt_roundtrip`.

#### Base de datos (PostgreSQL)

- [ ] **1.11** — Nuevo archivo `sql/06_seguridad_rls.sql` que crea roles `bomberos_app`, `bomberos_readonly`, `bomberos_backup` (todos `NOSUPERUSER NOBYPASSRLS`) y grants mínimos por schema/tabla. (**P0-4**.)
- [ ] **1.12** — `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en `personal.funcionarios`, todas las tablas de `salud.*`, `ops.*`, `carrera.*`, `equipo.*`, `beneficios.*`, `egresos.*`, `documentos.*`. (**P0-3**.)
- [ ] **1.13** — Policies RLS basadas en `current_setting('app.usuario_id')::BIGINT` + JOIN a `seguridad.usuario_scopes`, con bypass por `current_setting('app.bypass_rls', TRUE)='1'` para tareas de mantenimiento. (**P0-3**.)
- [ ] **1.14** — Tests SQL: `tests/sql/test_rls.sql` que crea dos usuarios con scopes distintos y verifica que cada uno ve solo lo suyo.
- [ ] **1.15** — `REVOKE UPDATE, DELETE, TRUNCATE ON aud.log_cambios, aud.log_accesos FROM PUBLIC`. Trigger `aud.fn_block_mutation()` que lanza excepción ante UPDATE/DELETE/TRUNCATE. (**P0-5**.)
- [ ] **1.16** — Añadir columnas `prev_hash BYTEA`, `record_hash BYTEA` a `aud.log_cambios` y `aud.log_accesos`. Modificar `aud.fn_audit()` para encadenar SHA-256 (`record_hash = sha256(prev_hash || row_json)`). (**P0-5**.)
- [ ] **1.17** — Modificar `aud.fn_audit()` para filtrar columnas sensibles del JSONB diff: `to_jsonb(NEW) - ARRAY['password_hash','mfa_secret','token_recuperacion','token_hash']`. (**P0-6**.)
- [ ] **1.18** — Test: trigger query que confirma que ningún log nuevo contiene `password_hash` en su payload, y que la cadena de hashes es válida.

#### Infraestructura

- [ ] **1.19** — Eliminar `ports: 5432:5432` de Postgres en `docker-compose.yml`. Acceso solo por red interna. (**P0-12**.)
- [ ] **1.20** — Convertir todas las variables sensibles del compose a `${VAR:?required}`. Documentar uso de `env_file: ./secrets/api.env` con perms 600. (**P0-13**.)
- [ ] **1.21** — Validar complejidad de `BOOTSTRAP_ADMIN_PASSWORD` en `scripts/bootstrap.py` con la misma regex de `change-password`. Fallo de arranque si no cumple. (**P0-14**.)
- [ ] **1.22** — Crear `/.dockerignore` en la raíz del repo excluyendo todo salvo `apps/api/`, `sql/`, `pyproject.toml`, `alembic/`. (**P0-15**.)
- [ ] **1.23** — Añadir servicio `caddy` al `docker-compose.yml` con TLS auto-firmado (cert local para desarrollo, CA del Distrito Capital en producción). Postgres y API ya no se exponen al host. (**P0-16**.)
- [ ] **1.24** — Añadir servicio `pgbackup` (alpine + `pg_dump` + `gpg` + cron) que genera dumps cifrados cada 6 h a un volumen separado. (**P0-17**.)
- [ ] **1.25** — Documento `docs/RESTORE.md` con procedimiento paso a paso de restore desde backup cifrado.

#### Frontend

- [ ] **1.26** — Eliminar archivos de modo demo: `src/lib/demo-fixtures.ts`, `src/app/actions/demo.ts`, `src/components/layout/RoleSwitcher.tsx`. (**P1-9** elevado a Fase 1 por simpleza.)
- [ ] **1.27** — `grep -r "isDemoMode" apps/web/src` debe devolver 0 resultados. Limpiar cada rama.
- [ ] **1.28** — Eliminar cookies `bcd_demo_*` activamente al hacer login (set con `expires: new Date(0)`).

### Definition of Done de Fase 1

- [ ] Todos los checkboxes (1.1 a 1.28) marcados.
- [ ] `pytest` pasa en `apps/api/`.
- [ ] Tests SQL pasan en `tests/sql/`.
- [ ] `npm test` y `tsc --noEmit` pasan en `apps/web/`.
- [ ] CI verde.
- [ ] Sección **P0** de `SECURITY.md` con todos los items marcados.
- [ ] Tag `v0.3.0-security-sprint-1` creado.
- [ ] Demo en Render sigue funcionando (regresión nula).

---

## 6 · Fase 2 — Security Sprint 2 (P1 altos)

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-security-sprint-2.md`](./superpowers/plans/2026-05-19-security-sprint-2.md)

**Objetivo:** cerrar los 20 hallazgos P1. Defense in depth, hardening de contenedores, refresh token rotation real, validación zod en frontend.

**Esfuerzo:** 2 semanas × 1 dev senior (80 h).

**Prerrequisitos:** Fase 1 cerrada.

### Puntualización

#### Autenticación y autorización

- [ ] **2.1** — Tabla `seguridad.refresh_tokens(jti, usuario_id, emitido_en, revocado_en, usado_en, padre_jti)` + endpoint `/auth/refresh` con reuse detection (si llega `usado` de nuevo → revocar familia). (**P1-2**.)
- [ ] **2.2** — En `change-password`: invalidar todos los refresh del usuario, emitir nuevo par. (**P1-3**.)
- [ ] **2.3** — Rol `SUPER_ADMIN` en `04_seed.sql`. Solo SUPER_ADMIN asigna ADMIN. ADMIN regular asigna roles operativos. (**P1-8**.)
- [ ] **2.4** — Sanitizar `integrity_409`: mensaje genérico al cliente, `e.orig` solo a structlog. (**P1-4**.)

#### Rate limiting y request handling

- [ ] **2.5** — Confiar en `X-Forwarded-For` solo si la conexión viene de proxy de allowlist. Usar último valor cuando la cadena es conocida. (**P1-5**.)
- [ ] **2.6** — Rate-limit dedicado para `/auth/login`: 5/min por IP **y** por username, en bucket separado. Barrido periódico del dict in-memory para evitar leak. (**P1-6**.)
- [ ] **2.7** — Refactor de `marcar_asistencia` y `devolver_proteccion`: eliminar `Annotated[..., Depends()] = ...`, mover `asistio`/`motivo_inasistencia` a body Pydantic. (**P1-7**.)

#### Frontend

- [ ] **2.8** — Helper `requireServerRole(["ADMIN"])` que llama `/auth/me` y verifica rol al inicio de cada server action de `(app)/admin/**/actions.ts`. (**P1-10**.)
- [ ] **2.9** — Schema zod por server action; `safeParse(payload)` antes de `api.post`. Tipos derivados con `z.infer<>`. (**P1-11**.)

#### Base de datos

- [ ] **2.10** — Cifrar `mfa_secret` y `token_recuperacion` con `pgp_sym_encrypt`. Key en `/etc/bomberos/kms.key` (root 600). Migrar valores existentes. (**P1-12**.)
- [ ] **2.11** — `ALTER VIEW ... SET (security_invoker = true)` en todas las vistas de schemas con datos personales (`personal.*`, `salud.*`, `ops.*`, `carrera.*`, `beneficios.*`, `egresos.*`). (**P1-13**.)
- [ ] **2.12** — `SET search_path = pg_catalog, <schema>, public` en `fn_audit`, `fn_attach_audit`, `fn_sync_*`, `fn_set_updated_at`, `fn_buscar`, `fn_calcular_merito`, `fn_recalcular_meritos_periodo`. (**P1-14**.)

#### Infraestructura

- [ ] **2.13** — Hardening de contenedores en `docker-compose.yml`: `security_opt`, `cap_drop`, `read_only`, `tmpfs`, `pids_limit`, `mem_limit`, `cpus` para cada servicio. (**P1-15**.)
- [ ] **2.14** — Networks `backend (internal: true)` y `frontend` separadas. Postgres solo en `backend`. (**P1-16**.)
- [ ] **2.15** — Eliminar `passlib` del API. Migrar `core/security.py` a `bcrypt>=4.2.1,<5` directo (`bcrypt.hashpw`, `bcrypt.checkpw`). Tests de hash roundtrip. (**P1-17**.)
- [ ] **2.16** — `.github/workflows/ci.yml`: `permissions: contents: read` top-level, actions pinneadas a SHA full, `JWT_SECRET_KEY` de test desde `secrets.JWT_SECRET_TEST`. (**P1-18**.)
- [ ] **2.17** — Reemplazar HEALTHCHECK de `curl` por one-liner Python; eliminar `curl` del apt-get. (**P1-19**.)
- [ ] **2.18** — Bootstrap fail-fast: `raise SystemExit(1)` si `_apply_sql_files` o `_ensure_admin_user` lanzan. (**P1-20**.)
- [ ] **2.19** — Pinear imágenes base con SHA256 digest (`python:3.12-slim@sha256:...`, `postgres:16-alpine@sha256:...`, `caddy:2-alpine@sha256:...`). (P2-20 elevado a P1 por implicación de mirror local.)

### Definition of Done de Fase 2

- [ ] Checkboxes 2.1 a 2.19 marcados.
- [ ] Tests pasan, CI verde.
- [ ] Sección **P1** de `SECURITY.md` con todos los items marcados.
- [ ] Tag `v0.4.0-security-sprint-2`.

---

## 7 · Fase 3 — Security Sprint 3 (hardening avanzado)

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-security-sprint-3.md`](./superpowers/plans/2026-05-19-security-sprint-3.md)

**Objetivo:** llevar el sistema al nivel de seguridad final esperado en producción gubernamental: MFA obligatorio, JWT asimétrico, denylist real, CSP estricta, mirrors locales, SBOM, hardening del SO.

**Esfuerzo:** 1-2 semanas × 1 dev senior (60 h).

**Prerrequisitos:** Fases 1 y 2 cerradas.

### Puntualización

#### MFA (autenticación multifactor)

- [ ] **3.1** — Dependencia `pyotp>=2.9` en API.
- [ ] **3.2** — Endpoint `POST /auth/mfa/enroll`: genera secret, devuelve QR base64 + secret en claro para apuntar manualmente. Persiste `mfa_secret` cifrado vía pgcrypto (key del Sprint 2).
- [ ] **3.3** — Endpoint `POST /auth/mfa/verify`: usuario envía código TOTP de 6 dígitos. Si OK, activa `mfa_activo=TRUE`.
- [ ] **3.4** — Modificar `POST /auth/login`: si usuario tiene `mfa_activo`, después de password correcto exigir paso 2 con código TOTP. Token temporal de 5 min entre paso 1 y 2.
- [ ] **3.5** — Política obligatoria: usuarios con rol `ADMIN`, `RRHH`, `MEDICO`, `SUPER_ADMIN` no pueden operar sin MFA activo. Endpoint que les fuerza enrollment.
- [ ] **3.6** — Frontend: páginas `/perfil/mfa` con QR scan, código de verificación, lista de códigos de recuperación de un solo uso.
- [ ] **3.7** — Tests E2E del flujo completo.

#### JWT asimétrico

- [ ] **3.8** — Generar par RSA 4096 (o EdDSA Ed25519): `openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:4096`.
- [ ] **3.9** — `core/security.py`: cargar `JWT_PRIVATE_KEY_PATH` y `JWT_PUBLIC_KEY_PATH` desde settings. Firmar con RS256, verificar con pública.
- [ ] **3.10** — Añadir `iss`, `aud`, `jti` claims. Validar todos en decode.
- [ ] **3.11** — Soporte `kid` (key ID) en header para key rotation futura.
- [ ] **3.12** — Migración de tokens existentes: forzar logout global al activar RS256 (los HS256 viejos serán rechazados, los usuarios re-login).

#### Logout real / denylist

- [ ] **3.13** — Tabla `seguridad.tokens_revocados(jti, usuario_id, revocado_en, expira_en)`.
- [ ] **3.14** — `POST /auth/logout` inserta `jti` actual en `tokens_revocados`.
- [ ] **3.15** — `get_current_user` consulta la denylist (con cache local de 30 s por TTL del access token).
- [ ] **3.16** — Job de limpieza diario: `DELETE FROM tokens_revocados WHERE expira_en < now()`.

#### Password policy reforzada

- [ ] **3.17** — Tabla `seguridad.password_history(usuario_id, hash, creado_en)`.
- [ ] **3.18** — Al cambiar password: insertar el viejo en history, verificar que el nuevo no coincide con últimas 10. Eliminar entradas antiguas (>10).
- [ ] **3.19** — Lista negra de top-10k passwords comunes en `apps/api/src/bomberos_api/data/common-passwords.txt`. Rechazar coincidencias.
- [ ] **3.20** — Rechazar passwords que contengan el username, nombre, cédula, "bombero", "caracas".

#### Tests de seguridad

- [ ] **3.21** — `tests/security/test_idor.py`: cobertura de cada router sensible (un test por endpoint × scope mismatch).
- [ ] **3.22** — `tests/security/test_role_escalation.py`: usuario con rol bajo intenta endpoint de rol alto → 403.
- [ ] **3.23** — `tests/security/test_admin_only.py`: cada endpoint `/admin/*` requiere ADMIN.
- [ ] **3.24** — `tests/security/test_mfa_required.py`: usuarios con MFA obligatorio no acceden sin verificarlo.
- [ ] **3.25** — `tests/security/test_audit_immutability.py`: intento de UPDATE/DELETE en `aud.*` lanza excepción.
- [ ] **3.26** — `tests/security/test_rls_isolation.py`: dos usuarios con scopes distintos no ven datos del otro a nivel BD.

#### Frontend hardening avanzado

- [ ] **3.27** — Hook `useIdleLogout(N)` en `(app)/layout.tsx`. N viene de `/auth/me.sesion_timeout_min`.
- [ ] **3.28** — `apps/web/src/middleware.ts` con matcher `/((?!login|api/auth|_next).*)` y verificación de cookie `bcd_access`.
- [ ] **3.29** — CSP en `next.config.mjs` con nonce dinámico. `connect-src` apunta solo al dominio interno de API.
- [ ] **3.30** — `apps/web/src/app/error.tsx` y `global-error.tsx` con mensaje neutro.
- [ ] **3.31** — `extra="forbid"` en todos los schemas Pydantic `*Create`/`*Update`.

#### Observabilidad y supply chain

- [ ] **3.32** — Middleware FastAPI que inyecta `X-Request-ID` (uuid4) en cada request y lo bind al structlog logger; correlacionar con `aud.log_*`.
- [ ] **3.33** — Generar SBOM CycloneDX en CI: `cyclonedx-py` para Python, `@cyclonedx/cyclonedx-npm` para Node. Guardar como release artifact.
- [ ] **3.34** — `pip-audit` y `npm audit --omit=dev` en CI con falla bloqueante por severidad ≥ High.
- [ ] **3.35** — Dashboard scope-aware: vistas `sys.v_dashboard_scoped` parametrizadas por `app.usuario_id`, o filtro SQL recibiendo scope.

### Definition of Done de Fase 3

- [ ] Checkboxes 3.1 a 3.35 marcados.
- [ ] MFA obligatorio probado E2E con 3 roles distintos.
- [ ] Test de RLS isolation pasa con 2 usuarios reales.
- [ ] SBOM se genera en cada CI run.
- [ ] Sección **Aceptación pre-producción** de `SECURITY.md` con 80%+ de items marcados.
- [ ] Tag `v0.5.0-security-sprint-3`.

---

## 8 · Fase 4 — Módulos frontend pendientes

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-frontend-modules.md`](./superpowers/plans/2026-05-19-frontend-modules.md)

**Objetivo:** completar la cobertura UI de todos los endpoints del API. Hoy hay módulos parciales en ops, carrera, equipo, beneficios, egresos.

**Esfuerzo:** 2-3 semanas × 1 dev senior, o 1.5 semanas × 2 devs.

**Prerrequisitos:** Fase 1 cerrada (scope checks en backend). Puede ejecutarse en paralelo con Fase 2.

### Inventario de módulos a completar

Estado actual verificado en `apps/web/src/app/(app)/`:

| Módulo | Estado actual | Faltante |
|---|---|---|
| `salud/reposos` | ✅ Existe | Verificar CRUD completo, scope checks, exportar PDF |
| `salud/lesiones` | ❌ No existe | Crear de cero |
| `salud/evaluacion-fisica` | ❌ No existe | Crear de cero |
| `salud/hcm` | ❌ No existe | Crear de cero |
| `ops/guardias` | ✅ Existe | Verificar flujo asistencia + cierre |
| `ops/permisos` | ✅ Existe | Verificar flujo autorización |
| `ops/vacaciones` | ✅ Existe | Verificar |
| `ops/comisiones` | ✅ Existe | Verificar |
| `ops/faltas` | ✅ Existe | Verificar |
| `carrera/cursos` | ✅ Existe | Verificar |
| `carrera/ascensos` | ✅ Existe | Verificar |
| `carrera/evaluaciones` | ❌ No existe | Crear |
| `carrera/reconocimientos` | ❌ No existe | Crear |
| `carrera/meritos` | ❌ No existe | Crear vista de cálculo |
| `equipo/proteccion` | ✅ Existe | Verificar inventario + asignaciones + devoluciones |
| `equipo/radios` | ✅ Existe | Verificar |
| `equipo/uniformes` | ❌ No existe | Crear |
| `beneficios/[id]`, `beneficios/nuevo` | ✅ Existe | Verificar flujo aprobación |
| `beneficios/entregas` | ❌ No existe | Crear |
| `egresos/page` | ✅ Existe (mínimo) | Expandir: jubilados, fallecimientos, solicitudes |
| `documentos/*` | ❌ No existe | Crear módulo completo (acervo, oficios, actas) |

### Puntualización (tareas por módulo)

Para cada módulo nuevo o a completar, el patrón es el mismo (definido en plan detallado):

- [ ] **4.X.1** — Página listado con TanStack Table, paginación, filtros, búsqueda.
- [ ] **4.X.2** — Página detalle (`[id]/page.tsx`) con acciones contextual (PATCH, DELETE si aplica).
- [ ] **4.X.3** — Página crear (`nuevo/page.tsx`) con react-hook-form + zod.
- [ ] **4.X.4** — Server actions con `requireServerRole()` + `safeParse` zod (patrón de Fase 2).
- [ ] **4.X.5** — Estados de error/loading/empty con shadcn.
- [ ] **4.X.6** — Tests de smoke con Playwright o similar (al menos: listar, crear, error de validación).
- [ ] **4.X.7** — Item en navegación lateral con rol correcto.

### Módulos en orden de prioridad

1. **Salud completo** (lesiones, evaluación física, HCM) — alto impacto operativo.
2. **Carrera completo** (evaluaciones, reconocimientos, méritos) — usado por RRHH frecuentemente.
3. **Equipo uniformes** — cierra el dominio de logística.
4. **Documentos** — módulo nuevo grande, baja urgencia.
5. **Beneficios entregas** — pequeño, cierra dominio.
6. **Egresos expandido** — listas separadas de jubilados/fallecimientos/solicitudes.

### Definition of Done de Fase 4

- [ ] Todos los endpoints del API tienen UI asociada en el frontend.
- [ ] Navegación lateral lista todos los módulos con icono + rol correcto.
- [ ] `npm test` pasa.
- [ ] `tsc --noEmit` pasa.
- [ ] Cada módulo probado manualmente con usuario de rol mínimo + scope.
- [ ] Tag `v0.6.0-frontend-complete`.

---

## 9 · Fase 5 — Migración legacy VB+SQL Server → PostgreSQL

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-migration-legacy.md`](./superpowers/plans/2026-05-19-migration-legacy.md)

**Objetivo:** migrar los datos de la BD legacy `PERSONALINTEGRADA` (SQL Server, ~230 tablas) a `bomberos_caracas` (PostgreSQL, ~85 tablas) en forma reproducible, idempotente y validable.

**Esfuerzo:** 1-2 semanas × 1 dev senior, depende de calidad de los datos legacy.

**Prerrequisitos:**
- Fases 1 y 2 cerradas (el esquema destino tiene RLS, auditoría, etc.).
- **Acceso a la BD legacy** (dump SQL Server o conexión directa).
- `apps/migration/` CLI ya está scaffolded.

### Puntualización

#### Preparación

- [ ] **5.1** — Restaurar dump legacy en SQL Server local (Express o Developer Edition gratis). Si la conexión es directa al servidor del cliente, configurar VPN o túnel SSH.
- [ ] **5.2** — Llenar `.env` de `apps/migration/` con cadenas reales: `LEGACY_DSN`, `TARGET_DSN`.
- [ ] **5.3** — Correr `bomberos-migrate analyze` y revisar reporte de conteo de filas por tabla. Identificar tablas que NO se van a migrar (legacy *_VIEJA, *_OLD, vistas obsoletas, logs antiguos).
- [ ] **5.4** — Generar `apps/migration/src/bomberos_migration/mapping.yaml` con base en columnas reales encontradas. Ejemplo de mapeo:
  ```yaml
  FUNCIONARIOS:
    target: personal.funcionarios
    columns:
      CEDULA:
        target: cedula
        transform: split_cedula  # extrae nacionalidad CHAR(1) y cedula INT
      NOMBRES:
        target: nombres
      # ...
    skip_if: "estatus = 'BORRADO'"
  ```

#### Migración por dominio (orden importa por FKs)

- [ ] **5.5** — **Catálogos primero**: jerarquías, cargos, condiciones, niveles educativos, especialidades, estados civiles, grupos sanguíneos, bancos.
- [ ] **5.6** — **Organización**: zonas, estaciones, divisiones, áreas, dependencias.
- [ ] **5.7** — **Funcionarios** (tabla maestra): cédulas, datos personales. Transform especial:
  - `CEDULA NUMERIC(18)` → split en `nacionalidad CHAR(1)` + `cedula INT`.
  - Validar duplicados por `(nacionalidad, cedula)`.
  - Marcar filas problemáticas en `tests/sql/migration_errors.csv`.
- [ ] **5.8** — **Períodos de servicio**: reconstruir desde `FECHA_INGRESO/EGRESO/REINTEGRO` + `DETALLE_EGRESO`. Cada par (ingreso, egreso) = período cerrado. Último ingreso sin egreso = período activo.
- [ ] **5.9** — **Históricos** (jerarquías, ubicaciones, condiciones, números de equipo): mapear `CEDULA → funcionario_id` con lookup post-migración funcionarios.
- [ ] **5.10** — **Salud**: reposos (filtrar duplicados `REPOSOS_ORIGINAL`, `REPOSOS_BD_VIEJA` — usar canónica), lesiones, HCM, evaluación física, consultas.
- [ ] **5.11** — **Carnets**: separar en `carnets` (genérico) y `carnets_vehiculo` según `TIPO`. Conservar `HISTORICO_CARNET`.
- [ ] **5.12** — **Ops**: guardias, permisos, vacaciones, comisiones, faltas, procesos administrativos.
- [ ] **5.13** — **Carrera**: cursos realizados, evaluaciones, ascensos, reconocimientos.
- [ ] **5.14** — **Equipo**: respetar cadena `inventario → asignaciones → despachos`. Protección y uniformes con histórico.
- [ ] **5.15** — **Beneficios**: ayudas económicas + entregas.
- [ ] **5.16** — **Egresos**: jubilados, pre-jubilados, fallecimientos, solicitudes.
- [ ] **5.17** — **Documentos**: acervo personal, oficios, actas, firmas autorizadas.
- [ ] **5.18** — **Identidad país**: carnets, hogares_patria, gdc_habitacional, registro_votacion.

#### Validación post-migración

- [ ] **5.19** — Script `bomberos-migrate validate` que ejecuta queries comparativas:
  - Conteos por tabla origen vs destino.
  - Suma de cédulas únicas.
  - FKs sin huérfanos.
  - Funcionarios activos sin período de servicio activo (error).
  - Reposos con fechas invertidas.
- [ ] **5.20** — Reporte de validación en `apps/migration/reports/<fecha>-validation.md` con éxitos y descartes.
- [ ] **5.21** — Test manual: 5 funcionarios elegidos al azar, comparar manualmente todos sus datos legacy vs nuevo.

#### Cutover

- [ ] **5.22** — Documentar runbook de cutover en `docs/CUTOVER_RUNBOOK.md`:
  1. Apagar app legacy (read-only mode).
  2. Último delta de migración (cambios desde el dry-run final).
  3. Validación final.
  4. Encender app nueva.
  5. Plan B: rollback con dump pre-cutover.
- [ ] **5.23** — Ensayar el cutover en entorno de staging con copia del legacy.
- [ ] **5.24** — Validar que el RLS no rompe la migración (la migración corre con `app.bypass_rls='1'`).

### Definition of Done de Fase 5

- [ ] `bomberos-migrate analyze` reporta 100% de cobertura de tablas legacy relevantes.
- [ ] `bomberos-migrate migrate --dry-run` corre sin error.
- [ ] `bomberos-migrate validate` pasa con 0 errores críticos.
- [ ] Reporte de migración firmado por el equipo.
- [ ] Runbook de cutover ensayado al menos una vez.
- [ ] Tag `v0.7.0-migration-ready`.

---

## 10 · Fase 6 — Despliegue intranet final

**Plan detallado:** [`docs/superpowers/plans/2026-05-19-deploy-intranet.md`](./superpowers/plans/2026-05-19-deploy-intranet.md)

**Objetivo:** desplegar el sistema en el servidor físico del Cuerpo de Bomberos, capacitar al personal, hacer handover formal.

**Esfuerzo:** 2-3 semanas calendario (incluye visitas a sede, capacitación, pruebas con usuarios reales).

**Prerrequisitos:** Fases 1-5 cerradas. Servidor físico y red disponibles. Acceso aprobado a la sede.

### Puntualización

#### Preparación del servidor

- [ ] **6.1** — Inventario del servidor físico: CPU, RAM, disco, NIC. Validar mínimos: 8 cores, 32 GB RAM, 2× 1 TB NVMe en RAID 1, 1 Gbps NIC.
- [ ] **6.2** — Instalar Debian 12 stable. Particionado:
  ```
  /         50 GB  ext4
  /boot     1 GB   ext4
  /home     20 GB  ext4
  /var/lib/docker  300 GB  ext4  noatime
  /srv/bomberos/data    400 GB  ext4  noatime,nodev,nosuid
  /srv/bomberos/backups 200 GB  ext4  noexec,nodev,nosuid
  swap      8 GB
  ```
- [ ] **6.3** — Cifrado de disco completo con LUKS + TPM. Frase de paso en custodia (sobre sellado en caja fuerte del Distrito Capital).
- [ ] **6.4** — `apt update && apt full-upgrade`. Configurar `unattended-upgrades` con mirror Debian local.
- [ ] **6.5** — SSH:
  - `Port 2222` (no 22).
  - `PermitRootLogin no`.
  - `PasswordAuthentication no`.
  - `AllowUsers bomberos-ops`.
  - Llaves autorizadas en `/home/bomberos-ops/.ssh/authorized_keys` (solo Ed25519).
- [ ] **6.6** — `fail2ban` activo, jail para SSH con 3 intentos/10 min ban.
- [ ] **6.7** — Firewall `nftables`:
  - Inbound: 443/tcp desde subred LAN intranet; 2222/tcp desde subred de administración. Resto: drop.
  - Outbound: NTP local; resto: drop.
- [ ] **6.8** — `auditd` con reglas que loguean acceso a `/etc/bomberos/`, `/var/lib/docker/volumes/`, ejecución de `docker` y `psql`.
- [ ] **6.9** — `chronyd` apuntando a NTP interno del Distrito Capital (sin internet, hay que asegurar que existe servidor NTP local).
- [ ] **6.10** — AppArmor en enforcing.
- [ ] **6.11** — Docker daemon configurado en `/etc/docker/daemon.json`:
  ```json
  {
    "userns-remap": "default",
    "live-restore": true,
    "icc": false,
    "no-new-privileges": true,
    "log-driver": "json-file",
    "log-opts": {"max-size": "10m", "max-file": "7"}
  }
  ```

#### CA interna y TLS

- [ ] **6.12** — Generar CA del Cuerpo de Bomberos con `step-ca`. Key root en cold storage (USB cifrado, caja fuerte).
- [ ] **6.13** — Emitir cert leaf para `bomberos.dc.local` (o dominio interno acordado).
- [ ] **6.14** — Distribuir root CA cert a las PCs de funcionarios vía GPO Active Directory (si existe) o script de instalación.

#### Despliegue del stack

- [ ] **6.15** — Clonar repo en `/opt/bomberos/`. Configurar `secrets/api.env`, `secrets/postgres.env`, `secrets/kms.key` con perms 600 root.
- [ ] **6.16** — Generar `JWT_SECRET_KEY` real con `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
- [ ] **6.17** — Generar par RSA para JWT RS256 (Fase 3 dependency).
- [ ] **6.18** — `docker compose up -d postgres`. Verificar que arranca, que `pg_hba.conf` está configurado, que solo escucha en red interna.
- [ ] **6.19** — Aplicar schema: `docker compose exec postgres psql -U postgres -d bomberos_caracas -f /sql/99_run_all.sql`.
- [ ] **6.20** — Aplicar RLS, roles y append-only triggers (`06_seguridad_rls.sql`).
- [ ] **6.21** — `docker compose up -d api caddy pgbackup`.
- [ ] **6.22** — Bootstrap del admin inicial con password fuerte generado en custodia.
- [ ] **6.23** — Smoke test: login, navegación básica, creación de funcionario de prueba.

#### Migración de datos reales

- [ ] **6.24** — Ejecutar `bomberos-migrate analyze` contra BD legacy de producción del cliente.
- [ ] **6.25** — Ejecutar `bomberos-migrate migrate --dry-run`. Revisar reporte.
- [ ] **6.26** — Ejecutar `bomberos-migrate migrate --apply`. Tiempo estimado: 30-90 min según volumen.
- [ ] **6.27** — Ejecutar `bomberos-migrate validate`. Revisar reporte.
- [ ] **6.28** — Validación manual: 10 funcionarios elegidos por RRHH, comparar legacy vs nuevo.

#### Capacitación

- [ ] **6.29** — 3 sesiones de capacitación de 2 h cada una:
  - Sesión 1: RRHH y operadores. Login, navegación, funcionarios, salud, ops.
  - Sesión 2: Supervisores. Carrera, beneficios, evaluaciones, autorizaciones.
  - Sesión 3: Administradores TI. Gestión usuarios, roles, scopes, parámetros, dashboards, backups.
- [ ] **6.30** — Manuales en PDF para cada rol en `docs/manuales/`.
- [ ] **6.31** — Video screencast de cada flujo principal (login, crear funcionario, registrar reposo, ascenso) — 5-10 min cada uno.

#### Handover formal

- [ ] **6.32** — Documento de handover firmado (`docs/HANDOVER.md`):
  - Arquitectura del sistema.
  - Inventario de credenciales en custodia (qué, dónde).
  - Contactos de soporte.
  - Procedimientos operativos (backup, restore, agregar usuario, rotar password).
  - Política de actualización trimestral.
  - Runbook de incidentes.
- [ ] **6.33** — Reunión final con cliente para entrega de:
  - Acceso al sistema (URL interno, credencial admin).
  - Sobres con credenciales en custodia (LUKS passphrase, JWT keys, KMS key).
  - Manuales y videos.
  - Garantía de soporte (período acordado contractualmente).
- [ ] **6.34** — Primer backup completo verificado. Restore probado en entorno aislado.
- [ ] **6.35** — Mirror local de PyPI/npm/Debian configurado y verificado.
- [ ] **6.36** — Tag `v1.0.0-production`.

### Definition of Done de Fase 6

- [ ] Sistema corriendo en sede del cliente con datos reales migrados.
- [ ] Personal capacitado y operando autónomamente.
- [ ] Documentación entregada y firmada.
- [ ] Backups automáticos verificados.
- [ ] Auditoría interna inicial pasada.
- [ ] Soporte de garantía iniciado.

---

## 10 · Métricas de éxito globales

Al cierre del roadmap, los siguientes indicadores deben cumplirse:

| Métrica | Objetivo |
|---|---|
| Hallazgos P0/P1/P2 de `SECURITY.md` cerrados | 100% P0, 100% P1, ≥80% P2 |
| Cobertura de tests de seguridad | ≥30 tests específicos pasando |
| Endpoints API con scope check verificado | 100% de los que reciben `funcionario_id` |
| Tablas con RLS activado | 100% de tablas con datos personales |
| Tiempo de bootstrap a `/login` operativo | <2 min |
| Tiempo de restore desde backup | <30 min para BD completa |
| Tiempo de respuesta P50 API | <200 ms |
| Tiempo de respuesta P99 API | <1 s |
| Uptime esperado en intranet | 99.5% mensual (excluyendo mantenimientos planificados) |
| Cobertura UI vs endpoints API | 100% |
| Funcionarios capacitados | 100% del personal designado por cliente |

---

## 11 · Riesgos identificados y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| BD legacy con datos sucios (duplicados, inconsistencias) | Alta | Medio | Reporte detallado de descartes en migración, validación manual con cliente, plan de limpieza acordado |
| Cliente no tiene NTP interno | Media | Alto | Auditoría temporal sin reloj sincronizado es inútil; provisionar NTP en el mismo servidor o pedir uno |
| Servidor físico inadecuado | Media | Alto | Validación de mínimos en Fase 6.1 antes de instalar |
| Personal del cliente sin habilidad técnica básica | Media | Medio | Capacitación dimensionada al perfil real, manuales con screenshots, soporte extendido |
| Cambios en alcance del cliente (módulos extras) | Alta | Medio | Documentar scope inicial, change requests formales por escrito, presupuesto separado |
| Política gubernamental cambia requisitos de seguridad | Baja | Alto | Diseño con defense in depth permite ajustes locales sin rediseñar |
| Falla de hardware del servidor único | Media | Crítico | Backups + plan de continuidad documentado; segundo servidor en standby como mejora futura |
| Dependencias sin actualización por meses (sin internet) | Alta | Medio | Mirror local + política de updates trimestrales planificada |
| Pérdida de credenciales en custodia | Baja | Crítico | Procedimiento de custodia formal, copia múltiple en cajas fuertes separadas |

---

## 12 · Lo que NO está en este roadmap (fuera de alcance)

Para evitar scope creep, dejo explícito lo que **NO** es parte de este plan:

- App móvil nativa para funcionarios.
- Integración con sistemas externos del Distrito Capital (RRHH centralizado, salud pública, etc.).
- Migración a HA con replicación o cluster.
- Reportería avanzada / BI con Power BI / Metabase.
- Funcionalidades nuevas no presentes en el sistema legacy.
- Internacionalización (i18n) — sistema solo en español.

Si alguno de estos surge como necesidad, requiere un roadmap nuevo con su propio análisis y presupuesto.

---

## 13 · Mantenimiento de este documento

- Cuando se cierra una fase, marcar en §2 con `(cerrado YYYY-MM-DD)`.
- Cuando aparecen hallazgos nuevos en auditoría posterior, agregar fase nueva en §4+ con su plan hijo.
- Cuando se decide bajar prioridad de algo, mover a §12 con justificación.
- No editar el contenido histórico de las fases ya cerradas. Si algo cambió post-cierre, anotar en un bloque "Post-mortem" al final de la fase.

---

**Próximos pasos inmediatos:**

1. Revisar este roadmap con el equipo/cliente.
2. Confirmar prioridades y plazos.
3. Abrir [`docs/superpowers/plans/2026-05-19-security-sprint-1.md`](./superpowers/plans/2026-05-19-security-sprint-1.md) y empezar tarea 1.1.

**Fin del documento maestro.**
