"""Autenticación contra PostgreSQL real: login, bloqueo, refresh, 401."""

import jwt

from tests.integration.conftest import CLAVE_PRUEBA, bearer, login

MAX_INTENTOS = 5


async def _accesos(pg, usuario_id: int) -> list[tuple[str, str | None]]:
    filas = await pg.fetch(
        "SELECT tipo_evento::text AS t, detalle FROM aud.log_accesos "
        "WHERE usuario_id = $1 ORDER BY id",
        usuario_id,
    )
    return [(f["t"], f["detalle"]) for f in filas]


async def test_login_exitoso_emite_tokens_y_registra_acceso(client, pg, crear_usuario):
    u = await crear_usuario("CONSULTA")
    r = await login(client, u["usuario"], u["clave"])
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"].lower() == "bearer"
    assert body["expires_in"] == 30 * 60
    access = jwt.decode(body["access_token"], options={"verify_signature": False})
    assert access["type"] == "access" and access["sub"] == str(u["id"])
    assert access["roles"] == ["CONSULTA"]
    assert access["exp"] - access["iat"] == 30 * 60
    assert jwt.get_unverified_header(body["access_token"])["alg"] == "HS256"
    # Persistido: evento LOGIN y ultimo_acceso/ultimo_ip actualizados.
    assert ("LOGIN", None) in await _accesos(pg, u["id"])
    fila = await pg.fetchrow(
        "SELECT ultimo_acceso, host(ultimo_ip) AS ip FROM seguridad.usuarios WHERE id=$1",
        u["id"],
    )
    assert fila["ultimo_acceso"] is not None
    assert fila["ip"] == client.ip


async def test_bloqueo_tras_cinco_intentos_fallidos_persiste(client, pg, crear_usuario):
    u = await crear_usuario("CONSULTA")

    for n in range(1, MAX_INTENTOS + 1):
        r = await login(client, u["usuario"], "ClaveIncorrecta#1")
        assert r.status_code == 401
        # Se consulta con OTRA conexión: el cambio debe estar confirmado en la BD.
        fila = await pg.fetchrow(
            "SELECT intentos_fallidos, bloqueado, motivo_bloqueo "
            "FROM seguridad.usuarios WHERE id=$1",
            u["id"],
        )
        assert fila["intentos_fallidos"] == n
        assert fila["bloqueado"] is (n >= MAX_INTENTOS)

    assert "5 intentos" in fila["motivo_bloqueo"]
    eventos = await _accesos(pg, u["id"])
    fallidos = [d for t, d in eventos if t == "LOGIN_FALLIDO"]
    assert fallidos == [f"intento_{i}" for i in range(1, MAX_INTENTOS + 1)]
    assert [t for t, _ in eventos].count("BLOQUEO") == 1

    # Con la clave CORRECTA, la cuenta bloqueada sigue sin poder entrar.
    r = await login(client, u["usuario"], u["clave"])
    assert r.status_code == 403
    assert "bloqueada" in r.json()["detail"].lower()
    assert ("LOGIN_FALLIDO", "bloqueada") in await _accesos(pg, u["id"])

    # La bitácora de cambios registró el bloqueo con la IP de origen.
    cambio = await pg.fetchrow(
        "SELECT host(ip) AS ip FROM aud.log_cambios WHERE schema_name='seguridad' "
        "AND table_name='usuarios' AND registro_id=$1 "
        "AND campos_cambiados ? 'bloqueado' ORDER BY id DESC LIMIT 1",
        str(u["id"]),
    )
    assert cambio is not None and cambio["ip"] == client.ip


async def test_login_exitoso_reinicia_contador(client, pg, crear_usuario):
    u = await crear_usuario("CONSULTA")
    for _ in range(3):
        assert (await login(client, u["usuario"], "ClaveIncorrecta#1")).status_code == 401
    assert await pg.fetchval(
        "SELECT intentos_fallidos FROM seguridad.usuarios WHERE id=$1", u["id"]
    ) == 3
    assert (await login(client, u["usuario"], u["clave"])).status_code == 200
    fila = await pg.fetchrow(
        "SELECT intentos_fallidos, bloqueado FROM seguridad.usuarios WHERE id=$1", u["id"]
    )
    assert fila["intentos_fallidos"] == 0 and fila["bloqueado"] is False


async def test_usuario_inexistente_registra_intento(client, pg):
    nombre = "no_existe_it_7f3a"
    antes = await pg.fetchval(
        "SELECT count(*) FROM aud.log_accesos WHERE usuario = $1 "
        "AND detalle = 'usuario_inexistente'",
        nombre,
    )
    r = await login(client, nombre, "Cualquier#123")
    assert r.status_code == 401
    assert r.json()["detail"] == "Credenciales inválidas"  # no revela si existe
    despues = await pg.fetchval(
        "SELECT count(*) FROM aud.log_accesos WHERE usuario = $1 "
        "AND detalle = 'usuario_inexistente'",
        nombre,
    )
    assert despues == antes + 1


