"""Migración completa en memoria (origen simulado + destino simulado), con y sin --zona."""
import asyncio
from datetime import date, datetime
from decimal import Decimal

import pytest

from bomberos_migration.destino import DestinoNulo
from bomberos_migration.migrate import Motor, Opciones
from bomberos_migration.origen import OrigenMemoria


def d(y, m, dd):
    return datetime(y, m, dd)


def func(ced, ape, nom, **kw):
    base = {"CEDULA": Decimal(ced), "NACIONALIDAD": "V", "APELLIDOS": ape, "NOMBRES": nom,
            "FECHA_INGRESO": d(2010, 1, 15), "COD_JERARQUIA": Decimal(1), "COD_CARGO": 1,
            "ESTATUS": "ACTIVO", "SEXO": "M", "CORREO_ELECTRONICO": f"{nom.lower()}@x.com",
            "TELEFONO_MOBIL": "0414", "N_EMPLEADO": str(ced), "COD_UBICACION": 1,
            "FECHA_ACTUALIZACION": d(2024, 1, 1)}
    base.update(kw)
    return base


def origen() -> OrigenMemoria:
    return OrigenMemoria({
        "ZONAS": [{"COD_ZONA": 1, "ZONA": "ZONA 1"}, {"COD_ZONA": 2, "ZONA": "ZONA 2"}],
        "ESTACIONES": [
            {"COD_ESTACION": 10, "COD_ZONA": 1, "NOMBRE_LARGO": "Estación Central",
             "CODIGO_RADIO": "E1", "FAX": "-"},
            {"COD_ESTACION": 20, "COD_ZONA": 2, "NOMBRE_LARGO": "Estación Catia"},
        ],
        "AREAS": [{"COD_AREA": 5, "AREA": "Guardias"}],
        "DIVISIONES": [{"COD_DIVISION": 7, "DIVISION": "Operativa", "COD_AREA": 5}],
        "DEPENDENCIAS": [{"COD_DEPENDENCIA": 3, "DEPENDENCIA": "Despacho"}],
        "JERARQUIAS": [{"COD_JERARQUIA": 1, "JERARQUIA": "BOMBERO"},
                       {"COD_JERARQUIA": 2, "JERARQUIA": "CABO SEGUNDO"},
                       {"COD_JERARQUIA": 3, "JERARQUIA": "BRIGADIER"}],
        "CARGOS": [{"COD_CARGO": 1, "CARGO": "Operativo"}],
        "CONDICIONES": [{"COD_CONDICION": 1, "DESCRIPCION": "FIJO"}],
        "TIPO_NIVEL_EDUCATIVO": [{"COD_NIVEL": 2, "TIPO_NIVEL": "BACHILLER", "ID_NIVEL": 2}],
        "CURSOS": [{"COD_CURSO": 8, "DESCRIPCION": "Primeros auxilios", "ASCENSO": "SI",
                    "COD_JERARQUIA": 2}],
        "GRUPOSDIAGNOSTICOS": [{"CODGRUPODIAGNOSTICO": 1, "GRUPODIAGNOSTICO": "Osteomuscular"}],
        "DIAGNOSTICOS": [{"CODDIAGNOSTICO": 50, "DIAGNOSTICO": "Lumbago",
                          "CODGRUPODIAGNOSTICO": 1},
                         {"CODDIAGNOSTICO": 51, "DIAGNOSTICO": "LUMBAGO",
                          "CODGRUPODIAGNOSTICO": 1}],
        "ESPECIALIDADES": [{"ID_ESPE": 4, "ESPECIALIDAD": "Traumatología"}],
        "MEDICO_TRATANTE": [{"ID_MEDICO": 3, "CEDULA_MEDICO": 555, "NOMBRES": "Ana",
                             "APELLIDOS": "Ruiz", "MSAS": "M-1", "ID_ESPE": "4"}],
        "CENTROS_MEDICOS": [{"COD_INSTITUCION": 9, "INSTITUCION": "Hospital Vargas",
                             "TIPO_CENTRO": "PUBLICO", "COD_IVSS": "X1"}],
        "FUNCIONARIOS": [
            func(100, "Pérez", "Ana", FECHA_REINTEGRO=d(2012, 1, 9)),
            func(200, "Gómez", "Luis", NIVEL_EDUCATIVO=2),
        ],
        "FUNCIONARIOS_EGRESADOS": [
            func(100, "Pérez", "Ana", FECHA_INGRESO=d(2005, 3, 1), FECHA_EGRESO=d(2010, 6, 30),
                 ESTATUS="RENUNCIA", USUARIO="admin"),
            func(300, "Díaz", "Rosa", FECHA_INGRESO=d(1995, 1, 1), ESTATUS="JUBILADO",
                 FECHA_EGRESO=d(2020, 12, 31)),
        ],
        "UBICACION_ADMINISTRATIVA": [
            {"ID": 1, "CEDULA": 100, "COD_ZONA": 1, "COD_ESTACION": 10,
             "FECHA_DESDE": d(2015, 1, 1), "JEFE_INMEDIATO": "Cap. X"},
            {"ID": 2, "CEDULA": 200, "COD_ZONA": 2, "COD_ESTACION": 20,
             "FECHA_DESDE": d(2016, 1, 1)},
        ],
        "HISTORICO_UBICACION_ADMINISTRATIVA": [
            {"ID_UBIADM": 1, "CEDULA": 100, "COD_ZONA": 2, "FECHA_DESDE": d(2012, 1, 9)},
            {"ID_UBIADM": 2, "CEDULA": 100, "COD_ZONA": 1, "COD_ESTACION": 10,
             "FECHA_DESDE": d(2015, 1, 1)},
            {"ID_UBIADM": 3, "CEDULA": 300, "COD_ESTACION": 10, "FECHA_DESDE": d(2001, 1, 1)},
        ],
        "HISTORICO_JERARQUIA": [
            {"ID": 1, "CEDULA": 100, "FECHA": d(2012, 1, 9), "COD_JERARQUIA": 1},
            {"ID": 2, "CEDULA": 100, "FECHA": d(2016, 7, 5), "COD_JERARQUIA": 2,
             "NIVELACION": True},
            {"ID": 3, "CEDULA": 200, "FECHA": d(2010, 1, 15), "COD_JERARQUIA": 1},
        ],
        "DETALLE_EGRESO": [{"ID_EGRESO": 1, "CEDULA": 300, "FECHA_EGRESO_NOTIF": d(2021, 1, 5),
                            "BASAMENTO_LEGAL": "Jubilación ordinaria"}],
        "CARGA_FAMILIAR": [
            {"ID": 1, "CEDULA": 100, "NOMBRES": "Leo", "APELLIDOS": "Pérez",
             "PARENTESCO": "HIJO", "FECHA_INGRESO": d(2015, 1, 1), "P_M": "P"},
            {"ID": 2, "CEDULA": 200, "NOMBRES": "Eva", "APELLIDOS": "Gómez",
             "PARENTESCO": "ESPOSA"},
        ],
        "NIVEL_EDUCATIVO": [{"ID_NIVEL": 1, "CEDULA": 100, "NIVEL_EDUCATIVO": 2, "IUTB": True,
                             "UNES": False, "LICEO_UNIVERSIDAD": "Liceo A"}],
        "REPOSOS": [
            {"ID": 1, "NROORDEN": 1, "CEDULA": 100, "FECHA_INICIO": d(2024, 1, 1),
             "FECHA_FIN": d(2024, 1, 10), "CODDIAGNOSTICO": 51, "TIPOREPOSO": "Enfermedad",
             "IDMEDICO": 3, "COD_INSTITUCION": "9"},
            {"ID": 2, "NROORDEN": 2, "CEDULA": 100, "FECHA_INICIO": d(2024, 1, 5),
             "FECHA_FIN": d(2024, 1, 12), "TIPOREPOSO": None},
            {"ID": 3, "NROORDEN": 3, "CEDULA": 200, "FECHA_INICIO": d(2024, 2, 1),
             "FECHA_FIN": d(2024, 2, 3), "TIPOREPOSO": "Enfermedad"},
        ],
        "VACACIONES": [{"ID": 1, "CEDULA": 100, "PERIODOS": "2022-2023",
                        "FECHADESDE": d(2023, 8, 1), "FECHAHASTA": d(2023, 8, 25),
                        "NROMEMO": "M-1"}],
        "RECURRENCIA": [
            {"COD_RECURRENCIA": 1, "CEDULA_CUESTIONADO": 100, "FECHA": d(2021, 3, 3),
             "OBSERVACIONES": "Retardo", "DESCRIPCION_FALTA": "LEVE"},
            {"COD_RECURRENCIA": 2, "CEDULA_CUESTIONADO": 999, "FECHA": d(2021, 3, 3),
             "OBSERVACIONES": "Huérfana"},
        ],
        "ENC_GUARDIAS": [
            {"ID_ENCABEZADO": 1, "COD_ESTACION": 10, "SECCION": "A", "HORARIO": "24 HORAS",
             "FECHA": d(2024, 3, 1)},
            {"ID_ENCABEZADO": 2, "COD_ESTACION": 20, "SECCION": "B", "HORARIO": "DIURNO",
             "FECHA": d(2024, 3, 1)},
        ],
        "DET_GUARDIAS": [
            {"ID_ENCABEZADO": 1, "ID_DETALLE": 1, "CEDULA": 100, "ESTATUS_INICIAL": "P"},
            {"ID_ENCABEZADO": 1, "ID_DETALLE": 2, "CEDULA": 200},
            {"ID_ENCABEZADO": 2, "ID_DETALLE": 3, "CEDULA": 200},
        ],
        "ASCENSOS": [{"CEDULA": 100, "COD_JERARQUIA": 2, "FECHA_ASCENSO": d(2016, 7, 5),
                      "ORDEN_GENERAL": "OG-7"}],
        "EVALUACIONES": [{"IDEVALUACION": 1, "CEDULA": 100, "FECHA": d(2019, 5, 1),
                          "DESEMPEÑO": 18.0}],
        "EVALUACIONES_CURSOS": [{"ID": 1, "CEDULA": 100, "COD_CURSO": 8, "NOTA": 19,
                                 "ACUDIO": True, "FECHA": d(2020, 1, 1)}],
        "JUBILADOS": [{"CEDULA": 300.0, "NOMINA": "JUBILADOS", "FECHA_INGRESO": d(1995, 1, 1)}],
    }, filas_declaradas={"FUNCIONARIOS_VIEJA": 3353, "AUDIT_FUNCIONARIOS": 51575,
                         "VIVIENDA_REFUGIOS": 24})


