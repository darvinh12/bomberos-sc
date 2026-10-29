"""Gestión de funcionarios y reposos contra PostgreSQL real."""

import secrets

import asyncpg
import pytest

from tests.integration.conftest import cedula_aleatoria


async def test_crud_funcionario_con_auditoria(client, pg, admin_headers):
    admin_id = await pg.fetchval("SELECT id FROM seguridad.usuarios WHERE usuario='admin'")
    ced = cedula_aleatoria()

    # Crear
    r = await client.post(
        "/funcionarios",
        headers=admin_headers,
        json={
            "nacionalidad": "V",
            "cedula": ced,
            "apellidos": "Guevara Rondon",
            "nombres": "Maria Jose",
            "fecha_primer_ingreso": "2019-03-01",
            "sexo": "F",
        },
    )
    assert r.status_code == 201, r.text
    creado = r.json()
    fid = creado["id"]
    assert creado["nombre_completo"] == "Guevara Rondon, Maria Jose"
    assert creado["estatus"] == "ACTIVO"
    # El alta genera el primer período de servicio.
    assert await pg.fetchval(
        "SELECT count(*) FROM personal.periodos_servicio WHERE funcionario_id=$1", fid
    ) == 1

    # Leer
    r = await client.get(f"/funcionarios/{fid}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["cedula"] == ced and r.json()["sexo"] == "F"

    # Actualizar
    r = await client.patch(
        f"/funcionarios/{fid}", headers=admin_headers, json={"nombres": "Maria Josefina"}
    )
    assert r.status_code == 200
    assert r.json()["nombre_completo"] == "Guevara Rondon, Maria Josefina"
    assert await pg.fetchval(
        "SELECT nombres FROM personal.funcionarios WHERE id=$1", fid
    ) == "Maria Josefina"

    # Duplicado de cédula → 409 (restricción UNIQUE de la BD)
    r = await client.post(
        "/funcionarios",
        headers=admin_headers,
        json={
            "nacionalidad": "V",
            "cedula": ced,
            "apellidos": "Otra",
            "nombres": "Persona",
            "fecha_primer_ingreso": "2019-03-01",
        },
    )
    assert r.status_code == 409

    # Inexistente → 404
    assert (await client.get("/funcionarios/999999999", headers=admin_headers)).status_code == 404

    # Bitácora: INSERT y UPDATE con el actor y el diff del cambio.
    filas = await pg.fetch(
        "SELECT operacion::text AS op, usuario_id, campos_cambiados "
        "FROM aud.log_cambios WHERE schema_name='personal' AND table_name='funcionarios' "
        "AND registro_id=$1 ORDER BY id",
        str(fid),
    )
    ops = [f["op"] for f in filas]
    assert ops[0] == "I" and "U" in ops
    assert all(f["usuario_id"] == admin_id for f in filas)
    ultima_u = [f for f in filas if f["op"] == "U"][-1]
    assert '"nombres": "Maria Josefina"' in ultima_u["campos_cambiados"]


async def test_busqueda_por_cedula_y_nombre(client, admin_headers, crear_funcionario):
    marca = f"Zq{secrets.token_hex(4)}"
    f1 = await crear_funcionario(apellidos=f"{marca} Perez", nombres="Luis")
    f2 = await crear_funcionario(apellidos=f"{marca} Soto", nombres="Ana")
    await crear_funcionario(apellidos="Distinto", nombres="Nadie")

    # Por cédula exacta
    r = await client.get("/funcionarios", headers=admin_headers, params={"q": str(f1["cedula"])})
    assert r.status_code == 200
    assert [i["id"] for i in r.json()["items"]] == [f1["id"]]

    # Por nombre (sin distinguir mayúsculas)
    r = await client.get("/funcionarios", headers=admin_headers, params={"q": marca.lower()})
    body = r.json()
    assert body["total"] == 2
    assert {i["id"] for i in body["items"]} == {f1["id"], f2["id"]}
    # Orden por apellidos
    assert [i["id"] for i in body["items"]] == [f1["id"], f2["id"]]

    # Sin coincidencias
    r = await client.get("/funcionarios", headers=admin_headers, params={"q": "NoExisteXyz123"})
    assert r.json()["total"] == 0 and r.json()["items"] == []


async def test_paginacion(client, admin_headers, crear_funcionario):
    marca = f"Pg{secrets.token_hex(4)}"
    creados = [await crear_funcionario(apellidos=f"{marca} {i}", nombres="Pag") for i in range(5)]
    ids = {c["id"] for c in creados}

    vistos: list[int] = []
    for pagina, esperados in ((1, 2), (2, 2), (3, 1)):
        r = await client.get(
            "/funcionarios",
            headers=admin_headers,
            params={"q": marca, "page": pagina, "page_size": 2},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 5 and body["pages"] == 3 and body["page"] == pagina
        assert len(body["items"]) == esperados
        vistos += [i["id"] for i in body["items"]]
    assert len(vistos) == 5 and set(vistos) == ids  # sin repetidos ni faltantes

    # Página fuera de rango: lista vacía, no error.
    r = await client.get(
        "/funcionarios", headers=admin_headers, params={"q": marca, "page": 9, "page_size": 2}
    )
    assert r.status_code == 200 and r.json()["items"] == []
    # Límites validados
    r = await client.get("/funcionarios", headers=admin_headers, params={"page_size": 201})
    assert r.status_code == 422
    r = await client.get("/funcionarios", headers=admin_headers, params={"page": 0})
    assert r.status_code == 422


async def test_reposos_solapados_rechazados(client, pg, crear_usuario, headers_de, crear_funcionario):
    h = await headers_de(await crear_usuario("MEDICO"))
    f = await crear_funcionario()
    tipo = await pg.fetchval("SELECT id FROM core.tipos_reposo ORDER BY id LIMIT 1")

    def reposo(ini: str, fin: str) -> dict:
        return {
            "funcionario_id": f["id"],
            "tipo_reposo_id": tipo,
            "fecha_inicio": ini,
            "fecha_fin": fin,
            "diagnostico_libre": "Prueba de integracion",
        }

    r = await client.post("/salud/reposos", headers=h, json=reposo("2025-01-10", "2025-01-20"))
    assert r.status_code == 201, r.text
    assert r.json()["dias"] == 11

    # Se solapa (15 al 25) → la restricción EXCLUDE lo rechaza → 409
    r = await client.post("/salud/reposos", headers=h, json=reposo("2025-01-15", "2025-01-25"))
    assert r.status_code == 409
    # Mismo día de cierre (rango cerrado '[]') también se solapa
    r = await client.post("/salud/reposos", headers=h, json=reposo("2025-01-20", "2025-01-22"))
    assert r.status_code == 409
    # Contiguo, sin solape → aceptado
    r = await client.post("/salud/reposos", headers=h, json=reposo("2025-01-21", "2025-01-30"))
    assert r.status_code == 201

    assert await pg.fetchval(
        "SELECT count(*) FROM salud.reposos WHERE funcionario_id=$1", f["id"]
    ) == 2

    # La restricción vive en la BD: un INSERT directo también se rechaza.
    with pytest.raises(asyncpg.exceptions.ExclusionViolationError):
        await pg.execute(
            "INSERT INTO salud.reposos (funcionario_id, tipo_reposo_id, fecha_inicio, fecha_fin) "
            "VALUES ($1, $2, '2025-01-12', '2025-01-13')",
            f["id"],
            tipo,
        )

    # Otro funcionario sí puede tener reposo en las mismas fechas.
    otro = await crear_funcionario()
    r = await client.post(
        "/salud/reposos",
        headers=h,
        json={**reposo("2025-01-10", "2025-01-20"), "funcionario_id": otro["id"]},
    )
    assert r.status_code == 201


async def test_reposo_fecha_fin_anterior_rechazada(client, pg, admin_headers, crear_funcionario):
    f = await crear_funcionario()
    tipo = await pg.fetchval("SELECT id FROM core.tipos_reposo ORDER BY id LIMIT 1")
    r = await client.post(
        "/salud/reposos",
        headers=admin_headers,
        json={
            "funcionario_id": f["id"],
            "tipo_reposo_id": tipo,
            "fecha_inicio": "2025-05-10",
            "fecha_fin": "2025-05-01",
        },
    )
    assert r.status_code == 422
