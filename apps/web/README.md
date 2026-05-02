# Bomberos Caracas — Web (Next.js 14)

Frontend institucional. Conecta con [`apps/api`](../api) vía REST.

## Stack

- **Next.js 14** App Router + TypeScript estricto
- **TailwindCSS** + shadcn-style design tokens
- **TanStack Query** para fetching del lado cliente (donde se necesite)
- **react-hook-form** + **zod** para formularios
- **Cookies HttpOnly** para tokens (no localStorage — más seguro contra XSS)

## Páginas implementadas

| Ruta                       | Acceso        | Descripción                     |
|----------------------------|---------------|----------------------------------|
| `/login`                   | Pública       | Login OAuth2 → setea cookies    |
| `/dashboard`               | Autenticado   | Indicadores + distribución zona |
| `/funcionarios`            | Autenticado   | Listado paginado con filtros    |
| `/funcionarios/[id]`       | Autenticado   | Detalle del funcionario         |
| `/salud/reposos`           | Autenticado   | Reposos vigentes                |
| `/ops/guardias`            | Autenticado   | Guardias programadas            |
| `/ops/vacaciones`          | Autenticado   | Vacaciones del año              |

Iremos sumando módulos (carrera, equipamiento, beneficios, admin) en próximas iteraciones.

## Seguridad

- Tokens en **cookies HttpOnly + SameSite=Lax + Secure** (en producción).
- Server actions hacen el login → cliente nunca ve los tokens.
- Cabeceras enviadas por Next: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- `robots: noindex,nofollow` (sistema interno).

## Desarrollo

```bash
pnpm install            # o npm/yarn/bun
cp .env.example .env.local
# Asegúrate de que la API esté corriendo en http://localhost:8000
pnpm dev                # http://localhost:3000
```

## Build / despliegue

```bash
pnpm build && pnpm start
```

Listo para Vercel: detecta Next.js automáticamente. Necesita variables de entorno:
- `NEXT_PUBLIC_API_URL` — URL pública de la API

## Estructura

```
src/
  app/
    (auth)/login/         página pública + server action
    (app)/                grupo autenticado, layout con navegación
      dashboard/
      funcionarios/
      salud/
      ops/
    layout.tsx            root
    page.tsx              redirige a /login o /dashboard
    globals.css           tokens shadcn
  components/
    layout/               LogoutButton + server action
  lib/
    api.ts                cliente HTTP
    session.ts            cookies HttpOnly + requireAuth()
    utils.ts              cn(), formatDate(), formatCedula()
```
