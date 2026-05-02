#!/usr/bin/env bash
set -e

echo "==> Instalando dependencias de la API..."
cd /workspace/apps/api
pip install --upgrade pip
pip install -e ".[dev]"

echo "==> Esperando Postgres..."
until pg_isready -h postgres -U postgres >/dev/null 2>&1; do sleep 1; done

echo "==> Cargando esquema BD si no existe..."
psql -h postgres -U postgres -d bomberos_caracas -tc "SELECT 1 FROM information_schema.schemata WHERE schema_name='personal'" | grep -q 1 || \
    psql -h postgres -U postgres -d bomberos_caracas -f /workspace/sql/99_run_all.sql

echo "==> Listo."
echo "    Para correr la API:    cd apps/api && uvicorn bomberos_api.main:app --reload --host 0.0.0.0"
echo "    Para correr el front:  cd apps/web && pnpm install && pnpm dev"
