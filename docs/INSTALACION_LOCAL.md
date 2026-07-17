# Instalación local en la intranet de la estación

Guía para desplegar el sistema completo en un servidor de la red local, con el escenario de dimensionamiento acordado: hasta 40 PCs cliente y unos 20 usuarios activos en simultáneo. Todo el stack corre en Docker y las PCs acceden por el nombre `sigp.bomberos`, sin escribir IPs. Complementa a DEPLOY.md, que cubre el despliegue en la nube para la demo.

## 1. Especificaciones recomendadas del servidor

| Recurso | Mínimo funcional | Recomendado (40 PCs / 20 activos) |
|---|---|---|
| CPU | 2 núcleos | 4 a 8 núcleos |
| RAM | 4 GB | 16 GB |
| Disco | 60 GB SSD | 256 GB SSD |
| Red | LAN 100 Mbps, IP fija | LAN gigabit, IP fija |
| Sistema operativo | Windows 10/11 Pro + Docker Desktop | Ubuntu Server 24.04 LTS + Docker Engine |
| Software | Docker + Docker Compose | Docker + Docker Compose |

Las PCs cliente solo necesitan un navegador moderno (Chrome, Edge o Firefox) y estar en la misma red. La instalación por PC es ejecutar una vez `deploy/instalar-cliente.bat` como administrador, que registra el nombre y deja el ícono "SIGP Bomberos" en el escritorio.

Sobre el disco: la base de datos con 5.000 expedientes ronda los 2 GB. Lo que crece son los archivos adjuntos (fotos, huellas, firmas, documentos), estimados entre 5 y 15 GB en los primeros años. Los 256 GB dan margen para el histórico completo más los respaldos locales.

## 2. Arquitectura que se levanta

Cuatro contenedores definidos en el `docker-compose.yml` de la raíz:

| Servicio | Función | Puerto expuesto |
|---|---|---|
| `caddy` | Puerta única: enruta la web y la API bajo el mismo origen | 80 |
| `web` | Frontend Next.js (build standalone) | interno |
| `api` | Backend FastAPI, 2 workers | 8000 (opcional, solo diagnóstico) |
| `postgres` | Base de datos | interno |

Las PCs entran a `http://sigp.bomberos` (puerto 80). Caddy manda `/sigp-api/*` a la API y el resto a la web, así el navegador siempre habla con un solo origen y no hay problemas de CORS aunque cambie el nombre o la IP.

Al primer arranque, la API corre un bootstrap idempotente que aplica los esquemas SQL si la base está vacía y crea el usuario administrador inicial desde variables de entorno.

## 3. Preparación (una sola vez, en una máquina con internet)

La intranet no tiene salida a internet, así que las imágenes se construyen afuera y viajan en un pendrive o disco externo.

En la máquina con internet, dentro del repositorio:

```powershell
# Construir todas las imágenes (postgres y caddy se descargan solas)
docker compose build
docker compose pull postgres caddy

# Exportarlas a archivos
docker save -o bomberos_api.tar bomberos-caracas-bd-api
docker save -o bomberos_web.tar bomberos-caracas-bd-web
docker save -o postgres16.tar postgres:16-alpine
docker save -o caddy2.tar caddy:2-alpine
```

Copiar al medio externo: el repositorio y los cuatro archivos `.tar`. Si el servidor va a ser Windows, el instalador de Docker Desktop también viaja en el pendrive.

En el servidor de la estación:

```powershell
docker load -i postgres16.tar
docker load -i caddy2.tar
docker load -i bomberos_api.tar
docker load -i bomberos_web.tar
```

## 4. Configuración del servidor

Crear un archivo `.env` en la raíz del repositorio:

```
JWT_SECRET_KEY=<cadena aleatoria de 64+ caracteres>
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_PASSWORD=<contraseña fuerte inicial>
BOOTSTRAP_ADMIN_EMAIL=admin@bomberos.gob.ve
```

Para generar el JWT secret en PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | % {[char]$_})
```

Asignarle al servidor una IP fija (en el router por reserva DHCP, o en la configuración de red de Windows/Ubuntu).

## 5. Arranque

```powershell
docker compose up -d
```

Eso levanta los cuatro servicios. Verificar:

```powershell
curl http://localhost/           # la web responde por Caddy
curl http://localhost:8000/health  # la API responde directo
```

Primer ingreso desde el propio servidor: `http://localhost` con el usuario y contraseña del bootstrap. El sistema fuerza el cambio de contraseña en el primer login. Los contenedores arrancan solos al reiniciar el servidor (`restart: unless-stopped`), solo Docker debe estar configurado para iniciar con el sistema.

## 6. Instalación en las PCs cliente

1. Editar `deploy/instalar-cliente.bat` y poner la IP fija real del servidor en la línea `set SERVIDOR_IP=`.
2. Copiarlo a un pendrive.
3. En cada PC: clic derecho, "Ejecutar como administrador".

El script registra `sigp.bomberos` en el archivo hosts de Windows, crea el acceso directo "SIGP Bomberos" en el escritorio y limpia el caché DNS. Desde ese momento el usuario entra con doble clic al ícono, o escribiendo `sigp.bomberos` en el navegador. Nunca ve una IP.

Si más adelante la institución monta un DNS interno (en el router o en un Active Directory), basta con crear ahí la entrada `sigp.bomberos` y el script de hosts deja de ser necesario para las PCs nuevas. Nada del sistema cambia.

## 7. Respaldo diario

Programar en el servidor (tarea programada de Windows o cron en Linux):

```powershell
docker exec bomberos_pg pg_dump -U postgres bomberos_caracas > "D:\respaldos\bomberos_$(Get-Date -Format yyyy-MM-dd).sql"
```

Conservar al menos 14 días y copiar semanalmente a un segundo medio. El respaldo debe incluir también la carpeta de archivos adjuntos cuando el módulo de documentos entre en uso.

## 8. Qué falta para producción real

1. Migración de los datos del sistema legacy (plan en docs/MIGRACION_LEGACY_PLAN.md).
2. Con la proyección de 20 usuarios activos: cache de permisos a Redis y 4 workers de uvicorn, más el endpoint agregado del expediente (detalle en la auditoría del 4 de julio).
3. Scheduler para procesos programados (cierres automáticos, alertas de vencimiento) cuando esas funcionalidades se implementen.
4. TLS interno si la institución lo exige: cambiar `:80` por el nombre en `deploy/Caddyfile` y montar certificados propios.

---

_Última actualización: julio 2026_
