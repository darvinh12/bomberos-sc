"""Pruebas unitarias de las transformaciones (no requieren BD).

Usan los nombres de columna REALES del origen (ver legacy_inspection_*.json).
"""
from datetime import date, datetime
from decimal import Decimal

from bomberos_migration.mapping import CATALOGOS
from bomberos_migration.texto import a_json, compacto, norm_col
from bomberos_migration.transform import (
    Contexto,
    Expediente,
    agrupar_expedientes,
    ascensos_from_legacy,
    carga_familiar_from_legacy,
    clave_origen,
    curso_realizado_from_legacy,
    detectar_solapes,
    educacion_from_legacy,
    encadenar_fechas,
    evaluacion_from_legacy,
    falta_from_legacy,
    flags_educacion,
    funcionario_from_legacy,
    guardia_from_legacy,
    historico_jerarquias_from_legacy,
    historico_ubicaciones_from_legacy,
    jubilado_from_legacy,
    normalizar_estatus,
    parse_cedula,
    parse_date,
    parse_grupo_sanguineo,
    parse_nacionalidad,
    planificar_catalogo,
    reconstruir_periodos_servicio,
    reposo_from_legacy,
    resolver_unicos,
    separar_extra,
    tipo_egreso_desde_texto,
    vacacion_from_legacy,
)


def ctx_base() -> Contexto:
    return Contexto(
        hoy=date(2026, 10, 27),
        zonas={1: 101, 2: 102},
        estaciones={10: 210, 20: 220},
        areas={5: 305},
        divisiones={7: 407},
        jerarquias={1: 11, 2: 12, 3: 13},
        jerarquias_por_nombre={"CABO2DO": 13},
        cargos={4: 44},
        condiciones={1: 61},
        condiciones_por_nombre={"FUNCIONARIODECARRERA": 61, "FIJO": 62},
        niveles={2: 72},
        niveles_por_nombre={"SECUNDARIA": 72, "BACHILLER": 72},
        cursos={8: 88},
        diagnosticos={50: 550},
        diagnosticos_nombre={50: "LUMBAGO"},
        medicos={3: 33},
        centros={9: 99},
        tipos_reposo={"ENFERMEDADCOMUN": 81},
        tipo_reposo_no_especificado=80,
        estados_civiles={"SOLTERO": 1, "SOLTERA": 1, "CASADO": 2},
        grupos_sanguineos={"O+": 7, "A-": 2},
        secciones={"A": 1, "B": 2},
        tipos_licencia={"3": 3, "5": 5},
        parentescos={"HIJO": "HIJO", "ESPOSA": "CONYUGE", "CONYUGE": "CONYUGE"},
        estacion_zona={10: 1, 20: 2},
        periodos_evaluacion={2019: 19},
    )


FUNC = {
    "CEDULA": Decimal("12345678"),
    "NACIONALIDAD": "V",
    "RIF": "V123456780",
    "APELLIDOS": "Pérez García",
    "NOMBRES": "José Luis",
    "FECHA_INGRESO": datetime(2010, 1, 15),
    "FECHA_ESTE": datetime(2010, 2, 1),
    "FECHA_INGRESOGDF": None,
    "COD_JERARQUIA": Decimal(2),
    "SECCION": "a",
    "COD_CARGO": Decimal(4),
    "N_EQUIPO": "E-45",
    "N_EMPLEADO": "000123",
    "CONDICION": "Fijo",
    "ESTATUS": "ACTIVO",
    "HORARIO": "24X48",
    "SEXO": "MASCULINO",
    "FECHA_NACIMIENTO": datetime(1985, 6, 12),
    "ESTADO_CIVIL": "Soltero",
    "GRUPO_SANGUINEO": "O",
    "FACTOR_SANGUINEO": "POSITIVO",
    "CORREO_ELECTRONICO": "jose@example.com",
    "NIVEL_EDUCATIVO": 2,
    "PROMOCION": "XV",
    "FECHA_EGRESO": None,
    "FECHA_REINTEGRO": None,
    "TELEFONO_HABITACION": "0212-5551234",
    "TELEFONO_MOBIL": "0414-5551234",
    "TELEFONO_OTROS": None,
    "PERSONA_CONTACTO": "María",
    "LICENCIA": "3RA",
    "COD_UBICACION": Decimal(77),
    "FECHA_ACTUALIZACION": datetime(2024, 3, 1, 10, 30),
    "PRE_JUBILADOS": "NO",
}


