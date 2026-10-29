"""Acotación por zona: ubicación vigente y resolución del argumento --zona."""
from datetime import datetime
from decimal import Decimal

import pytest

from bomberos_migration.alcance import (
    calcular_alcance,
    resolver_zona,
    ubicaciones_vigentes,
    zona_de,
)

ZONAS = [{"COD_ZONA": Decimal(1), "ZONA": "ZONA 1"},
         {"COD_ZONA": Decimal(2), "ZONA": "ZONA OESTE"}]


def test_vigente_prefiere_ubicacion_administrativa_y_la_mas_reciente():
    actual = [
        {"ID": 1, "CEDULA": Decimal(10), "COD_ZONA": 1, "FECHA_DESDE": datetime(2020, 1, 1)},
        {"ID": 2, "CEDULA": Decimal(10), "COD_ZONA": 2, "FECHA_DESDE": datetime(2022, 1, 1)},
    ]
    hist = [{"ID_UBIADM": 9, "CEDULA": 10, "COD_ZONA": 1, "FECHA_DESDE": datetime(2024, 1, 1)}]
    vig = ubicaciones_vigentes(actual, hist)
    assert vig[10]["COD_ZONA"] == 2
    assert vig[10]["_fuente"] == "UBICACION_ADMINISTRATIVA"


def test_vigente_cae_al_ultimo_historico_si_no_hay_actual():
    hist = [
        {"ID_UBIADM": 1, "CEDULA": 20, "COD_ZONA": 1, "FECHA_DESDE": datetime(2010, 1, 1)},
        {"ID_UBIADM": 3, "CEDULA": 20, "COD_ZONA": 2, "FECHA_DESDE": datetime(2015, 1, 1)},
        {"ID_UBIADM": 2, "CEDULA": 20, "COD_ZONA": 1, "FECHA_DESDE": datetime(2015, 1, 1)},
    ]
    vig = ubicaciones_vigentes([], hist)
    # misma fecha → desempata el mayor ID_UBIADM
    assert vig[20]["ID_UBIADM"] == 3 and vig[20]["COD_ZONA"] == 2
    assert vig[20]["_fuente"] == "HISTORICO_UBICACION_ADMINISTRATIVA"


def test_zona_se_deduce_de_la_estacion():
    assert zona_de({"COD_ZONA": None, "COD_ESTACION": 7}, {7: 2}) == 2
    assert zona_de({"COD_ZONA": 1, "COD_ESTACION": 7}, {7: 2}) == 1
    assert zona_de(None, {}) is None


@pytest.mark.parametrize("arg,esperado", [
    ("1", 1), ("2", 2), ("zona 1", 1), ("Zona Oeste", 2), ("Z1", 1), ("z2", 2),
])
def test_resolver_zona(arg, esperado):
    assert resolver_zona(arg, ZONAS, {1: "Z1", 2: "Z2"}) == esperado


def test_resolver_zona_desconocida():
    with pytest.raises(ValueError, match="desconocida"):
        resolver_zona("Z9", ZONAS, {1: "Z1", 2: "Z2"})


def test_calcular_alcance_activos_y_egresados():
    vig = {
        1: {"COD_ZONA": 1, "_fuente": "UBICACION_ADMINISTRATIVA"},
        2: {"COD_ZONA": 2, "_fuente": "UBICACION_ADMINISTRATIVA"},
        3: {"COD_ZONA": None, "COD_ESTACION": 5, "_fuente": "HISTORICO_UBICACION_ADMINISTRATIVA"},
    }
    alc = calcular_alcance({1, 2, 3, 4}, vig, {5: 1}, zona=1)
    assert alc.cedulas == {1, 3}          # 3 es egresado: su último histórico está en Z1
    assert alc.fuera == 1 and alc.sin_ubicacion == [4]
    assert alc.incluye(Decimal(3)) and not alc.incluye(2)
    assert alc.por_fuente == {"UBICACION_ADMINISTRATIVA": 2,
                              "HISTORICO_UBICACION_ADMINISTRATIVA": 1}


def test_sin_zona_entra_todo():
    alc = calcular_alcance({1, 2}, {}, {}, zona=None)
    assert alc.cedulas == {1, 2} and alc.sin_ubicacion == []
