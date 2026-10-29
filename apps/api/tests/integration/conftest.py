"""Fixtures de las pruebas de integración contra PostgreSQL real.

Requisitos: una BD PostgreSQL con el esquema cargado mediante
`psql -f sql/99_run_all.sql` y la variable DATABASE_URL apuntando a ella.

- Si la BD no está disponible, las pruebas se OMITEN (skip) con el motivo.
- Con BOMBEROS_REQUIRE_DB=1 (lo usa el CI) la falta de BD es un FALLO, para
  que el pipeline no pase en verde sin haber ejecutado las pruebas.

Cada prueba usa usuarios y funcionarios con nombres/cédulas aleatorios, así que
pueden correr repetidamente sobre la misma BD sin limpiarla.
"""

import os
import secrets
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import httpx
import pytest

from bomberos_api.config import get_settings
from bomberos_api.database import dispose_engine
from bomberos_api.main import app

ADMIN_USER = os.environ.get("BOMBEROS_TEST_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("BOMBEROS_TEST_ADMIN_PASSWORD", "Admin#2026*")
CLAVE_PRUEBA = "Sup3rPass!2026"

_AQUI = Path(__file__).parent


def pytest_collection_modifyitems(config, items):
    for item in items:
        if _AQUI in Path(str(item.fspath)).parents:
            item.add_marker(pytest.mark.integration)


def _dsn() -> str:
    return get_settings().database_url.replace("+asyncpg", "")


def _no_disponible(motivo: str) -> None:
    if os.environ.get("BOMBEROS_REQUIRE_DB") == "1":
        pytest.fail(f"BD de pruebas no disponible: {motivo}")
    pytest.skip(f"BD de pruebas no disponible: {motivo}")


@pytest.fixture
async def pg() -> AsyncIterator[asyncpg.Connection]:
    """Conexión directa (fuera de la API) para preparar datos y verificar que
    los cambios quedaron PERSISTIDOS, no solo en la sesión de la API."""
    try:
        conn = await asyncpg.connect(_dsn(), timeout=5)
    except Exception as e:
        _no_disponible(f"{type(e).__name__}: {e}")
    esquema_ok = await conn.fetchval(
        "SELECT to_regclass('aud.log_cambios') IS NOT NULL "
        "AND to_regclass('seguridad.usuarios') IS NOT NULL"
    )
    if not esquema_ok:
        await conn.close()
        _no_disponible("esquema no cargado (ejecute sql/99_run_all.sql)")
    try:
        yield conn
    finally:
        await conn.close()


@pytest.fixture
async def client(pg) -> AsyncIterator[httpx.AsyncClient]:
    # IP de origen distinta por prueba: el rate limit en memoria es por IP.
    ip = "10.{}.{}.{}".format(*(secrets.randbelow(250) + 1 for _ in range(3)))
    transport = httpx.ASGITransport(app=app, client=(ip, 50000))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        c.ip = ip  # type: ignore[attr-defined]
        yield c
    # El engine global queda ligado al event loop de la prueba: se descarta.
    await dispose_engine()


async def login(client: httpx.AsyncClient, usuario: str, clave: str) -> httpx.Response:
    return await client.post("/auth/login", data={"username": usuario, "password": clave})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def admin_headers(client) -> dict[str, str]:
    r = await login(client, ADMIN_USER, ADMIN_PASSWORD)
    assert r.status_code == 200, f"login admin falló: {r.status_code} {r.text}"
    return bearer(r.json()["access_token"])


@pytest.fixture
def crear_usuario(client, admin_headers):
    """Crea un usuario real vía POST /admin/usuarios con los roles indicados."""

    async def _crear(*roles: str) -> dict:
        nombre = f"it_{secrets.token_hex(5)}"
        r = await client.post(
            "/admin/usuarios",
            headers=admin_headers,
            json={
                "usuario": nombre,
                "nombre_completo": f"Usuario de prueba {nombre}",
                "password": CLAVE_PRUEBA,
                "roles": list(roles),
            },
        )
        assert r.status_code == 201, r.text
        return {"id": r.json()["id"], "usuario": nombre, "clave": CLAVE_PRUEBA}

    return _crear


@pytest.fixture
def headers_de(client):
    async def _headers(usuario: dict) -> dict[str, str]:
        r = await login(client, usuario["usuario"], usuario["clave"])
        assert r.status_code == 200, r.text
        return bearer(r.json()["access_token"])

    return _headers


def cedula_aleatoria() -> int:
    return 80_000_000 + secrets.randbelow(19_999_999)


@pytest.fixture
def crear_funcionario(client, admin_headers):
    async def _crear(**extra) -> dict:
        payload = {
            "nacionalidad": "V",
            "cedula": cedula_aleatoria(),
            "apellidos": "Prueba",
            "nombres": "Integracion",
            "fecha_primer_ingreso": "2020-01-15",
        }
        payload.update(extra)
        r = await client.post("/funcionarios", headers=admin_headers, json=payload)
        assert r.status_code == 201, r.text
        return r.json()

    return _crear
