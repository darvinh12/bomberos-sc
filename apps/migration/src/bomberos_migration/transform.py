"""Transformaciones por dominio.

Convierte registros del esquema legacy (SQL Server) a estructuras
listas para insertar en el esquema nuevo (PostgreSQL).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any


def parse_cedula(raw: Any) -> tuple[str, int] | None:
    """Legacy guarda CEDULA NUMERIC(18). En el nuevo es (nacionalidad, cedula)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if s[0] in "VEPvep":
        nac = s[0].upper()
        digits = s[1:].strip().lstrip("0")
    else:
        nac = "V"
        digits = s.lstrip("0")
    digits = digits.replace(" ", "").replace(".", "")
    if not digits.isdigit():
        return None
    return nac, int(digits)


def parse_date(raw: Any) -> date | None:
    if raw is None:
        return None
    if isinstance(raw, date):
        return raw if not isinstance(raw, datetime) else raw.date()
    s = str(raw).strip()
    if not s or s in ("0", "01/01/1900", "1900-01-01"):
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y%m%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def funcionario_from_legacy(row: dict) -> dict | None:
    """Mapea legacy.FUNCIONARIOS -> personal.funcionarios."""
    ced = parse_cedula(row.get("CEDULA"))
    if ced is None:
        return None
    nac, cedula = ced
    sexo_raw = (row.get("SEXO") or row.get("GENERO") or "").strip().upper()
    sexo = "M" if sexo_raw.startswith("M") else "F" if sexo_raw.startswith("F") else None
    estatus = (row.get("ESTATUS") or row.get("ESTATUS_FUNCIONARIO") or "ACTIVO").strip().upper()
    estatus = _normalize_estatus(estatus)
    return {
        "nacionalidad": nac,
        "cedula": cedula,
        "apellidos": (row.get("APELLIDOS") or "").strip()[:100],
        "nombres": (row.get("NOMBRES") or "").strip()[:100],
        "fecha_nacimiento": parse_date(row.get("FECHA_NACIMIENTO")),
        "sexo": sexo,
        "tipo_personal": _normalize_tipo_personal(row.get("TIPO_PERSONAL")),
        "numero_empleado": _str_or_none(row.get("NUMERO_EMPLEADO") or row.get("NUM_EMPLEADO")),
        "fecha_primer_ingreso": parse_date(row.get("FECHA_INGRESO")),
        "estatus": estatus,
        "telefono_movil": _str_or_none(row.get("TELEFONO_MOVIL") or row.get("CELULAR")),
        "correo": _str_or_none(row.get("CORREO") or row.get("EMAIL")),
        "profesion": _str_or_none(row.get("PROFESION")),
        "iutb": bool(row.get("IUTB", False)),
        "egresado_unes": bool(row.get("EGRESADO_UNES", False)),
        "pre_jubilado": estatus == "PRE_JUBILADO",
    }


def reposo_from_legacy(row: dict, funcionario_lookup: dict[tuple[str, int], int]) -> dict | None:
    """Mapea legacy.REPOSOS -> salud.reposos."""
    ced = parse_cedula(row.get("CEDULA"))
    if ced is None:
        return None
    fid = funcionario_lookup.get(ced)
    if fid is None:
        return None
    fini = parse_date(row.get("FECHA_INICIO") or row.get("DESDE"))
    ffin = parse_date(row.get("FECHA_FIN") or row.get("HASTA"))
    if fini is None or ffin is None:
        return None
    return {
        "funcionario_id": fid,
        "fecha_inicio": fini,
        "fecha_fin": ffin,
        "diagnostico_libre": _str_or_none(row.get("DIAGNOSTICO") or row.get("MOTIVO")),
        "documento_url": _str_or_none(row.get("CERTIFICADO") or row.get("DOCUMENTO")),
        "observaciones": _str_or_none(row.get("OBSERVACIONES")),
    }


def vacaciones_from_legacy(
    row: dict, funcionario_lookup: dict[tuple[str, int], int]
) -> dict | None:
    ced = parse_cedula(row.get("CEDULA"))
    if ced is None:
        return None
    fid = funcionario_lookup.get(ced)
    if fid is None:
        return None
    fini = parse_date(row.get("FECHA_INICIO"))
    ffin = parse_date(row.get("FECHA_FIN"))
    if fini is None or ffin is None:
        return None
    return {
        "funcionario_id": fid,
        "periodo_anio": fini.year,
        "fecha_inicio": fini,
        "fecha_fin": ffin,
        "dias_habiles": _int_or_none(row.get("DIAS_HABILES")),
        "fraccionada": bool(row.get("FRACCIONADA", False)),
        "autorizado": bool(row.get("AUTORIZADO", True)),
        "observaciones": _str_or_none(row.get("OBSERVACIONES")),
    }


def reconstruir_periodos_servicio(funcionario_legacy: dict) -> list[dict]:
    """Convierte FECHA_INGRESO/EGRESO/REINTEGRO de legacy en lista de periodos.

    Legacy guarda hasta 3 fechas escalares; el detalle de ciclos posteriores
    lo busca en DETALLE_EGRESO si existe. Esta función opera SOLO sobre las
    columnas escalar; el módulo migrate.py compone el listado completo
    consultando DETALLE_EGRESO aparte.
    """
    periodos: list[dict] = []
    fi = parse_date(funcionario_legacy.get("FECHA_INGRESO"))
    fe = parse_date(funcionario_legacy.get("FECHA_EGRESO"))
    fr = parse_date(funcionario_legacy.get("FECHA_REINTEGRO"))
    if fi is None:
        return periodos

    if fe is None:
        # Período activo único
        periodos.append({"fecha_ingreso": fi, "fecha_egreso": None, "tipo_egreso": None})
    else:
        periodos.append({"fecha_ingreso": fi, "fecha_egreso": fe, "tipo_egreso": "RENUNCIA"})
        if fr and fr > fe:
            periodos.append({"fecha_ingreso": fr, "fecha_egreso": None, "tipo_egreso": None})
    return periodos


# --- helpers -------------------------------------------------------------


def _str_or_none(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _int_or_none(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _normalize_estatus(s: str) -> str:
    s = s.upper().replace(" ", "_").replace("Á", "A").replace("É", "E").replace("Ó", "O")
    mapping = {
        "ACTIVO": "ACTIVO",
        "REPOSO": "REPOSO",
        "EN_REPOSO": "REPOSO",
        "COMISION": "COMISION",
        "EN_COMISION": "COMISION",
        "JUBILADO": "JUBILADO",
        "PRE_JUBILADO": "PRE_JUBILADO",
        "PREJUBILADO": "PRE_JUBILADO",
        "EGRESADO": "EGRESADO",
        "FALLECIDO": "FALLECIDO",
        "MUERTO": "FALLECIDO",
        "SUSPENDIDO": "SUSPENDIDO",
    }
    return mapping.get(s, "ACTIVO")


def _normalize_tipo_personal(v: Any) -> str:
    s = (v or "UNIFORMADO").strip().upper()
    if "ADM" in s or "CIVIL" in s:
        return "ADMINISTRATIVO"
    if "OBR" in s:
        return "OBRERO"
    return "UNIFORMADO"
