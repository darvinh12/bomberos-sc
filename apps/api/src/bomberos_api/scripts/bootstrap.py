"""Bootstrap idempotente para producción.

Aplica los .sql en sql/ si la BD está vacía y crea (o actualiza) un usuario
ADMIN inicial leyendo BOOTSTRAP_ADMIN_USER, BOOTSTRAP_ADMIN_PASSWORD,
BOOTSTRAP_ADMIN_EMAIL del entorno. Si BOOTSTRAP_ADMIN_PASSWORD no está
seteada, omite la creación del usuario y solo aplica los SQL pendientes.

Es seguro correr en cada arranque: detecta si los esquemas ya existen
antes de aplicar los SQL.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg

from bomberos_api.config import get_settings
from bomberos_api.core.security import hash_password

_HERE = Path(__file__).resolve()
# bootstrap.py: src/bomberos_api/scripts/bootstrap.py
# Repo root: parents[5] (scripts→bomberos_api→src→api→apps→root)
REPO_ROOT_SQL = _HERE.parents[5] / "sql"
ALT_SQL_DIR = Path("/app/sql")  # contenedor


def _resolve_sql_dir() -> Path:
    if ALT_SQL_DIR.is_dir():
        return ALT_SQL_DIR
    if REPO_ROOT_SQL.is_dir():
        return REPO_ROOT_SQL
    raise FileNotFoundError(
        f"No se encontró carpeta sql/: {REPO_ROOT_SQL} ni {ALT_SQL_DIR}"
    )


def _to_sync_dsn(async_dsn: str) -> str:
    return async_dsn.replace("+asyncpg", "")


async def _schema_exists(conn: asyncpg.Connection, schema: str) -> bool:
    return bool(
        await conn.fetchval(
            "SELECT 1 FROM pg_namespace WHERE nspname = $1", schema
        )
    )


async def _table_exists(conn: asyncpg.Connection, schema: str, table: str) -> bool:
    return bool(
        await conn.fetchval(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = $1 AND table_name = $2",
            schema, table,
        )
    )


# Sentinelas por archivo: si la tabla existe, se asume que el archivo ya fue aplicado.
_FILE_SENTINELS: dict[str, tuple[str, str]] = {
    "02_dominio.sql": ("personal", "funcionarios"),
    "03_funciones_vistas.sql": ("aud", "log_cambios"),
    "04_seed.sql": ("seguridad", "roles"),
    "05_campos_custom.sql": ("sys", "campos_custom"),
    "07_roles_por_departamento.sql": ("seguridad", "usuario_rol_scope"),
}


async def _apply_sql_files(conn: asyncpg.Connection, sql_dir: Path) -> list[str]:
    applied: list[str] = []
    files = sorted(p for p in sql_dir.iterdir() if p.suffix == ".sql")
    for path in files:
        # Saltar si ya fue aplicado (basado en sentinela)
        sentinel_schema = "core" if path.name.startswith("01") else None
        if sentinel_schema and await _schema_exists(conn, sentinel_schema):
            print(f"[bootstrap] {path.name} omitido (schema {sentinel_schema} ya existe)")
            continue
        if path.name in _FILE_SENTINELS:
            schema, table = _FILE_SENTINELS[path.name]
            if await _table_exists(conn, schema, table):
                print(f"[bootstrap] {path.name} omitido ({schema}.{table} ya existe)")
                continue
        print(f"[bootstrap] aplicando {path.name}…")
        sql = path.read_text(encoding="utf-8")
        try:
            await conn.execute(sql)
            applied.append(path.name)
        except (
            asyncpg.exceptions.DuplicateSchemaError,
            asyncpg.exceptions.DuplicateObjectError,
            asyncpg.exceptions.DuplicateTableError,
            asyncpg.exceptions.DuplicateColumnError,
            asyncpg.exceptions.DuplicateFunctionError,
        ) as e:
            print(f"[bootstrap] {path.name} parcialmente aplicado (ignorado): {type(e).__name__}: {str(e)[:200]}")
        except Exception as e:
            # No abortamos — queremos llegar a _ensure_admin_user igual.
            print(f"[bootstrap] {path.name} ERROR (continuando): {type(e).__name__}: {str(e)[:200]}")
    return applied


async def _ensure_admin_user(conn: asyncpg.Connection) -> None:
    user = os.environ.get("BOOTSTRAP_ADMIN_USER", "admin")
    pwd = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD")
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@bomberos.local")
    if not pwd:
        print("[bootstrap] BOOTSTRAP_ADMIN_PASSWORD no seteada; omitiendo seed de admin")
        return

    pwd_hash = hash_password(pwd)
    existing_id = await conn.fetchval(
        "SELECT id FROM seguridad.usuarios WHERE usuario = $1", user
    )
    if existing_id:
        await conn.execute(
            """UPDATE seguridad.usuarios
                  SET password_hash = $1,
                      activo = TRUE,
                      bloqueado = FALSE,
                      intentos_fallidos = 0,
                      debe_cambiar_password = TRUE
                WHERE id = $2""",
            pwd_hash,
            existing_id,
        )
        usuario_id = existing_id
        print(f"[bootstrap] password reseteada para usuario '{user}'")
    else:
        usuario_id = await conn.fetchval(
            """INSERT INTO seguridad.usuarios
                   (usuario, nombre_completo, correo, password_hash,
                    activo, debe_cambiar_password)
               VALUES ($1, $2, $3, $4, TRUE, TRUE)
               RETURNING id""",
            user,
            "Administrador inicial",
            email,
            pwd_hash,
        )
        print(f"[bootstrap] usuario '{user}' creado (id={usuario_id})")

    rol_admin = await conn.fetchval(
        "SELECT id FROM seguridad.roles WHERE codigo = 'ADMIN'"
    )
    if not rol_admin:
        await conn.execute(
            "INSERT INTO seguridad.roles (codigo, nombre, descripcion) "
            "VALUES ('ADMIN', 'Administrador', 'Acceso total')"
        )
        rol_admin = await conn.fetchval(
            "SELECT id FROM seguridad.roles WHERE codigo = 'ADMIN'"
        )

    await conn.execute(
        """INSERT INTO seguridad.usuario_roles (usuario_id, rol_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING""",
        usuario_id,
        rol_admin,
    )
    print("[bootstrap] rol ADMIN asignado")


async def main() -> int:
    settings = get_settings()
    dsn = _to_sync_dsn(settings.database_url)
    sql_dir = _resolve_sql_dir()

    print(f"[bootstrap] conectando a {dsn.split('@')[-1]}")
    conn = await asyncpg.connect(dsn)
    try:
        # SQL files es best-effort — si falla algo continuamos al admin.
        try:
            applied = await _apply_sql_files(conn, sql_dir)
            if applied:
                print(f"[bootstrap] SQL aplicados: {', '.join(applied)}")
            else:
                print("[bootstrap] no se aplicaron SQL nuevos")
        except Exception as e:
            print(f"[bootstrap] _apply_sql_files falló (continuando): {type(e).__name__}: {e}")
        # Crítico: siempre intentar resetear admin. Si esto falla, no podemos login.
        try:
            await _ensure_admin_user(conn)
        except Exception as e:
            print(f"[bootstrap] _ensure_admin_user falló: {type(e).__name__}: {e}")
            raise
    finally:
        await conn.close()
    print("[bootstrap] OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as e:
        print(f"[bootstrap] ERROR: {e}", file=sys.stderr)
        # Permitimos que el contenedor siga arrancando aunque bootstrap falle,
        # para no bloquear deploys cuando la BD ya tiene datos consistentes.
        # Ajustar a `raise SystemExit(1)` si se quiere fallar duro.
        sys.exit(0)