# --- parsers -----------------------------------------------------------------

def test_parse_cedula_numeric18():
    assert parse_cedula(Decimal("12345678")) == 12345678
    assert parse_cedula(12345678.0) == 12345678  # JUBILADOS.CEDULA es float
    assert parse_cedula("12.345.678") == 12345678


def test_parse_cedula_invalida():
    assert parse_cedula(None) is None
    assert parse_cedula("") is None
    assert parse_cedula("abc") is None
    assert parse_cedula(0) is None
    assert parse_cedula(Decimal("1234567890")) is None  # fuera del CHECK del destino
    assert parse_cedula(1.5) is None


def test_parse_nacionalidad():
    assert parse_nacionalidad("V") == ("V", None)
    assert parse_nacionalidad("e") == ("E", None)
    nac, aviso = parse_nacionalidad(None)
    assert nac == "V" and "se asume V" in aviso
    nac, motivo = parse_nacionalidad("P")
    assert nac is None and "no admitida" in motivo


def test_parse_date_iso_dmy_y_datetime():
    assert parse_date("2026-05-02") == date(2026, 5, 2)
    assert parse_date("02/05/2026") == date(2026, 5, 2)
    assert parse_date(datetime(2026, 5, 2, 13, 0)) == date(2026, 5, 2)


def test_parse_date_centinela():
    assert parse_date("01/01/1900") is None
    assert parse_date(datetime(1900, 1, 1)) is None
    assert parse_date(None) is None


def test_grupo_sanguineo_combina_factor():
    assert parse_grupo_sanguineo("O", "POSITIVO") == "O+"
    assert parse_grupo_sanguineo("AB", "Rh -") == "AB-"
    assert parse_grupo_sanguineo("A+", None) == "A+"
    assert parse_grupo_sanguineo("0", "+") == "O+"
    assert parse_grupo_sanguineo("X", "+") is None
    assert parse_grupo_sanguineo("B", None) is None


def test_normalizar_estatus():
    assert normalizar_estatus("Pre Jubilado") == "PRE_JUBILADO"
    assert normalizar_estatus("activa") == "ACTIVO"
    assert normalizar_estatus("EN COMISIÓN") == "COMISION"
    assert normalizar_estatus("VACANTE") is None  # desconocido: no aborta


def test_norm_col_y_textos():
    assert norm_col("Fecha Ultimo Ascenso") == "FECHA_ULTIMO_ASCENSO"
    assert norm_col("DESEMPEÑO") == "DESEMPENO"
    assert norm_col("DESEMPE�O") == "DESEMPENO"
    assert norm_col("FechaDesde") == "FECHADESDE"
    assert compacto("Sub-Teniente") == compacto("SUBTENIENTE")
    assert a_json(Decimal("5")) == 5
    assert a_json(datetime(2024, 1, 2)) == "2024-01-02"


# --- funcionarios ------------------------------------------------------------

def test_funcionario_mapea_columnas_reales():
    exp = Expediente(12345678, activo=FUNC)
    ub = {"COD_ZONA": 1, "COD_ESTACION": 10, "COD_AREA": 5, "COD_DIVISION": 7,
          "AGRUPACION": "GRUPO 3", "_fuente": "UBICACION_ADMINISTRATIVA"}
    r = funcionario_from_legacy(exp, ctx_base(), ub, (True, False))
    assert r.ok, r.motivo
    v = r.valores
    assert (v["nacionalidad"], v["cedula"]) == ("V", 12345678)
    assert v["correo"] == "jose@example.com"           # CORREO_ELECTRONICO
    assert v["telefono_movil"] == "0414-5551234"       # TELEFONO_MOBIL
    assert v["numero_empleado"] == "000123"            # N_EMPLEADO
    assert v["numero_equipo"] == "E-45"
    assert v["sexo"] == "M"
    assert v["estatus"] == "ACTIVO"
    assert v["jerarquia_id"] == 12 and v["cargo_id"] == 44
    assert v["condicion_id"] == 62
    assert v["estado_civil_id"] == 1
    assert v["grupo_sanguineo_id"] == 7
    assert v["seccion"] == "A" and v["seccion_id"] == 1
    assert v["licencia_conducir"] == "3RA" and v["licencia_conducir_id"] == 3
    assert v["nivel_educativo_id"] == 72
    assert v["iutb"] is True and v["egresado_unes"] is False
    assert (v["zona_id"], v["estacion_id"], v["area_id"], v["division_id"]) == (101, 210, 305,
                                                                                407)
    assert v["fecha_este"] == date(2010, 2, 1)
    # Columnas sin destino → metadata.legacy_extra (nunca se pierden)
    extra = v["metadata"]["legacy_extra"]
    assert extra["FUNCIONARIOS"]["COD_UBICACION"] == 77
    assert extra["FUNCIONARIOS"]["FECHA_ACTUALIZACION"] == "2024-03-01 10:30:00"
    assert extra["UBICACION_VIGENTE"]["AGRUPACION"] == "GRUPO 3"
    assert "tipo_personal" not in v  # no existe en el origen: queda el valor por defecto


