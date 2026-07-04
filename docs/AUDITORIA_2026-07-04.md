# Auditoría general del proyecto, 4 de julio de 2026

Revisión completa del monorepo hecha con dos agentes de análisis (consistencia interna del frontend y contrato frontend contra backend) más verificación de build, CI y repositorio. Cada hallazgo fue verificado leyendo el código, con archivo y línea. El resumen corto es que el proyecto está sano como demo pero hoy no sobrevive la salida del modo demo, y el CI lleva semanas en rojo sin que los tests del API corran.

## Estado de build y repositorio

| Check | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | 0 errores |
| Build de producción Next.js | Exitoso, 60+ rutas, 87 kB de JS compartido, página más pesada 145 kB |
| Git | Limpio, todo pusheado a `origin/main` |
| CI: Web Build y API Docker build | Pasan |
| CI: API Lint + Tests | **Falla desde hace semanas** |
| ESLint frontend | **Sin configurar** (nunca se inicializó) |
| pytest local | No instalado (Python 3.14 local sin dependencias del API) |

El job "API Lint + Tests" falla en el paso de ruff con 103 errores, en su mayoría `B904` (raise dentro de except sin `from err`) e imports desordenados o sin usar. Como el lint corre antes que los tests, **los tests del API no se ejecutan en ningún lado desde hace semanas**. GitHub además avisa que las actions usadas corren sobre Node 20 deprecado.

## Bloque crítico: el sistema de permisos se rompe fuera de demo

El sistema de permisos granulares funciona en demo porque vive en cookies. Contra el backend real hay tres fallas que juntas dejan sin interfaz a todo usuario que no sea ADMIN.

1. **El GET está detrás del guard ADMIN.** El router `/admin` exige rol ADMIN a nivel router (`routers/admin.py:36`), pero `GET /admin/permisos-recursos` lo consume todo usuario autenticado: el layout (`app/(app)/layout.tsx:128`), la ficha de funcionario y el polling de `usePermisos.ts`. Un usuario RRHH recibe 403, el frontend hidrata el cache vacío y todo devuelve "none".

2. **Shape mismatch.** El backend responde `rol_id: int` (`schemas/permiso_recurso.py:11-19`) y el frontend indexa el cache por `rol_codigo: string` (`lib/permisos-cache.ts:18-23`). Con la respuesta real el cache queda indexado por `undefined` y ningún rol matchea.

3. **El bug LECTURA sigue vivo en los seeds.** El rol real es `CONSULTA` (`sql/04_seed.sql:455`), pero los seeds de `sql/12_permisos_recursos.sql:94-218` y de la migración alembic `20260601_120000` siembran ~20 filas para `LECTURA`, que no existe. El INNER JOIN las descarta en silencio y el rol CONSULTA queda sin ninguna fila en la matriz.

Archivos a tocar para cerrar el bloque: `routers/admin.py` (guard y shape del GET), `schemas/permiso_recurso.py` (exponer `rol_codigo`), `sql/12_permisos_recursos.sql` y la migración alembic (LECTURA a CONSULTA).

## Crítico: contratos frontend a backend rotos al salir de demo

| # | Problema | Ubicación | Efecto fuera de demo |
|---|---|---|---|
| 1 | Componentes cliente llaman a la API sin token. El backend solo acepta `Authorization: Bearer` (`core/deps.py:12-19`), la cookie no sirve | Las 10 secciones de la ficha (`SeccionResumen`, `SeccionSalud`, `SeccionCarrera`, etc.) y `usePermisos.ts:23` | La ficha completa del funcionario se renderiza vacía (401 silenciado por catch) |
| 2 | `POST /admin/usuarios/{id}/password` no existe. El backend expone `/reset-password` con body `{password_nuevo}` | `admin/usuarios/[id]/actions.ts:180-184` vs `routers/admin.py:175` | Reset de contraseña da 404 |
| 3 | `GET /funcionarios/{id}/auditoria` solo existe en demo-fixtures | `SeccionAuditoria.tsx:93` | Sección Auditoría siempre vacía |
| 4 | `<img src="/api/funcionarios/{id}/foto">` no tiene route proxy en Next y el endpoint del backend exige Bearer que un `<img>` no puede enviar | `HeaderFuncionario.tsx:46`, `FotoUpload.tsx:22` | Fotos rotas |
| 5 | Suspender, reactivar y egresar mandan campos (`suspension_*`, `egreso_motivo`, etc.) que no existen en schema, modelo ni SQL. Pydantic los descarta sin error | `acciones/actions.ts:299-604` | El estatus cambia pero motivo, fechas y resolución se pierden sin rastro de auditoría |
| 6 | `GET /catalogos/tipos-reposo` no existe aunque la tabla sí | `funcionarios/[id]/page.tsx:51` | Modal de reposo sin opciones de tipo |
| 7 | `GET /admin/usuarios/{id}/roles` no existe (el comentario del código lo reconoce) | `admin/usuarios/[id]/actions.ts:64-67` | El detalle de usuario nunca muestra roles asignados |
| 8 | `GET /ops/guardias?funcionario_id=` filtro que el backend ignora | `SeccionOperativo.tsx:136` vs `routers/ops.py:39-56` | La sección mostraría todas las guardias de la institución como si fueran del funcionario |

