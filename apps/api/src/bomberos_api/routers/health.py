from fastapi import APIRouter
from sqlalchemy import text

from bomberos_api.core.deps import DbSession

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(db: DbSession) -> dict[str, str]:
    res = await db.execute(text("SELECT 1"))
    res.scalar_one()
    return {"status": "ok", "db": "ok"}


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
