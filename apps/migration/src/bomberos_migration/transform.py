"""Transformaciones puras origen → destino (sin base de datos).

Cada función recibe filas del origen con las claves ya normalizadas por
:func:`bomberos_migration.texto.norm_col` y devuelve un :class:`Resultado`
con los valores listos para insertar, o el motivo del descarte. Los
identificadores de catálogos se resuelven a través de :class:`Contexto`, que
el orquestador llena a partir de la BD destino (o de un destino simulado en
las pruebas).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from .mapping import (
    EXTRA,
    HORAS_POR_TURNO,
    MAPEOS,
    TOLERANCIA_DETALLE_EGRESO_DIAS,
    CatalogoCfg,
)
from .texto import a_json, compacto, norm_texto, slug

# ---------------------------------------------------------------------------
# Resultado y contexto
# ---------------------------------------------------------------------------


@dataclass
class Resultado:
    valores: dict[str, Any] | None
    motivo: str | None = None
    avisos: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)
    no_previstas: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.valores is not None


def descarte(motivo: str, extra: dict | None = None) -> Resultado:
    return Resultado(None, motivo=motivo, extra=extra or {})


@dataclass
class Contexto:
    """Mapas código legacy → id destino (y otros índices de resolución)."""

    hoy: date = field(default_factory=date.today)
    zonas: dict[int, int] = field(default_factory=dict)
    estaciones: dict[int, int] = field(default_factory=dict)
    areas: dict[int, int] = field(default_factory=dict)
    divisiones: dict[int, int] = field(default_factory=dict)
    dependencias: dict[int, int] = field(default_factory=dict)
    jerarquias: dict[int, int] = field(default_factory=dict)
    jerarquias_por_nombre: dict[str, int] = field(default_factory=dict)
    cargos: dict[int, int] = field(default_factory=dict)
    condiciones: dict[int, int] = field(default_factory=dict)
    condiciones_por_nombre: dict[str, int] = field(default_factory=dict)
    niveles: dict[int, int] = field(default_factory=dict)
    niveles_por_nombre: dict[str, int] = field(default_factory=dict)
    cursos: dict[int, int] = field(default_factory=dict)
    grupos_diagnosticos: dict[int, int] = field(default_factory=dict)
    diagnosticos: dict[int, int] = field(default_factory=dict)
    diagnosticos_nombre: dict[int, str] = field(default_factory=dict)
    medicos: dict[int, int] = field(default_factory=dict)
    centros: dict[int, int] = field(default_factory=dict)
    centros_por_nombre: dict[str, int] = field(default_factory=dict)
    tipos_reposo: dict[str, int] = field(default_factory=dict)
    tipo_reposo_no_especificado: int | None = None
    estados_civiles: dict[str, int] = field(default_factory=dict)
    grupos_sanguineos: dict[str, int] = field(default_factory=dict)
    secciones: dict[str, int] = field(default_factory=dict)
    tipos_licencia: dict[str, int] = field(default_factory=dict)
    parentescos: dict[str, str] = field(default_factory=dict)
    especialidades: dict[int, str] = field(default_factory=dict)
    estacion_zona: dict[int, int] = field(default_factory=dict)  # legacy estación → legacy zona
    funcionarios: dict[int, int] = field(default_factory=dict)  # cédula → funcionario_id
    periodos_evaluacion: dict[int, int] = field(default_factory=dict)  # año → id


# ---------------------------------------------------------------------------
# Parsers básicos
# ---------------------------------------------------------------------------
_CENTINELAS = {"0", "01/01/1900", "1900-01-01", "1900-01-01 00:00:00"}


def parse_cedula(raw: Any) -> int | None:
    """``CEDULA numeric(18)`` (o float en JUBILADOS) → int válido para el destino."""
    if raw is None or isinstance(raw, bool):
        return None
    try:
        if isinstance(raw, (int, Decimal)):
            d = Decimal(raw)
        elif isinstance(raw, float):
            d = Decimal(str(raw))
        else:
            s = str(raw).strip().replace(".", "").replace(" ", "").replace("-", "")
            if not s.isdigit():
                return None
            d = Decimal(s)
    except InvalidOperation:
        return None
    if d != d.to_integral_value():
        return None
    n = int(d)
    return n if 1 <= n <= 999_999_999 else None


def parse_nacionalidad(raw: Any) -> tuple[str | None, str | None]:
    """``NACIONALIDAD nvarchar(1)`` → ('V'|'E', aviso) o (None, motivo de descarte)."""
    s = norm_texto(raw)
    if not s:
        return "V", "nacionalidad vacía: se asume V"
    if s[0] in ("V", "E") and len(s) == 1:
        return s, None
    if s in ("VENEZOLANO", "VENEZOLANA"):
        return "V", None
    if s in ("EXTRANJERO", "EXTRANJERA"):
        return "E", None
    return None, f"nacionalidad no admitida por el destino ({str(raw).strip()!r})"


def parse_date(raw: Any) -> date | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        d = raw.date()
    elif isinstance(raw, date):
        d = raw
    else:
        s = str(raw).strip()
        if not s or s in _CENTINELAS:
            return None
        d = None
        for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%Y%m%d", "%m/%d/%Y"):
            try:
                d = datetime.strptime(s, fmt).date()
                break
            except ValueError:
                continue
        if d is None:
            return None
    return None if d.year <= 1900 else d


def parse_time(raw: Any) -> time | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.time()
    if isinstance(raw, time):
        return raw
    m = re.match(r"^\s*(\d{1,2}):(\d{2})", str(raw))
    return time(int(m.group(1)), int(m.group(2))) if m else None


def parse_bool(raw: Any) -> bool | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float, Decimal)):
        return bool(raw)
    s = norm_texto(raw)
    if s in ("SI", "S", "X", "1", "TRUE", "VERDADERO", "Y", "YES"):
        return True
    if s in ("NO", "N", "0", "FALSE", "FALSO"):
        return False
    return None


def parse_int(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        d = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        return None
    if not d.is_finite():
        return None
    return int(d) if d == d.to_integral_value() else None


def parse_decimal(raw: Any) -> Decimal | None:
    if raw is None or raw == "":
        return None
    try:
        return Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        return None


def texto(v: Any, largo: int | None = None) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s[:largo] if largo else s


def parse_sexo(raw: Any) -> str | None:
    s = norm_texto(raw)
    if s in ("M", "MASCULINO", "HOMBRE", "VARON"):
        return "M"
    if s in ("F", "FEMENINO", "MUJER", "HEMBRA"):
        return "F"
    return None


def parse_grupo_sanguineo(grupo: Any, factor: Any) -> str | None:
    """``GRUPO_SANGUINEO`` (``O``, ``AB``, ``A+``) + ``FACTOR_SANGUINEO`` → ``O+``."""
    g = str(grupo or "").strip().upper().replace("0", "O")
    signo = ""
    if g.endswith(("+", "-")):
        g, signo = g[:-1].strip(), g[-1]
    if g not in ("A", "B", "AB", "O"):
        return None
    if not signo:
        f = norm_texto(factor)
        raw_f = str(factor or "").strip()
        if "+" in raw_f or f.startswith("POS"):
            signo = "+"
        elif "-" in raw_f or f.startswith("NEG"):
            signo = "-"
    return g + signo if signo else None


_ESTATUS = {
    "ACTIVO": "ACTIVO", "ACTIVA": "ACTIVO",
    "VACACIONES": "ACTIVO", "DE VACACIONES": "ACTIVO",  # las vacaciones no cambian el estatus
    "REPOSO": "REPOSO", "EN REPOSO": "REPOSO",
    "COMISION": "COMISION", "EN COMISION": "COMISION", "COMISION DE SERVICIO": "COMISION",
    "JUBILADO": "JUBILADO", "JUBILADA": "JUBILADO",
    "PRE JUBILADO": "PRE_JUBILADO", "PREJUBILADO": "PRE_JUBILADO", "PRE JUBILADA": "PRE_JUBILADO",
    "EGRESADO": "EGRESADO", "EGRESADA": "EGRESADO", "RETIRADO": "EGRESADO",
    "RENUNCIA": "EGRESADO", "DESTITUIDO": "EGRESADO", "DESINCORPORADO": "EGRESADO",
    "FALLECIDO": "FALLECIDO", "FALLECIDA": "FALLECIDO", "MUERTO": "FALLECIDO",
    "SUSPENDIDO": "SUSPENDIDO", "SUSPENDIDA": "SUSPENDIDO",
    "PERMISO": "PERMISO_LARGO", "PERMISO LARGO": "PERMISO_LARGO",
}


def normalizar_estatus(raw: Any) -> str | None:
    """Estatus legacy → ``core.estatus_funcionario``; None si no se reconoce."""
    s = norm_texto(raw)
    if s in _ESTATUS:
        return _ESTATUS[s]
    if s.replace(" ", "_") in _ESTATUS.values():
        return s.replace(" ", "_")
    return None


_TIPO_EGRESO_CLAVES = (
    ("JUBIL", "JUBILACION"),
    ("FALLEC", "FALLECIMIENTO"),
    ("MUERT", "FALLECIMIENTO"),
    ("DECES", "FALLECIMIENTO"),
    ("RENUNC", "RENUNCIA"),
    ("DESTITU", "DESPIDO"),
    ("DESPID", "DESPIDO"),
    ("ABANDON", "ABANDONO"),
    ("EXCEDEN", "EXCEDENCIA"),
    ("RATIFIC", "NO_RATIFICADO"),
    ("MILITAR", "MILITAR"),
)


def tipo_egreso_desde_texto(*textos: Any) -> str | None:
    """Infere el tipo de egreso por palabras clave (estatus, basamento legal…)."""
    for t in textos:
        s = norm_texto(t)
        if not s:
            continue
        for clave, tipo in _TIPO_EGRESO_CLAVES:
            if clave in s:
                return tipo
    return None


# ---------------------------------------------------------------------------
# legacy_extra y claves de origen
# ---------------------------------------------------------------------------


def clave_origen(tabla: str, fila: dict) -> str:
    """Clave estable de una fila del origen (PK declarada o columnas de ``MapeoTabla.clave``).

    Es la que se guarda en ``migracion.trazas`` / ``migracion.descartes`` y la
    que usa ``validate`` para cuadrar origen contra destino.
    """
    m = MAPEOS.get(tabla)
    cols = m.clave if m else ("ID",)
    return "|".join(str(a_json(fila.get(c))) for c in cols)



def separar_extra(fila: dict, tabla: str, adicionales: dict | None = None) -> tuple[dict, list]:
    """Columnas EXTRA (y no previstas) con valor → dict JSON; lista de no previstas."""
    mapeo = MAPEOS[tabla]
    extra: dict[str, Any] = {}
    no_previstas: list[str] = []
    for col, val in fila.items():
        if col.startswith("_"):
            continue
        destino = mapeo.columnas.get(col)
        if destino is None:
            no_previstas.append(col)
        if destino is None or destino == EXTRA:
            v = a_json(val)
            if v is not None and v != "":
                extra[col] = v
    for col, val in (adicionales or {}).items():
        v = a_json(val)
        if v is not None and v != "":
            extra[col] = v
    return extra, no_previstas


def _res(valores: dict, fila: dict, tabla: str, avisos: list[str],
         no_resueltos: dict | None = None) -> Resultado:
    extra, nop = separar_extra(fila, tabla, no_resueltos)
    return Resultado(valores, avisos=avisos, extra=extra, no_previstas=nop)


def _cat(mapa: dict[int, int], cod: Any, col: str, avisos: list[str], nores: dict,
         fila: dict) -> int | None:
    """Busca un código legacy en un mapa; si no resuelve, avisa y guarda el valor."""
    c = parse_int(cod)
    if c is None:
        return None
    if c in mapa:
        return mapa[c]
    avisos.append(f"{col}={c} no resuelto en el catálogo destino")
    nores[f"{col}_no_resuelto"] = fila.get(col)
    return None


# ---------------------------------------------------------------------------
# Catálogos: resolución contra lo sembrado
# ---------------------------------------------------------------------------


def indice_catalogo(filas_destino: list[dict], cfg: CatalogoCfg | None = None) -> dict[str, int]:
    """Índice ``compacto(texto) → id`` por código, nombre, nombre antes de « - » y corto."""
    idx: dict[str, int] = {}
    por_codigo: dict[str, int] = {}
    for f in filas_destino:
        fid = f["id"]
        cod = f.get("codigo")
        if cod:
            por_codigo[str(cod).upper()] = fid
        for v in (cod, f.get("nombre"), f.get("nombre_corto")):
            if v:
                idx.setdefault(compacto(v), fid)
        nombre = f.get("nombre") or ""
        if " - " in nombre:
            idx.setdefault(compacto(nombre.split(" - ")[0]), fid)
    if cfg:
        for alias, codigo in cfg.sinonimos.items():
            if codigo.upper() in por_codigo:
                idx[compacto(alias)] = por_codigo[codigo.upper()]
    return idx


def codigos_catalogo(filas_destino: list[dict]) -> dict[str, int]:
    return {str(f["codigo"]).upper(): f["id"] for f in filas_destino if f.get("codigo")}


@dataclass
class AccionCatalogo:
    clave: str                    # clave legacy (código o texto)
    nombre: str
    tipo: str                     # traza | semilla | crear | sin_resolver
    id_destino: int | None = None
    codigo_nuevo: str | None = None


def planificar_catalogo(
    cfg: CatalogoCfg,
    entradas: list[tuple[str, str]],
    filas_destino: list[dict],
    trazas: dict[str, int],
) -> list[AccionCatalogo]:
    """Decide para cada entrada legacy (clave, nombre) si ya está migrada, casa con
    una semilla del destino, hay que crearla o queda sin resolver."""
    idx = indice_catalogo(filas_destino, cfg)
    por_codigo = codigos_catalogo(filas_destino)
    acciones: list[AccionCatalogo] = []
    planificados: dict[str, str] = {}
    for clave, nombre in entradas:
        if clave in trazas:
            acciones.append(AccionCatalogo(clave, nombre, "traza", trazas[clave]))
            continue
        fid = idx.get(compacto(nombre)) if nombre else None
        if fid is None and cfg.plantilla and "{cod}" in cfg.plantilla:
            fid = por_codigo.get(cfg.plantilla.format(cod=clave).upper())
        if fid is not None:
            acciones.append(AccionCatalogo(clave, nombre, "semilla", fid))
            continue
        if not cfg.crear or not cfg.plantilla:
            acciones.append(AccionCatalogo(clave, nombre, "sin_resolver"))
            continue
        codigo = cfg.plantilla.format(cod=clave, slug=slug(nombre))
        if codigo.upper() in por_codigo:
            acciones.append(AccionCatalogo(clave, nombre, "semilla", por_codigo[codigo.upper()]))
            continue
        if codigo in planificados.values():
            # mismo código (p. ej. dos textos con el mismo slug) → misma entrada
            acciones.append(AccionCatalogo(clave, nombre, "crear", codigo_nuevo=codigo))
            continue
        planificados[clave] = codigo
        acciones.append(AccionCatalogo(clave, nombre or codigo, "crear", codigo_nuevo=codigo))
    return acciones


# ---------------------------------------------------------------------------
# Funcionarios (FUNCIONARIOS ∪ FUNCIONARIOS_EGRESADOS)
# ---------------------------------------------------------------------------


@dataclass
class Expediente:
    """Todas las filas legacy de una cédula."""

    cedula: int
    activo: dict | None = None              # fila de FUNCIONARIOS
    egresos: list[dict] = field(default_factory=list)  # filas de FUNCIONARIOS_EGRESADOS

    @property
    def base(self) -> dict:
        if self.activo is not None:
            return self.activo
        return max(
            self.egresos,
            key=lambda f: (parse_date(f.get("FECHA_EGRESO")) or date.min,
                           parse_date(f.get("FECHA_TRANSACCION")) or date.min),
        )

    @property
    def filas(self) -> list[dict]:
        return ([self.activo] if self.activo else []) + list(self.egresos)


def agrupar_expedientes(funcionarios: list[dict], egresados: list[dict]
                        ) -> tuple[dict[int, Expediente], list[tuple[str, Any, str]]]:
    """Une FUNCIONARIOS y FUNCIONARIOS_EGRESADOS por CEDULA.

    Devuelve (expedientes, descartes) donde cada descarte es (tabla, clave, motivo).
    """
    exp: dict[int, Expediente] = {}
    descartes: list[tuple[str, Any, str]] = []
    for tabla, filas in (("FUNCIONARIOS", funcionarios), ("FUNCIONARIOS_EGRESADOS", egresados)):
        for f in filas:
            ced = parse_cedula(f.get("CEDULA"))
            if ced is None:
                descartes.append((tabla, f.get("CEDULA"), "cédula inválida o fuera de rango"))
                continue
            e = exp.setdefault(ced, Expediente(ced))
            if tabla == "FUNCIONARIOS":
                if e.activo is not None:
                    descartes.append((tabla, ced, "cédula duplicada en FUNCIONARIOS"))
                    continue
                e.activo = f
            else:
                e.egresos.append(f)
    return exp, descartes


def _primero(filas: list[dict], col: str) -> Any:
    for f in filas:
        v = f.get(col)
        if v is not None and (not isinstance(v, str) or v.strip()):
            return v
    return None


def funcionario_from_legacy(
    exp: Expediente,
    ctx: Contexto,
    ubicacion: dict | None = None,
    flags_educacion: tuple[bool, bool] = (False, False),
) -> Resultado:
    """Mapea el expediente (unión FUNCIONARIOS ∪ FUNCIONARIOS_EGRESADOS) → personal.funcionarios.

    La fila de FUNCIONARIOS prevalece; los vacíos se completan con la fila de
    egreso más reciente. Las columnas sin destino van a ``metadata.legacy_extra``.
    """
    base = exp.base
    filas = [base] + [f for f in exp.filas if f is not base]
    avisos: list[str] = []
    nores: dict[str, Any] = {}

    def v(col: str) -> Any:
        return _primero(filas, col)

    nac, msg = parse_nacionalidad(v("NACIONALIDAD"))
    if nac is None:
        return descarte(msg or "nacionalidad inválida")
    if msg:
        avisos.append(msg)

    estatus_raw = base.get("ESTATUS")
    estatus = normalizar_estatus(estatus_raw)
    if estatus is None:
        estatus = "ACTIVO" if exp.activo is not None else "EGRESADO"
        if texto(estatus_raw):
            avisos.append(f"estatus legacy desconocido {str(estatus_raw).strip()!r}: "
                          f"se usa {estatus}")
            nores["ESTATUS_no_reconocido"] = estatus_raw

    sexo = parse_sexo(v("SEXO"))
    if sexo is None and texto(v("SEXO")):
        nores["SEXO_no_reconocido"] = v("SEXO")

    grupo = parse_grupo_sanguineo(v("GRUPO_SANGUINEO"), v("FACTOR_SANGUINEO"))
    grupo_id = ctx.grupos_sanguineos.get(grupo) if grupo else None
    if grupo_id is None and texto(v("GRUPO_SANGUINEO")):
        nores["GRUPO_SANGUINEO_no_reconocido"] = v("GRUPO_SANGUINEO")

    ec_raw = v("ESTADO_CIVIL")
    estado_civil_id = ctx.estados_civiles.get(compacto(ec_raw)) if texto(ec_raw) else None
    if estado_civil_id is None and texto(ec_raw):
        avisos.append(f"estado civil no reconocido {str(ec_raw).strip()!r}")
        nores["ESTADO_CIVIL_no_reconocido"] = ec_raw

    correo = texto(v("CORREO_ELECTRONICO"), 254)
    if correo and "@" not in correo:
        nores["CORREO_ELECTRONICO_invalido"] = correo
        correo = None

    seccion = texto(v("SECCION"))
    seccion = seccion[0].upper() if seccion else None

    licencia = texto(v("LICENCIA"), 20)
    licencia_id = None
    if licencia:
        licencia_id = ctx.tipos_licencia.get(compacto(licencia))
        if licencia_id is None and licencia[0] in "12345":
            licencia_id = ctx.tipos_licencia.get(licencia[0])

    condicion_raw = v("CONDICION")
    condicion_id = None
    if texto(condicion_raw):
        condicion_id = ctx.condiciones_por_nombre.get(compacto(condicion_raw))
        if condicion_id is None and parse_int(condicion_raw) is not None:
            condicion_id = ctx.condiciones.get(parse_int(condicion_raw))
        if condicion_id is None:
            avisos.append(f"condición no resuelta {str(condicion_raw).strip()!r}")
            nores["CONDICION_no_resuelta"] = condicion_raw

    pre = parse_bool(v("PRE_JUBILADOS"))

    valores: dict[str, Any] = {
        "nacionalidad": nac,
        "cedula": exp.cedula,
        "rif": texto(v("RIF")),
        "apellidos": texto(v("APELLIDOS")) or "",
        "nombres": texto(v("NOMBRES")) or "",
        "fecha_nacimiento": parse_date(v("FECHA_NACIMIENTO")),
        "sexo": sexo,
        "estado_civil_id": estado_civil_id,
        "grupo_sanguineo_id": grupo_id,
        "factor_sanguineo": texto(v("FACTOR_SANGUINEO"), 15),
        "numero_empleado": texto(v("N_EMPLEADO")),
        "numero_equipo": texto(v("N_EQUIPO")),
        "promocion": texto(v("PROMOCION")),
        "estatus": estatus,
        "condicion_id": condicion_id,
        "jerarquia_id": _cat(ctx.jerarquias, v("COD_JERARQUIA"), "COD_JERARQUIA", avisos, nores,
                             base),
        "cargo_id": _cat(ctx.cargos, v("COD_CARGO"), "COD_CARGO", avisos, nores, base),
        "seccion": seccion,
        "seccion_id": ctx.secciones.get(seccion) if seccion else None,
        "horario": texto(v("HORARIO")),
        "telefono_habitacion": texto(v("TELEFONO_HABITACION")),
        "telefono_movil": texto(v("TELEFONO_MOBIL")),
        "telefono_otros": texto(v("TELEFONO_OTROS")),
        "correo": correo,
        "persona_contacto": texto(v("PERSONA_CONTACTO")),
        "nivel_educativo_id": _cat(ctx.niveles, v("NIVEL_EDUCATIVO"), "NIVEL_EDUCATIVO",
                                   avisos, nores, base),
        "iutb": bool(flags_educacion[0]),
        "egresado_unes": bool(flags_educacion[1]),
        "pre_jubilado": bool(pre) or estatus == "PRE_JUBILADO",
        "licencia_conducir": licencia,
        "licencia_conducir_id": licencia_id,
        "fecha_egreso": parse_date(base.get("FECHA_EGRESO")),
        "fecha_reintegro": parse_date(base.get("FECHA_REINTEGRO")),
        "fecha_este": parse_date(v("FECHA_ESTE")),
        "fecha_ingreso_gdf": parse_date(v("FECHA_INGRESOGDF")),
    }
    if not valores["apellidos"] and not valores["nombres"]:
        avisos.append("expediente sin nombres ni apellidos")

    # Ubicación administrativa vigente (snapshot)
    if ubicacion:
        cod_zona = parse_int(ubicacion.get("COD_ZONA"))
        cod_est = parse_int(ubicacion.get("COD_ESTACION"))
        if cod_zona is None and cod_est is not None:
            cod_zona = ctx.estacion_zona.get(cod_est)
        valores["zona_id"] = ctx.zonas.get(cod_zona) if cod_zona is not None else None
        valores["estacion_id"] = ctx.estaciones.get(cod_est) if cod_est is not None else None
        valores["area_id"] = ctx.areas.get(parse_int(ubicacion.get("COD_AREA")) or -1)
        valores["division_id"] = ctx.divisiones.get(parse_int(ubicacion.get("COD_DIVISION")) or -1)

    # legacy_extra: una entrada por tabla de origen
    extra_total: dict[str, Any] = {}
    no_previstas: list[str] = []
    if exp.activo is not None:
        ex, nop = separar_extra(exp.activo, "FUNCIONARIOS", nores)
        extra_total["FUNCIONARIOS"] = ex
        no_previstas += nop
    if exp.egresos:
        lst = []
        for f in exp.egresos:
            ex, nop = separar_extra(f, "FUNCIONARIOS_EGRESADOS",
                                    nores if exp.activo is None else None)
            lst.append(ex)
            no_previstas += nop
        extra_total["FUNCIONARIOS_EGRESADOS"] = lst
    if ubicacion:
        fuente = ubicacion.get("_fuente") or "UBICACION_ADMINISTRATIVA"
        ex, nop = separar_extra(ubicacion, fuente)
        ex["fuente"] = fuente
        extra_total["UBICACION_VIGENTE"] = ex
        no_previstas += nop
    valores["metadata"] = {"legacy_extra": extra_total}
    return Resultado(valores, avisos=avisos, extra=extra_total, no_previstas=no_previstas)


def resolver_unicos(
    filas: list[dict[str, Any]],
    ocupados: dict[str, dict[str, tuple[str, int]]],
) -> list[str]:
    """Evita violar UNIQUE de ``numero_empleado`` y ``correo``.

    ``ocupados[col][valor_normalizado] = (nacionalidad, cedula)`` del dueño
    actual (en la BD o en filas anteriores). Si el valor ya pertenece a OTRA
    persona, se anula en la fila, se guarda en ``metadata.legacy_extra`` y se
    devuelve un aviso. Modifica ``filas`` y ``ocupados`` in situ.
    """
    avisos: list[str] = []
    for f in filas:
        dueno = (f["nacionalidad"], f["cedula"])
        for col in ("numero_empleado", "correo"):
            val = f.get(col)
            if not val:
                continue
            k = str(val).strip().lower()
            reg = ocupados.setdefault(col, {})
            if k in reg and reg[k] != dueno:
                otro = reg[k]
                f[col] = None
                le = f.setdefault("metadata", {}).setdefault("legacy_extra", {})
                le[f"{col}_duplicado"] = val
                avisos.append(f"{col} {val!r} de {dueno[0]}-{dueno[1]} ya pertenece a "
                              f"{otro[0]}-{otro[1]}: se deja vacío")
            else:
                reg[k] = dueno
    return avisos


# ---------------------------------------------------------------------------
# Períodos de servicio
# ---------------------------------------------------------------------------


def reconstruir_periodos_servicio(
    filas: list[dict] | dict,
    detalles: list[dict] | None = None,
    tolerancia_dias: int = TOLERANCIA_DETALLE_EGRESO_DIAS,
) -> tuple[list[dict], list[str]]:
    """Reconstruye los ciclos ingreso/egreso/reingreso de un funcionario.

    Entradas: todas sus filas de FUNCIONARIOS / FUNCIONARIOS_EGRESADOS
    (``FECHA_INGRESO``, ``FECHA_EGRESO``, ``FECHA_REINTEGRO``, ``ESTATUS``) y sus
    filas de ``DETALLE_EGRESO``. Algoritmo:

    1. Eventos de ingreso: cada ``FECHA_INGRESO`` (INGRESO) y ``FECHA_REINTEGRO``
       (REINGRESO). Eventos de egreso: cada ``FECHA_EGRESO``.
    2. Cada DETALLE_EGRESO se asocia al egreso más cercano dentro de la
       tolerancia; si no hay ninguno, su fecha (notificación o nómina) se
       convierte en un egreso propio.
    3. Se recorren en orden cronológico: un ingreso abre período si no hay uno
       abierto; un egreso cierra el abierto. Lo incoherente (reingreso con un
       período abierto, egreso sin ingreso) se ignora y se avisa.

    Devuelve (períodos, avisos). El último período sin egreso queda abierto.
    """
    if isinstance(filas, dict):
        filas = [filas]
    detalles = detalles or []
    avisos: list[str] = []
    ingresos: dict[date, str] = {}
    egresos: dict[date, dict[str, Any]] = {}
    for f in filas:
        fi = parse_date(f.get("FECHA_INGRESO"))
        fe = parse_date(f.get("FECHA_EGRESO"))
        fr = parse_date(f.get("FECHA_REINTEGRO"))
        if fi and fi not in ingresos:
            ingresos[fi] = "INGRESO"
        if fr:
            ingresos.setdefault(fr, "REINGRESO")
        if fe:
            ultimo_de_la_fila = not (fr and fr > fe)
            tipo = tipo_egreso_desde_texto(f.get("ESTATUS")) if ultimo_de_la_fila else None
            e = egresos.setdefault(fe, {"tipo_egreso": None, "detalles": []})
            e["tipo_egreso"] = e["tipo_egreso"] or tipo
    for d in detalles:
        fn = parse_date(d.get("FECHA_EGRESO_NOTIF"))
        fm = parse_date(d.get("FECHA_EGRESO_NOMI"))
        ref = fn or fm
        if ref is None:
            avisos.append(f"DETALLE_EGRESO {d.get('ID_EGRESO')}: sin fechas, se ignora")
            continue
        cercano = min(egresos, key=lambda x: abs((x - ref).days), default=None)
        if cercano is None or abs((cercano - ref).days) > tolerancia_dias:
            cercano = ref
            egresos.setdefault(cercano, {"tipo_egreso": None, "detalles": []})
            avisos.append(f"DETALLE_EGRESO {d.get('ID_EGRESO')}: egreso {ref} sin fecha "
                          "equivalente en la ficha; se registra como egreso propio")
        egresos[cercano]["detalles"].append(d)

    fechas = sorted(set(ingresos) | set(egresos))
    periodos: list[dict] = []
    abierto: dict | None = None
    for fch in fechas:
        orden = ("E", "I") if abierto is not None else ("I", "E")
        for tipo_ev in orden:
            if tipo_ev == "I" and fch in ingresos:
                if abierto is None:
                    abierto = {
                        "numero_periodo": len(periodos) + 1,
                        "fecha_ingreso": fch,
                        "fecha_egreso": None,
                        "tipo_ingreso": "INGRESO" if not periodos else "REINGRESO",
                        "tipo_egreso": None,
                    }
                    periodos.append(abierto)
                elif fch != abierto["fecha_ingreso"]:
                    avisos.append(f"{ingresos[fch].lower()} {fch} ignorado: ya hay un "
                                  f"período abierto desde {abierto['fecha_ingreso']}")
            elif tipo_ev == "E" and fch in egresos:
                ev = egresos[fch]
                if abierto is None:
                    avisos.append(f"egreso {fch} sin ingreso previo: se ignora")
                    continue
                abierto["fecha_egreso"] = fch
                dets = ev["detalles"]
                textos = [x.get("BASAMENTO_LEGAL") for x in dets] + [
                    x.get("OBSERVACIONES") for x in dets]
                abierto["tipo_egreso"] = ev["tipo_egreso"] or tipo_egreso_desde_texto(*textos)
                if dets:
                    d0 = dets[0]
                    abierto["base_legal"] = texto(d0.get("BASAMENTO_LEGAL"))
                    abierto["observaciones"] = texto(d0.get("OBSERVACIONES"))
                    abierto["fecha_notificacion"] = parse_date(d0.get("FECHA_EGRESO_NOTIF"))
                    abierto["fecha_efectiva_nomina"] = parse_date(d0.get("FECHA_EGRESO_NOMI"))
                    abierto["_detalles"] = [x.get("ID_EGRESO") for x in dets]
                    if len(dets) > 1:
                        abierto["_detalles_extra"] = [
                            {k: a_json(val) for k, val in x.items() if not k.startswith("_")}
                            for x in dets[1:]
                        ]
                abierto = None
    for d in detalles:
        usado = any(d.get("ID_EGRESO") in p.get("_detalles", []) for p in periodos)
        if not usado and (parse_date(d.get("FECHA_EGRESO_NOTIF")) or
                          parse_date(d.get("FECHA_EGRESO_NOMI"))):
            avisos.append(f"DETALLE_EGRESO {d.get('ID_EGRESO')}: no se pudo asociar a un período")
    return periodos, avisos


# ---------------------------------------------------------------------------
# Históricos
# ---------------------------------------------------------------------------


def encadenar_fechas(items: list[dict]) -> None:
    """Rellena ``fecha_fin`` = (fecha_inicio del siguiente) − 1, nunca < fecha_inicio.

    ``items`` debe venir ordenado por fecha_inicio. El último queda abierto.
    """
    for i, it in enumerate(items):
        if i + 1 < len(items):
            sig = items[i + 1]["fecha_inicio"] - timedelta(days=1)
            it["fecha_fin"] = max(sig, it["fecha_inicio"])
        else:
            it["fecha_fin"] = None


def historico_jerarquias_from_legacy(filas: list[dict], fid: int, ctx: Contexto
                                     ) -> list[tuple[dict, Resultado]]:
    """HISTORICO_JERARQUIA de UN funcionario → personal.historico_jerarquias (encadenado)."""
    salida: list[tuple[dict, Resultado]] = []
    validos: list[tuple[dict, Resultado]] = []
    for f in sorted(filas, key=lambda x: (parse_date(x.get("FECHA")) or date.min,
                                          parse_int(x.get("ID")) or 0)):
        avisos: list[str] = []
        nores: dict[str, Any] = {}
        fecha = parse_date(f.get("FECHA"))
        if fecha is None:
            salida.append((f, descarte("sin FECHA (fecha_inicio es obligatoria)")))
            continue
        jid = _cat(ctx.jerarquias, f.get("COD_JERARQUIA"), "COD_JERARQUIA", avisos, nores, f)
        if jid is None and texto(f.get("JERARQUIA")):
            jid = ctx.jerarquias_por_nombre.get(compacto(f.get("JERARQUIA")))
        if jid is None:
            salida.append((f, descarte("jerarquía no resuelta (jerarquia_id es obligatoria)")))
            continue
        r = _res({
            "funcionario_id": fid,
            "jerarquia_id": jid,
            "fecha_inicio": fecha,
            "motivo": texto(f.get("TIPO_DOCUMENTO")),
            "resolucion": texto(f.get("NUMERO_DOCUMENTO")),
        }, f, "HISTORICO_JERARQUIA", avisos, nores)
        validos.append((f, r))
    items = [r.valores for _, r in validos]
    encadenar_fechas(items)  # type: ignore[arg-type]
    return salida + validos


def historico_ubicaciones_from_legacy(filas: list[dict], fid: int, ctx: Contexto
                                      ) -> list[tuple[dict, Resultado]]:
    salida: list[tuple[dict, Resultado]] = []
    validos: list[tuple[dict, Resultado]] = []
    for f in sorted(filas, key=lambda x: (parse_date(x.get("FECHA_DESDE")) or date.min,
                                          parse_int(x.get("ID_UBIADM")) or 0)):
        avisos: list[str] = []
        nores: dict[str, Any] = {}
        fecha = parse_date(f.get("FECHA_DESDE"))
        if fecha is None:
            salida.append((f, descarte("sin FECHA_DESDE (fecha_inicio es obligatoria)")))
            continue
        cod_zona = parse_int(f.get("COD_ZONA"))
        cod_est = parse_int(f.get("COD_ESTACION"))
        if cod_zona is None and cod_est is not None:
            cod_zona = ctx.estacion_zona.get(cod_est)
        r = _res({
            "funcionario_id": fid,
            "zona_id": _cat(ctx.zonas, cod_zona, "COD_ZONA", avisos, nores, f),
            "estacion_id": _cat(ctx.estaciones, cod_est, "COD_ESTACION", avisos, nores, f),
            "area_id": _cat(ctx.areas, f.get("COD_AREA"), "COD_AREA", avisos, nores, f),
            "division_id": _cat(ctx.divisiones, f.get("COD_DIVISION"), "COD_DIVISION", avisos,
                                nores, f),
            "fecha_inicio": fecha,
        }, f, "HISTORICO_UBICACION_ADMINISTRATIVA", avisos, nores)
        validos.append((f, r))
    encadenar_fechas([r.valores for _, r in validos])  # type: ignore[misc]
    return salida + validos


# ---------------------------------------------------------------------------
# Identidad
# ---------------------------------------------------------------------------


def carga_familiar_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    avisos: list[str] = []
    nores: dict[str, Any] = {}
    par_raw = f.get("PARENTESCO")
    parentesco = ctx.parentescos.get(compacto(par_raw)) if texto(par_raw) else None
    if parentesco is None:
        parentesco = norm_texto(par_raw).replace(" ", "_") or "NO_ESPECIFICADO"
        if texto(par_raw):
            avisos.append(f"parentesco {str(par_raw).strip()!r} no está en core.parentescos")
    nivel = None
    if texto(f.get("GRADO_INSTRUCCION")):
        nivel = ctx.niveles_por_nombre.get(compacto(f.get("GRADO_INSTRUCCION")))
    estudia = parse_bool(f.get("ESTUDIA"))
    valores: dict[str, Any] = {
        "funcionario_id": fid,
        "parentesco": parentesco,
        "apellidos": texto(f.get("APELLIDOS")) or "",
        "nombres": texto(f.get("NOMBRES")) or "",
        "fecha_nacimiento": parse_date(f.get("FECHA_NACIMIENTO")),
        "sexo": parse_sexo(f.get("SEXO")),
        "nivel_educativo_id": nivel,
        "estudia": bool(estudia),
        "observaciones": texto(f.get("OBSERVACION")),
    }
    inclusion = parse_date(f.get("FECHA_INGRESO"))
    if inclusion:
        valores["fecha_inclusion"] = inclusion
    else:
        avisos.append("sin FECHA_INGRESO: fecha_inclusion toma el valor por defecto del destino")
    if nivel is None and texto(f.get("GRADO_INSTRUCCION")):
        nores["GRADO_INSTRUCCION_no_resuelto"] = f.get("GRADO_INSTRUCCION")
    return _res(valores, f, "CARGA_FAMILIAR", avisos, nores)


def educacion_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    avisos: list[str] = []
    nores: dict[str, Any] = {}
    nivel = _cat(ctx.niveles, f.get("NIVEL_EDUCATIVO"), "NIVEL_EDUCATIVO", avisos, nores, f)
    if nivel is None:
        return descarte("nivel educativo no resuelto (nivel_id es obligatorio)")
    return _res({
        "funcionario_id": fid,
        "nivel_id": nivel,
        "institucion": texto(f.get("LICEO_UNIVERSIDAD")),
        "titulo": texto(f.get("ESPECIALIDAD")),
        "fecha_titulo": parse_date(f.get("FECHA")),
    }, f, "NIVEL_EDUCATIVO", avisos, nores)


def flags_educacion(filas: list[dict]) -> tuple[bool, bool]:
    """(iutb, egresado_unes) = OR de las banderas de todas sus filas de NIVEL_EDUCATIVO."""
    iutb = any(parse_bool(f.get("IUTB")) for f in filas)
    unes = any(parse_bool(f.get("UNES")) for f in filas)
    return iutb, unes


# ---------------------------------------------------------------------------
# Operaciones
# ---------------------------------------------------------------------------


def reposo_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    fini = parse_date(f.get("FECHA_INICIO"))
    ffin = parse_date(f.get("FECHA_FIN"))
    if fini is None or ffin is None:
        return descarte("reposo sin FECHA_INICIO o FECHA_FIN")
    if ffin < fini:
        return descarte("FECHA_FIN anterior a FECHA_INICIO")
    avisos: list[str] = []
    nores: dict[str, Any] = {}
    tipo_raw = f.get("TIPOREPOSO")
    tipo_id = ctx.tipos_reposo.get(compacto(tipo_raw)) if texto(tipo_raw) else None
    if tipo_id is None:
        tipo_id = ctx.tipo_reposo_no_especificado
        avisos.append("tipo de reposo vacío o no resuelto: se usa LEG_NO_ESPECIFICADO")
        if texto(tipo_raw):
            nores["TIPOREPOSO_no_resuelto"] = tipo_raw
    if tipo_id is None:
        return descarte("tipo de reposo no resuelto (tipo_reposo_id es obligatorio)")
    cod_diag = parse_int(f.get("CODDIAGNOSTICO"))
    diag_id = ctx.diagnosticos.get(cod_diag) if cod_diag is not None else None
    if cod_diag is not None and diag_id is None:
        nores["CODDIAGNOSTICO_no_resuelto"] = cod_diag
    centro_id = None
    ci = f.get("COD_INSTITUCION")
    if texto(ci):
        n = parse_int(ci)
        centro_id = ctx.centros.get(n) if n is not None else ctx.centros_por_nombre.get(
            compacto(ci))
        if centro_id is None:
            nores["COD_INSTITUCION_no_resuelto"] = ci
    medico = parse_int(f.get("IDMEDICO"))
    medico_id = ctx.medicos.get(medico) if medico is not None else None
    if medico is not None and medico_id is None:
        nores["IDMEDICO_no_resuelto"] = medico
    folio = f.get("NROREPOSO")
    r = _res({
        "funcionario_id": fid,
        "tipo_reposo_id": tipo_id,
        "diagnostico_id": diag_id,
        "diagnostico_libre": ctx.diagnosticos_nombre.get(cod_diag) if cod_diag else None,
        "medico_id": medico_id,
        "centro_medico_id": centro_id,
        "fecha_inicio": fini,
        "fecha_fin": ffin,
        "folio": str(a_json(folio)) if folio is not None else None,
    }, f, "REPOSOS", avisos, nores)
    r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
    return r


def periodo_anio(periodos_txt: Any, fecha_inicio: date) -> int:
    m = re.search(r"(19|20)\d{2}", str(periodos_txt or ""))
    return int(m.group(0)) if m else fecha_inicio.year


def vacacion_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    fini = parse_date(f.get("FECHADESDE"))
    ffin = parse_date(f.get("FECHAHASTA"))
    if fini is None or ffin is None:
        return descarte("vacación sin FechaDesde o FechaHasta")
    if ffin < fini:
        return descarte("FechaHasta anterior a FechaDesde")
    r = _res({
        "funcionario_id": fid,
        "periodo_anio": periodo_anio(f.get("PERIODOS"), fini),
        "fecha_inicio": fini,
        "fecha_fin": ffin,
        "dias_habiles": parse_int(f.get("DIASDISFRUTE")),
        "observaciones": texto(f.get("OBSERVACIONES")),
    }, f, "VACACIONES", [])
    r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
    return r


def falta_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    fecha = parse_date(f.get("FECHA"))
    if fecha is None:
        return descarte("falta sin FECHA")
    avisos: list[str] = []
    descripcion = texto(f.get("OBSERVACIONES")) or texto(f.get("DESCRIPCION_FALTA"))
    if not descripcion:
        descripcion = "(sin descripción en el sistema anterior)"
        avisos.append("falta sin OBSERVACIONES ni DESCRIPCION_FALTA")
    r = _res({
        "funcionario_id": fid,
        "tipo_falta": texto(f.get("DESCRIPCION_FALTA")) or "NO_ESPECIFICADO",
        "fecha": fecha,
        "descripcion": descripcion,
    }, f, "RECURRENCIA", avisos)
    r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
    return r


def normalizar_turno(horario: Any) -> str | None:
    s = norm_texto(horario)
    if not s:
        return None
    if "24" in s:
        return "24H"
    if "NOCT" in s or s.startswith("N"):
        return "NOCTURNO"
    if "DIUR" in s or s.startswith("D"):
        return "DIURNO"
    return None


def guardia_from_legacy(f: dict, ctx: Contexto) -> Resultado:
    fecha = parse_date(f.get("FECHA"))
    if fecha is None:
        return descarte("guardia sin FECHA")
    est = parse_int(f.get("COD_ESTACION"))
    est_id = ctx.estaciones.get(est) if est is not None else None
    if est_id is None:
        return descarte("estación no resuelta (estacion_id es obligatoria)")
    turno = normalizar_turno(f.get("HORARIO"))
    if turno is None:
        return descarte(f"HORARIO {f.get('HORARIO')!r} no se reconoce como turno")
    hi, hf = HORAS_POR_TURNO[turno]
    seccion = texto(f.get("SECCION"))
    r = _res({
        "fecha": fecha,
        "estacion_id": est_id,
        "seccion": seccion[0].upper() if seccion else None,
        "turno": turno,
        "hora_inicio": parse_time(hi),
        "hora_fin": parse_time(hf),
    }, f, "ENC_GUARDIAS", ["hora_inicio/hora_fin tomadas de HORAS_POR_TURNO (parámetro)"])
    r.extra["HORARIO"] = a_json(f.get("HORARIO"))
    r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
    return r


def guardia_funcionario_from_legacy(f: dict, guardia_id: int, fid: int) -> Resultado:
    return _res({
        "guardia_id": guardia_id,
        "funcionario_id": fid,
        "observaciones": texto(f.get("OBSERVACIONES")),
    }, f, "DET_GUARDIAS", [])


# ---------------------------------------------------------------------------
# Carrera y egresos
# ---------------------------------------------------------------------------


def curso_realizado_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    avisos: list[str] = []
    nores: dict[str, Any] = {}
    curso_id = _cat(ctx.cursos, f.get("COD_CURSO"), "COD_CURSO", avisos, nores, f)
    nota = parse_decimal(f.get("NOTA"))
    r = _res({
        "funcionario_id": fid,
        "curso_id": curso_id,
        "nombre_libre": None if curso_id else texto(f.get("COD_CURSO")),
        "fecha_fin": parse_date(f.get("FECHA")),
        "nota": nota if nota is None or abs(nota) < 1000 else None,
        "aprobado": parse_bool(f.get("ACUDIO")),
        "observaciones": texto(f.get("OBSERVACION")),
    }, f, "EVALUACIONES_CURSOS", avisos, nores)
    r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
    return r


def ascensos_from_legacy(filas: list[dict], fid: int, ctx: Contexto
                         ) -> list[tuple[dict, Resultado]]:
    """ASCENSOS de un funcionario; jerarquia_anterior_id = la del ascenso previo."""
    salida: list[tuple[dict, Resultado]] = []
    anterior: int | None = None
    for f in sorted(filas, key=lambda x: parse_date(x.get("FECHA_ASCENSO")) or date.min):
        avisos: list[str] = []
        nores: dict[str, Any] = {}
        fecha = parse_date(f.get("FECHA_ASCENSO"))
        if fecha is None:
            salida.append((f, descarte("ascenso sin FECHA_ASCENSO")))
            continue
        jid = _cat(ctx.jerarquias, f.get("COD_JERARQUIA"), "COD_JERARQUIA", avisos, nores, f)
        if jid is None and texto(f.get("JERARQUIA")):
            jid = ctx.jerarquias_por_nombre.get(compacto(f.get("JERARQUIA")))
        if jid is None:
            salida.append((f, descarte("jerarquía no resuelta (jerarquia_nueva_id obligatoria)")))
            continue
        r = _res({
            "funcionario_id": fid,
            "jerarquia_anterior_id": anterior,
            "jerarquia_nueva_id": jid,
            "fecha_efectiva": fecha,
            "resolucion": texto(f.get("ORDEN_GENERAL")),
        }, f, "ASCENSOS", avisos, nores)
        r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
        anterior = jid
        salida.append((f, r))
    return salida


def evaluacion_from_legacy(f: dict, fid: int, ctx: Contexto) -> Resultado:
    fecha = parse_date(f.get("FECHA"))
    if fecha is None:
        return descarte("evaluación sin FECHA (no se puede asignar período)")
    periodo = ctx.periodos_evaluacion.get(fecha.year)
    if periodo is None:
        return descarte(f"período de evaluación {fecha.year} no disponible")
    r = _res({
        "funcionario_id": fid,
        "periodo_id": periodo,
        "tipo": "INTEGRAL",
        "estatus": "APROBADA",
        "observaciones": texto(f.get("RECOMENDACIONES")),
    }, f, "EVALUACIONES", [])
    r.extra["FECHA"] = a_json(f.get("FECHA"))
    r.valores["metadata"] = {"legacy_extra": r.extra}  # type: ignore[index]
    return r


def jubilado_from_legacy(f: dict, fid: int, fecha_ultimo_egreso: date | None) -> Resultado:
    if fecha_ultimo_egreso is None:
        return descarte("sin fecha de jubilación: el expediente no tiene egreso registrado")
    r = _res({
        "funcionario_id": fid,
        "fecha_jubilacion": fecha_ultimo_egreso,
    }, f, "JUBILADOS", [])
    return r


# ---------------------------------------------------------------------------
# Solapamientos (previsión en modo ensayo; el motor decide al aplicar)
# ---------------------------------------------------------------------------


def detectar_solapes(intervalos: list[tuple[Any, date, date | None]], cerrado: bool = True
                     ) -> dict[Any, Any]:
    """Para intervalos de UN funcionario, devuelve {clave: clave_con_la_que_choca}.

    Se aceptan en orden de inicio; un intervalo que choca con uno ya aceptado
    se marca (es lo que hará el EXCLUDE del destino si se insertan en ese orden).
    ``cerrado`` = rango ``[]`` (reposos, vacaciones); si no, ``[)``.
    """
    aceptados: list[tuple[Any, date, date]] = []
    choques: dict[Any, Any] = {}
    for clave, ini, fin in sorted(intervalos, key=lambda x: (x[1], str(x[0]))):
        fin_ef = fin or date.max
        for c2, i2, f2 in aceptados:
            if cerrado:
                solapa = ini <= f2 and i2 <= fin_ef
            else:
                solapa = ini < f2 and i2 < fin_ef
            if solapa:
                choques[clave] = c2
                break
        else:
            aceptados.append((clave, ini, fin_ef))
    return choques
