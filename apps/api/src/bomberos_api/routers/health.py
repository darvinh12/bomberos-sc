from fastapi import APIRouter
from sqlalchemy import text

from bomberos_api.config import get_settings
from bomberos_api.core.deps import DbSession
from bomberos_api.database import get_session_factory

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(db: DbSession) -> dict[str, str]:
    res = await db.execute(text("SELECT 1"))
    res.scalar_one()
    return {"status": "ok", "db": "ok"}


@router.get("/health/db-diag")
async def health_db_diag() -> dict:
    """Diagnóstico de conexión: no usa DbSession para que reporte el error en lugar de 500."""
    s = get_settings()
    # Mascara: muestra solo el host y los primeros caracteres del usuario
    url = s.database_url
    masked = url
    if "@" in url:
        prefix, suffix = url.split("@", 1)
        if "://" in prefix:
            proto, creds = prefix.split("://", 1)
            user = creds.split(":")[0] if ":" in creds else creds
            masked = f"{proto}://{user[:8]}***@{suffix}"
    out: dict = {"db_url_masked": masked}
    try:
        factory = get_session_factory()
        async with factory() as session:
            res = await session.execute(text("SELECT current_database(), current_user, version()"))
            row = res.first()
            out["connect_ok"] = True
            out["database"] = row[0]
            out["user"] = row[1]
            out["pg_version"] = row[2][:80]
    except Exception as e:
        out["connect_ok"] = False
        out["error"] = f"{type(e).__name__}: {str(e)[:500]}"
    return out


@router.get("/health/schema")
async def health_schema(db: DbSession) -> dict:
    """Diagnóstico temporal: inspecciona schemas y tablas críticas."""
    out: dict = {}
    out["schemas"] = [
        r[0] for r in (await db.execute(text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','public') "
            "ORDER BY 1"
        ))).all()
    ]
    critical_tables = [
        ("seguridad", "usuarios"),
        ("seguridad", "roles"),
        ("seguridad", "usuario_roles"),
        ("seguridad", "modulos"),
        ("seguridad", "rol_permisos"),
        ("aud", "log_accesos"),
        ("aud", "log_cambios"),
        ("personal", "funcionarios"),
        ("core", "estados_civiles"),
    ]
    out["tables"] = {}
    for schema, table in critical_tables:
        exists = await db.scalar(text(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
            "WHERE table_schema=:s AND table_name=:t)"
        ).bindparams(s=schema, t=table))
        out["tables"][f"{schema}.{table}"] = bool(exists)
    try:
        admin = await db.execute(text(
            "SELECT id, activo, bloqueado, length(password_hash), intentos_fallidos "
            "FROM seguridad.usuarios WHERE usuario='admin'"
        ))
        row = admin.first()
        if row:
            out["admin"] = {
                "id": row[0],
                "activo": row[1],
                "bloqueado": row[2],
                "pwd_hash_len": row[3],
                "intentos_fallidos": row[4],
            }
        else:
            out["admin"] = "NOT FOUND"
    except Exception as e:
        out["admin"] = f"ERROR: {e}"
    return out
