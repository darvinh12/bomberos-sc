# Fase 0 — Upgrade Stack (Next 15 + React 19 + Tailwind 4) — Implementation Plan

> **Para agentes:** SKILL REQUERIDA: superpowers:subagent-driven-development o superpowers:executing-plans.
>
> **Importante:** Este es upgrade en cascada de tres tecnologías. Ejecutar en branch separado `chore/upgrade-stack`, mantener el demo en Render funcional durante el proceso, mergear solo cuando smoke tests pasen. NO ejecutar simultáneamente con Security Sprint 1.

**Goal:** Migrar el frontend desde Next 14 + React 18 + Tailwind 3 a Next 15 + React 19 + Tailwind 4, manteniendo funcionalidad y cero regresiones visuales, para que las fases posteriores (módulos pendientes) se escriban sobre stack moderno.

**Architecture:**
- Upgrade incremental en orden seguro: codemods automáticos primero (Next 15 + React 19), luego refactors manuales obligatorios (`cookies()`/`headers()` async, `useFormState` → `useActionState`), luego Tailwind 4, luego ESLint 9.
- Branch separado, commits atómicos por step.
- Smoke tests Playwright al final de cada bloque mayor.
- Rollback plan documentado.

**Tech Stack target:**
- `next 15.x` (última estable)
- `react 19.x`, `react-dom 19.x`
- `tailwindcss 4.x` (CSS-first con `@theme`)
- `eslint 9.x` con flat config (oportunidad para hacer este upgrade ahora también)
- `@playwright/test` instalado para smoke tests

**Esfuerzo estimado:** 5-7 días / 1 dev senior. Buffer de 2 días para imprevistos con redefinición de tokens shadcn y dependencias indirectas con React 19 peer-deps.

---

## Inventario detectado en `apps/web/`

Tras grepar todo `apps/web/src/`:

| Categoría                                                       | Cantidad | Riesgo  |
|-----------------------------------------------------------------|----------|---------|
| Archivos con `cookies()` síncrono (next/headers)                | 11       | Alto    |
| Páginas con `params` o `searchParams` (props sync object)       | 24       | Alto    |
| Archivos con `useFormState` + `useFormStatus` (react-dom)       | 27       | Alto    |
| Archivos con `forwardRef`                                       | 0        | Nulo    |
| Plugin `tailwindcss-animate` en config (no usado en código)     | 1 ref    | Bajo    |
| Componentes UI shadcn instalados en `components/ui/`            | 0        | Nulo    |
| Tokens HSL shadcn-style en `globals.css`                        | sí       | Medio   |
| Route handlers con `GET` que dependen del cache default Next 14 | 2        | Bajo    |

> **Hallazgo clave:** No existe `apps/web/src/components/ui/` con primitivas shadcn (Button, Input, etc.). El proyecto usa utilities Tailwind crudas + la clase global `.input` definida en `globals.css`. Esto **elimina el Bloque 2** original (refactor `forwardRef` → `ref`). Se conserva el Bloque 2 reorientado a validar que cualquier componente añadido durante el upgrade respete el patrón React 19.

### Archivos críticos identificados (requieren refactor manual posterior al codemod)

**Manejo de cookies async (Bloque 1.2):**

- `apps/web/src/lib/session.ts` — 4 usos de `cookies()` en `setSessionCookies`, `getAccessToken`, `getRefreshToken`, `clearSession`.
- `apps/web/src/lib/api.ts:29` — `cookies()` dentro de un `try` con `await import("next/headers")`.
- `apps/web/src/app/actions/demo.ts:13,23` — `switchDemoRole`, `readDemoRole`.
- `apps/web/src/app/(app)/admin/usuarios/[id]/scope-actions.ts:21,31`
- `apps/web/src/app/(app)/admin/usuarios/[id]/rol-scope-actions.ts:22,32`
- `apps/web/src/app/(app)/admin/usuarios/[id]/actions.ts:28,40`
- `apps/web/src/app/(app)/admin/roles/actions.ts:13,23`
- `apps/web/src/app/(app)/admin/permisos/actions.ts:50,60`
- `apps/web/src/app/(app)/admin/organizacion/actions.ts:52,62`
- `apps/web/src/app/(app)/admin/catalogos/actions.ts:48,58`
- `apps/web/src/app/(app)/admin/campos-custom/actions.ts:27,77`

**Páginas con `params` / `searchParams` sync (Bloque 1.3):**

- `apps/web/src/app/(app)/funcionarios/page.tsx` (searchParams)
- `apps/web/src/app/(app)/funcionarios/[id]/page.tsx` (params)
- `apps/web/src/app/(app)/funcionarios/[id]/editar/page.tsx` (params)
- `apps/web/src/app/(app)/admin/usuarios/page.tsx` (searchParams)
- `apps/web/src/app/(app)/admin/usuarios/[id]/page.tsx` (params)
- `apps/web/src/app/(app)/admin/auditoria/page.tsx` (searchParams)
- `apps/web/src/app/(app)/beneficios/page.tsx` (searchParams)
- `apps/web/src/app/(app)/beneficios/[id]/editar/page.tsx` (params)
- `apps/web/src/app/(app)/perfil/page.tsx` (searchParams)
- `apps/web/src/app/(app)/carrera/page.tsx` (searchParams)
- `apps/web/src/app/(app)/egresos/page.tsx` (searchParams)
- `apps/web/src/app/(app)/editar-pendiente/[entidad]/page.tsx` (params + searchParams)
- `apps/web/src/app/(app)/equipo/proteccion/page.tsx` (searchParams)
- `apps/web/src/app/(app)/equipo/proteccion/[id]/asignar/page.tsx` (params)
- `apps/web/src/app/(app)/equipo/radios/page.tsx` (searchParams)
- `apps/web/src/app/(app)/equipo/radios/[id]/asignar/page.tsx` (params)
- `apps/web/src/app/(app)/ops/comisiones/page.tsx` (searchParams)
- `apps/web/src/app/(app)/ops/faltas/page.tsx` (searchParams)
- `apps/web/src/app/(app)/ops/guardias/[id]/page.tsx` (params)
- `apps/web/src/app/(app)/ops/permisos/page.tsx` (searchParams)
- `apps/web/src/app/(app)/ops/permisos/[id]/editar/page.tsx` (params)
- `apps/web/src/app/(app)/ops/vacaciones/[id]/editar/page.tsx` (params)
- `apps/web/src/app/(app)/salud/reposos/[id]/editar/page.tsx` (params)

**Formularios con `useFormState`/`useFormStatus` (Bloque 3, 27 archivos):**

- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(app)/funcionarios/nuevo/form.tsx`
- `apps/web/src/app/(app)/funcionarios/[id]/editar/form.tsx`
- `apps/web/src/app/(app)/funcionarios/[id]/acciones/panel.tsx` (7 instancias dentro de un mismo archivo)
- `apps/web/src/app/(app)/salud/reposos/nuevo/form.tsx`
- `apps/web/src/app/(app)/salud/reposos/[id]/editar/form.tsx`
- `apps/web/src/app/(app)/ops/guardias/nuevo/form.tsx`
- `apps/web/src/app/(app)/ops/vacaciones/nuevo/form.tsx`
- `apps/web/src/app/(app)/ops/vacaciones/[id]/editar/form.tsx`
- `apps/web/src/app/(app)/ops/permisos/nuevo/form.tsx`
- `apps/web/src/app/(app)/ops/permisos/[id]/editar/form.tsx`
- `apps/web/src/app/(app)/ops/comisiones/nuevo/form.tsx`
- `apps/web/src/app/(app)/ops/faltas/nuevo/form.tsx`
- `apps/web/src/app/(app)/carrera/cursos/nuevo/form.tsx`
- `apps/web/src/app/(app)/carrera/ascensos/nuevo/form.tsx`
- `apps/web/src/app/(app)/equipo/proteccion/nuevo/form.tsx`
- `apps/web/src/app/(app)/equipo/proteccion/[id]/asignar/form.tsx`
- `apps/web/src/app/(app)/equipo/radios/nuevo/form.tsx`
- `apps/web/src/app/(app)/equipo/radios/[id]/asignar/form.tsx`
- `apps/web/src/app/(app)/beneficios/nuevo/form.tsx`
- `apps/web/src/app/(app)/beneficios/[id]/editar/form.tsx`
- `apps/web/src/app/(app)/perfil/form.tsx`
- `apps/web/src/app/(app)/admin/usuarios/nuevo/form.tsx`
- `apps/web/src/app/(app)/admin/roles/admin-client.tsx`
- `apps/web/src/app/(app)/admin/organizacion/tabs.tsx` (4 instancias)
- `apps/web/src/app/(app)/admin/catalogos/tabs.tsx`
- `apps/web/src/app/(app)/admin/campos-custom/form.tsx`

**Tailwind / estilos (Bloque 4):**

- `apps/web/tailwind.config.ts` — config en TS, usa `tailwindcss-animate` plugin (no consumido en JSX).
- `apps/web/postcss.config.mjs` — usa `tailwindcss` + `autoprefixer`.
- `apps/web/src/app/globals.css` — `@tailwind base/components/utilities`, tokens HSL shadcn, `@layer base/components`.

**Route handlers (Bloque 1.4):**

- `apps/web/src/app/api/export/funcionarios/route.ts`
- `apps/web/src/app/api/search/funcionarios/route.ts` (ya tiene `export const dynamic = "force-dynamic";`)

---

## Riesgos identificados y mitigaciones

| Riesgo                                                                                    | Probabilidad | Mitigación                                                                                                  |
|-------------------------------------------------------------------------------------------|--------------|-------------------------------------------------------------------------------------------------------------|
| `tailwindcss-animate` no es drop-in con TW4                                               | Baja         | El plugin no se usa en el código (`grep animate-in` → 0 hits). Se elimina del config en Bloque 4.1.        |
| Tokens HSL de `globals.css` no se mapean automáticamente a `@theme` de TW4                | Alta         | Bloque 4.5 redefine variables a sintaxis `hsl(...)` directamente en `@theme` para que las utilities resuelvan correctamente. Comparación visual obligatoria contra `e2e/baselines/`. |
| Algunas dependencias Radix-UI / TanStack pueden requerir `--legacy-peer-deps` con React 19 | Alta         | Bloque 1.1.a documenta cuáles fallaron, planea bump posterior. Si bloquea build, se usa `--legacy-peer-deps` temporalmente y se abre issue. |
| Server actions con `cookies()` deben volverse `await cookies()` — codemod no siempre acierta dentro de wrappers | Media        | Bloque 1.2 inspecciona manualmente los 11 archivos listados arriba. Refactor de `lib/session.ts` mostrado en step 1.2 con código completo. |
| `clearSession()` (síncrona) llamada desde `requireAuth` async — Next 15 puede romper tipos | Media        | Bloque 1.2 unifica TODAS las funciones del módulo `session.ts` a async + await cookies internamente.        |
| Tipo `searchParams` ahora es `Promise<{...}>` — `URLSearchParams({...searchParams, page})` en `funcionarios/page.tsx` rompe | Alta         | Bloque 1.3.b muestra refactor concreto: hacer `await` y reconstruir el objeto base.                          |
| `params.bind(null, id)` en `acciones/panel.tsx` con server actions y async cookies         | Media        | Bloque 1.2 valida que los binds siguen funcionando una vez la action interna haga `await cookies()`.        |
| Cache default cambia en Next 15 (fetch ya no cachea por default)                          | Baja         | Bloque 1.4 confirma que `api.ts` ya usa `cache: "no-store"` explícito → sin cambios.                       |
| ESLint flat config requiere reescribir reglas custom                                       | Media        | Bloque 5 incluye plantilla mínima funcional.                                                                |
| Playwright en Windows con paths con espacios y caracteres especiales (`(app)`, `[id]`)    | Media        | Smoke tests usan rutas relativas a la URL (`/funcionarios/1`), no a archivos.                              |

---

## Bloque 0 — Preparación

### Task 0.1 — Crear branch y validar baseline

- [ ] **0.1.1** Crear y cambiar a branch desde `main`:
  ```bash
  cd "c:/Users/Darvin PC/Documents/PROYECTOS TRABAJOS/Bomberos SC/bomberos-caracas-bd"
  git checkout main
  git pull origin main
  git checkout -b chore/upgrade-stack
  ```
- [ ] **0.1.2** Validar que el código actual compila limpio:
  ```bash
  cd apps/web
  npm install
  npm run lint
  npm run typecheck
  npm run build
  ```
  Esperado: las tres pasan sin error. Si alguna falla, ARREGLAR ANTES de comenzar el upgrade (no se mezclan fixes con upgrade).
- [ ] **0.1.3** Documentar baseline en `apps/web/UPGRADE-METRICS.md` (temporal, se elimina al final):
  ```markdown
  # Upgrade Baseline (pre-upgrade)
  - Fecha: 2026-05-19
  - Commit: $(git rev-parse HEAD)
  - Next: 14.2.35
  - React: 18.3.1
  - Tailwind: 3.4.17
  - Tiempo `npm run build`: __ s
  - Tamaño .next/static: __ KB
  - Errores lint: 0
  - Errores typecheck: 0
  ```
  Llenar los valores ejecutando `npm run build` y midiendo con `du -sh .next/static/` (Windows: `Get-ChildItem -Recurse .next/static | Measure-Object -Property Length -Sum`).

### Task 0.2 — Instalar Playwright y crear smoke tests baseline

- [ ] **0.2.1** Instalar Playwright dev-only en `apps/web/`:
  ```bash
  cd apps/web
  npm install -D @playwright/test
  npx playwright install chromium
  ```
- [ ] **0.2.2** Crear `apps/web/playwright.config.ts`:
  ```ts
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: false,
    retries: 0,
    reporter: [["list"]],
    use: {
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      trace: "on-first-retry",
      screenshot: "only-on-failure",
    },
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
    webServer: {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 60_000,
      env: { NEXT_PUBLIC_DEMO_MODE: "1" },
    },
  });
  ```
- [ ] **0.2.3** Crear `apps/web/e2e/smoke.spec.ts` (DEMO MODE, sin backend real):
  ```ts
  import { test, expect } from "@playwright/test";

  // El proyecto soporta NEXT_PUBLIC_DEMO_MODE=1 que sirve fixtures locales.
  // Los smoke tests corren contra demo mode para no depender de la API.

  test.describe("Smoke — flujos críticos pre/post upgrade", () => {
    test("redirección raíz → login si no autenticado", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: /Iniciar sesión/i })).toBeVisible();
    });

    test("login con credencial demo entra al dashboard", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/Usuario/i).fill("admin");
      await page.getByLabel(/Contraseña/i).fill("demo");
      await page.getByRole("button", { name: /Ingresar al sistema/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });

    test("listado funcionarios renderiza tabla con datos demo", async ({ page }) => {
      // pre-condición: login
      await page.goto("/login");
      await page.getByLabel(/Usuario/i).fill("admin");
      await page.getByLabel(/Contraseña/i).fill("demo");
      await page.getByRole("button", { name: /Ingresar al sistema/i }).click();
      await page.waitForURL(/\/dashboard$/);

      await page.goto("/funcionarios");
      await expect(page.getByRole("heading", { name: "Personal" })).toBeVisible();
      await expect(page.locator("table")).toBeVisible();
    });

    test("formulario nuevo funcionario muestra error si campos vacíos", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/Usuario/i).fill("admin");
      await page.getByLabel(/Contraseña/i).fill("demo");
      await page.getByRole("button", { name: /Ingresar al sistema/i }).click();
      await page.waitForURL(/\/dashboard$/);

      await page.goto("/funcionarios/nuevo");
      await expect(page.getByRole("button", { name: /Crear funcionario/i })).toBeVisible();
    });

    test("admin/usuarios accesible para rol ADMIN", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/Usuario/i).fill("admin");
      await page.getByLabel(/Contraseña/i).fill("demo");
      await page.getByRole("button", { name: /Ingresar al sistema/i }).click();
      await page.waitForURL(/\/dashboard$/);

      await page.goto("/admin/usuarios");
      await expect(page.locator("h1")).toContainText(/Usuarios/i);
    });

    test("logout regresa a /login", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/Usuario/i).fill("admin");
      await page.getByLabel(/Contraseña/i).fill("demo");
      await page.getByRole("button", { name: /Ingresar al sistema/i }).click();
      await page.waitForURL(/\/dashboard$/);

      await page.getByRole("button", { name: /Salir|Logout|Cerrar sesión/i }).click();
      await expect(page).toHaveURL(/\/login$/);
    });
  });
  ```
- [ ] **0.2.4** Agregar script `"e2e": "playwright test"` y `"e2e:headed": "playwright test --headed"` en `apps/web/package.json` (sección scripts).
- [ ] **0.2.5** Correr suite y confirmar verde:
  ```bash
  cd apps/web
  NEXT_PUBLIC_DEMO_MODE=1 npm run e2e
  ```
  Esperado: 6/6 verdes. Si algún test falla por timing, ajustar timeouts antes de seguir; **no continuar el upgrade con smoke tests rotos**.

### Task 0.3 — Snapshots visuales baseline

- [ ] **0.3.1** Crear `apps/web/e2e/visual-baseline.spec.ts`:
  ```ts
  import { test } from "@playwright/test";
  import path from "node:path";

  const ROUTES = [
    { name: "01-login",                    url: "/login",                          auth: false },
    { name: "02-dashboard",                url: "/dashboard",                      auth: true  },
    { name: "03-funcionarios-listado",     url: "/funcionarios",                   auth: true  },
    { name: "04-funcionarios-detalle",     url: "/funcionarios/1",                 auth: true  },
    { name: "05-funcionarios-nuevo",       url: "/funcionarios/nuevo",             auth: true  },
    { name: "06-salud-reposos",            url: "/salud/reposos",                  auth: true  },
    { name: "07-admin-usuarios",           url: "/admin/usuarios",                 auth: true  },
    { name: "08-admin-roles",              url: "/admin/roles",                    auth: true  },
    { name: "09-admin-organizacion",       url: "/admin/organizacion",             auth: true  },
    { name: "10-perfil",                   url: "/perfil",                         auth: true  },
  ];

  async function login(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel(/Usuario/i).fill("admin");
    await page.getByLabel(/Contraseña/i).fill("demo");
    await page.getByRole("button", { name: /Ingresar al sistema/i }).click();
    await page.waitForURL(/\/dashboard$/);
  }

  for (const r of ROUTES) {
    test(`baseline:${r.name}`, async ({ page }) => {
      if (r.auth) await login(page);
      await page.goto(r.url);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join("e2e", "baselines", `${r.name}.png`),
        fullPage: true,
      });
    });
  }
  ```
- [ ] **0.3.2** Crear directorio `apps/web/e2e/baselines/` (commitearlo con `.gitkeep`).
- [ ] **0.3.3** Ejecutar y commitear las 10 capturas:
  ```bash
  cd apps/web
  NEXT_PUBLIC_DEMO_MODE=1 npx playwright test e2e/visual-baseline.spec.ts
  ```
  Esperado: 10 PNGs en `e2e/baselines/`.
- [ ] **0.3.4** Commit del bloque 0:
  ```bash
  git add apps/web/playwright.config.ts apps/web/e2e apps/web/package.json apps/web/UPGRADE-METRICS.md
  git commit -m "chore: add playwright smoke + visual baselines (pre-upgrade)"
  ```

---

## Bloque 1 — Upgrade Next 14 → 15 + React 18 → 19

### Task 1.1 — Correr codemod oficial

- [ ] **1.1.1** Asegurar working dir limpio: `git status` (debe estar en limpio post-bloque-0).
- [ ] **1.1.2** Ejecutar codemod oficial. Responder `yes` a todos los prompts:
  ```bash
  cd apps/web
  npx @next/codemod@canary upgrade latest
  ```
  Esto debe:
  - Bumpear `next` a `^15.x`, `react` a `^19.x`, `react-dom` a `^19.x`, `@types/react` y `@types/react-dom` a `^19.x`, y `eslint-config-next` a `15.x`.
  - Aplicar codemod `next-async-request-api` (transforma `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` a async).
  - Aplicar codemod `next-request-geo-ip` (no aplica, no usamos).
  - Aplicar codemod `next-og-import` (no aplica).
- [ ] **1.1.3** Si el install falla por peer-deps con React 19, reintentar con flag:
  ```bash
  npm install --legacy-peer-deps
  ```
  Documentar cuáles paquetes lo requieren en `apps/web/UPGRADE-METRICS.md` sección "Peer-dep blockers".
- [ ] **1.1.4** `git diff apps/web/package.json` — verificar que las versiones quedaron:
  ```json
  "next": "^15.0.0",         // o ^15.1.x según release
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "eslint-config-next": "^15.0.0"
  ```
  Si los pins están incorrectos, ajustar manualmente y `npm install` de nuevo.
- [ ] **1.1.5** Commit intermedio:
  ```bash
  git add apps/web
  git commit -m "chore: run @next/codemod upgrade latest (Next 15 + React 19)"
  ```

### Task 1.2 — Refactor manual `lib/session.ts` y cookies async

El codemod aplica `await cookies()` cuando lo encuentra dentro de una función `async`. Pero `lib/session.ts` actual mezcla síncrono (`const c = cookies();`) con async (función exportada). Hay que limpiar manualmente.

- [ ] **1.2.1** Reescribir completo `apps/web/src/lib/session.ts`:
  ```ts
  "use server";

  import { cookies } from "next/headers";
  import { redirect } from "next/navigation";

  const ACCESS_COOKIE = "bcd_access";
  const REFRESH_COOKIE = "bcd_refresh";

  export async function setSessionCookies(
    access: string,
    refresh: string,
    accessMaxAge: number,
  ): Promise<void> {
    const c = await cookies();
    c.set(ACCESS_COOKIE, access, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: accessMaxAge,
    });
    c.set(REFRESH_COOKIE, refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  export async function getAccessToken(): Promise<string | null> {
    const c = await cookies();
    return c.get(ACCESS_COOKIE)?.value ?? null;
  }

  export async function getRefreshToken(): Promise<string | null> {
    const c = await cookies();
    return c.get(REFRESH_COOKIE)?.value ?? null;
  }

  export async function clearSession(): Promise<void> {
    const c = await cookies();
    c.delete(ACCESS_COOKIE);
    c.delete(REFRESH_COOKIE);
  }

  export async function requireAuth(): Promise<string> {
    const token = await getAccessToken();
    if (!token) redirect("/login");
    return token;
  }
  ```
- [ ] **1.2.2** Refactor de `apps/web/src/lib/api.ts:23-36` (el bloque dinámico con `await import("next/headers")`):
  ```ts
  // Antes
  let rol = "ADMIN";
  try {
    const { cookies } = await import("next/headers");
    rol = cookies().get("bcd_demo_role")?.value ?? "ADMIN";
  } catch {
    /* En client-side no hay next/headers */
  }

  // Después (Next 15)
  let rol = "ADMIN";
  try {
    const { cookies } = await import("next/headers");
    const c = await cookies();
    rol = c.get("bcd_demo_role")?.value ?? "ADMIN";
  } catch {
    /* En client-side no hay next/headers */
  }
  ```
- [ ] **1.2.3** Refactor de `apps/web/src/app/actions/demo.ts` (servidor):
  ```ts
  "use server";

  import { cookies } from "next/headers";
  import { revalidatePath } from "next/cache";
  import { ROLES_DISPONIBLES } from "@/lib/roles";

  const DEMO_ROLE_COOKIE = "bcd_demo_role";

  export async function switchDemoRole(formData: FormData): Promise<void> {
    const rol = String(formData.get("rol") ?? "ADMIN");
    const valido = ROLES_DISPONIBLES.some((r) => r.codigo === rol);
    if (!valido) return;
    const c = await cookies();
    c.set(DEMO_ROLE_COOKIE, rol, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    revalidatePath("/", "layout");
  }

  export async function readDemoRole(): Promise<string> {
    const c = await cookies();
    return c.get(DEMO_ROLE_COOKIE)?.value ?? "ADMIN";
  }
  ```
- [ ] **1.2.4** Aplicar el mismo patrón a los 8 archivos admin restantes. Patrón a buscar/reemplazar (Edit tool, file-by-file):
  - Reemplazar `const raw = cookies().get(XXX)?.value;` por `const c = await cookies(); const raw = c.get(XXX)?.value;`
  - Reemplazar `cookies().set(XXX, ...)` por `const c = await cookies(); c.set(XXX, ...)`
  - Confirmar que la función contenedora ya es `async` (todas las server actions lo son).

  Archivos a tocar:
  - `apps/web/src/app/(app)/admin/usuarios/[id]/scope-actions.ts`
  - `apps/web/src/app/(app)/admin/usuarios/[id]/rol-scope-actions.ts`
  - `apps/web/src/app/(app)/admin/usuarios/[id]/actions.ts`
  - `apps/web/src/app/(app)/admin/roles/actions.ts`
  - `apps/web/src/app/(app)/admin/permisos/actions.ts`
  - `apps/web/src/app/(app)/admin/organizacion/actions.ts`
  - `apps/web/src/app/(app)/admin/catalogos/actions.ts`
  - `apps/web/src/app/(app)/admin/campos-custom/actions.ts`

- [ ] **1.2.5** Verificación de cobertura:
  ```bash
  grep -rn "cookies()" apps/web/src/ | grep -v "await cookies()" | grep -v "\.test\." | grep -v "// "
  ```
  Esperado: 0 líneas. Si aparece alguna, refactorizar.

### Task 1.3 — Refactor `params` / `searchParams` a Promises

En Next 15, las props `params` y `searchParams` de pages/layouts son `Promise<...>`. El codemod renombra el tipo y añade `await`, PERO suele dejar a medias usos como `URLSearchParams({ ...searchParams })` que requieren acceder al objeto resuelto.

- [ ] **1.3.1** Patrón canónico para páginas con `params`:
  ```tsx
  // Antes
  export default async function Page({
    params,
  }: {
    params: { id: string };
  }) {
    const id = Number(params.id);
    // ...
  }

  // Después (Next 15)
  export default async function Page({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    // ...
  }
  ```
- [ ] **1.3.2** Patrón canónico para `searchParams` (caso simple — `perfil/page.tsx`):
  ```tsx
  // Antes
  export default async function PerfilPage({
    searchParams,
  }: {
    searchParams: { ok?: string };
  }) {
    const ok = searchParams.ok === "1";
    // ...
  }

  // Después
  export default async function PerfilPage({
    searchParams,
  }: {
    searchParams: Promise<{ ok?: string }>;
  }) {
    const sp = await searchParams;
    const ok = sp.ok === "1";
    // ...
  }
  ```
- [ ] **1.3.3** Patrón especial: `funcionarios/page.tsx` usa `URLSearchParams({ ...searchParams, page: String(...) })` para construir los links de paginación. Refactor concreto:
  ```tsx
  // Antes (apps/web/src/app/(app)/funcionarios/page.tsx)
  interface SearchProps {
    searchParams: {
      q?: string;
      estatus?: string;
      // ... etc
    };
  }

  export default async function FuncionariosPage({ searchParams }: SearchProps) {
    const q = searchParams.q ?? "";
    // ...
    // Más abajo en JSX:
    href={`?${new URLSearchParams({ ...searchParams, page: String(data.page - 1) })}`}
  }

  // Después (Next 15)
  interface SearchProps {
    searchParams: Promise<{
      q?: string;
      estatus?: string;
      zona_id?: string;
      estacion_id?: string;
      jerarquia_id?: string;
      page?: string;
    }>;
  }

  export default async function FuncionariosPage({ searchParams }: SearchProps) {
    const sp = await searchParams;
    const q = sp.q ?? "";
    const estatus = sp.estatus ?? "ACTIVO";
    const zonaId = sp.zona_id ?? "";
    const estacionId = sp.estacion_id ?? "";
    const jerarquiaId = sp.jerarquia_id ?? "";
    const page = Number(sp.page ?? 1);
    // ...

    // Construir un base para los links de paginación
    const baseParams: Record<string, string> = {};
    if (sp.q) baseParams.q = sp.q;
    if (sp.estatus) baseParams.estatus = sp.estatus;
    if (sp.zona_id) baseParams.zona_id = sp.zona_id;
    if (sp.estacion_id) baseParams.estacion_id = sp.estacion_id;
    if (sp.jerarquia_id) baseParams.jerarquia_id = sp.jerarquia_id;

    // En el JSX:
    href={`?${new URLSearchParams({ ...baseParams, page: String(data.page - 1) })}`}
  }
  ```
- [ ] **1.3.4** Patrón para páginas con AMBOS `params` y `searchParams` (`editar-pendiente/[entidad]/page.tsx`):
  ```tsx
  // Antes
  interface Props {
    params: { entidad: string };
    searchParams: { id?: string; desde?: string };
  }

  // Después
  interface Props {
    params: Promise<{ entidad: string }>;
    searchParams: Promise<{ id?: string; desde?: string }>;
  }

  export default async function EditarPendientePage({ params, searchParams }: Props) {
    const { entidad } = await params;
    const sp = await searchParams;
    const id = sp.id;
    const desde = sp.desde;
    // ...
  }
  ```
- [ ] **1.3.5** Para cada uno de los **24 archivos** listados en el inventario, validar con grep que se aplicó el patrón:
  ```bash
  grep -rn "params:\s*{\s*\w\+:" apps/web/src/app/ | grep -v "Promise<"
  ```
  Esperado: 0 hits. Si aparece, aplicar refactor manual.

### Task 1.4 — Revisar fetch cache default y route handlers

- [ ] **1.4.1** Inspeccionar `apps/web/src/lib/api.ts`. La línea 48 ya usa `cache: "no-store"` explícito. **Sin cambios necesarios.**
- [ ] **1.4.2** Inspeccionar `apps/web/src/app/api/search/funcionarios/route.ts`. Línea 5 ya tiene `export const dynamic = "force-dynamic";`. **Sin cambios necesarios.**
- [ ] **1.4.3** Inspeccionar `apps/web/src/app/api/export/funcionarios/route.ts` y, si no tiene `export const dynamic = "force-dynamic";` ni `export const revalidate = 0;`, agregarlo arriba:
  ```ts
  export const dynamic = "force-dynamic";
  ```
  Esto preserva el comportamiento de Next 14 (no-cache) que la export debe respetar (devuelve CSV personalizado por token).

### Task 1.5 — Typecheck

- [ ] **1.5.1** Correr:
  ```bash
  cd apps/web
  npm run typecheck
  ```
- [ ] **1.5.2** Errores esperados después del codemod (si los hay):
  - `Type '{ id: string; }' is not assignable to type 'Promise<{ id: string; }>'.` → archivo sin refactor manual. Aplicar patrón 1.3.1.
  - `Property 'q' does not exist on type 'Promise<{ q?: string; }>'.` → falta `await searchParams`. Aplicar patrón 1.3.2.
  - `cookies(...).get is not a function` (a runtime, no typecheck) → falta `await`. Volver a Task 1.2.
- [ ] **1.5.3** Repetir hasta `0 errors`.

### Task 1.6 — Build

- [ ] **1.6.1** Correr:
  ```bash
  cd apps/web
  npm run build
  ```
- [ ] **1.6.2** Si falla con error de ESLint, comentar temporalmente el lint del build añadiendo a `next.config.mjs`:
  ```js
  eslint: { ignoreDuringBuilds: true }, // TEMPORAL — se quita en Bloque 5
  ```
  Resolver lint en Bloque 5 con flat config. Importante: **dejar nota TODO en el archivo** y removerla.
- [ ] **1.6.3** Si falla con error de tipos en `next-env.d.ts` u otra dependencia, refrescar:
  ```bash
  rm -rf apps/web/.next apps/web/node_modules apps/web/package-lock.json
  npm install
  npm run build
  ```

### Task 1.7 — Smoke tests Playwright

- [ ] **1.7.1** Correr suite contra dev server:
  ```bash
  cd apps/web
  NEXT_PUBLIC_DEMO_MODE=1 npm run e2e
  ```
- [ ] **1.7.2** Esperado: 6/6 verdes. Si alguno falla:
  - Login falla → revisar `lib/session.ts` Task 1.2.1.
  - `/funcionarios` 500 → revisar `funcionarios/page.tsx` Task 1.3.3.
  - Admin 500 → revisar cookies admin Task 1.2.4.
- [ ] **1.7.3** Repetir snapshots visuales para comparación post-bloque (todavía no se mergea con baseline):
  ```bash
  NEXT_PUBLIC_DEMO_MODE=1 npx playwright test e2e/visual-baseline.spec.ts -- --output e2e/post-bloque-1
  ```
  Comparar visualmente 10 pares. Esperado: idénticos (no se tocaron estilos todavía).

### Task 1.8 — Commit del bloque

- [ ] **1.8.1**
  ```bash
  git add apps/web
  git commit -m "refactor: migrate async cookies/params + fix fetch cache for Next 15"
  ```

---

## Bloque 2 — Refactor `forwardRef` → `ref` prop (no aplica)

> **Resultado del inventario:** 0 usos de `forwardRef` en `apps/web/src/`. No hay componentes shadcn instalados. Este bloque queda **vacío como step explícito** pero se mantiene en el plan para que cuando se agreguen componentes durante futuras fases (Fase 4 frontend-modules) se respete React 19 nativo.

- [ ] **2.1** Verificar:
  ```bash
  grep -rn "forwardRef" apps/web/src/
  ```
  Esperado: 0. Si en el futuro se agrega un componente con `forwardRef`, aplicar:
  ```tsx
  // ❌ React 18 / shadcn legacy
  const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ ...props }, ref) => {
    return <button ref={ref} {...props} />;
  });

  // ✅ React 19
  function Button({ ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
    return <button ref={ref} {...props} />;
  }
  ```
- [ ] **2.2** Añadir regla ESLint (en Bloque 5) que prohíba `forwardRef` para nuevo código.

---

## Bloque 3 — Refactor `useFormState` → `useActionState`

React 19 mueve `useFormState` (de `react-dom`) a `useActionState` (de `react`). Rename + signature: el hook nuevo devuelve un tercer valor `isPending`, reemplazando al `useFormStatus` separado. **27 archivos a tocar.**

### Task 3.1 — Patrón canónico (aplicar a todos los formularios)

- [ ] **3.1.1** Patrón before/after, ejemplo del login:
  ```tsx
  // Antes (apps/web/src/app/(auth)/login/page.tsx)
  "use client";
  import { useFormState, useFormStatus } from "react-dom";
  import { loginAction, type LoginState } from "./actions";

  const initial: LoginState = {};

  function SubmitButton() {
    const { pending } = useFormStatus();
    return (
      <button type="submit" disabled={pending} className="...">
        {pending ? "Verificando…" : "Ingresar al sistema"}
      </button>
    );
  }

  export default function LoginPage() {
    const [state, action] = useFormState(loginAction, initial);
    // ...
  }
  ```

  ```tsx
  // Después (React 19)
  "use client";
  import { useActionState } from "react";
  import { loginAction, type LoginState } from "./actions";

  const initial: LoginState = {};

  function SubmitButton({ pending }: { pending: boolean }) {
    return (
      <button type="submit" disabled={pending} className="...">
        {pending ? "Verificando…" : "Ingresar al sistema"}
      </button>
    );
  }

  export default function LoginPage() {
    const [state, action, pending] = useActionState(loginAction, initial);

    return (
      // ... mismo JSX, pero <SubmitButton /> ahora recibe pending por prop
      <SubmitButton pending={pending} />
      // ...
    );
  }
  ```

  > **Nota:** `useFormStatus` SIGUE existiendo en React 19 y se puede mantener si el `<Submit />` está anidado dentro del `<form>`. Es válido conservarlo. El cambio mandatorio es solo `useFormState` → `useActionState`. Sin embargo, **se recomienda** mover a `isPending` del hook nuevo en formularios simples para reducir un componente; para formularios con muchos botones internos, conservar `useFormStatus`.

### Task 3.2 — Estrategia por archivo

- [ ] **3.2.1** **Estrategia A — formularios simples (1 submit, 1 state):** rename hook + agregar 3er valor `isPending` + eliminar componente `<Submit>` separado (inline en JSX). Aplica a:
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/app/(app)/funcionarios/nuevo/form.tsx`
  - `apps/web/src/app/(app)/funcionarios/[id]/editar/form.tsx`
  - `apps/web/src/app/(app)/salud/reposos/nuevo/form.tsx`
  - `apps/web/src/app/(app)/salud/reposos/[id]/editar/form.tsx`
  - `apps/web/src/app/(app)/ops/guardias/nuevo/form.tsx`
  - `apps/web/src/app/(app)/ops/vacaciones/nuevo/form.tsx`
  - `apps/web/src/app/(app)/ops/vacaciones/[id]/editar/form.tsx`
  - `apps/web/src/app/(app)/ops/permisos/nuevo/form.tsx`
  - `apps/web/src/app/(app)/ops/permisos/[id]/editar/form.tsx`
  - `apps/web/src/app/(app)/ops/comisiones/nuevo/form.tsx`
  - `apps/web/src/app/(app)/ops/faltas/nuevo/form.tsx`
  - `apps/web/src/app/(app)/carrera/cursos/nuevo/form.tsx`
  - `apps/web/src/app/(app)/carrera/ascensos/nuevo/form.tsx`
  - `apps/web/src/app/(app)/equipo/proteccion/nuevo/form.tsx`
  - `apps/web/src/app/(app)/equipo/proteccion/[id]/asignar/form.tsx`
  - `apps/web/src/app/(app)/equipo/radios/nuevo/form.tsx`
  - `apps/web/src/app/(app)/equipo/radios/[id]/asignar/form.tsx`
  - `apps/web/src/app/(app)/beneficios/nuevo/form.tsx`
  - `apps/web/src/app/(app)/beneficios/[id]/editar/form.tsx`
  - `apps/web/src/app/(app)/perfil/form.tsx`
  - `apps/web/src/app/(app)/admin/usuarios/nuevo/form.tsx`
  - `apps/web/src/app/(app)/admin/campos-custom/form.tsx`

- [ ] **3.2.2** **Estrategia B — archivos multi-form (varios `useFormState` en el mismo archivo):** rename hook + mantener `useFormStatus` interno donde ayude a separar responsabilidades. Aplica a:
  - `apps/web/src/app/(app)/funcionarios/[id]/acciones/panel.tsx` (7 hooks)
  - `apps/web/src/app/(app)/admin/organizacion/tabs.tsx` (4 hooks)
  - `apps/web/src/app/(app)/admin/catalogos/tabs.tsx` (1 hook + helpers)
  - `apps/web/src/app/(app)/admin/roles/admin-client.tsx` (1 hook)

  Cambio mínimo:
  ```tsx
  // Reemplazar SOLO la importación y la llamada:
  - import { useFormState, useFormStatus } from "react-dom";
  + import { useActionState } from "react";
  + import { useFormStatus } from "react-dom"; // sigue válido en R19 dentro de <form>

  - const [state, action] = useFormState(serverAction, initial);
  + const [state, action] = useActionState(serverAction, initial);
  ```

### Task 3.3 — Refactor concreto: login (Estrategia A — completo)

- [ ] **3.3.1** Sustituir todo `apps/web/src/app/(auth)/login/page.tsx`:
  ```tsx
  "use client";

  import { useActionState } from "react";
  import { loginAction, type LoginState } from "./actions";

  const initial: LoginState = {};

  export default function LoginPage() {
    const [state, action, pending] = useActionState(loginAction, initial);

    return (
      <div className="min-h-[100dvh] flex bg-slate-900">
        {/* Left panel — branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-wide">CB</span>
            </div>
            <span className="text-white text-sm font-semibold">
              Cuerpo de Bomberos del Distrito Capital
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Sistema Integrado<br />de Gestión de Personal
            </h1>
            <p className="mt-4 text-slate-400 text-sm leading-relaxed max-w-sm">
              Plataforma institucional para la administración del recurso humano,
              operaciones y carrera del cuerpo de bomberos.
            </p>
            <div className="mt-8 flex items-center gap-2">
              <div className="w-1 h-8 bg-primary rounded-full" />
              <p className="text-slate-500 text-xs">
                Acceso restringido a personal autorizado.<br />
                Las sesiones son auditadas.
              </p>
            </div>
          </div>
          <div className="text-slate-700 text-xs">
            Bomberos Caracas · Sistema SIGP v2
          </div>
        </div>

        {/* Right panel — form */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-9 h-9 bg-primary rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold tracking-wide">CB</span>
              </div>
              <div>
                <div className="text-white text-sm font-semibold">Bomberos Caracas</div>
                <div className="text-slate-500 text-xs">Cuerpo del Distrito Capital</div>
              </div>
            </div>

            <div className="bg-slate-800 rounded p-8 shadow-2xl border border-slate-700">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">Iniciar sesión</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ingrese sus credenciales institucionales
                </p>
              </div>

              {state.error && (
                <div className="mb-5 px-4 py-3 rounded border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                  {state.error}
                </div>
              )}

              <form action={action} className="space-y-4">
                <div>
                  <label htmlFor="usuario" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                    Usuario
                  </label>
                  <input
                    id="usuario"
                    name="usuario"
                    type="text"
                    autoComplete="username"
                    required
                    autoFocus
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="input"
                  />
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded border border-transparent bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
                  >
                    {pending ? "Verificando…" : "Ingresar al sistema"}
                  </button>
                </div>
              </form>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              Acceso restringido · Sesiones auditadas
            </p>
          </div>
        </div>
      </div>
    );
  }
  ```

### Task 3.4 — Refactor concreto: funcionarios/nuevo/form.tsx (Estrategia A)

- [ ] **3.4.1** Cambios mínimos a `apps/web/src/app/(app)/funcionarios/nuevo/form.tsx`:
  ```diff
  - import { useFormState, useFormStatus } from "react-dom";
  + import { useActionState } from "react";

  - function Submit() {
  -   const { pending } = useFormStatus();
  -   return (
  -     <button type="submit" disabled={pending} className="...">
  -       {pending ? "Guardando…" : "Crear funcionario"}
  -     </button>
  -   );
  - }

  export default function NuevoForm({ ... }) {
  -   const [state, action] = useFormState(crearFuncionario, initial);
  +   const [state, action, pending] = useActionState(crearFuncionario, initial);

    return (
      <form action={action} className="...">
        {/* ... */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href="/funcionarios" className="...">Cancelar</Link>
  -       <Submit />
  +       <button
  +         type="submit"
  +         disabled={pending}
  +         className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60 transition"
  +       >
  +         {pending ? "Guardando…" : "Crear funcionario"}
  +       </button>
        </div>
      </form>
    );
  }
  ```

### Task 3.5 — Refactor concreto: acciones/panel.tsx (Estrategia B — mantener useFormStatus)

- [ ] **3.5.1** En `apps/web/src/app/(app)/funcionarios/[id]/acciones/panel.tsx`, cambio mínimo:
  ```diff
  - import { useFormState, useFormStatus } from "react-dom";
  + import { useActionState } from "react";
  + import { useFormStatus } from "react-dom";
  ```
  Las 7 llamadas a `useFormState(action.bind(null, funcionarioId), initial)` se vuelven `useActionState(action.bind(null, funcionarioId), initial)`. `useFormStatus()` dentro de `Submit()` se mantiene intacto. **No tocar más.**

### Task 3.6 — Aplicar a los 27 archivos

- [ ] **3.6.1** Para cada archivo de Estrategia A (23 archivos en Task 3.2.1):
  - Reemplazar import.
  - Reemplazar destructuring para incluir `pending`.
  - Reemplazar `<Submit />` separado por `<button>` inline que reciba `pending` o, si el `Submit` se reusa, pasar `pending` por prop.
- [ ] **3.6.2** Para cada archivo de Estrategia B (4 archivos en Task 3.2.2):
  - Solo separar el import: `useActionState` desde `react`, `useFormStatus` desde `react-dom`.
  - Rename `useFormState` → `useActionState`.

- [ ] **3.6.3** Verificación final:
  ```bash
  grep -rn "useFormState" apps/web/src/
  ```
  Esperado: 0 hits.

  ```bash
  grep -rn "from \"react-dom\"" apps/web/src/
  ```
  Esperado: solo en archivos que mantengan `useFormStatus` (4 de Estrategia B). Cualquier otra mención debe eliminarse.

### Task 3.7 — Validación

- [ ] **3.7.1** `npm run typecheck` — 0 errores. Errores comunes:
  - `Cannot find name 'useFormState'` → import obsoleto.
  - `Property 'pending' is missing` → falta tercer valor en destructuring.
- [ ] **3.7.2** `npm run build` — passes.
- [ ] **3.7.3** `NEXT_PUBLIC_DEMO_MODE=1 npm run e2e` — 6/6 verdes.
- [ ] **3.7.4** Smoke manual:
  - Login (verificar texto "Verificando…" aparece al click).
  - Submit del form "nuevo funcionario" — botón debe mostrar "Guardando…".
  - Panel acciones → cualquier acción muestra "Procesando…".

### Task 3.8 — Commit

- [ ] **3.8.1**
  ```bash
  git add apps/web/src
  git commit -m "refactor: migrate useFormState → useActionState (React 19)"
  ```

---

## Bloque 4 — Upgrade Tailwind 3 → 4

### Task 4.1 — Correr codemod oficial Tailwind

- [ ] **4.1.1** Asegurar working dir limpio. Correr codemod en `apps/web/`:
  ```bash
  cd apps/web
  npx @tailwindcss/upgrade@latest
  ```
  Esto:
  - Bumpea `tailwindcss` a `^4.x`.
  - Quita `autoprefixer` (TW4 lo incluye internamente vía Lightning CSS).
  - Reemplaza `postcss.config.mjs` para usar `@tailwindcss/postcss`.
  - Migra utilities deprecadas (`bg-opacity-*`, `text-opacity-*`, etc.).
  - Migra `tailwind.config.ts` → `@theme` en `globals.css` (parcial; revisar después).

- [ ] **4.1.2** Si el codemod no instala automáticamente la dependencia:
  ```bash
  npm install -D tailwindcss@^4 @tailwindcss/postcss@^4
  npm uninstall autoprefixer tailwindcss-animate
  ```
  > El plugin `tailwindcss-animate` se desinstala porque no se usa en el código (verificado: `grep animate-in apps/web/src` → 0 hits).

### Task 4.2 — Validar / forzar postcss.config.mjs

- [ ] **4.2.1** El archivo debe quedar así. Si el codemod lo dejó diferente, sobreescribir:
  ```js
  // apps/web/postcss.config.mjs
  export default {
    plugins: { "@tailwindcss/postcss": {} },
  };
  ```

### Task 4.3 — Eliminar tailwind.config.ts

- [ ] **4.3.1** Eliminar el archivo (Tailwind 4 lee config desde `globals.css`):
  ```bash
  rm apps/web/tailwind.config.ts
  ```
- [ ] **4.3.2** Confirmar que no queda ningún `tailwind.config.*`:
  ```bash
  ls apps/web/tailwind.config.* 2>&1
  ```
  Esperado: `No such file`.

### Task 4.4 — Reescribir `globals.css` para Tailwind 4

- [ ] **4.4.1** Sobreescribir `apps/web/src/app/globals.css` completo (mantiene paleta dark navy + burgundy):
  ```css
  @import "tailwindcss";

  /* ───────────────────────────────────────────────────
   * Dark-mode estrategia: class-based (compat shadcn tokens)
   * ─────────────────────────────────────────────────── */
  @custom-variant dark (&:where(.dark, .dark *));

  /* ───────────────────────────────────────────────────
   * Tokens shadcn-style mapeados a @theme de TW4.
   * Las variables HSL crudas se conservan para componibilidad
   * con utilities como bg-primary/20.
   * ─────────────────────────────────────────────────── */
  :root {
    --background: 218 28% 7%;
    --foreground: 213 20% 88%;

    --card: 220 24% 12%;
    --card-foreground: 213 20% 88%;

    --primary: 355 72% 19%;
    --primary-foreground: 0 0% 92%;

    --secondary: 220 28% 17%;
    --secondary-foreground: 213 20% 88%;

    --muted: 220 24% 14%;
    --muted-foreground: 220 18% 38%;

    --accent: 220 26% 16%;
    --accent-foreground: 213 20% 88%;

    --destructive: 0 72% 52%;
    --destructive-foreground: 0 0% 100%;

    --border: 220 28% 17%;
    --input: 220 24% 12%;
    --ring: 355 58% 35%;

    --radius: 0.25rem;
  }

  @theme inline {
    /* Colores: TW4 acepta `hsl(var(--x))` y resuelve a runtime */
    --color-background: hsl(var(--background));
    --color-foreground: hsl(var(--foreground));

    --color-card: hsl(var(--card));
    --color-card-foreground: hsl(var(--card-foreground));

    --color-primary: hsl(var(--primary));
    --color-primary-foreground: hsl(var(--primary-foreground));

    --color-secondary: hsl(var(--secondary));
    --color-secondary-foreground: hsl(var(--secondary-foreground));

    --color-muted: hsl(var(--muted));
    --color-muted-foreground: hsl(var(--muted-foreground));

    --color-accent: hsl(var(--accent));
    --color-accent-foreground: hsl(var(--accent-foreground));

    --color-destructive: hsl(var(--destructive));
    --color-destructive-foreground: hsl(var(--destructive-foreground));

    --color-border: hsl(var(--border));
    --color-input: hsl(var(--input));
    --color-ring: hsl(var(--ring));

    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);

    --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-snap: cubic-bezier(0.85, 0, 0.15, 1);
  }

  @layer base {
    body {
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      font-feature-settings: "rlig" 1, "calt" 1, "tnum" 1;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    h1, h2, h3 {
      letter-spacing: -0.01em;
    }
  }

  @layer components {
    .input {
      width: 100%;
      border-radius: 0.25rem;
      border: 1px solid hsl(var(--border));
      background-color: hsl(var(--input));
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      color: hsl(var(--foreground));
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .input::placeholder {
      color: hsl(var(--muted-foreground));
    }
    .input:focus {
      outline: none;
      border-color: hsl(var(--ring));
      box-shadow: 0 0 0 1px hsl(var(--ring));
    }
  }
  ```

  **Decisiones tomadas en este refactor:**
  - Se reemplaza `@tailwind base/components/utilities` (TW3) por `@import "tailwindcss"` (TW4).
  - El `@theme inline` con `hsl(var(--x))` permite que `bg-primary/20` siga funcionando como en TW3 (Tailwind v4 procesa el alpha con color-mix sobre el valor resuelto).
  - El `.input` se reescribe sin `@apply` para evitar el cambio de comportamiento de `@apply` en TW4 con variables CSS.
  - `tailwindcss-animate` queda eliminado.

### Task 4.5 — Verificar utilities usadas que cambiaron en TW4

- [ ] **4.5.1** Sintaxis OK en TW4 (sin cambios necesarios, verificado con grep):
  - `bg-primary/20`, `text-primary/80`, `border-amber-800/50` → siguen funcionando (color-mix nativo).
  - `space-y-4`, `flex`, `gap-2`, `rounded-md`, `shadow-2xl`, `min-h-screen` → idénticas.
- [ ] **4.5.2** Sintaxis que cambió pero **NO se usa** en este proyecto (verificado: 0 hits):
  - `bg-opacity-X`, `text-opacity-X`, `border-opacity-X`, `divide-opacity-X`, `ring-opacity-X`, `placeholder-X`.
- [ ] **4.5.3** Revisar `min-h-screen` en `funcionarios/page.tsx` y similar → en login se cambió a `min-h-[100dvh]` en Bloque 3.3.1; aplicar mismo cambio en otros sitios si es necesario (no obligatorio, solo si Bloque 6 lo detecta).

### Task 4.6 — Build con TW4

- [ ] **4.6.1**
  ```bash
  cd apps/web
  rm -rf .next
  npm run build
  ```
- [ ] **4.6.2** Si falla por `@import "tailwindcss"` no encontrado, verificar:
  - `node_modules/tailwindcss/package.json` existe y `"version": "4.x"`.
  - `postcss.config.mjs` usa `"@tailwindcss/postcss"`.
- [ ] **4.6.3** Si falla por utility no existente, ver mensaje exacto y agregar a `@theme` o reescribir el class.

### Task 4.7 — Verificación visual contra baselines

- [ ] **4.7.1** Levantar dev server:
  ```bash
  NEXT_PUBLIC_DEMO_MODE=1 npm run dev
  ```
- [ ] **4.7.2** Regenerar snapshots post-Tailwind:
  ```bash
  NEXT_PUBLIC_DEMO_MODE=1 npx playwright test e2e/visual-baseline.spec.ts
  ```
  Las nuevas screenshots se sobreescriben en `e2e/baselines/`. **NO commitear esos cambios todavía.**
- [ ] **4.7.3** Comparar manualmente las 10 capturas pre/post:
  ```bash
  git diff --stat apps/web/e2e/baselines/
  ```
  Si todos los archivos cambian → revisar si la diferencia es perceptual o solo por anti-alias.
- [ ] **4.7.4** Para diferencias perceptibles, abrir las dos versiones lado a lado:
  - Login: paleta navy + burgundy debe ser idéntica.
  - Dashboard: cards con `bg-card` mismo gris.
  - Tabla funcionarios: hover-row `bg-muted/30` mismo color.
  - Filtros: `bg-background` y `border-input` mismo.
  - Pill estados (ACTIVO/REPOSO/etc): `bg-emerald-900/40 text-emerald-400` correctamente renderizados.
  - Si CUALQUIER token está mal → ajustar `@theme inline` y repetir.
- [ ] **4.7.5** Una vez aprobado visualmente, commitear baselines nuevas:
  ```bash
  git checkout -- apps/web/e2e/baselines/  # descartar cambios accidentales si ya están idénticos
  # O si hay diferencias mínimas aceptables:
  git add apps/web/e2e/baselines/
  ```

### Task 4.8 — Smoke tests funcionales

- [ ] **4.8.1**
  ```bash
  NEXT_PUBLIC_DEMO_MODE=1 npm run e2e
  ```
  Esperado: 6/6 verdes.

### Task 4.9 — Commit

- [ ] **4.9.1**
  ```bash
  git add apps/web
  git commit -m "chore: upgrade Tailwind 3 → 4 (CSS-first @theme config)"
  ```

---

## Bloque 5 — Upgrade ESLint 8 → 9 (flat config)

### Task 5.1 — Instalación

- [ ] **5.1.1**
  ```bash
  cd apps/web
  npm install -D eslint@^9 eslint-config-next@^15
  ```
  Si `eslint-config-next@15` aún no soporta flat config nativamente, instalar también:
  ```bash
  npm install -D @eslint/eslintrc @eslint/js
  ```

### Task 5.2 — Crear flat config

- [ ] **5.2.1** Eliminar (si existe) `apps/web/.eslintrc.json` o `.eslintrc.js`.
- [ ] **5.2.2** Crear `apps/web/eslint.config.mjs`:
  ```js
  import { FlatCompat } from "@eslint/eslintrc";
  import js from "@eslint/js";
  import path from "node:path";
  import { fileURLToPath } from "node:url";

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
  });

  export default [
    ...compat.extends("next/core-web-vitals"),
    {
      ignores: [
        ".next/**",
        "node_modules/**",
        "e2e/baselines/**",
        "playwright-report/**",
        "test-results/**",
      ],
    },
    {
      rules: {
        "react/no-unescaped-entities": "off",
        "@next/next/no-img-element": "warn",
        "no-console": ["warn", { allow: ["warn", "error"] }],
        // Prohibir forwardRef (React 19 ya no lo necesita)
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "react",
                importNames: ["forwardRef"],
                message: "React 19: usa ref como prop directa. Ver CLAUDE.md.",
              },
            ],
          },
        ],
      },
    },
  ];
  ```
- [ ] **5.2.3** Actualizar script `lint` en `apps/web/package.json` (next 15 + eslint 9 ya usa flat config automáticamente, pero por claridad):
  ```json
  "lint": "next lint --dir src"
  ```

### Task 5.3 — Limpiar config temporal de Bloque 1.6

- [ ] **5.3.1** Si en Task 1.6.2 se agregó `eslint: { ignoreDuringBuilds: true }` a `next.config.mjs`, **eliminarlo ahora**.
- [ ] **5.3.2** Verificar archivo:
  ```js
  // apps/web/next.config.mjs final
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          ],
        },
      ];
    },
  };

  export default nextConfig;
  ```

### Task 5.4 — Validar lint

- [ ] **5.4.1**
  ```bash
  cd apps/web
  npm run lint
  ```
  Errores esperados (a arreglar uno a uno):
  - Imports no usados (post-refactor de Bloque 3 — eliminar `useFormStatus` huérfano si quedó).
  - Variables no usadas.
  - `<img>` plano (warn) → ignorar a menos que sea fácil de migrar a `next/image`.
- [ ] **5.4.2** Re-correr hasta `✔ No ESLint warnings or errors`.

### Task 5.5 — Build final

- [ ] **5.5.1**
  ```bash
  cd apps/web
  rm -rf .next
  npm run build
  ```
  Esperado: passes con lint integrado (no `ignoreDuringBuilds`).

### Task 5.6 — Commit

- [ ] **5.6.1**
  ```bash
  git add apps/web
  git commit -m "chore: upgrade ESLint 8 → 9 (flat config)"
  ```

---

## Bloque 6 — Validación final y rollback plan

### Task 6.1 — Suite Playwright completa

- [ ] **6.1.1**
  ```bash
  cd apps/web
  NEXT_PUBLIC_DEMO_MODE=1 npm run e2e
  ```
  Esperado: 100% verde (6 smoke + 10 visual = 16/16).

### Task 6.2 — Bundle size compare

- [ ] **6.2.1** Build limpio:
  ```bash
  rm -rf apps/web/.next
  cd apps/web && npm run build
  ```
- [ ] **6.2.2** Medir tamaño y tiempo, completar `UPGRADE-METRICS.md` sección "Post-upgrade":
  ```
  ## Post-upgrade
  - Fecha: 2026-05-XX
  - Commit: $(git rev-parse HEAD)
  - Next: 15.x
  - React: 19.x
  - Tailwind: 4.x
  - Tiempo `npm run build`: __ s   (delta: __ %)
  - Tamaño .next/static: __ KB    (delta: __ %)
  ```
- [ ] **6.2.3** Si bundle creció >15%, investigar — buscar duplicación de React. Suele resolverse con `npm dedupe`.

### Task 6.3 — Typecheck y lint finales

- [ ] **6.3.1** `npm run typecheck` → 0 errores.
- [ ] **6.3.2** `npm run lint` → 0 errores, warnings tolerables.

### Task 6.4 — QA manual exhaustivo

- [ ] **6.4.1** Levantar dev sin demo (con backend real si disponible) o con demo:
  ```bash
  NEXT_PUBLIC_DEMO_MODE=1 npm run dev
  ```
- [ ] **6.4.2** Recorrido obligatorio:
  - [ ] `/login` — login con `admin/demo` → entra al dashboard.
  - [ ] `/dashboard` — KPIs cargan.
  - [ ] `/funcionarios` — listado, filtros (zona, jerarquía, estatus), paginación, búsqueda `q`.
  - [ ] `/funcionarios/1` — detalle con todos los tabs.
  - [ ] `/funcionarios/1/editar` — formulario, validación zod, submit.
  - [ ] `/funcionarios/nuevo` — todos los selects pueblan, submit muestra "Guardando…".
  - [ ] `/funcionarios/1/acciones` — los 6 paneles (reposo, comisión, sancionar, pre-jubilar, jubilar, fallecimiento) abren modal y muestran "Procesando…".
  - [ ] `/salud/reposos` — listado.
  - [ ] `/salud/reposos/nuevo` — submit.
  - [ ] `/ops/guardias`, `/ops/vacaciones`, `/ops/permisos`, `/ops/comisiones`, `/ops/faltas`.
  - [ ] `/carrera`, `/carrera/cursos/nuevo`, `/carrera/ascensos/nuevo`.
  - [ ] `/equipo/proteccion`, `/equipo/radios` con sus respectivos `/nuevo` y `/[id]/asignar`.
  - [ ] `/beneficios`, `/beneficios/nuevo`, `/beneficios/[id]/editar`.
  - [ ] `/egresos`.
  - [ ] `/admin/usuarios` listado.
  - [ ] `/admin/usuarios/1` detalle con scopes y roles.
  - [ ] `/admin/roles`, `/admin/organizacion`, `/admin/permisos`, `/admin/catalogos`, `/admin/parametros`, `/admin/campos-custom`, `/admin/auditoria`.
  - [ ] `/perfil` — cambio de contraseña.
  - [ ] Logout → redirect a `/login`.
- [ ] **6.4.3** Mobile viewport (DevTools, iPhone 14): sidebar oculta, topbar visible, MobileSidebar abre/cierra.

### Task 6.5 — Lighthouse

- [ ] **6.5.1** Con build de producción levantado (`npm run build && npm start`), correr Lighthouse mobile en:
  - `/login`
  - `/dashboard`
  - `/funcionarios`
- [ ] **6.5.2** Objetivos:
  - Performance ≥ 85 (móvil — el cap se baja respecto a meta 90 del CLAUDE.md porque es intranet y no hay optimizaciones de imágenes/fonts todavía; el sprint específico de performance es Sprint 4).
  - Accessibility ≥ 90.
  - Best Practices ≥ 90.
- [ ] **6.5.3** Anotar números en `UPGRADE-METRICS.md`.

### Task 6.6 — Rollback plan

- [ ] **6.6.1** Crear `c:/Users/Darvin PC/Documents/PROYECTOS TRABAJOS/Bomberos SC/bomberos-caracas-bd/docs/superpowers/plans/2026-05-19-fase-0-upgrade-stack-rollback.md`:
  ```markdown
  # Fase 0 — Rollback Plan

  Si el merge a `main` causa regresión en producción (demo Render o instalación cliente), seguir estos pasos en orden:

  ## Escenario A — Regresión leve (un módulo roto, demo OK general)

  1. Identificar commit problemático en el log de `chore/upgrade-stack` (revisar Task 1.8, 3.8, 4.9, 5.6 — cada bloque commit atómico).
  2. Crear branch fix:
     ```
     git checkout main
     git checkout -b fix/upgrade-stack-<modulo>
     ```
  3. Arreglar puntualmente.
  4. PR → merge.

  ## Escenario B — Regresión crítica (build roto, login roto, smoke 0/6)

  1. Revert del merge commit en main:
     ```
     git checkout main
     git revert -m 1 <MERGE_SHA>
     git push origin main
     ```
  2. Verificar deploy Render recovery.
  3. Re-abrir `chore/upgrade-stack` como `chore/upgrade-stack-v2`, identificar la causa con `git bisect` entre los commits del bloque.

  ## Escenario C — Imposible compilar después de merge

  1. Reset duro (solo si no hay otros commits sobre main posteriores):
     ```
     git checkout main
     git reset --hard <COMMIT_ANTES_DEL_MERGE>
     git push --force-with-lease origin main
     ```
     ⚠️ Coordinar con equipo antes de force-push.

  ## Tag de seguridad

  Antes del merge, crear tag de safety:
  ```
  git tag pre-fase-0-upgrade
  git push origin pre-fase-0-upgrade
  ```
  Permite recuperación instantánea con `git checkout pre-fase-0-upgrade`.
  ```

### Task 6.7 — Merge

- [ ] **6.7.1** Crear tag de safety en main ANTES del merge:
  ```bash
  git checkout main
  git tag pre-fase-0-upgrade
  git push origin pre-fase-0-upgrade
  ```
- [ ] **6.7.2** Volver a la branch y mergear:
  ```bash
  git checkout chore/upgrade-stack
  git rebase main   # asegurar fast-forward limpio
  git checkout main
  git merge --no-ff chore/upgrade-stack -m "chore(fase-0): upgrade to Next 15 + React 19 + Tailwind 4"
  git push origin main
  ```
- [ ] **6.7.3** Tag post-upgrade:
  ```bash
  git tag v0.2.0-stack-upgraded
  git push origin v0.2.0-stack-upgraded
  ```

### Task 6.8 — Smoke en demo Render desplegado

- [ ] **6.8.1** Esperar a que Render despliegue auto-detectando push (~3-5 min).
- [ ] **6.8.2** Abrir URL demo y verificar:
  - Login con credencial demo.
  - Navegar funcionarios, admin, perfil.
  - Logout.
- [ ] **6.8.3** Si algo falla en demo pero funcionaba en local, revisar logs Render por errores de runtime (cookies async, params async).

---

## Bloque 7 — Documentación final

### Task 7.1 — Actualizar `apps/web/README.md`

- [ ] **7.1.1** Reescribir secciones:
  ```markdown
  # Bomberos Caracas — Web

  Frontend institucional. Conecta con [`apps/api`](../api) vía REST.

  ## Stack

  - **Next.js 15** App Router + TypeScript estricto
  - **React 19** (refs como prop, useActionState, async cookies/params)
  - **Tailwind CSS 4** (CSS-first con `@theme` en `globals.css`)
  - **TanStack Query 5** para fetching del lado cliente (donde se necesite)
  - **react-hook-form 7 + zod 3** para formularios complejos
  - **Cookies HttpOnly** para tokens (no localStorage — más seguro contra XSS)
  - **Playwright** para smoke tests (`npm run e2e`)
  - **ESLint 9** con flat config

  ## Scripts

  ```bash
  npm run dev         # dev server en :3000
  npm run build       # build producción
  npm run start       # start producción
  npm run lint        # eslint
  npm run typecheck   # tsc --noEmit
  npm run e2e         # playwright smoke + visual
  ```
  ```

### Task 7.2 — Actualizar `docs/ROADMAP.md`

- [ ] **7.2.1** Marcar Fase 0 como CERRADA. Añadir nota:
  ```markdown
  ## Fase 0 — Upgrade Stack ✅ CERRADA (2026-05-XX)

  Frontend migrado a Next 15 + React 19 + Tailwind 4 + ESLint 9.
  Plan: `docs/superpowers/plans/2026-05-19-fase-0-upgrade-stack.md`.
  Tag: `v0.2.0-stack-upgraded`.

  Los módulos pendientes (§5 Fase 4) se escriben sobre este stack.
  ```
- [ ] **7.2.2** En §5 (Fase 4 frontend modules), agregar nota:
  > **Stack base:** React 19 (refs como prop, `useActionState`), Next 15 (async `cookies()`/`headers()`/`params`/`searchParams`), Tailwind 4 (`@theme` en `globals.css`). NO usar `forwardRef`, NO usar `useFormState`, NO crear `tailwind.config.ts`.

### Task 7.3 — Actualizar `CLAUDE.md` del proyecto

- [ ] **7.3.1** Si `bomberos-caracas-bd/CLAUDE.md` o `apps/web/CLAUDE.md` existen y mencionan Next 14 / React 18 / Tailwind 3, sustituir por versiones nuevas. Ya está alineado con CLAUDE.md global.

### Task 7.4 — Eliminar artefacto temporal

- [ ] **7.4.1** Eliminar `apps/web/UPGRADE-METRICS.md` (era solo medición temporal). Si se quiere conservar como bitácora, moverlo a `docs/superpowers/plans/2026-05-19-fase-0-upgrade-metrics.md`.

### Task 7.5 — Commit final

- [ ] **7.5.1**
  ```bash
  git add apps/web/README.md docs/ROADMAP.md docs/superpowers/plans/
  git commit -m "docs(fase-0): update stack documentation post-upgrade"
  git push origin main
  ```

---

## Resumen ejecutivo

| Bloque | Descripción                                  | Archivos tocados | Riesgo  | Esfuerzo |
|--------|----------------------------------------------|------------------|---------|----------|
| 0      | Preparación + Playwright baseline            | ~5 nuevos        | Bajo    | 0.5 día  |
| 1      | Next 14→15 + React 18→19 + async cookies/params | ~35              | Alto    | 1.5 días |
| 2      | forwardRef (N/A — 0 archivos)                | 0                | Nulo    | 0 días   |
| 3      | useFormState → useActionState                | 27               | Medio   | 1.5 días |
| 4      | Tailwind 3 → 4                               | 3                | Alto    | 1 día    |
| 5      | ESLint 8 → 9 flat config                     | 3                | Bajo    | 0.5 día  |
| 6      | Validación + rollback plan + merge           | 1 doc nuevo      | Bajo    | 1 día    |
| 7      | Documentación                                | 3                | Nulo    | 0.25 día |

**Total estimado:** 5-7 días dev senior, **0 días downtime** de la demo Render (toda la migración en branch).

**Definition of Done:**
- [ ] 16/16 tests Playwright verdes (6 smoke + 10 visual).
- [ ] `npm run build` y `npm run typecheck` con 0 errores.
- [ ] `npm run lint` con 0 errores y warnings tolerables.
- [ ] Bundle size dentro de ±15% del baseline.
- [ ] Lighthouse mobile ≥ 85 perf / ≥ 90 a11y en login, dashboard, funcionarios.
- [ ] Demo Render funcional.
- [ ] Tag `v0.2.0-stack-upgraded` publicado.
- [ ] `docs/ROADMAP.md` actualizado.

**No-Go criteria (abortar y rollback):**
- Algún flujo crítico (login, listado funcionarios, admin/usuarios) roto en demo después de merge.
- Bundle size +30% sin explicación.
- Lighthouse performance < 70.
- Errores de runtime relacionados con cookies/params en producción.