async def test_refresh_rota_tokens(client, crear_usuario):
    u = await crear_usuario("CONSULTA")
    tokens = (await login(client, u["usuario"], u["clave"])).json()

    r = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    nuevos = r.json()
    assert nuevos["refresh_token"] != tokens["refresh_token"]
    assert nuevos["access_token"] != tokens["access_token"]
    ref = jwt.decode(nuevos["refresh_token"], options={"verify_signature": False})
    assert ref["type"] == "refresh"
    assert ref["exp"] - ref["iat"] == 7 * 24 * 3600

    me = await client.get("/auth/me", headers=bearer(nuevos["access_token"]))
    assert me.status_code == 200 and me.json()["usuario"] == u["usuario"]

    # Un access token no sirve como refresh.
    r = await client.post("/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401


async def test_refresh_rechazado_si_la_cuenta_se_bloquea(client, pg, crear_usuario):
    u = await crear_usuario("CONSULTA")
    tokens = (await login(client, u["usuario"], u["clave"])).json()
    await pg.execute("UPDATE seguridad.usuarios SET bloqueado = TRUE WHERE id=$1", u["id"])
    r = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401
    # Y el access token vigente deja de servir de inmediato.
    r = await client.get("/auth/me", headers=bearer(tokens["access_token"]))
    assert r.status_code == 401


async def test_sin_token_o_token_invalido_401(client, crear_usuario):
    for ruta in ("/auth/me", "/funcionarios", "/salud/reposos"):
        r = await client.get(ruta)
        assert r.status_code == 401, ruta
    r = await client.get("/funcionarios", headers=bearer("no.es.un-jwt"))
    assert r.status_code == 401
    # Token firmado con otra clave.
    falso = jwt.encode(
        {"sub": "1", "type": "access", "iat": 0, "exp": 9999999999},
        "otra-clave-distinta-de-la-del-servidor",
        algorithm="HS256",
    )
    r = await client.get("/funcionarios", headers=bearer(falso))
    assert r.status_code == 401
    # Un refresh token no sirve para llamar a la API.
    u = await crear_usuario("CONSULTA")
    tokens = (await login(client, u["usuario"], u["clave"])).json()
    r = await client.get("/auth/me", headers=bearer(tokens["refresh_token"]))
    assert r.status_code == 401


async def test_cambio_de_clave_no_guarda_password_hash_en_bitacora(client, pg, crear_usuario):
    u = await crear_usuario("CONSULTA")
    tokens = (await login(client, u["usuario"], u["clave"])).json()
    hash_anterior = await pg.fetchval(
        "SELECT password_hash FROM seguridad.usuarios WHERE id=$1", u["id"]
    )

    r = await client.post(
        "/auth/change-password",
        headers=bearer(tokens["access_token"]),
        json={"password_actual": CLAVE_PRUEBA, "password_nuevo": "Otra#Clave2027"},
    )
    assert r.status_code == 204
    hash_nuevo = await pg.fetchval(
        "SELECT password_hash FROM seguridad.usuarios WHERE id=$1", u["id"]
    )
    assert hash_nuevo != hash_anterior

    filas = await pg.fetch(
        "SELECT operacion::text AS op, usuario_id, valor_anterior::text AS va, "
        "valor_nuevo::text AS vn, campos_cambiados::text AS cc "
        "FROM aud.log_cambios WHERE schema_name='seguridad' AND table_name='usuarios' "
        "AND registro_id=$1 ORDER BY id",
        str(u["id"]),
    )
    assert filas, "el disparador no escribió en aud.log_cambios"
    assert filas[0]["op"] == "I"  # alta del usuario también auditada
    for f in filas:
        texto = " ".join(x or "" for x in (f["va"], f["vn"], f["cc"]))
        assert '"password_hash":' not in texto
        assert hash_anterior not in texto and hash_nuevo not in texto

    ultima = filas[-1]
    assert ultima["op"] == "U"
    assert ultima["usuario_id"] == u["id"]  # contexto de auditoría del actor
    assert '"_campos_sensibles_modificados": ["password_hash"]' in ultima["cc"]

    # La clave nueva funciona y la anterior no.
    assert (await login(client, u["usuario"], "Otra#Clave2027")).status_code == 200
    assert (await login(client, u["usuario"], CLAVE_PRUEBA)).status_code == 401