def test_funcionario_union_con_egresado_y_extras():
    egr = {**FUNC, "ESTATUS": "RENUNCIA", "FECHA_EGRESO": datetime(2015, 12, 31),
           "TRANSACCION": "EGRESO", "USUARIO": "admin", "ESTATUS_ANTERIOR": "ACTIVO"}
    act = {**FUNC, "CORREO_ELECTRONICO": None, "FECHA_REINTEGRO": datetime(2018, 3, 1)}
    exp = Expediente(12345678, activo=act, egresos=[egr])
    r = funcionario_from_legacy(exp, ctx_base())
    assert r.ok
    # vacío en FUNCIONARIOS → se completa con la fila de egreso
    assert r.valores["correo"] == "jose@example.com"
    lst = r.valores["metadata"]["legacy_extra"]["FUNCIONARIOS_EGRESADOS"]
    assert lst[0]["USUARIO"] == "admin" and lst[0]["TRANSACCION"] == "EGRESO"


def test_funcionario_valores_raros_no_abortan():
    raro = {**FUNC, "ESTATUS": "VACANTE", "CORREO_ELECTRONICO": "NO TIENE",
            "ESTADO_CIVIL": "X", "COD_JERARQUIA": 99}
    r = funcionario_from_legacy(Expediente(1, activo=raro), ctx_base())
    assert r.ok
    v = r.valores
    assert v["estatus"] == "ACTIVO" and v["correo"] is None and v["jerarquia_id"] is None
    ex = v["metadata"]["legacy_extra"]["FUNCIONARIOS"]
    assert ex["ESTATUS_no_reconocido"] == "VACANTE"
    assert ex["CORREO_ELECTRONICO_invalido"] == "NO TIENE"
    assert ex["COD_JERARQUIA_no_resuelto"] == 99


def test_funcionario_estatus_prejubilado():
    r = funcionario_from_legacy(Expediente(1, activo={**FUNC, "ESTATUS": "Pre Jubilado"}),
                                ctx_base())
    assert r.valores["estatus"] == "PRE_JUBILADO" and r.valores["pre_jubilado"] is True


def test_funcionario_nacionalidad_invalida_se_descarta():
    r = funcionario_from_legacy(Expediente(1, activo={**FUNC, "NACIONALIDAD": "P"}), ctx_base())
    assert not r.ok and "nacionalidad" in r.motivo


def test_agrupar_expedientes_union_por_cedula():
    exp, desc = agrupar_expedientes(
        [FUNC, {**FUNC, "CEDULA": None}],
        [{**FUNC, "ESTATUS": "JUBILADO"}, {**FUNC, "CEDULA": Decimal(5)}])
    assert set(exp) == {12345678, 5}
    assert exp[12345678].activo is FUNC and len(exp[12345678].egresos) == 1
    assert exp[5].activo is None and exp[5].base["CEDULA"] == 5
    assert desc == [("FUNCIONARIOS", None, "cédula inválida o fuera de rango")]


def test_resolver_unicos_numero_empleado_y_correo():
    filas = [
        {"nacionalidad": "V", "cedula": 1, "numero_empleado": "9", "correo": "a@x.com"},
        {"nacionalidad": "V", "cedula": 2, "numero_empleado": "9", "correo": "A@x.com"},
    ]
    avisos = resolver_unicos(filas, {"numero_empleado": {}, "correo": {}})
    assert filas[1]["numero_empleado"] is None and filas[1]["correo"] is None
    assert filas[1]["metadata"]["legacy_extra"]["numero_empleado_duplicado"] == "9"
    assert len(avisos) == 2
    # Un valor ya ocupado en la BD por otra persona también se libera
    f3 = [{"nacionalidad": "V", "cedula": 3, "numero_empleado": "77"}]
    resolver_unicos(f3, {"numero_empleado": {"77": ("E", 8)}})
    assert f3[0]["numero_empleado"] is None