SEMILLAS = {
    "org.zonas": [{"id": 900, "codigo": "Z1", "nombre": "Zona 1 - Centro"},
                  {"id": 901, "codigo": "Z2", "nombre": "Zona 2 - Oeste"}],
    "core.jerarquias": [{"id": 910, "codigo": "BOMBERO", "nombre": "Bombero"},
                        {"id": 911, "codigo": "CABO_2DO", "nombre": "Cabo Segundo"}],
    "core.cargos": [{"id": 920, "codigo": "OPERATIVO", "nombre": "Operativo"}],
    "core.condiciones": [{"id": 930, "codigo": "FIJO", "nombre": "Personal fijo"}],
    "core.niveles_educativos": [{"id": 940, "codigo": "SECUNDARIA",
                                 "nombre": "Secundaria / Bachillerato"}],
    "core.tipos_reposo": [{"id": 950, "codigo": "ENFERMEDAD_GEN",
                           "nombre": "Enfermedad general"}],
    "core.parentescos": [{"id": 1, "codigo": "HIJO", "nombre": "Hijo"},
                         {"id": 2, "codigo": "CONYUGE", "nombre": "Cónyuge"}],
    "core.secciones_funcionario": [{"id": 1, "codigo": "A", "nombre": "Sección A"}],
}


