# syntax=docker/dockerfile:1.7
# Build context: apps/web (build con `docker compose build web` desde la raíz)

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables públicas embebidas en el bundle del cliente en build-time.
# NEXT_PUBLIC_API_URL relativa (/sigp-api): el navegador llama al mismo
# origen y Caddy enruta hacia la API — funciona con cualquier nombre o IP
# sin rebuilds. Server-side se usa API_INTERNAL_URL (runtime).
ARG NEXT_PUBLIC_DEMO_MODE=0
ARG NEXT_PUBLIC_API_URL=/sigp-api
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