# --- períodos de servicio -----------------------------------------------------

def test_periodos_servicio_solo_ingreso():
    out, _ = reconstruir_periodos_servicio({"FECHA_INGRESO": "2010-01-15"})
    assert len(out) == 1
    assert out[0]["fecha_egreso"] is None and out[0]["tipo_ingreso"] == "INGRESO"


def test_periodos_servicio_egreso_y_reingreso():
    out, _ = reconstruir_periodos_servicio({
        "FECHA_INGRESO": "2010-01-15", "FECHA_EGRESO": "2015-12-31",
        "FECHA_REINTEGRO": "2018-03-01", "ESTATUS": "ACTIVO"})
    assert len(out) == 2
    assert out[0]["fecha_egreso"] == date(2015, 12, 31)
    assert out[0]["tipo_egreso"] is None  # el estatus describe HOY, no aquel egreso
    assert out[1]["fecha_ingreso"] == date(2018, 3, 1)
    assert out[1]["tipo_ingreso"] == "REINGRESO" and out[1]["fecha_egreso"] is None


def test_periodos_servicio_reingreso_invalido_lo_ignora():
    """Reingreso anterior al egreso (con el período abierto) no genera período nuevo."""
    out, avisos = reconstruir_periodos_servicio({
        "FECHA_INGRESO": "2010-01-15", "FECHA_EGRESO": "2015-12-31",
        "FECHA_REINTEGRO": "2010-06-01"})
    assert len(out) == 1
    assert any("ignorado" in a for a in avisos)


def test_periodos_union_egresado_y_detalle_egreso():
    """FUNCIONARIOS_EGRESADOS (ciclo cerrado) + FUNCIONARIOS (reingreso) + DETALLE_EGRESO."""
    egr = {"FECHA_INGRESO": datetime(2005, 3, 1), "FECHA_EGRESO": datetime(2010, 6, 30),
           "ESTATUS": "RENUNCIA"}
    act = {"FECHA_INGRESO": datetime(2005, 3, 1), "FECHA_REINTEGRO": datetime(2012, 1, 9),
           "ESTATUS": "ACTIVO"}
    det = [{"ID_EGRESO": 4, "FECHA_EGRESO_NOTIF": datetime(2010, 7, 2),
            "FECHA_EGRESO_NOMI": datetime(2010, 7, 15),
            "BASAMENTO_LEGAL": "Art. 78 LEFP (renuncia)", "OBSERVACIONES": "carta"}]
    out, _ = reconstruir_periodos_servicio([act, egr], det)
    assert [(p["fecha_ingreso"], p["fecha_egreso"]) for p in out] == [
        (date(2005, 3, 1), date(2010, 6, 30)), (date(2012, 1, 9), None)]
    p1 = out[0]
    assert p1["tipo_egreso"] == "RENUNCIA"
    assert p1["base_legal"].startswith("Art. 78")
    assert p1["fecha_notificacion"] == date(2010, 7, 2)
    assert p1["fecha_efectiva_nomina"] == date(2010, 7, 15)
    assert p1["_detalles"] == [4]


def test_periodos_detalle_sin_egreso_en_ficha_crea_egreso():
    out, avisos = reconstruir_periodos_servicio(
        [{"FECHA_INGRESO": "2001-01-01", "ESTATUS": "JUBILADO"}],
        [{"ID_EGRESO": 9, "FECHA_EGRESO_NOTIF": "2021-05-01",
          "BASAMENTO_LEGAL": "Jubilación ordinaria"}])
    assert out[0]["fecha_egreso"] == date(2021, 5, 1)
    assert out[0]["tipo_egreso"] == "JUBILACION"
    assert any("egreso propio" in a for a in avisos)


def test_tipo_egreso_por_palabras_clave():
    assert tipo_egreso_desde_texto("FALLECIDO") == "FALLECIMIENTO"
    assert tipo_egreso_desde_texto(None, "Destitución por falta grave") == "DESPIDO"
    assert tipo_egreso_desde_texto("ACTIVO") is None


# --- históricos ----------------------------------------------------------------

