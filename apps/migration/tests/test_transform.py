"""Tests unitarios de las transformaciones (no requieren BD)."""
from datetime import date

from bomberos_migration.transform import (
    funcionario_from_legacy,
    parse_cedula,
    parse_date,
    reconstruir_periodos_servicio,
)


def test_parse_cedula_solo_numero():
    assert parse_cedula("12345678") == ("V", 12345678)


def test_parse_cedula_con_letra():
    assert parse_cedula("E12345678") == ("E", 12345678)
    assert parse_cedula("v 1234567") == ("V", 1234567)


def test_parse_cedula_invalida():
    assert parse_cedula(None) is None
    assert parse_cedula("") is None
    assert parse_cedula("abc") is None


def test_parse_date_iso():
    assert parse_date("2026-05-02") == date(2026, 5, 2)


def test_parse_date_dmy():
    assert parse_date("02/05/2026") == date(2026, 5, 2)


def test_parse_date_centinela():
    assert parse_date("01/01/1900") is None
    assert parse_date(None) is None


def test_funcionario_basico():
    raw = {
        "CEDULA": 12345678,
        "APELLIDOS": "Pérez García",
        "NOMBRES": "José Luis",
        "FECHA_NACIMIENTO": "1985-06-12",
        "SEXO": "M",
        "FECHA_INGRESO": "2010-01-15",
        "ESTATUS": "ACTIVO",
    }
    out = funcionario_from_legacy(raw)
    assert out is not None
    assert out["nacionalidad"] == "V"
    assert out["cedula"] == 12345678
    assert out["sexo"] == "M"
    assert out["estatus"] == "ACTIVO"
    assert out["fecha_primer_ingreso"] == date(2010, 1, 15)


def test_funcionario_estatus_normalizacion():
    out = funcionario_from_legacy({"CEDULA": 1, "ESTATUS": "Pre Jubilado"})
    assert out is not None
    assert out["estatus"] == "PRE_JUBILADO"
    assert out["pre_jubilado"] is True


def test_periodos_servicio_solo_ingreso():
    out = reconstruir_periodos_servicio({"FECHA_INGRESO": "2010-01-15"})
    assert len(out) == 1
    assert out[0]["fecha_egreso"] is None


def test_periodos_servicio_egreso_y_reingreso():
    out = reconstruir_periodos_servicio(
        {
            "FECHA_INGRESO": "2010-01-15",
            "FECHA_EGRESO": "2015-12-31",
            "FECHA_REINTEGRO": "2018-03-01",
        }
    )
    assert len(out) == 2
    assert out[0]["fecha_egreso"] == date(2015, 12, 31)
    assert out[1]["fecha_ingreso"] == date(2018, 3, 1)
    assert out[1]["fecha_egreso"] is None


def test_periodos_servicio_reingreso_invalido_lo_ignora():
    """Reingreso anterior al egreso no genera período nuevo."""
    out = reconstruir_periodos_servicio(
        {
            "FECHA_INGRESO": "2010-01-15",
            "FECHA_EGRESO": "2015-12-31",
            "FECHA_REINTEGRO": "2010-06-01",
        }
    )
    assert len(out) == 1