def correr(zona=None, only=None):
    dest = DestinoNulo(SEMILLAS)
    op = Opciones(solo_origen=True, zona=zona, only=only, hoy=date(2026, 10, 27))
    rep = asyncio.run(Motor(origen(), dest, op).ejecutar())
    return rep, dest


def est(rep, origen):
    return next(e for e in rep.tablas.values() if e.origen == origen)


@pytest.fixture(scope="module")
def zona1():
    return correr("Z1")


def test_alcance_z1_incluye_activo_y_egresado(zona1):
    rep, dest = zona1
    ceds = sorted(f["cedula"] for f in dest.tablas["personal.funcionarios"])
    assert ceds == [100, 300]        # 200 está en Z2; 300 es egresado con último histórico en Z1
    assert rep.alcance["expedientes_en_alcance"] == 2
    assert rep.alcance["expedientes_otras_zonas"] == 1
    assert "COD_ZONA=1" in rep.zona and "Z1" in rep.zona


def test_union_y_periodos_reconstruidos(zona1):
    rep, dest = zona1
    pers = sorted((p["funcionario_id"], p["numero_periodo"], p["fecha_ingreso"],
                   p["fecha_egreso"], p["tipo_egreso"])
                  for p in dest.tablas["personal.periodos_servicio"])
    ids = {f["cedula"]: f["id"] for f in dest.tablas["personal.funcionarios"]}
    assert (ids[100], 1, date(2005, 3, 1), date(2010, 6, 30), "RENUNCIA") in pers
    assert (ids[100], 2, date(2012, 1, 9), None, None) in pers
    assert (ids[300], 1, date(1995, 1, 1), date(2020, 12, 31), "JUBILACION") in pers
    a = next(f for f in dest.tablas["personal.funcionarios"] if f["cedula"] == 100)
    assert a["fecha_primer_ingreso"] == date(2005, 3, 1)
    assert a["zona_id"] == 900 and a["iutb"] is True
    le = a["metadata"]["legacy_extra"]
    assert le["FUNCIONARIOS"]["COD_UBICACION"] == 1
    assert le["FUNCIONARIOS_EGRESADOS"][0]["USUARIO"] == "admin"
    assert le["UBICACION_VIGENTE"]["JEFE_INMEDIATO"] == "Cap. X"