def test_encadenar_fechas_mismo_dia_no_invierte():
    items = [{"fecha_inicio": date(2010, 1, 1)}, {"fecha_inicio": date(2010, 1, 1)},
             {"fecha_inicio": date(2012, 5, 1)}]
    encadenar_fechas(items)
    assert items[0]["fecha_fin"] == date(2010, 1, 1)
    assert items[1]["fecha_fin"] == date(2012, 4, 30)
    assert items[2]["fecha_fin"] is None


def test_historico_jerarquias_encadena_y_resuelve_por_nombre():
    filas = [
        {"ID": 2, "CEDULA": 1, "FECHA": datetime(2015, 7, 5), "COD_JERARQUIA": None,
         "JERARQUIA": "Cabo 2do", "TIPO_DOCUMENTO": "ORDEN GENERAL",
         "NUMERO_DOCUMENTO": "OG-15", "NIVELACION": True, "COD_CARGO": 4},
        {"ID": 1, "CEDULA": 1, "FECHA": datetime(2010, 1, 15), "COD_JERARQUIA": 2},
        {"ID": 3, "CEDULA": 1, "FECHA": None, "COD_JERARQUIA": 3},
    ]
    res = historico_jerarquias_from_legacy(filas, 500, ctx_base())
    ok = [r.valores for _, r in res if r.ok]
    malos = [r.motivo for _, r in res if not r.ok]
    assert [v["jerarquia_id"] for v in ok] == [12, 13]
    assert ok[0]["fecha_fin"] == date(2015, 7, 4) and ok[1]["fecha_fin"] is None
    assert ok[1]["motivo"] == "ORDEN GENERAL" and ok[1]["resolucion"] == "OG-15"
    assert malos == ["sin FECHA (fecha_inicio es obligatoria)"]
    extra = [r.extra for f, r in res if r.ok and f["ID"] == 2][0]
    assert extra["NIVELACION"] is True and extra["COD_CARGO"] == 4


def test_historico_ubicaciones_deduce_zona_por_estacion():
    filas = [{"ID_UBIADM": 1, "CEDULA": 1, "COD_ESTACION": 20, "COD_ZONA": None,
              "FECHA_DESDE": datetime(2019, 1, 1), "AGRUPACION": "G1"}]
    (_, r), = historico_ubicaciones_from_legacy(filas, 9, ctx_base())
    assert r.valores["zona_id"] == 102 and r.valores["estacion_id"] == 220
    assert r.extra["AGRUPACION"] == "G1"


# --- identidad y operaciones ------------------------------------------------------

def test_carga_familiar():
    f = {"ID": 1, "CEDULA": 12345678, "NOMBRES": "Ana", "APELLIDOS": "Pérez",
         "PARENTESCO": "Esposa", "FECHA_NACIMIENTO": datetime(1990, 1, 1), "SEXO": "F",
         "ESTUDIA": "SI", "FECHA_INGRESO": datetime(2015, 1, 1), "NROPOLIZA": "P-1",
         "P_M": "X", "GRADO_INSTRUCCION": "Bachiller"}
    r = carga_familiar_from_legacy(f, 5, ctx_base())
    v = r.valores
    assert v["parentesco"] == "CONYUGE" and v["estudia"] is True and v["sexo"] == "F"
    assert v["fecha_inclusion"] == date(2015, 1, 1) and v["nivel_educativo_id"] == 72
    assert r.extra["NROPOLIZA"] == "P-1" and r.extra["P_M"] == "X"


def test_educacion_y_flags():
    filas = [{"ID_NIVEL": 1, "CEDULA": 1, "NIVEL_EDUCATIVO": 2, "LICEO_UNIVERSIDAD": "UCV",
              "ESPECIALIDAD": "Computación", "IUTB": False, "UNES": True}]
    assert flags_educacion(filas) == (False, True)
    r = educacion_from_legacy(filas[0], 5, ctx_base())
    assert r.valores["nivel_id"] == 72 and r.valores["institucion"] == "UCV"
    assert not educacion_from_legacy({"NIVEL_EDUCATIVO": 99}, 5, ctx_base()).ok


