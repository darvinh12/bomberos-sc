# Pendientes / Próximos pasos

## Bloqueos externos

- **GitHub Pages**: el plan free **no permite Pages en repos privados**. Opciones:
  1. Hacer público el repo (no recomendado por datos institucionales)
  2. Hacer upgrade a GitHub Pro/Team para mantenerlo privado con Pages
  3. Desplegar el sitio estático en **Vercel** (free, soporta repos privados)
     o **Cloudflare Pages** (free, repos privados con Cloudflare Access)

  Mientras tanto, los archivos `docs/api/index.html` (Swagger UI),
  `docs/api/redoc.html` y `docs/landing.html` están listos para abrirse
  localmente o servirse desde cualquier hosting estático. El `openapi.json`
  está versionado en `docs/api/openapi.json`.

- **Migración legacy**: la BD `PERSONALINTEGRADA` estará disponible el lunes.
  Diseñar el script Python con `pyodbc` (lectura) + `psycopg2/SQLAlchemy`
  (escritura) cuando llegue.

## Frontend — siguientes módulos

Los siguientes módulos del backend ya tienen API pero NO frontend aún:
- Permisos (autorización con flujo)
- Comisiones de servicio
- Faltas / procesos administrativos
- Carrera (ascensos, evaluaciones, cursos, méritos)
- Equipo (protección, uniformes, radios) con UI de inventario y devolución
- Beneficios (ayudas con flujo de aprobación)
- Vivienda (postulaciones, casos sociales)
- Egresos (jubilación, fallecimiento)
- Admin (gestión de usuarios y roles)

Cada módulo sigue el patrón ya establecido en
`apps/web/src/app/(app)/funcionarios/page.tsx`.

## Mejoras de seguridad

- **MFA TOTP**: la BD tiene la columna `mfa_secret` y `mfa_activo`. Falta
  el endpoint `/auth/mfa/setup` y verificación en `/auth/login`.
- **Lista de revocación de JWT con Redis**: para logout inmediato. Hoy
  el JWT vale hasta su `exp` (30 min máx).
- **Row-Level Security**: la tabla `seguridad.usuario_scopes` está lista.
  Falta crear policies en PG por zona/estación.
- **Auditoría enviada a SIEM**: hoy queda en `aud.log_cambios` de la BD.
  Considerar replicación a Elastic/Loki para retención larga.
- **Backups encriptados**: configurar `pgBackRest` o `barman` en producción.

## Despliegue

Cuando esté el infra:
- Reverse proxy con TLS terminado (Caddy / nginx)
- Secret manager (Vault / Doppler / AWS Secrets Manager)
- Healthchecks + alertas (Grafana / Uptime Kuma)
- CI/CD pipeline desde GitHub Actions a servidor de pruebas

## Datos demo

- Cargar: `psql -d bomberos_caracas -f sql/demo_data.sql`
- Limpiar: `psql -d bomberos_caracas -f sql/demo_data_clean.sql`

Ambos identifican registros con `apellidos LIKE '%DEMO'` o
`folio LIKE 'DEMO-%'` en reposos.
