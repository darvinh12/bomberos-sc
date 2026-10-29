"""Funciones puras de la validación post-carga."""
from datetime import date

from bomberos_migration.validate import (
    antiguedad_registrada,
    clasificar_antiguedad,
    comparar,
    cuadre,
    veredicto,
)


def test_cuadre_detecta_faltantes():
    c = cuadre({"1", "2", "3", "4"}, migradas={"1", "2", "9"}, descartadas={"3", "2"})
    assert (c["migradas"], c["descartadas"], c["faltantes"]) == (2, 1, 1)
    assert c["ejemplos_faltantes"] == ["4"] and not c["cuadra"]
    assert c["fuera_de_alcance_en_destino"] == 1
    assert cuadre({"1"}, {"1"}, set())["cuadra"]


def test_antiguedad_registrada_activo_y_egresado():
    hoy = date(2026, 10, 27)
    primero, dias = antiguedad_registrada([{"FECHA_INGRESO": "2026-10-01"}], hoy)
    assert primero == date(2026, 10, 1) and dias == 27
    _, dias = antiguedad_registrada(
        [{"FECHA_INGRESO": "2020-01-01", "FECHA_EGRESO": "2020-01-31"}], hoy)
    assert dias == 31
    # Reintegro posterior al egreso: sigue activo, cuenta hasta hoy
    _, dias = antiguedad_registrada(
        [{"FECHA_INGRESO": "2026-10-01", "FECHA_EGRESO": "2026-10-05",
          "FECHA_REINTEGRO": "2026-10-10"}], hoy)
    assert dias == 27
    assert antiguedad_registrada([{}], hoy) == (None, None)


def test_clasificar_antiguedad():
    assert clasificar_antiguedad(100, 101, 1) == "igual"
    assert clasificar_antiguedad(1000, 700, 2).startswith("menor en destino")
    assert clasificar_antiguedad(1000, 700, 1) == "diferente (revisar)"
    assert clasificar_antiguedad(None, 5, 1) == "sin datos"


def test_comparar_normaliza():
    assert comparar("Pérez  García", "PEREZ GARCIA")
    assert comparar(date(2020, 1, 1), "2020-01-01")
    assert comparar(None, "")
    assert not comparar("A", "B")


def test_veredicto():
    ok = {"conteos": {"por_tabla_origen": {"X": {"faltantes": 0}}},
          "integridad": {"trazas_sin_fila_destino": {}, "hijos_sin_funcionario": {"a": 0},
                         "funcionarios_con_varios_periodos_abiertos": 0},
          "solapamientos": {"periodos_solapados_en_destino": 0}}
    assert veredicto(ok)["aprobado"]
    malo = {**ok, "solapamientos": {"reposos_solapados_en_destino": 2}}
    v = veredicto(malo)
    assert not v["aprobado"] and "reposos" in v["problemas"][0]