def test_reposo_resuelve_catalogos_y_extra_en_metadata():
    f = {"ID": 7, "NROORDEN": 100, "FECHA_INICIO": datetime(2024, 1, 1),
         "FECHA_FIN": datetime(2024, 1, 7), "CEDULA": 1, "CODDIAGNOSTICO": 50,
         "TIPOREPOSO": "Enfermedad común", "IDMEDICO": 3, "COD_INSTITUCION": "9",
         "NROREPOSO": Decimal(4455), "ORIGEN": "IVSS", "ARCHIVADO": "SI"}
    r = reposo_from_legacy(f, 5, ctx_base())
    v = r.valores
    assert v["tipo_reposo_id"] == 81 and v["diagnostico_id"] == 550
    assert v["diagnostico_libre"] == "LUMBAGO" and v["medico_id"] == 33
    assert v["centro_medico_id"] == 99 and v["folio"] == "4455"
    assert v["metadata"]["legacy_extra"]["NROORDEN"] == 100
    assert v["metadata"]["legacy_extra"]["ORIGEN"] == "IVSS"


def test_reposo_sin_tipo_usa_no_especificado_y_fechas_invalidas_se_descartan():
    base = {"FECHA_INICIO": "2024-01-01", "FECHA_FIN": "2024-01-03", "TIPOREPOSO": None}
    assert reposo_from_legacy(base, 1, ctx_base()).valores["tipo_reposo_id"] == 80
    assert not reposo_from_legacy({**base, "FECHA_FIN": "2023-12-01"}, 1, ctx_base()).ok
    assert not reposo_from_legacy({**base, "FECHA_FIN": None}, 1, ctx_base()).ok


def test_vacacion_periodo_y_extra():
    f = {"ID": 1, "CEDULA": 1, "PERIODOS": "2018-2019", "FECHADESDE": datetime(2019, 8, 1),
         "FECHAHASTA": datetime(2019, 8, 30), "DIASDISFRUTE": Decimal(20), "NROMEMO": "M-9",
         "FIRMA": "SI", "QUINQUENIO": "2"}
    v = vacacion_from_legacy(f, 5, ctx_base()).valores
    assert v["periodo_anio"] == 2018 and v["dias_habiles"] == 20
    assert v["metadata"]["legacy_extra"]["NROMEMO"] == "M-9"


def test_falta_desde_recurrencia():
    f = {"COD_RECURRENCIA": 1, "CEDULA_CUESTIONADO": 1, "FECHA": datetime(2020, 2, 2),
         "OBSERVACIONES": "Llegó tarde", "DESCRIPCION_FALTA": "LEVE", "NRO_PARTE": "P-1"}
    v = falta_from_legacy(f, 5, ctx_base()).valores
    assert v["tipo_falta"] == "LEVE" and v["descripcion"] == "Llegó tarde"
    assert v["metadata"]["legacy_extra"]["NRO_PARTE"] == "P-1"


def test_guardia_turno_y_horas_parametrizadas():
    e = {"ID_ENCABEZADO": 1, "COD_ESTACION": 10, "SECCION": "b", "HORARIO": "24 HORAS",
         "FECHA": datetime(2023, 4, 1), "OFICIAL_COMANDO": "Tte. X"}
    v = guardia_from_legacy(e, ctx_base()).valores
    assert v["turno"] == "24H" and v["seccion"] == "B" and v["estacion_id"] == 210
    assert v["hora_inicio"].hour == 7
    assert v["metadata"]["legacy_extra"]["OFICIAL_COMANDO"] == "Tte. X"
    assert not guardia_from_legacy({**e, "HORARIO": "??"}, ctx_base()).ok
    assert not guardia_from_legacy({**e, "COD_ESTACION": 999}, ctx_base()).ok


# --- carrera y egresos ------------------------------------------------------------

def test_ascensos_encadena_jerarquia_anterior():
    filas = [{"CEDULA": 1, "COD_JERARQUIA": 3, "FECHA_ASCENSO": datetime(2016, 1, 1),
              "ORDEN_GENERAL": "OG-2"},
             {"CEDULA": 1, "COD_JERARQUIA": 2, "FECHA_ASCENSO": datetime(2012, 1, 1)}]
    res = ascensos_from_legacy(filas, 5, ctx_base())
    vs = [r.valores for _, r in res]
    assert [v["jerarquia_nueva_id"] for v in vs] == [12, 13]
    assert vs[0]["jerarquia_anterior_id"] is None and vs[1]["jerarquia_anterior_id"] == 12
    assert vs[1]["resolucion"] == "OG-2"


