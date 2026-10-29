"""Integración contra PostgreSQL real (opcional).

Se ejecuta solo si ``MIGRACION_TEST_DSN`` apunta a una BD de PRUEBAS recién
instalada (sql/01…14, sin migraciones previas: las trazas de otra corrida
cambian los conteos esperados). La prueba ESCRIBE en esa BD (modo --apply):
no la apunte nunca a una base con datos reales.

    $env:MIGRACION_TEST_DSN = "postgresql://postgres:postgres@localhost:5432/bomberos_prueba"
    .venv\\Scripts\\python -m pytest tests/test_integracion_pg.py
"""
import asyncio
import os
from datetime import date

import pytest

from bomberos_migration.destino import DestinoPg
from bomberos_migration.migrate import Motor, Opciones
from bomberos_migration.validate import Validador, veredicto

from .test_pipeline import origen

DSN = os.getenv("MIGRACION_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="MIGRACION_TEST_DSN no definido")


async def _contar(sql: str) -> int:
    import asyncpg

    c = await asyncpg.connect(DSN)
    try:
        return await c.fetchval(sql)
    finally:
        await c.close()


async def _migrar(aplicar: bool, zona: str | None = "Z1"):
    d = DestinoPg(DSN, aplicar=aplicar)
    await d.abrir()
    try:
        op = Opciones(aplicar=aplicar, zona=zona, hoy=date(2026, 10, 27))
        return await Motor(origen(), d, op).ejecutar()
    finally:
        await d.terminar()


async def _validar(zona: str | None):
    import asyncpg

    c = await asyncpg.connect(DSN)
    tr = c.transaction(readonly=True)
    await tr.start()
    try:
        return await Validador(origen(), c, zona, 2, 1, date(2026, 10, 27)).ejecutar()
    finally:
        await tr.rollback()
        await c.close()


def _est(rep, nombre):
    return next(e for e in rep.tablas.values() if e.origen == nombre)


def test_ensayo_apply_idempotencia_y_validacion():
    async def flujo():
        antes = await _contar("SELECT count(*) FROM personal.funcionarios")
        ensayo = await _migrar(aplicar=False)
        assert await _contar("SELECT count(*) FROM personal.funcionarios") == antes
        assert _est(ensayo, "EXPEDIENTE").insertadas == 2
        # El motor rechaza el reposo solapado (EXCLUDE) y queda el motivo
        rep = _est(ensayo, "REPOSOS")
        assert rep.insertadas == 1 and any("solapamiento" in m for m in rep.descartes)

        primera = await _migrar(aplicar=True)
        assert _est(primera, "EXPEDIENTE").insertadas + _est(
            primera, "EXPEDIENTE").sin_cambios == 2
        despues = await _contar("SELECT count(*) FROM personal.funcionarios")
        n_hist = await _contar("SELECT count(*) FROM personal.historico_jerarquias")

        segunda = await _migrar(aplicar=True)
        e = _est(segunda, "EXPEDIENTE")
        assert e.insertadas == 0 and e.sin_cambios == 2
        assert await _contar("SELECT count(*) FROM personal.funcionarios") == despues
        assert await _contar("SELECT count(*) FROM personal.historico_jerarquias") == n_hist

        res = await _validar("Z1")
        assert res["solapamientos"]["reposos_solapados_en_destino"] == 0
        assert res["conteos"]["por_tabla_origen"]["REPOSOS"]["cuadra"]
        assert res["conteos"]["por_tabla_origen"]["FUNCIONARIOS"]["migradas"] == 1
        assert res["muestreo"]["expedientes"]
        return res

    res = asyncio.run(flujo())
    v = veredicto(res)
    assert v["aprobado"], v["problemas"]