def test_dependientes_solo_del_alcance(zona1):
    rep, dest = zona1
    ids = {f["id"] for f in dest.tablas["personal.funcionarios"]}
    for tabla in ("personal.historico_jerarquias", "personal.historico_ubicaciones",
                  "personal.carga_familiar", "salud.reposos", "ops.vacaciones", "ops.faltas",
                  "carrera.ascensos", "carrera.evaluaciones", "carrera.cursos_realizados",
                  "egresos.jubilados", "ops.guardia_funcionarios", "personal.educacion"):
        filas = dest.tablas.get(tabla, [])
        assert filas, tabla
        assert all(f["funcionario_id"] in ids for f in filas), tabla
    assert len(dest.tablas["personal.carga_familiar"]) == 1
    # Guardias: solo el encabezado con un funcionario de la zona
    assert len(dest.tablas["ops.guardias"]) == 1
    assert est(rep, "DET_GUARDIAS").en_alcance == 1
    jub = dest.tablas["egresos.jubilados"][0]
    assert jub["fecha_jubilacion"] == date(2020, 12, 31)


def test_solape_de_reposos_previsto_y_reportado(zona1):
    rep, dest = zona1
    e = est(rep, "REPOSOS")
    assert e.en_alcance == 2 and e.insertadas == 1 and e.previstos_solape == 1
    assert any("solapamiento" in m for m in e.descartes)
    r = dest.tablas["salud.reposos"][0]
    assert r["metadata"]["legacy_extra"]["NROORDEN"] == 1


def test_catalogos_completos_y_resueltos_contra_semilla(zona1):
    rep, dest = zona1
    z = est(rep, "ZONAS")
    assert z.vinculadas == 2 and z.insertadas == 0
    j = est(rep, "JERARQUIAS")
    assert j.vinculadas == 2 and j.insertadas == 1                 # BRIGADIER se crea
    assert "LEG_JER_3" in rep.catalogos_creados["core.jerarquias"]
    assert len(dest.tablas["org.estaciones"]) == 2                  # estructura completa
    diag = est(rep, "DIAGNOSTICOS")
    assert diag.insertadas == 1 and diag.vinculadas == 1            # mismo nombre → 1 entrada


def test_exclusiones_y_no_mapeadas_reportadas(zona1):
    rep, _ = zona1
    excl = {x["tabla"]: x for x in rep.excluidas}
    assert excl["FUNCIONARIOS_VIEJA"]["filas"] == 3353
    assert "AUDIT_FUNCIONARIOS" in excl
    assert {"tabla": "VIVIENDA_REFUGIOS", "filas": 24} in rep.no_mapeadas


def test_columnas_extra_listadas_en_el_reporte(zona1):
    rep, _ = zona1
    assert "NROORDEN" in est(rep, "REPOSOS").columnas_extra
    assert "COD_UBICACION" in est(rep, "EXPEDIENTE").columnas_extra


def test_huerfanas_fuera_de_zona_y_descartadas_sin_zona():
    rep, _ = correr(None)
    rec = est(rep, "RECURRENCIA")
    assert rec.en_alcance == 2 and rec.insertadas == 1
    assert any("huérfana" in m for m in rec.descartes)
    rep_z, _ = correr("1")
    rec_z = est(rep_z, "RECURRENCIA")
    assert rec_z.en_alcance == 1 and rec_z.descartadas == 0


def test_sin_zona_migra_todo_e_idempotente_por_cedula():
    rep, dest = correr(None)
    assert sorted(f["cedula"] for f in dest.tablas["personal.funcionarios"]) == [100, 200, 300]
    assert len(dest.tablas["ops.guardias"]) == 2
    e = est(rep, "EXPEDIENTE")
    assert e.en_alcance == 3 and e.insertadas == 3


def test_only_limita_las_unidades():
    rep, dest = correr("Z1", only=["estructura", "funcionarios"])
    assert "personal.funcionarios" in dest.tablas
    assert "salud.reposos" not in dest.tablas
    assert not any(e.origen == "REPOSOS" for e in rep.tablas.values())


def test_zona_desconocida_falla_con_mensaje():
    with pytest.raises(ValueError, match="Disponibles"):
        correr("Z9")