def test_evaluacion_por_anio_y_curso_realizado():
    ev = {"IDEVALUACION": 1, "CEDULA": 1, "FECHA": datetime(2019, 5, 1), "FISICA": 18.5,
          "DESEMPENO": 17.0, "RECOMENDACIONES": "Bien"}
    v = evaluacion_from_legacy(ev, 5, ctx_base()).valores
    assert v["periodo_id"] == 19 and v["tipo"] == "INTEGRAL"
    assert v["metadata"]["legacy_extra"]["DESEMPENO"] == 17
    assert not evaluacion_from_legacy({**ev, "FECHA": datetime(2001, 1, 1)}, 5, ctx_base()).ok
    cr = curso_realizado_from_legacy({"ID": 1, "COD_CURSO": 8, "NOTA": Decimal("18.50"),
                                      "ACUDIO": True, "FECHA": datetime(2020, 1, 1)}, 5,
                                     ctx_base()).valores
    assert cr["curso_id"] == 88 and cr["aprobado"] is True and cr["nota"] == Decimal("18.50")


def test_jubilado_requiere_fecha_de_egreso():
    assert jubilado_from_legacy({"CEDULA": 1.0}, 5, None).motivo
    r = jubilado_from_legacy({"CEDULA": 1.0, "NOMINA": "JUB", "JERARQUIA": "CAP"}, 5,
                             date(2020, 1, 1))
    assert r.valores["fecha_jubilacion"] == date(2020, 1, 1)
    assert r.extra["NOMINA"] == "JUB"


# --- catálogos, extras y solapes ----------------------------------------------------

def test_planificar_catalogo_semilla_traza_y_creacion():
    destino = [{"id": 1, "codigo": "Z1", "nombre": "Zona 1 - Centro"},
               {"id": 2, "codigo": "Z2", "nombre": "Zona 2 - Oeste"}]
    acciones = planificar_catalogo(CATALOGOS["zonas"],
                                   [("1", "ZONA 1"), ("2", "OESTE"), ("9", "ZONA ESPECIAL"),
                                    ("5", "x")], destino, {"5": 50})
    por = {a.clave: a for a in acciones}
    assert por["1"].tipo == "semilla" and por["1"].id_destino == 1   # por nombre
    assert por["2"].tipo == "semilla" and por["2"].id_destino == 2   # por plantilla Z<n>
    assert por["9"].tipo == "crear" and por["9"].codigo_nuevo == "Z9"
    assert por["5"].tipo == "traza" and por["5"].id_destino == 50


def test_planificar_catalogo_sinonimos_y_cerrado():
    destino = [{"id": 3, "codigo": "CABO_2DO", "nombre": "Cabo Segundo"},
               {"id": 4, "codigo": "SUBTENIENTE", "nombre": "Sub-Teniente"}]
    acc = planificar_catalogo(CATALOGOS["jerarquias"],
                              [("7", "CABO 2DO"), ("8", "SUB TENIENTE"), ("9", "BRIGADIER")],
                              destino, {})
    assert [(a.tipo, a.id_destino, a.codigo_nuevo) for a in acc] == [
        ("semilla", 3, None), ("semilla", 4, None), ("crear", None, "LEG_JER_9")]
    acc = planificar_catalogo(CATALOGOS["estados_civiles"], [("X", "RARO")], [], {})
    assert acc[0].tipo == "sin_resolver"


def test_separar_extra_lista_columnas_no_previstas():
    extra, nop = separar_extra({"ID": 1, "CEDULA": 1, "FECHA_INICIO": "2024-01-01",
                                "COLUMNA_NUEVA": "dato", "ORIGEN": None}, "REPOSOS")
    assert extra == {"COLUMNA_NUEVA": "dato"}
    assert nop == ["COLUMNA_NUEVA"]


def test_clave_origen_compuesta():
    f = {"CEDULA": Decimal(1), "COD_JERARQUIA": Decimal(3),
         "FECHA_ASCENSO": datetime(2016, 1, 1)}
    assert clave_origen("ASCENSOS", f) == "1|3|2016-01-01"


def test_detectar_solapes_reposos():
    ch = detectar_solapes([
        ("a", date(2024, 1, 1), date(2024, 1, 10)),
        ("b", date(2024, 1, 10), date(2024, 1, 12)),   # comparte el día 10: '[]' solapa
        ("c", date(2024, 1, 13), date(2024, 1, 14)),
    ])
    assert ch == {"b": "a"}
    abiertos = detectar_solapes([("p1", date(2010, 1, 1), date(2015, 1, 1)),
                                 ("p2", date(2015, 1, 1), None)], cerrado=False)
    assert abiertos == {}  # '[)' : el egreso y el reingreso el mismo día no chocan
