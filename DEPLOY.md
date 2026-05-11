# Despliegue a producción

Pasos para pasar de **demo** (Vercel + fixtures en memoria) a **producción real**
(Postgres + API FastAPI + frontend en Vercel apuntando a la API).

## Resumen

| Componente | Hosting recomendado | Costo entrada |
|---|---|---|
| Postgres 16 | **Neon** (free tier 0.5 GB) o **Railway** ($5 plan starter) | $0 – $5 |
| API FastAPI | **Railway** (Dockerfile) o **Render** | $5 – $7 |
| Frontend Next.js | **Vercel** (ya desplegado) | $0 |

## 1) Crear la base de datos

### Opción A — Neon (más simple, free tier)

1. Crear cuenta en https://neon.tech.
2. New project → región más cercana, Postgres 16.
3. Copiar el connection string que entrega Neon (formato `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).
4. **No corras el SQL aún**: el bootstrap del API lo hará al primer arranque.

### Opción B — Railway (DB + API en mismo lugar)

1. https://railway.app → New Project → Provision Postgres.
2. Railway entrega `DATABASE_URL` automáticamente al servicio que adjuntes.

## 2) Desplegar la API

### Variables que tienes que configurar (en Railway o Render)

```
DATABASE_URL=postgresql://...                        # del paso 1
JWT_SECRET_KEY=<openssl rand -hex 32>
APP_ENV=production
CORS_ORIGINS=https://bomberos-caracas.vercel.app
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_PASSWORD=<contraseña fuerte>
BOOTSTRAP_ADMIN_EMAIL=admin@bomberos.gob.ve
WEB_CONCURRENCY=2
```

> El config valida automáticamente la complejidad del password y normaliza
> `postgres://` / `postgresql://` a `postgresql+asyncpg://`.

### Railway

1. New Service → Deploy from GitHub → repo `ganesh4494/bomberos-caracas-bd`.
2. Railway detecta `railway.toml` y usa `apps/api/Dockerfile` con build context = repo root.
3. Adjunta el plugin Postgres (Connect → tu servicio API). Railway inyecta `DATABASE_URL`.
4. Settings → Variables → pega las demás del bloque de arriba.
5. Deploy. El bootstrap aplica `sql/01_*.sql` … `sql/05_*.sql` y crea el ADMIN inicial.
6. Settings → Networking → Generate Domain → copia la URL pública (`xxx.up.railway.app`).

### Render (alternativa)

1. New Blueprint → conecta el repo. Render lee `render.yaml`.
2. En el dashboard, llena `DATABASE_URL` con el DSN de Neon (o usa la BD que crea Render).
3. Llena `BOOTSTRAP_ADMIN_PASSWORD`.
4. Deploy.

### Verificación post-deploy

```bash
curl https://<tu-api>.up.railway.app/health      # → {"status":"ok"}
curl https://<tu-api>.up.railway.app/health/db   # → {"status":"ok","db":"ok"}
```

## 3) Apuntar el frontend a la API real

1. En Vercel → Project Settings → Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://<tu-api>.up.railway.app
   ```
2. **Desactivar DEMO_MODE**: edita `apps/web/src/lib/demo-fixtures.ts` y cambia
   ```ts
   export const DEMO_MODE = true;
   ```
   por:
   ```ts
   export const DEMO_MODE = false;
   ```
   Commit + push. Vercel re-despliega.
3. Login en https://bomberos-caracas.vercel.app con las credenciales del bootstrap
   (`admin` / la contraseña que pusiste en `BOOTSTRAP_ADMIN_PASSWORD`).
   El sistema te obligará a cambiarla en el primer login.

## 4) Cargar la base de datos vieja (cuando esté disponible)

```bash
cd apps/migration
uv venv && source .venv/bin/activate    # o python -m venv .venv en Windows
uv pip install -e .
bomberos-migrate analyze --legacy "DSN-de-la-bd-vieja"
bomberos-migrate migrate --legacy "DSN-vieja" --target "DSN-nueva-de-Neon"
```

`analyze` te muestra tabla por tabla cuántos registros leerá; `migrate` hace
el UPSERT real. Puedes correrlo varias veces — es idempotente por PK.

## 5) Hardening posterior al primer deploy

- [ ] Cambiar la contraseña del usuario `admin` (forzado en el primer login).
- [ ] Crear usuarios reales con sus roles correspondientes y desactivar el `admin`
      inicial si ya no se necesita.
- [ ] Configurar backups automáticos del Postgres (Railway / Neon lo hacen por defecto).
- [ ] Revisar el endpoint `/admin/auditoria` para auditar las primeras operaciones.
- [ ] Reducir `RATE_LIMIT_PER_MINUTE` si hay abuso (default 120).
