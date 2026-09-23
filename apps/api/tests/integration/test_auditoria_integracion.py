"""Disparadores de auditoría (sql/14_auditoria_excluir_sensibles.sql)."""

import json
import secrets

ESQUEMAS_DOMINIO = [
    "core", "geo", "org", "personal", "salud", "ops", "carrera", "equipo",
    "beneficios", "vivienda", "egresos", "documentos", "seguridad", "sys",
]

TABLAS_AGREGADAS_EN_14 = [
    "core.tipos_personal",
    "core.estatus_funcionarios",
    "core.instituciones_formadoras",
    "core.tipos_vivienda",
    "core.tenencias_vivienda",
    "core.parentescos",
    "core.tipos_nacionalizacion",
    "core.idiomas",
    "core.paises",
    "core.secciones_funcionario",
    "personal.funcionario_idiomas",
    "seguridad.permisos_recursos",
]


async def test_todas_las_tablas_de_dominio_tienen_disparador(pg):
    faltantes = await pg.fetch(
        """
        SELECT n.nspname || '.' || c.relname AS tabla
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r' AND n.nspname = ANY($1::text[])
           AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                            WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
                              AND t.tgfoid = 'aud.fn_audit()'::regprocedure)
        """,
        ESQUEMAS_DOMINIO,
    )
    assert [f["tabla"] for f in faltantes] == []


async def test_las_doce_tablas_nuevas_tienen_disparador(pg):
    con_disparador = await pg.fetch(
        """
        SELECT c.oid::regclass::text AS tabla
          FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal AND t.tgfoid = 'aud.fn_audit()'::regprocedure
        """
    )
    nombres = {f["tabla"] for f in con_disparador}
    assert set(TABLAS_AGREGADAS_EN_14) <= nombres
    assert len(TABLAS_AGREGADAS_EN_14) == 12


async def test_catalogo_nuevo_escribe_en_bitacora(pg):
    codigo = f"T{secrets.token_hex(3)}".upper()
    async with pg.transaction():
        await pg.execute("SELECT set_config('app.usuario_id', '1', true)")
        nuevo_id = await pg.fetchval(
            "INSERT INTO core.idiomas (codigo, nombre) VALUES ($1, $2) RETURNING id",
            codigo,
            f"Idioma de prueba {codigo}",
        )
    fila = await pg.fetchrow(
        "SELECT operacion::text AS op, usuario_id FROM aud.log_cambios "
        "WHERE schema_name='core' AND table_name='idiomas' AND registro_id=$1",
        str(nuevo_id),
    )
    assert fila is not None and fila["op"] == "I" and fila["usuario_id"] == 1
    await pg.execute("DELETE FROM core.idiomas WHERE id=$1", nuevo_id)
    assert await pg.fetchval(
        "SELECT count(*) FROM aud.log_cambios WHERE schema_name='core' "
        "AND table_name='idiomas' AND registro_id=$1 AND operacion='D'",
        str(nuevo_id),
    ) == 1


async def test_fn_audit_excluye_todas_las_columnas_sensibles(pg):
    nombre = f"it_sql_{secrets.token_hex(4)}"
    secreto = f"SECRETO-{secrets.token_hex(8)}"
    uid = await pg.fetchval(
        "INSERT INTO seguridad.usuarios (usuario, password_hash, nombre_completo, mfa_secret) "
        "VALUES ($1, $2, 'Prueba SQL', $2) RETURNING id",
        nombre,
        secreto,
    )
    await pg.execute(
        "UPDATE seguridad.usuarios SET password_hash=$2, mfa_secret=$2, "
        "token_recuperacion=$2 WHERE id=$1",
        uid,
        secreto + "-2",
    )
    # UPDATE que solo toca una columna sensible: queda constancia del NOMBRE.
    await pg.execute(
        "UPDATE seguridad.usuarios SET token_recuperacion='otro-' || $2 WHERE id=$1",
        uid,
        secreto,
    )
    await pg.execute("DELETE FROM seguridad.usuarios WHERE id=$1", uid)

    filas = await pg.fetch(
        "SELECT operacion::text AS op, coalesce(valor_anterior::text,'') || "
        "coalesce(valor_nuevo::text,'') || coalesce(campos_cambiados::text,'') AS t, "
        "campos_cambiados::text AS cc "
        "FROM aud.log_cambios WHERE schema_name='seguridad' AND table_name='usuarios' "
        "AND registro_id=$1 ORDER BY id",
        str(uid),
    )
    assert [f["op"] for f in filas] == ["I", "U", "U", "D"]
    for f in filas:
        assert secreto not in f["t"]
        for col in ("password_hash", "mfa_secret", "token_recuperacion"):
            assert f'"{col}":' not in f["t"]
    assert (
        '["mfa_secret", "password_hash", "token_recuperacion"]' in filas[1]["cc"]
    )
    solo_sensible = json.loads(filas[2]["cc"])
    assert solo_sensible["_campos_sensibles_modificados"] == ["token_recuperacion"]
    # Además del nombre de la columna solo aparece updated_at (disparador de fecha).
    assert set(solo_sensible) == {"_campos_sensibles_modificados", "updated_at"}


async def test_bitacora_historica_saneada(pg):
    # El script 14 limpia los registros previos (p. ej. el alta del admin en 04_seed).
    assert await pg.fetchval(
        "SELECT count(*) FROM aud.log_cambios WHERE valor_anterior ? 'password_hash' "
        "OR valor_nuevo ? 'password_hash' OR campos_cambiados ? 'password_hash'"
    ) == 0
