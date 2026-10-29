"""Mapa explícito origen → destino (PERSONALINTEGRADA → bomberos_caracas).

Fuente de los nombres de columna: ``legacy_inspection_20260504_174805.json``
(metadatos reales del SQL Server del cliente). Los nombres se guardan
NORMALIZADOS con :func:`bomberos_migration.transform.norm_col` (mayúsculas,
sin tildes, ``_`` en lugar de espacios): ``Fecha Ultimo Ascenso`` →
``FECHA_ULTIMO_ASCENSO``, ``DESEMPEÑO`` → ``DESEMPENO``, ``FechaDesde`` →
``FECHADESDE``.

Cada columna de origen tiene UNA de estas especificaciones:

* ``"esquema.tabla.columna"``: destino directo (o tras normalizar).
* ``"derivado: …"``: se usa para calcular otro valor (períodos, alcance…).
* ``EXTRA`` (``"legacy_extra"``): sin destino claro; se conserva en
  ``metadata.legacy_extra`` del registro destino si la tabla tiene
  ``metadata`` (sql/05_campos_custom.sql) o, si no, en
  ``migracion.trazas.legacy_extra`` (esquema propio de la herramienta).

Cualquier columna presente en el origen y AUSENTE de este mapa se trata como
``EXTRA`` y además se lista en el reporte como «no prevista». Nunca se pierde
una columna en silencio. ``tests/test_mapping.py`` verifica contra el JSON que
todas las columnas de las tablas mapeadas estén declaradas aquí.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .texto import norm_col

EXTRA = "legacy_extra"

# Dónde va el legacy_extra de cada tabla destino.
EN_METADATA = "metadata"  # columna metadata JSONB del registro destino
EN_TRAZA = "traza"  # migracion.trazas.legacy_extra (la tabla destino no tiene metadata)


@dataclass(frozen=True)
class MapeoTabla:
    origen: str
    destino: str
    fase: str
    unidad: str
    clave: tuple[str, ...]
    columnas: dict[str, str]
    extra_en: str = EN_TRAZA
    nota: str = ""

    def columnas_extra(self) -> list[str]:
        return [c for c, d in self.columnas.items() if d == EXTRA]

    def columnas_con_destino(self) -> list[str]:
        return [c for c, d in self.columnas.items() if d != EXTRA]


# ---------------------------------------------------------------------------
# Fases y orden de carga (fijo)
# ---------------------------------------------------------------------------
FASES: tuple[str, ...] = (
    "estructura",        # catálogos core.* y estructura org.*
    "salud_catalogos",   # grupos/diagnósticos, médicos, centros médicos
    "funcionarios",      # FUNCIONARIOS ∪ FUNCIONARIOS_EGRESADOS + períodos de servicio
    "historicos",        # histórico de jerarquías y de ubicaciones
    "identidad",         # carga familiar, educación
    "operaciones",       # reposos, vacaciones, faltas, guardias
    "carrera",           # cursos realizados, ascensos, evaluaciones
    "egresos",           # jubilados
)

# Unidades de carga en orden. --only acepta el nombre de la unidad o de la fase.
UNIDADES: tuple[tuple[str, str], ...] = (
    ("zonas", "estructura"),
    ("divisiones", "estructura"),
    ("areas", "estructura"),
    ("dependencias", "estructura"),
    ("estaciones", "estructura"),
    ("jerarquias", "estructura"),
    ("cargos", "estructura"),
    ("condiciones", "estructura"),
    ("niveles_educativos", "estructura"),
    ("cursos", "estructura"),
    ("tipos_reposo", "estructura"),
    ("grupos_diagnosticos", "salud_catalogos"),
    ("diagnosticos", "salud_catalogos"),
    ("medicos", "salud_catalogos"),
    ("centros_medicos", "salud_catalogos"),
    ("funcionarios", "funcionarios"),
    ("periodos_servicio", "funcionarios"),
    ("historico_jerarquias", "historicos"),
    ("historico_ubicaciones", "historicos"),
    ("carga_familiar", "identidad"),
    ("educacion", "identidad"),
    ("reposos", "operaciones"),
    ("vacaciones", "operaciones"),
    ("faltas", "operaciones"),
    ("guardias", "operaciones"),
    ("cursos_realizados", "carrera"),
    ("ascensos", "carrera"),
    ("evaluaciones", "carrera"),
    ("jubilados", "egresos"),
)

BATCH_SIZE = 500


def unidades_seleccionadas(only: list[str] | None) -> list[str]:
    """Traduce --only (unidades o fases) a la lista ordenada de unidades."""
    if not only:
        return [u for u, _ in UNIDADES]
    pedidos = {o.strip().lower() for o in only}
    desconocidos = pedidos - {u for u, _ in UNIDADES} - set(FASES)
    if desconocidos:
        raise ValueError(f"--only desconocido: {', '.join(sorted(desconocidos))}")
    return [u for u, f in UNIDADES if u in pedidos or f in pedidos]


def opciones_only() -> list[str]:
    return list(FASES) + [u for u, _ in UNIDADES if u not in FASES]


# ---------------------------------------------------------------------------
# Tablas descartadas del origen (se reportan con nombre, filas y regla)
# ---------------------------------------------------------------------------
REGLAS_EXCLUSION: tuple[tuple[str, str], ...] = (
    (r"OLD\d*$", "copia antigua (_OLD / …OLD)"),
    (r"[_ ]VIEJA$", "copia antigua (_VIEJA)"),
    (r"_BACKUP$", "respaldo manual (_BACKUP)"),
    (r"_2017$", "instantánea anual 2017 (_2017)"),
    (r"^TEMP", "tabla temporal (TEMP*)"),
    (r"_TEMP$", "tabla temporal (*_TEMP)"),
    (r"\(ORIGINAL\)", "copia (ORIGINAL)"),
    (r"\(ANTES ", "instantánea previa (ANTES …)"),
    (r"^AUDIT_", "auditoría legacy (el destino tiene aud.log_cambios)"),
    (r"^ACCESO$", "usuarios legacy con claves en texto plano"),
    (r"^BENEFICIO(_.+|\d+)$", "instantánea mensual de BENEFICIO"),
    (r"_COPIA$", "copia manual (_COPIA)"),
    (r"\$$", "hoja importada de Excel ($)"),
    (r"_2019\$?$", "importación puntual de 2019 (*_2019$)"),
    (r"^DTPROPERTIES$", "tabla de sistema de SQL Server"),
    (r"^SYSDIAGRAMS$", "tabla de sistema de SQL Server"),
)

# Tablas de 2019 que NO son importaciones de Excel sino históricos anuales: se
# conservan como «canónicas no mapeadas» (pendientes) para no perderlas.
# Se comparan normalizadas (DESEMPEÑO → DESEMPENO).
EXCEPCIONES_EXCLUSION: frozenset[str] = frozenset(
    {
        "HISTORICO_ASCENSOS_GENERAL_2019",
        "HISTORICO_EVALUACION_DESEMPENO_2019",
        "HISTORICO_EVALUACION_FISICA_2019",
    }
)


def motivo_exclusion(tabla: str) -> str | None:
    """Regla de exclusión que aplica a la tabla, o None si es canónica."""
    if norm_col(tabla) in EXCEPCIONES_EXCLUSION:
        return None
    t = tabla.upper()
    for patron, motivo in REGLAS_EXCLUSION:
        if re.search(patron, t):
            return motivo
    return None


# ---------------------------------------------------------------------------
# Correspondencias por tabla (Tabla 4.39 del TEG)
# ---------------------------------------------------------------------------
_FUNC_COMUNES: dict[str, str] = {
    "CEDULA": "personal.funcionarios.cedula",
    "NACIONALIDAD": "personal.funcionarios.nacionalidad",
    "RIF": "personal.funcionarios.rif",
    "APELLIDOS": "personal.funcionarios.apellidos",
    "NOMBRES": "personal.funcionarios.nombres",
    "FECHA_INGRESO": "derivado: personal.periodos_servicio.fecha_ingreso (+ fecha_primer_ingreso)",
    "FECHA_ESTE": "personal.funcionarios.fecha_este",
    "COD_JERARQUIA": "personal.funcionarios.jerarquia_id (core.jerarquias)",
    "SECCION": "personal.funcionarios.seccion + seccion_id",
    "COD_CARGO": "personal.funcionarios.cargo_id (core.cargos)",
    "N_EQUIPO": "personal.funcionarios.numero_equipo",
    "N_EMPLEADO": "personal.funcionarios.numero_empleado",
    "CONDICION": "personal.funcionarios.condicion_id (core.condiciones)",
    "ESTATUS": "personal.funcionarios.estatus (+ tipo_egreso del último período)",
    "HORARIO": "personal.funcionarios.horario",
    "SEXO": "personal.funcionarios.sexo",
    "FECHA_NACIMIENTO": "personal.funcionarios.fecha_nacimiento",
    "ESTADO_CIVIL": "personal.funcionarios.estado_civil_id (core.estados_civiles)",
    "GRUPO_SANGUINEO": "personal.funcionarios.grupo_sanguineo_id (core.grupos_sanguineos)",
    "FACTOR_SANGUINEO": "personal.funcionarios.factor_sanguineo (+ grupo_sanguineo_id)",
    "CORREO_ELECTRONICO": "personal.funcionarios.correo",
    "NIVEL_EDUCATIVO": "personal.funcionarios.nivel_educativo_id (TIPO_NIVEL_EDUCATIVO)",
    "PROMOCION": "personal.funcionarios.promocion",
    "FECHA_EGRESO": "personal.funcionarios.fecha_egreso + derivado: periodos_servicio",
    "FECHA_REINTEGRO": "personal.funcionarios.fecha_reintegro + derivado: periodos_servicio",
    "TELEFONO_HABITACION": "personal.funcionarios.telefono_habitacion",
    "TELEFONO_MOBIL": "personal.funcionarios.telefono_movil",
    "TELEFONO_OTROS": "personal.funcionarios.telefono_otros",
    "PERSONA_CONTACTO": "personal.funcionarios.persona_contacto",
    "LICENCIA": "personal.funcionarios.licencia_conducir + licencia_conducir_id",
    "COD_UBICACION": EXTRA,  # semántica no confirmada (¿ID de UBICACION_ADMINISTRATIVA?)
    "FECHA_ACTUALIZACION": EXTRA,
}

MAPEOS: dict[str, MapeoTabla] = {}


def _m(m: MapeoTabla) -> None:
    MAPEOS[m.origen] = m


# --- Estructura organizativa y catálogos --------------------------------------
_m(MapeoTabla("ZONAS", "org.zonas", "estructura", "zonas", ("COD_ZONA",), {
    "COD_ZONA": "org.zonas.codigo (semilla Z<n> o por nombre)",
    "ZONA": "org.zonas.nombre",
}))
_m(MapeoTabla("DIVISIONES", "org.divisiones", "estructura", "divisiones", ("COD_DIVISION",), {
    "COD_DIVISION": "org.divisiones.codigo (LEG_DIV_<n> si no casa con la semilla)",
    "DIVISION": "org.divisiones.nombre",
    "COD_AREA": EXTRA,  # jerarquía invertida en el destino (área ⊂ división)
}, nota="En el origen la división cuelga del área; en el destino el área cuelga de la división."))
_m(MapeoTabla("AREAS", "org.areas", "estructura", "areas", ("COD_AREA",), {
    "COD_AREA": "org.areas.codigo (LEG_AREA_<n> si no casa con la semilla)",
    "AREA": "org.areas.nombre",
}))
_m(MapeoTabla("DEPENDENCIAS", "org.dependencias", "estructura", "dependencias",
              ("COD_DEPENDENCIA",), {
    "COD_DEPENDENCIA": "org.dependencias.codigo (LEG_DEP_<n>)",
    "DEPENDENCIA": "org.dependencias.nombre",
}))
_m(MapeoTabla("ESTACIONES", "org.estaciones", "estructura", "estaciones", ("COD_ESTACION",), {
    "COD_ESTACION": "org.estaciones.codigo (EST_<n>)",
    "COD_ZONA": "org.estaciones.zona_id",
    "NOMBRE_CORTO": "org.estaciones.nombre_corto",
    "NOMBRE_LARGO": "org.estaciones.nombre",
    "CODIGO_RADIO": EXTRA,
    "DIRECCION": "org.estaciones.direccion",
    "TELEFONOS": "org.estaciones.telefono",
    "FAX": EXTRA,
}))
_m(MapeoTabla("JERARQUIAS", "core.jerarquias", "estructura", "jerarquias", ("COD_JERARQUIA",), {
    "COD_JERARQUIA": "core.jerarquias.codigo (semilla por nombre o LEG_JER_<n>)",
    "JERARQUIA": "core.jerarquias.nombre",
}))
_m(MapeoTabla("CARGOS", "core.cargos", "estructura", "cargos", ("COD_CARGO",), {
    "COD_CARGO": "core.cargos.codigo (semilla por nombre o LEG_CARGO_<n>)",
    "CARGO": "core.cargos.nombre",
}))
_m(MapeoTabla("CONDICIONES", "core.condiciones", "estructura", "condiciones", ("COD_CONDICION",), {
    "COD_CONDICION": "core.condiciones.codigo (semilla por nombre o LEG_COND_<n>)",
    "DESCRIPCION": "core.condiciones.nombre",
}))
_m(MapeoTabla("TIPO_NIVEL_EDUCATIVO", "core.niveles_educativos", "estructura",
              "niveles_educativos", ("COD_NIVEL",), {
    "COD_NIVEL": "core.niveles_educativos.codigo (semilla por nombre o LEG_NIV_<n>)",
    "TIPO_NIVEL": "core.niveles_educativos.nombre",
    "ID_NIVEL": EXTRA,
    "MSREPL_TRAN_VERSION": EXTRA,  # columna técnica de replicación de SQL Server
}))
_m(MapeoTabla("CURSOS", "carrera.cursos", "estructura", "cursos", ("COD_CURSO",), {
    "COD_CURSO": "carrera.cursos.codigo (LEG_CURSO_<n>)",
    "DESCRIPCION": "carrera.cursos.nombre",
    "COD_JERARQUIA": "carrera.cursos.nivel_jerarquia_destino_id",
    "ASCENSO": "carrera.cursos.es_ascenso",
    "CURSOS_VALOR": EXTRA,
}))
_m(MapeoTabla("GRUPOSDIAGNOSTICOS", "salud.grupos_diagnosticos", "salud_catalogos",
              "grupos_diagnosticos", ("CODGRUPODIAGNOSTICO",), {
    "CODGRUPODIAGNOSTICO": "salud.grupos_diagnosticos.codigo (LEG_GRP_<n>)",
    "GRUPODIAGNOSTICO": "salud.grupos_diagnosticos.nombre",
}))
_m(MapeoTabla("DIAGNOSTICOS", "salud.diagnosticos", "salud_catalogos", "diagnosticos",
              ("CODDIAGNOSTICO",), {
    "CODDIAGNOSTICO": "derivado: clave de resolución (el origen no trae código CIE)",
    "DIAGNOSTICO": "salud.diagnosticos.nombre",
    "CODGRUPODIAGNOSTICO": "salud.diagnosticos.grupo_id",
}))
_m(MapeoTabla("MEDICO_TRATANTE", "salud.medicos", "salud_catalogos", "medicos", ("ID_MEDICO",), {
    "ID_MEDICO": "derivado: clave de resolución para REPOSOS.IDMEDICO",
    "CEDULA_MEDICO": "salud.medicos.cedula",
    "TIPO_MEDICO": EXTRA,
    "NOMBRES": "salud.medicos.nombres",
    "APELLIDOS": "salud.medicos.apellidos",
    "MSAS": "salud.medicos.mpps",
    "ID_ESPE": "salud.medicos.especialidad (texto de ESPECIALIDADES)",
}))
_m(MapeoTabla("CENTROS_MEDICOS", "salud.centros_medicos", "salud_catalogos", "centros_medicos",
              ("COD_INSTITUCION",), {
    "COD_INSTITUCION": "derivado: clave de resolución para REPOSOS.COD_INSTITUCION",
    "INSTITUCION": "salud.centros_medicos.nombre",
    "TIPO_CENTRO": "salud.centros_medicos.tipo",
    "COD_IVSS": EXTRA,
}))

# --- Expedientes -------------------------------------------------------------
_m(MapeoTabla("FUNCIONARIOS", "personal.funcionarios", "funcionarios", "funcionarios",
              ("CEDULA",), {**_FUNC_COMUNES,
                            "FECHA_INGRESOGDF": "personal.funcionarios.fecha_ingreso_gdf",
                            "PRE_JUBILADOS": "personal.funcionarios.pre_jubilado"},
              extra_en=EN_METADATA))
_m(MapeoTabla("FUNCIONARIOS_EGRESADOS", "personal.funcionarios", "funcionarios",
              "funcionarios", ("CEDULA",), {**_FUNC_COMUNES,
                                            "FECHA_TRANSACCION": EXTRA,
                                            "USUARIO": EXTRA,
                                            "TRANSACCION": EXTRA,
                                            "ESTATUS_ANTERIOR": EXTRA},
              extra_en=EN_METADATA,
              nota="Unión con FUNCIONARIOS por CEDULA; FUNCIONARIOS prevalece en la ficha."))
_m(MapeoTabla("DETALLE_EGRESO", "personal.periodos_servicio", "funcionarios",
              "periodos_servicio", ("ID_EGRESO",), {
    "ID_EGRESO": "derivado: clave",
    "CEDULA": "derivado: funcionario",
    "FECHA_EGRESO_NOTIF": "personal.periodos_servicio.fecha_notificacion",
    "FECHA_EGRESO_NOMI": "personal.periodos_servicio.fecha_efectiva_nomina",
    "BASAMENTO_LEGAL": "personal.periodos_servicio.base_legal (+ tipo_egreso por palabras clave)",
    "OBSERVACIONES": "personal.periodos_servicio.observaciones",
}, nota="Se adjunta al egreso más cercano (±90 días); si no hay, abre un egreso propio."))
_m(MapeoTabla("UBICACION_ADMINISTRATIVA", "personal.funcionarios", "funcionarios",
              "funcionarios", ("ID",), {
    "ID": "derivado: desempate de la ubicación vigente",
    "CEDULA": "derivado: funcionario",
    "COD_ZONA": "personal.funcionarios.zona_id (+ acotación --zona)",
    "COD_AREA": "personal.funcionarios.area_id",
    "COD_ESTACION": "personal.funcionarios.estacion_id",
    "COD_DIVISION": "personal.funcionarios.division_id",
    "AGRUPACION": EXTRA,
    "DEPENDENCIA": EXTRA,
    "HORARIO": EXTRA,
    "SECCION": EXTRA,
    "TELEFONO_OFICINA": EXTRA,
    "EXTENSION": EXTRA,
    "JEFE_INMEDIATO": EXTRA,
    "FECHA_DESDE": "derivado: ubicación vigente (la más reciente)",
}, extra_en=EN_METADATA,
   nota="Ubicación vigente (instantánea); se guarda en metadata del funcionario."))

# --- Históricos --------------------------------------------------------------
_m(MapeoTabla("HISTORICO_JERARQUIA", "personal.historico_jerarquias", "historicos",
              "historico_jerarquias", ("ID",), {
    "ID": "derivado: clave",
    "CEDULA": "personal.historico_jerarquias.funcionario_id",
    "TIPO_DOCUMENTO": "personal.historico_jerarquias.motivo",
    "NUMERO_DOCUMENTO": "personal.historico_jerarquias.resolucion",
    "REFERENCIA": EXTRA,
    "FECHA": "personal.historico_jerarquias.fecha_inicio (fecha_fin = siguiente − 1)",
    "COD_JERARQUIA": "personal.historico_jerarquias.jerarquia_id",
    "COD_CARGO": EXTRA,
    "JERARQUIA": "derivado: jerarquia_id si COD_JERARQUIA no resuelve",
    "FECHA_ULTIMO_ASCENSO": EXTRA,
    "NIVELACION": EXTRA,
}))
_m(MapeoTabla("HISTORICO_UBICACION_ADMINISTRATIVA", "personal.historico_ubicaciones",
              "historicos", "historico_ubicaciones", ("ID_UBIADM",), {
    "ID_UBIADM": "derivado: clave",
    "CEDULA": "personal.historico_ubicaciones.funcionario_id",
    "COD_ESTACION": "personal.historico_ubicaciones.estacion_id",
    "COD_ZONA": "personal.historico_ubicaciones.zona_id",
    "COD_AREA": "personal.historico_ubicaciones.area_id",
    "COD_DIVISION": "personal.historico_ubicaciones.division_id",
    "AGRUPACION": EXTRA,
    "FECHA_DESDE": "personal.historico_ubicaciones.fecha_inicio (fecha_fin = siguiente − 1)",
    "SECCION": EXTRA,
    "HORARIO": EXTRA,
}))

# --- Identidad ---------------------------------------------------------------
_m(MapeoTabla("CARGA_FAMILIAR", "personal.carga_familiar", "identidad", "carga_familiar",
              ("ID",), {
    "ID": "derivado: clave",
    "COMPANIA": EXTRA,
    "RAMOPOLIZA": EXTRA,
    "NROPOLIZA": EXTRA,
    "CERTIFICADO": EXTRA,
    "CEDULA": "personal.carga_familiar.funcionario_id (cédula del TITULAR)",
    "NOMBRES": "personal.carga_familiar.nombres",
    "APELLIDOS": "personal.carga_familiar.apellidos",
    "PARENTESCO": "personal.carga_familiar.parentesco (core.parentescos.codigo)",
    "EDAD": EXTRA,
    "FECHA_NACIMIENTO": "personal.carga_familiar.fecha_nacimiento",
    "SEXO": "personal.carga_familiar.sexo",
    "TIPO_MOVIMIENTO": EXTRA,
    "CONDICION": EXTRA,
    "TELEFONO_FUN": EXTRA,
    "FECHA_INGRESO": "personal.carga_familiar.fecha_inclusion",
    "OBSERVACION": "personal.carga_familiar.observaciones",
    "P_M": EXTRA,
    "VIGENCIA": EXTRA,
    "VIVE": EXTRA,
    "FECHA_ACTUALIZACION": EXTRA,
    "ESTUDIA": "personal.carga_familiar.estudia",
    "GRADO_INSTRUCCION": "personal.carga_familiar.nivel_educativo_id (por nombre)",
}))
_m(MapeoTabla("NIVEL_EDUCATIVO", "personal.educacion", "identidad", "educacion", ("ID_NIVEL",), {
    "ID_NIVEL": "derivado: clave",
    "CEDULA": "personal.educacion.funcionario_id",
    "NIVEL_EDUCATIVO": "personal.educacion.nivel_id (TIPO_NIVEL_EDUCATIVO)",
    "LICEO_UNIVERSIDAD": "personal.educacion.institucion",
    "ESPECIALIDAD": "personal.educacion.titulo",
    "FECHA": "personal.educacion.fecha_titulo",
    "FECHA_RECEPCION": EXTRA,
    "NUMERO_TITULO": EXTRA,
    "IUTB": "personal.funcionarios.iutb (OR de todas sus filas)",
    "UNES": "personal.funcionarios.egresado_unes (OR de todas sus filas)",
    "OBSERVACIONES": EXTRA,
}))

# --- Operaciones -------------------------------------------------------------
_m(MapeoTabla("REPOSOS", "salud.reposos", "operaciones", "reposos", ("ID",), {
    "ID": "derivado: clave",
    "NROORDEN": EXTRA,
    "FECHA_RECEPCION": EXTRA,
    "FECHA_INICIO": "salud.reposos.fecha_inicio",
    "FECHA_FIN": "salud.reposos.fecha_fin",
    "CEDULA": "salud.reposos.funcionario_id",
    "CODDIAGNOSTICO": "salud.reposos.diagnostico_id (+ diagnostico_libre)",
    "TIPOREPOSO": "salud.reposos.tipo_reposo_id (core.tipos_reposo)",
    "ORIGEN": EXTRA,
    "IDMEDICO": "salud.reposos.medico_id",
    "COD_INSTITUCION": "salud.reposos.centro_medico_id",
    "ESTATUS_CONVALIDADO_IVSS": EXTRA,
    "CODCENTRO_IVSS": EXTRA,
    "FECHA_CITA": EXTRA,
    "NROREPOSO": "salud.reposos.folio",
    "LUGAREXPEDICION": EXTRA,
    "FECHA_CONVALIDACION_IVSS": EXTRA,
    "IDDRCONVA_IVSS": EXTRA,
    "VERIFICADO_INSPECTORIA": EXTRA,
    "RE_LABORAL": EXTRA,
    "ARCHIVADO": EXTRA,
}, extra_en=EN_METADATA))
_m(MapeoTabla("VACACIONES", "ops.vacaciones", "operaciones", "vacaciones", ("ID",), {
    "ID": "derivado: clave",
    "CEDULA": "ops.vacaciones.funcionario_id",
    "QUINQUENIO": EXTRA,
    "PERIODOS": "ops.vacaciones.periodo_anio (primer año del texto)",
    "FECHADESDE": "ops.vacaciones.fecha_inicio",
    "FECHAHASTA": "ops.vacaciones.fecha_fin",
    "FECHAREINGRESO": EXTRA,
    "DIASDISFRUTE": "ops.vacaciones.dias_habiles",
    "PERIODOSPENDIENTES": EXTRA,
    "NROMEMO": EXTRA,
    "FECHAPROCESO": EXTRA,
    "FECHACALCULOQUINQUENIO": EXTRA,
    "FIRMA": EXTRA,
    "FECHAFIRMA": EXTRA,
    "OBSERVACIONES": "ops.vacaciones.observaciones",
    "COD_AREA": EXTRA,
    "QUINQUENIOSEGUNBONOVACACIONAL": EXTRA,
    "ESTATUS": EXTRA,
}, extra_en=EN_METADATA))
_m(MapeoTabla("RECURRENCIA", "ops.faltas", "operaciones", "faltas", ("COD_RECURRENCIA",), {
    "COD_RECURRENCIA": "derivado: clave",
    "CEDULA_CUESTIONADO": "ops.faltas.funcionario_id",
    "FECHA": "ops.faltas.fecha",
    "OBSERVACIONES": "ops.faltas.descripcion",
    "COD_FALTA": EXTRA,
    "DESCRIPCION_FALTA": "ops.faltas.tipo_falta",
    "HORA": EXTRA,
    "NRO_PARTE": EXTRA,
    "TOMO_LIBRO": EXTRA,
    "BENEFICIOS": EXTRA,
}, extra_en=EN_METADATA, nota="La tabla FALTAS legacy tiene 1 fila; RECURRENCIA es la real."))
_m(MapeoTabla("ENC_GUARDIAS", "ops.guardias", "operaciones", "guardias", ("ID_ENCABEZADO",), {
    "ID_ENCABEZADO": "derivado: clave",
    "COD_ZONA": EXTRA,
    "COD_ESTACION": "ops.guardias.estacion_id",
    "SECCION": "ops.guardias.seccion",
    "HORARIO": "ops.guardias.turno (+ hora_inicio/hora_fin por parámetro, ver LAGUNAS)",
    "COD_AREA_DEPENDENCIA": EXTRA,
    "MES": EXTRA,
    "DIA": EXTRA,
    "FECHA": "ops.guardias.fecha",
    "OFICIAL_COMANDO": EXTRA,
    "RESPONSABLE_CARGA": EXTRA,
}, extra_en=EN_METADATA))
_m(MapeoTabla("DET_GUARDIAS", "ops.guardia_funcionarios", "operaciones", "guardias",
              ("ID_DETALLE",), {
    "ID_ENCABEZADO": "ops.guardia_funcionarios.guardia_id",
    "ID_DETALLE": "derivado: clave",
    "COD_DEPENDENCIA_OPERATIVA": EXTRA,
    "CEDULA": "ops.guardia_funcionarios.funcionario_id",
    "COD_JERARQUIA": EXTRA,
    "ESTATUS_INICIAL": EXTRA,
    "ESTATUS_FINAL": EXTRA,
    "OBSERVACIONES": "ops.guardia_funcionarios.observaciones",
}))

# --- Carrera -----------------------------------------------------------------
_m(MapeoTabla("EVALUACIONES_CURSOS", "carrera.cursos_realizados", "carrera",
              "cursos_realizados", ("ID",), {
    "ID": "derivado: clave",
    "CEDULA": "carrera.cursos_realizados.funcionario_id",
    "COD_JERARQUIA": EXTRA,
    "COD_CURSO": "carrera.cursos_realizados.curso_id",
    "NOTA": "carrera.cursos_realizados.nota",
    "FECHA": "carrera.cursos_realizados.fecha_fin",
    "CEDULA_INSTRUCTOR": EXTRA,
    "ACUDIO": "carrera.cursos_realizados.aprobado",
    "OBSERVACION": "carrera.cursos_realizados.observaciones",
    "EXTRA": EXTRA,
}, extra_en=EN_METADATA))
_m(MapeoTabla("ASCENSOS", "carrera.ascensos", "carrera", "ascensos",
              ("CEDULA", "COD_JERARQUIA", "FECHA_ASCENSO"), {
    "CEDULA": "carrera.ascensos.funcionario_id",
    "COD_JERARQUIA": "carrera.ascensos.jerarquia_nueva_id",
    "JERARQUIA": "derivado: jerarquia_nueva_id si COD_JERARQUIA no resuelve",
    "FECHA_ASCENSO": "carrera.ascensos.fecha_efectiva",
    "ORDEN_GENERAL": "carrera.ascensos.resolucion",
}, extra_en=EN_METADATA,
   nota="jerarquia_anterior_id = la del ascenso previo del mismo funcionario."))
_m(MapeoTabla("EVALUACIONES", "carrera.evaluaciones", "carrera", "evaluaciones",
              ("IDEVALUACION",), {
    "IDEVALUACION": "derivado: clave",
    "CEDULA": "carrera.evaluaciones.funcionario_id",
    "CAPACITACION": EXTRA,
    "FISICA": EXTRA,
    "NOMBRE_EVALUADOR": EXTRA,
    "NUMERO_EVALUADOR": EXTRA,
    "DESEMPENO": EXTRA,
    "GERENTE": EXTRA,
    "RECOMENDACIONES": "carrera.evaluaciones.observaciones",
    "FECHA": "carrera.evaluaciones.periodo_id (período anual LEG_<año>)",
}, extra_en=EN_METADATA))

# --- Egresos -----------------------------------------------------------------
_m(MapeoTabla("JUBILADOS", "egresos.jubilados", "egresos", "jubilados", ("CEDULA",), {
    "CEDULA": "egresos.jubilados.funcionario_id",
    "NOMINA": EXTRA,
    "UNIDAD_EJECUTORA": EXTRA,
    "NRO_NOMINA": EXTRA,
    "APELLIDOS_NOMBRES": EXTRA,
    "JERARQUIA": EXTRA,
    "FECHA_INGRESO": EXTRA,
}, nota="fecha_jubilacion = fecha_egreso del último período (el origen no la trae)."))

# Tablas que se leen solo como apoyo de resolución (no generan filas propias).
TABLAS_APOYO: dict[str, str] = {
    "ESPECIALIDADES": "texto de especialidad para salud.medicos",
}


# ---------------------------------------------------------------------------
# Catálogos: cómo resolver contra lo sembrado (sql/04_seed.sql, 08, 10)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CatalogoCfg:
    unidad: str
    origen: str | None          # tabla legacy (None = solo valores sueltos)
    destino: str
    col_codigo: str | None      # columna legacy con el código
    col_nombre: str             # columna legacy con el nombre
    plantilla: str | None       # código destino para entradas nuevas
    crear: bool = True
    sinonimos: dict[str, str] = field(default_factory=dict)  # nombre legacy → codigo destino


CATALOGOS: dict[str, CatalogoCfg] = {
    c.unidad: c
    for c in (
        CatalogoCfg("zonas", "ZONAS", "org.zonas", "COD_ZONA", "ZONA", "Z{cod}"),
        CatalogoCfg("divisiones", "DIVISIONES", "org.divisiones", "COD_DIVISION", "DIVISION",
                    "LEG_DIV_{cod}"),
        CatalogoCfg("areas", "AREAS", "org.areas", "COD_AREA", "AREA", "LEG_AREA_{cod}"),
        CatalogoCfg("dependencias", "DEPENDENCIAS", "org.dependencias", "COD_DEPENDENCIA",
                    "DEPENDENCIA", "LEG_DEP_{cod}"),
        CatalogoCfg("estaciones", "ESTACIONES", "org.estaciones", "COD_ESTACION",
                    "NOMBRE_LARGO", "EST_{cod}"),
        CatalogoCfg("jerarquias", "JERARQUIAS", "core.jerarquias", "COD_JERARQUIA", "JERARQUIA",
                    "LEG_JER_{cod}", sinonimos={
                        "BOMBERO DISTINGUIDO": "DISTINGUIDO",
                        "DISTINGUIDO": "DISTINGUIDO",
                        "CABO SEGUNDO": "CABO_2DO", "CABO PRIMERO": "CABO_1RO",
                        "SARGENTO SEGUNDO": "SARGENTO_2DO", "SARGENTO PRIMERO": "SARGENTO_1RO",
                        "SUB TENIENTE": "SUBTENIENTE", "TTE CORONEL": "TENIENTE_CORONEL",
                    }),
        CatalogoCfg("cargos", "CARGOS", "core.cargos", "COD_CARGO", "CARGO", "LEG_CARGO_{cod}"),
        CatalogoCfg("condiciones", "CONDICIONES", "core.condiciones", "COD_CONDICION",
                    "DESCRIPCION", "LEG_COND_{cod}"),
        CatalogoCfg("niveles_educativos", "TIPO_NIVEL_EDUCATIVO", "core.niveles_educativos",
                    "COD_NIVEL", "TIPO_NIVEL", "LEG_NIV_{cod}", sinonimos={
                        "BACHILLER": "SECUNDARIA", "BACHILLERATO": "SECUNDARIA",
                        "TECNICO SUPERIOR": "TSU", "T S U": "TSU",
                        "LICENCIATURA": "UNIVERSITARIO", "UNIVERSITARIA": "UNIVERSITARIO",
                        "PROFESIONAL": "UNIVERSITARIO",
                    }),
        CatalogoCfg("cursos", "CURSOS", "carrera.cursos", "COD_CURSO", "DESCRIPCION",
                    "LEG_CURSO_{cod}"),
        CatalogoCfg("tipos_reposo", None, "core.tipos_reposo", None, "TIPOREPOSO",
                    "LEG_{slug}", sinonimos={
                        "ENFERMEDAD": "ENFERMEDAD_GEN", "ENFERMEDAD COMUN": "ENFERMEDAD_GEN",
                        "PRE NATAL": "MATERNIDAD", "POST NATAL": "MATERNIDAD",
                        "PRENATAL": "MATERNIDAD", "POSTNATAL": "MATERNIDAD",
                        "ACCIDENTE LABORAL": "ACCIDENTE_TRAB",
                        "ACCIDENTE DE TRABAJO": "ACCIDENTE_TRAB",
                        "POST OPERATORIO": "POSTOPERATORIO",
                    }),
        CatalogoCfg("grupos_diagnosticos", "GRUPOSDIAGNOSTICOS", "salud.grupos_diagnosticos",
                    "CODGRUPODIAGNOSTICO", "GRUPODIAGNOSTICO", "LEG_GRP_{cod}"),
        # Catálogos solo de resolución (no se crean entradas: valor desconocido → NULL + aviso).
        CatalogoCfg("estados_civiles", None, "core.estados_civiles", None, "ESTADO_CIVIL", None,
                    crear=False, sinonimos={
                        "SOLTERA": "SOLTERO", "S": "SOLTERO", "CASADA": "CASADO", "C": "CASADO",
                        "DIVORCIADA": "DIVORCIADO", "D": "DIVORCIADO", "VIUDA": "VIUDO",
                        "V": "VIUDO", "CONCUBINO": "CONCUBINATO", "CONCUBINA": "CONCUBINATO",
                        "UNION ESTABLE": "CONCUBINATO", "UNION LIBRE": "CONCUBINATO",
                    }),
        CatalogoCfg("parentescos", None, "core.parentescos", None, "PARENTESCO", None,
                    crear=False, sinonimos={
                        "ESPOSA": "CONYUGE", "ESPOSO": "CONYUGE", "CONCUBINA": "CONYUGE",
                        "CONCUBINO": "CONYUGE", "HIJOS": "HIJO", "HIJAS": "HIJA",
                    }),
    )
}

# Valor de tipo de reposo cuando el origen viene vacío (tipo_reposo_id es NOT NULL).
TIPO_REPOSO_NO_ESPECIFICADO = ("LEG_NO_ESPECIFICADO", "No especificado (migrado)")

# Horas de inicio/fin de guardia por turno. El origen NO las trae y el destino las
# exige (NOT NULL): parámetro explícito, VERIFICAR con el cliente (ver LAGUNAS.md).
HORAS_POR_TURNO: dict[str, tuple[str, str]] = {
    "24H": ("07:00", "07:00"),
    "DIURNO": ("07:00", "19:00"),
    "NOCTURNO": ("19:00", "07:00"),
}

# Días de tolerancia para asociar un DETALLE_EGRESO a una fecha de egreso.
TOLERANCIA_DETALLE_EGRESO_DIAS = 90


def como_dict() -> dict:
    """Mapa serializable (para `bomberos-migrate mapping --yaml`)."""
    return {
        "fases": list(FASES),
        "unidades": [{"unidad": u, "fase": f} for u, f in UNIDADES],
        "tablas": {
            m.origen: {
                "destino": m.destino,
                "fase": m.fase,
                "unidad": m.unidad,
                "clave": list(m.clave),
                "legacy_extra_en": m.extra_en,
                "nota": m.nota,
                "columnas": dict(m.columnas),
            }
            for m in MAPEOS.values()
        },
        "exclusiones": [{"regex": p, "motivo": mo} for p, mo in REGLAS_EXCLUSION],
        "catalogos": {
            c.unidad: {
                "origen": c.origen,
                "destino": c.destino,
                "plantilla_codigo": c.plantilla,
                "crear_si_falta": c.crear,
                "sinonimos": c.sinonimos,
            }
            for c in CATALOGOS.values()
        },
        "horas_por_turno": {k: list(v) for k, v in HORAS_POR_TURNO.items()},
    }
