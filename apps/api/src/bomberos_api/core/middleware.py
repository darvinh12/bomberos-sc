from collections import defaultdict
from time import monotonic

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from bomberos_api.config import get_settings
from bomberos_api.logging import get_logger

log = get_logger("middleware")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Cabeceras de seguridad recomendadas (OWASP)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        h.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        if get_settings().is_production:
            h.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )
            h.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self' data:; "
                "script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "frame-ancestors 'none'; form-action 'self'",
            )
        return response


class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting in-memory por IP. Usar Redis en producción multi-instancia."""

    def __init__(self, app, per_minute: int = 120):
        super().__init__(app)
        self.per_minute = per_minute
        self.window = 60.0
        self.hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Saltar healthchecks y docs
        if request.url.path in {"/health", "/health/db", "/docs", "/openapi.json", "/redoc"}:
            return await call_next(request)

        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not ip:
            ip = request.client.host if request.client else "unknown"

        now = monotonic()
        bucket = self.hits[ip]
        # Limpiar requests antiguos
        cutoff = now - self.window
        bucket[:] = [t for t in bucket if t > cutoff]

        if len(bucket) >= self.per_minute:
            log.warning("rate_limit_exceeded", ip=ip, hits=len(bucket))
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Demasiadas solicitudes. Intenta en 1 minuto."},
                headers={"Retry-After": "60"},
            )

        bucket.append(now)
        return await call_next(request)


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Log estructurado de cada request, sin loggear bodies (para evitar PII)."""

    async def dispatch(self, request: Request, call_next):
        start = monotonic()
        response = await call_next(request)
        elapsed_ms = int((monotonic() - start) * 1000)
        log.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            ms=elapsed_ms,
            ip=request.client.host if request.client else None,
        )
        return response
