"""Normalización de textos, nombres de columna y valores (sin dependencias)."""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any


def _sin_tildes(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def norm_col(nombre: str) -> str:
    """Nombre de columna/tabla normalizado: ``Fecha Ultimo Ascenso`` → ``FECHA_ULTIMO_ASCENSO``.

    ``\\ufffd`` (carácter de reemplazo) se trata como ``N``: es la única letra
    no ASCII que aparece en los nombres del origen (``DESEMPEÑO``) y así se
    lee igual aunque el controlador ODBC la entregue dañada.
    """
    s = _sin_tildes(str(nombre).replace("�", "N"))
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper()


def norm_texto(valor: Any) -> str:
    """Texto comparable: mayúsculas, sin tildes, signos → espacio, espacios colapsados."""
    if valor is None:
        return ""
    s = _sin_tildes(str(valor)).upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return s.strip()


def compacto(valor: Any) -> str:
    """Como :func:`norm_texto` pero sin espacios (``SUB-TENIENTE`` ≡ ``SUBTENIENTE``)."""
    return norm_texto(valor).replace(" ", "")


def slug(valor: Any, largo: int = 40) -> str:
    """Código a partir de un nombre: ``Enfermedad común`` → ``ENFERMEDAD_COMUN``."""
    return norm_texto(valor).replace(" ", "_")[:largo] or "SIN_NOMBRE"


def a_json(v: Any) -> Any:
    """Convierte un valor del origen a algo serializable en JSON (para legacy_extra)."""
    if v is None or isinstance(v, (bool, int, str)):
        return v.strip() if isinstance(v, str) else v
    if isinstance(v, float):
        return int(v) if v.is_integer() else v
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, datetime):
        return v.isoformat(sep=" ") if (v.hour, v.minute, v.second) != (0, 0, 0) else (
            v.date().isoformat()
        )
    if isinstance(v, (date, time)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        return v.hex()
    if isinstance(v, uuid.UUID):
        return str(v)
    return str(v)
