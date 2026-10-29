"""El mapa cubre TODAS las columnas reales del origen y las exclusiones son las acordadas."""
import json
from pathlib import Path

import pytest

from bomberos_migration.analyze import clasificar
from bomberos_migration.mapping import (
    EXTRA,
    MAPEOS,
    UNIDADES,
    como_dict,
    motivo_exclusion,
    unidades_seleccionadas,
)
from bomberos_migration.texto import norm_col

JSON = Path(__file__).resolve().parents[1] / "legacy_inspection_20260504_174805.json"


@pytest.fixture(scope="module")
def inspeccion() -> dict:
    return json.loads(JSON.read_text(encoding="utf-8-sig"))


@pytest.fixture(scope="module")
def columnas_reales(inspeccion) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for c in inspeccion["columns"]:
        out.setdefault(c["TABLE_NAME"], []).append(norm_col(c["COLUMN_NAME"]))
    return out


def test_todas_las_tablas_mapeadas_existen_en_el_origen(columnas_reales):
    faltan = [t for t in MAPEOS if t not in columnas_reales]
    assert faltan == []


def test_cada_columna_real_esta_declarada_en_el_mapa(columnas_reales):
    """Ninguna columna del origen se pierde en silencio: o tiene destino o va a legacy_extra."""
    sin_declarar = {
        t: sorted(set(columnas_reales[t]) - set(m.columnas))
        for t, m in MAPEOS.items()
        if set(columnas_reales[t]) - set(m.columnas)
    }
    assert sin_declarar == {}


def test_el_mapa_no_inventa_columnas(columnas_reales):
    inventadas = {
        t: sorted(set(m.columnas) - set(columnas_reales[t]))
        for t, m in MAPEOS.items()
        if set(m.columnas) - set(columnas_reales[t])
    }
    assert inventadas == {}


def test_funcionarios_34_columnas_todas_declaradas(columnas_reales):
    cols = columnas_reales["FUNCIONARIOS"]
    assert len(cols) == 34
    m = MAPEOS["FUNCIONARIOS"]
    assert {"NACIONALIDAD", "CEDULA", "CORREO_ELECTRONICO", "TELEFONO_MOBIL",
            "N_EMPLEADO"} <= set(m.columnas_con_destino())
    # Lo que no tiene destino claro está declarado explícitamente como EXTRA
    assert set(m.columnas_extra()) == {"COD_UBICACION", "FECHA_ACTUALIZACION"}


def test_claves_existen_en_las_columnas(columnas_reales):
    for t, m in MAPEOS.items():
        assert set(m.clave) <= set(columnas_reales[t]), t


def test_cada_tabla_tiene_destino_y_unidad_valida():
    unidades = {u for u, _ in UNIDADES}
    for m in MAPEOS.values():
        assert m.unidad in unidades
        assert "." in m.destino
        assert all(d == EXTRA or d for d in m.columnas.values())


@pytest.mark.parametrize("tabla", [
    "FUNCIONARIOS_VIEJA", "CARGA_FAMILIAR VIEJA", "REPOSOS_BD_VIEJA", "ASCENSOS_GENERAL_old",
    "HISTORICO_JERARQUIA_OLD2015", "Diagnostico_ConsultaOLD", "HISTORICO_JERARQUIA_2017",
    "TEMP_HISTORICO_JERARQUIA", "TEMPORAL_POSTULADOS", "REPOSOS_TEMP", "REPOSOS(ORIGINAL)",
    "AUDIT_FUNCIONARIOS", "ACCESO", "BENEFICIO_ABRIL2022", "beneficio_oct2021", "BENEFICIO2",
    "Hoja1$", "MINISTERIO_AGOSTO_2019$", "LISTA_AGOSTO_2019", "dtproperties", "sysdiagrams",
    "VACACIONES (ANTES 22-02-17)", "DIRECCION_VIVIENDA_COPIA",
])
def test_tablas_excluidas(tabla):
    assert motivo_exclusion(tabla) is not None


@pytest.mark.parametrize("tabla", [
    "FUNCIONARIOS", "BENEFICIO", "REPOSOS", "ACCESO_ACT_FUN_ASCENSO", "HISTORICO_JERARQUIA",
    "HISTORICO_ASCENSOS_GENERAL_2019", "HISTORICO_EVALUACION_DESEMPEÑO_2019",
    "HISTORICO_ASCENSOS_GENERAL_2018",
])
def test_tablas_canonicas_no_se_excluyen(tabla):
    assert motivo_exclusion(tabla) is None


def test_clasificacion_del_inventario_real(inspeccion):
    tablas = [(t["table_name"], t["row_count"]) for t in inspeccion["tables"]]
    cls = clasificar(tablas)
    assert len(cls["mapeadas"]) == len(MAPEOS) + 1  # + ESPECIALIDADES (apoyo)
    assert sum(len(v) for v in cls.values()) == len(tablas)
    excl = {x["tabla"] for x in cls["excluidas"]}
    assert {"AUDIT_FUNCIONARIOS", "FUNCIONARIOS_VIEJA", "Hoja1$"} <= excl
    assert not any(x["tabla"] in excl for x in cls["mapeadas"])


def test_only_acepta_fases_y_unidades():
    assert unidades_seleccionadas(["funcionarios"]) == ["funcionarios", "periodos_servicio"]
    assert unidades_seleccionadas(["reposos", "historicos"]) == [
        "historico_jerarquias", "historico_ubicaciones", "reposos"]
    with pytest.raises(ValueError):
        unidades_seleccionadas(["inexistente"])


def test_mapa_serializable():
    d = como_dict()
    json.dumps(d, ensure_ascii=False)
    assert d["tablas"]["FUNCIONARIOS"]["columnas"]["TELEFONO_MOBIL"].startswith(
        "personal.funcionarios.telefono_movil")
