# syntax=docker/dockerfile:1.7
# Build context: repo root (build con `docker build -f apps/api/Dockerfile .`)

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY apps/api/pyproject.toml ./
COPY apps/api/src ./src

RUN pip install --upgrade pip && pip wheel --wheel-dir /wheels .


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WEB_CONCURRENCY=2

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels

COPY --chown=appuser:appuser apps/api/src ./src
COPY --chown=appuser:appuser apps/api/alembic.ini ./alembic.ini
COPY --chown=appuser:appuser apps/api/alembic ./alembic
COPY --chown=appuser:appuser sql ./sql

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "python -m bomberos_api.scripts.bootstrap && exec uvicorn bomberos_api.main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY}"]
