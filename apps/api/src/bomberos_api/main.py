from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from bomberos_api import __version__
from bomberos_api.config import get_settings
from bomberos_api.core.middleware import (
    RequestLogMiddleware,
    SecurityHeadersMiddleware,
    SimpleRateLimitMiddleware,
)
from bomberos_api.database import dispose_engine, get_engine
from bomberos_api.logging import configure_logging, get_logger
from bomberos_api.routers import (
    admin,
    auth,
    beneficios,
    carrera,
    catalogos,
    dashboard,
    egresos,
    equipo,
    funcionarios,
    health,
    ops,
    salud,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log = get_logger("startup")
    log.info("startup", version=__version__, env=get_settings().app_env)
    get_engine()  # inicializa pool
    yield
    await dispose_engine()
    log.info("shutdown")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Bomberos Caracas API",
        version=__version__,
        description="API del sistema integral del Cuerpo de Bomberos del Distrito Capital.",
        lifespan=lifespan,
        docs_url="/docs" if not s.is_production else None,
        redoc_url="/redoc" if not s.is_production else None,
        openapi_url="/openapi.json" if not s.is_production else None,
    )

    # Middlewares en orden de ejecución reverso al orden de adición
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(SimpleRateLimitMiddleware, per_minute=s.rate_limit_per_minute)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(funcionarios.router)
    app.include_router(catalogos.router)
    app.include_router(salud.router)
    app.include_router(ops.router)
    app.include_router(carrera.router)
    app.include_router(equipo.router)
    app.include_router(beneficios.router)
    app.include_router(egresos.router)
    app.include_router(dashboard.router)
    app.include_router(admin.router)

    return app


app = create_app()
