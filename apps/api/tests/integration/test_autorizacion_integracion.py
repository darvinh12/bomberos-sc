"""Autorización por rol (RBAC) contra PostgreSQL real."""

from tests.integration.conftest import cedula_aleatoria

DIAGNOSTICO = ("/health/db-diag", "/health/schema")


async def test_health_publico_sin_token(client):
    # Los usa el healthcheck del contenedor y el cron: deben seguir públicos.
    assert (await client.get("/health")).status_code == 200
    r = await client.get("/health/db")
    assert r.status_code == 200 and r.json() == {"status": "ok", "db": "ok"}


async def test_diagnostico_sin_token_401(client):
    for ruta in DIAGNOSTICO:
        r = await client.get(ruta)
        assert r.status_code == 401, ruta
        assert "pg_version" not in r.text and "admin" not in r.text


async def test_diagnostico_rol_no_admin_403(client, crear_usuario, headers_de):
    for rol in ("CONSULTA", "RRHH", "SUPERVISOR"):
        h = await headers_de(await crear_usuario(rol))
        for ruta in DIAGNOSTICO:
            r = await client.get(ruta, headers=h)
            assert r.status_code == 403, (rol, ruta)


async def test_diagnostico_admin_200(client, admin_headers):
    r = await client.get("/health/db-diag", headers=admin_headers)
    assert r.status_code == 200 and r.json()["connect_ok"] is True
    r = await client.get("/health/schema", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["tables"]["aud.log_cambios"] is True


async def test_consulta_lee_pero_no_escribe_funcionarios(
    client, pg, crear_usuario, headers_de, crear_funcionario
):
    h = await headers_de(await crear_usuario("CONSULTA"))
    existente = await crear_funcionario()

    assert (await client.get("/funcionarios", headers=h)).status_code == 200
    assert (await client.get(f"/funcionarios/{existente['id']}", headers=h)).status_code == 200

    ced = cedula_aleatoria()
    r = await client.post(
        "/funcionarios",
        headers=h,
        json={
            "nacionalidad": "V",
            "cedula": ced,
            "apellidos": "Intruso",
            "nombres": "Consulta",
            "fecha_primer_ingreso": "2021-01-01",
        },
    )
    assert r.status_code == 403
    assert await pg.fetchval(
        "SELECT count(*) FROM personal.funcionarios WHERE cedula=$1", ced
    ) == 0

    r = await client.patch(
        f"/funcionarios/{existente['id']}", headers=h, json={"nombres": "Alterado"}
    )
    assert r.status_code == 403
    assert await pg.fetchval(
        "SELECT nombres FROM personal.funcionarios WHERE id=$1", existente["id"]
    ) == "Integracion"


async def test_rol_sin_permiso_no_crea_reposo_ni_administra(
    client, pg, crear_usuario, headers_de, crear_funcionario
):
    h = await headers_de(await crear_usuario("CONSULTA"))
    f = await crear_funcionario()
    tipo = await pg.fetchval("SELECT id FROM core.tipos_reposo ORDER BY id LIMIT 1")
    r = await client.post(
        "/salud/reposos",
        headers=h,
        json={
            "funcionario_id": f["id"],
            "tipo_reposo_id": tipo,
            "fecha_inicio": "2025-03-01",
            "fecha_fin": "2025-03-05",
        },
    )
    assert r.status_code == 403
    assert (await client.get("/admin/usuarios", headers=h)).status_code == 403


async def test_rrhh_puede_crear_funcionario(client, crear_usuario, headers_de):
    h = await headers_de(await crear_usuario("RRHH"))
    r = await client.post(
        "/funcionarios",
        headers=h,
        json={
            "nacionalidad": "V",
            "cedula": cedula_aleatoria(),
            "apellidos": "Recursos",
            "nombres": "Humanos",
            "fecha_primer_ingreso": "2022-06-01",
        },
    )
    assert r.status_code == 201