## Alta: bugs visibles en el demo hoy

1. **Sidebar Operativo invisible para roles no ADMIN.** Los 6 ítems de Operativo no tienen `permisoCodigo` (`app/(app)/layout.tsx:47-54`) y el cache siempre se hidrata (aunque sea vacío, `permisos-funcionario.ts:227`). Con cache hidratado, `filtrar()` devuelve false para ítems sin código. Resultado: cualquier rol no ADMIN pierde Guardias, Vacaciones, Permisos, Comisiones, Faltas y Reposos del sidebar, y el módulo "operativo" que sí se configura en la matriz no controla nada.

2. **Crear funcionario crashea en demo.** `funcionarios/nuevo/actions.ts` no tiene guard demo. `api.post` devuelve `undefined` en demo y la línea 237 (`created.id`) lanza TypeError fuera del try/catch. La página de error de Next aparece al intentar crear.

3. **Detalle de guardia crashea en demo.** `GET /ops/guardias/{id}` no tiene case en `demoResolve`, el default devuelve un paginado sin `funcionarios_asignados` y la página revienta (`ops/guardias/[id]/page.tsx:40`). Hay links a esa página desde el listado.

4. **Dos componentes dark-only ilegibles en modo claro.** El tono warning del panel de acciones (`PanelAcciones.tsx:200-206`, texto amber-200 sobre card blanca) y el `WarningBanner` que usan todos los formularios de acciones (`_form-shared.tsx:53-60`).

## Media

1. **~40 gates de página con roles hardcoded** que ignoran lo que el ADMIN configure en `/admin/permisos`: `requireRoleOrRedirect(["ADMIN","RRHH",...])` en carrera, salud, beneficios, egresos, ops, equipo, funcionarios/nuevo y todos los formularios nuevo/editar. Solo la sidebar, las secciones de la ficha y el panel de acciones consultan el sistema editable. Esto conecta con el pendiente PASO 3 y merece decisión de diseño antes de tocar código.

2. **Formularios de edición vacíos en demo** para reposos, permisos y vacaciones (`GET /salud/reposos/{id}`, `/ops/permisos/{id}`, `/ops/vacaciones/{id}` sin fixture, muestran "Funcionario #undefined"). El patrón correcto ya existe en `beneficios/[id]/editar/page.tsx:39-40`.

3. **SeccionEquipos huérfana.** Existe el componente, el type y la entrada en DEFAULT_MATRIZ, pero no se renderiza en la ficha ni es configurable en la matriz. La sección Equipos de la ficha se perdió en alguna integración.

4. **~30 server actions demo sin persistencia** (ops, salud, beneficios, carrera, equipo, ficha, acciones del panel, perfil). Devuelven ok sin guardar. Esperado en demo, pero conviene saber la lista completa al conectar backend real. El patrón bueno con cookie ya existe en admin/roles, admin/permisos, catálogos, organización y campos custom.

5. **Iconos con colores `-400` sin par claro** en ~12 archivos (contraste ~2.2:1 sobre fondo claro, bajo AA).

## Baja

Código muerto: `PageHeader.tsx`, `PrintButton.tsx`, `FormAsignarProteccion.tsx`, `FormAsignarRadio.tsx`, `ROLES_DISPONIBLES` (ya nadie lo importa), `DEMO_ME`, re-exports legacy del panel. Endpoints huérfanos del backend sin consumidor (refresh token que nunca se usa, lesiones y evaluación física solo GET, dashboard inventario). El baseline SQL 01 a 07 no tiene migración alembic, un entorno nuevo exige `sql/99_run_all.sql` antes de `alembic upgrade` y conviene documentarlo. Huecos de numeración en sql (no hay 06 ni 09). Seis `console.warn` deliberados aceptables.

Lo que sí verificó bien: los 22 catálogos admin, organización, parámetros, roles, módulos, scopes, matriz de permisos legacy, CRUD de funcionarios con 8 sub-entidades y soft-delete, ops, salud, carrera, equipo, beneficios y egresos apuntan a rutas existentes con método correcto. Las 4 migraciones alembic replican 1:1 sus SQL. No hay console.log ni TODO olvidados.

## Plan de arreglo propuesto, en orden

1. **Bloque permisos backend** (crítico, 4 archivos): guard y shape de `GET /admin/permisos-recursos`, seeds LECTURA a CONSULTA. Sin esto el sistema de permisos no existe fuera de demo.
2. **Bugs visibles del demo** (rápidos): permisoCodigo para ítems Operativo del sidebar, guard demo en crear funcionario, fixture de detalle de guardia, par claro para los 2 componentes dark-only.
3. **CI en verde**: `ruff --fix` para lo automático, `B904` a mano, configurar ESLint, actualizar actions a Node 24.
4. **Contratos rotos**: path y body del reset password, endpoint de auditoría por funcionario, route proxy de foto, tipos-reposo, roles por usuario, campos de suspensión/egreso en schema y BD.
5. **Estrategia de datos client-side de la ficha**: decidir entre proxy Next con el token de la cookie o mover las cargas a server components. Afecta a las 10 secciones.
6. **Decisión de diseño sobre gates de página** (junto con PASO 3 de scopes): migrar los ~40 `requireRoleOrRedirect` hardcoded al sistema editable.
