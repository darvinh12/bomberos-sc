"""Acotación de la migración a UNA zona operativa (``--zona``).

Regla (decidida con los metadatos reales del origen):

* La **ubicación administrativa vigente** de una cédula es:

  1. su fila de ``UBICACION_ADMINISTRATIVA`` (tabla de ubicación ACTUAL, una
     fila por funcionario: 5.522 filas frente a 5.726 de FUNCIONARIOS; trae
     CEDULA, COD_ZONA, COD_ESTACION, COD_AREA, COD_DIVISION y FECHA_DESDE). Si
     hubiera varias, la de FECHA_DESDE más reciente y, a igualdad, mayor ID;
  2. si no tiene, la ÚLTIMA fila de ``HISTORICO_UBICACION_ADMINISTRATIVA``
     (FECHA_DESDE más reciente; a igualdad, mayor ID_UBIADM). Es el caso típico
     de los egresados, que salen de la tabla de ubicación actual.

* La **zona** de esa ubicación es ``COD_ZONA``; si viene vacía se deduce de
  ``COD_ESTACION`` → ``ESTACIONES.COD_ZONA``.
* ``FUNCIONARIOS.COD_UBICACION`` NO se usa: su significado no está documentado
  (se conserva en ``metadata.legacy_extra``). Ver LAGUNAS.md.

Entran en el alcance los expedientes (activos y egresados) cuya zona vigente
es la pedida, con TODOS sus registros dependientes. Los catálogos y la
estructura organizativa se migran completos siempre.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from .texto import compacto, norm_texto
from .transform import parse_cedula, parse_date, parse_int


def _orden(fila: dict, col_fecha: str, col_id: str) -> tuple:
    return (parse_date(fila.get(col_fecha)) or date.min, parse_int(fila.get(col_id)) or 0)


def ubicaciones_vigentes(
    ubicacion_actual: list[dict],
    historico: list[dict],
) -> dict[int, dict]:
    """``cedula → fila de ubicación vigente`` (con ``_fuente`` = tabla de origen)."""
    vig: dict[int, dict] = {}
    for f in ubicacion_actual:
        ced = parse_cedula(f.get("CEDULA"))
        if ced is None:
            continue
        actual = vig.get(ced)
        if actual is None or _orden(f, "FECHA_DESDE", "ID") > _orden(actual, "FECHA_DESDE", "ID"):
            vig[ced] = {**f, "_fuente": "UBICACION_ADMINISTRATIVA"}
    ultimo_hist: dict[int, dict] = {}
    for f in historico:
        ced = parse_cedula(f.get("CEDULA"))
        if ced is None:
            continue
        actual = ultimo_hist.get(ced)
        if actual is None or (_orden(f, "FECHA_DESDE", "ID_UBIADM")
                              > _orden(actual, "FECHA_DESDE", "ID_UBIADM")):
            ultimo_hist[ced] = f
    for ced, f in ultimo_hist.items():
        if ced not in vig:
            vig[ced] = {**f, "_fuente": "HISTORICO_UBICACION_ADMINISTRATIVA"}
    return vig


def zona_de(ubicacion: dict | None, estacion_zona: dict[int, int]) -> int | None:
    if not ubicacion:
        return None
    z = parse_int(ubicacion.get("COD_ZONA"))
    if z is None:
        est = parse_int(ubicacion.get("COD_ESTACION"))
        if est is not None:
            z = estacion_zona.get(est)
    return z


def resolver_zona(
    argumento: str,
    zonas_legacy: list[dict],
    codigo_destino_por_cod: dict[int, str] | None = None,
) -> int:
    """Traduce ``--zona`` al ``COD_ZONA`` del origen.

    Acepta el código numérico del origen (``1``), el nombre del origen
    (``ZONA 1``, sin importar tildes ni mayúsculas) o el código del destino al
    que se resolvió esa zona (``Z1``). Lanza ValueError si no hay coincidencia
    única.
    """
    arg = argumento.strip()
    codigo_destino_por_cod = codigo_destino_por_cod or {}
    candidatos: set[int] = set()
    n = parse_int(arg)
    cods = {parse_int(z.get("COD_ZONA")) for z in zonas_legacy} - {None}
    if n is not None and n in cods:
        candidatos.add(n)
    if not candidatos:
        for z in zonas_legacy:
            cod = parse_int(z.get("COD_ZONA"))
            if cod is None:
                continue
            if compacto(z.get("ZONA")) == compacto(arg):
                candidatos.add(cod)
            dest = codigo_destino_por_cod.get(cod)
            if dest and dest.upper() == arg.upper():
                candidatos.add(cod)
    if len(candidatos) != 1:
        disponibles = ", ".join(
            f"{parse_int(z.get('COD_ZONA'))}={norm_texto(z.get('ZONA'))}"
            + (f" ({codigo_destino_por_cod[parse_int(z.get('COD_ZONA'))]})"
               if parse_int(z.get("COD_ZONA")) in codigo_destino_por_cod else "")
            for z in zonas_legacy
        )
        estado = "ambigua" if candidatos else "desconocida"
        raise ValueError(f"Zona {argumento!r} {estado}. Disponibles: {disponibles}")
    return candidatos.pop()


@dataclass
class Alcance:
    zona: int | None                         # COD_ZONA del origen (None = todas)
    cedulas: set[int] = field(default_factory=set)
    fuera: int = 0                           # expedientes de otras zonas
    sin_ubicacion: list[int] = field(default_factory=list)
    por_fuente: dict[str, int] = field(default_factory=dict)

    def incluye(self, cedula: Any) -> bool:
        ced = parse_cedula(cedula)
        return ced is not None and ced in self.cedulas

    def como_dict(self) -> dict:
        return {
            "zona_cod_origen": self.zona,
            "expedientes_en_alcance": len(self.cedulas),
            "expedientes_otras_zonas": self.fuera,
            "expedientes_sin_ubicacion": len(self.sin_ubicacion),
            "ubicacion_vigente_por_fuente": self.por_fuente,
        }


def calcular_alcance(
    cedulas_expedientes: set[int],
    vigentes: dict[int, dict],
    estacion_zona: dict[int, int],
    zona: int | None,
) -> Alcance:
    """Expedientes que entran en la migración según la zona vigente."""
    alc = Alcance(zona=zona)
    for ced in cedulas_expedientes:
        ub = vigentes.get(ced)
        if ub is not None:
            fuente = ub.get("_fuente", "?")
            alc.por_fuente[fuente] = alc.por_fuente.get(fuente, 0) + 1
        if zona is None:
            alc.cedulas.add(ced)
            continue
        z = zona_de(ub, estacion_zona)
        if z is None:
            alc.sin_ubicacion.append(ced)
        elif z == zona:
            alc.cedulas.add(ced)
        else:
            alc.fuera += 1
    alc.sin_ubicacion.sort()
    return alc
