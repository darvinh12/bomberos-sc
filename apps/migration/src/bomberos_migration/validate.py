"""Validaciones post-carga (``bomberos-migrate validate``). SOLO LECTURA en ambos lados.

1. **Cuadre de conteos** origen ↔ destino por tabla, con la misma acotación
   por zona y los mismos descartes de la carga: cada fila del origen en el
   alcance debe estar migrada (``migracion.trazas``) o descartada con motivo
   (``migracion.descartes``). Las que no estén en ninguna son «faltantes».
2. **Integridad referencial y huérfanos**: trazas que apuntan a filas que ya no
   existen, hijos sin funcionario, funcionarios sin períodos o con más de un
   período abierto, estatus incoherente con los períodos.
3. **Solapamientos**: períodos de servicio, reposos y vacaciones no se solapan
   en el destino, y cuántas filas rechazó el motor por solapamiento (con motivo).
4. **Antigüedad**: la calculada por el sistema nuevo
   (``personal.fn_antiguedad_dias``) frente a la registrada en el origen
   (``FECHA_INGRESO`` → ``FECHA_EGRESO``/hoy), y ``fecha_primer_ingreso``.
5. **Muestreo** de N expedientes, origen y destino lado a lado.

Salida en texto y en ``reporte_migracion_<fecha>.json``.
"""
from __future__ import annotations

import asyncio
import json
import random
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

from .alcance import calcular_alcance, resolver_zona, ubicaciones_vigentes, zona_de
from .config import Config
from .mapping import MAPEOS
from .origen import Origen, OrigenSqlServer
from .texto import a_json, compacto
from .transform import (
    agrupar_expedientes,
    clave_origen,
    normalizar_estatus,
    parse_cedula,
    parse_date,
    parse_int,
    parse_sexo,
    reconstruir_periodos_servicio,
    texto,
)

console = Console()

# Columna de cédula por tabla dependiente (None = catálogo: se migra completo).
COL_CEDULA: dict[str, str | None] = {
    "ZONAS": None, "DIVISIONES": None, "AREAS": None, "DEPENDENCIAS": None,
    "ESTACIONES": None, "JERARQUIAS": None, "CARGOS": None, "CONDICIONES": None,
    "TIPO_NIVEL_EDUCATIVO": None, "CURSOS": None, "GRUPOSDIAGNOSTICOS": None,
    "DIAGNOSTICOS": None, "MEDICO_TRATANTE": None, "CENTROS_MEDICOS": None,
    "FUNCIONARIOS": "CEDULA", "FUNCIONARIOS_EGRESADOS": "CEDULA",
    "UBICACION_ADMINISTRATIVA": "CEDULA", "DETALLE_EGRESO": "CEDULA",
    "HISTORICO_JERARQUIA": "CEDULA", "HISTORICO_UBICACION_ADMINISTRATIVA": "CEDULA",
    "CARGA_FAMILIAR": "CEDULA", "NIVEL_EDUCATIVO": "CEDULA", "REPOSOS": "CEDULA",
    "VACACIONES": "CEDULA", "RECURRENCIA": "CEDULA_CUESTIONADO", "DET_GUARDIAS": "CEDULA",
    "EVALUACIONES_CURSOS": "CEDULA", "ASCENSOS": "CEDULA", "EVALUACIONES": "CEDULA",
    "JUBILADOS": "CEDULA",
}

# Dependientes que se comparan en el muestreo: tabla origen → (col cédula, tabla destino)
DEPENDIENTES_MUESTRA: dict[str, tuple[str, str]] = {
    "HISTORICO_JERARQUIA": ("CEDULA", "personal.historico_jerarquias"),
    "HISTORICO_UBICACION_ADMINISTRATIVA": ("CEDULA", "personal.historico_ubicaciones"),
    "CARGA_FAMILIAR": ("CEDULA", "personal.carga_familiar"),
    "REPOSOS": ("CEDULA", "salud.reposos"),
    "VACACIONES": ("CEDULA", "ops.vacaciones"),
    "RECURRENCIA": ("CEDULA_CUESTIONADO", "ops.faltas"),
    "ASCENSOS": ("CEDULA", "carrera.ascensos"),
    "EVALUACIONES": ("CEDULA", "carrera.evaluaciones"),
    "EVALUACIONES_CURSOS": ("CEDULA", "carrera.cursos_realizados"),
}


# ---------------------------------------------------------------------------
# Funciones puras (probadas sin BD)
# ---------------------------------------------------------------------------


def cuadre(en_alcance: set[str], migradas: set[str], descartadas: set[str]) -> dict:
    """Cuadra una tabla: alcance = migradas + descartadas (+ faltantes, que no debería haber)."""
    mig = en_alcance & migradas
    desc = (en_alcance & descartadas) - mig
    faltan = en_alcance - mig - desc
    return {
        "en_alcance": len(en_alcance),
        "migradas": len(mig),
        "descartadas": len(desc),
        "faltantes": len(faltan),
        "ejemplos_faltantes": sorted(faltan)[:10],
        "fuera_de_alcance_en_destino": len(migradas - en_alcance),
        "cuadra": not faltan,
    }


def antiguedad_registrada(filas: list[dict], hoy: date) -> tuple[date | None, int | None]:
    """Antigüedad «ingenua» del origen: primer FECHA_INGRESO → FECHA_EGRESO (o hoy).

    No descuenta interrupciones: es lo que el sistema anterior mostraba al no
    tener períodos. Se devuelve (primer ingreso, días) con la misma convención
    que ``personal.fn_antiguedad_dias`` (ambos extremos incluidos).
    """
    ingresos = [d for d in (parse_date(f.get("FECHA_INGRESO")) for f in filas) if d]
    if not ingresos:
        return None, None
    primero = min(ingresos)
    base = filas[0]
    fe = parse_date(base.get("FECHA_EGRESO"))
    fr = parse_date(base.get("FECHA_REINTEGRO"))
    fin = fe if fe and not (fr and fr > fe) else hoy
    return primero, (fin - primero).days + 1


def clasificar_antiguedad(dias_origen: int | None, dias_destino: int | None,
                          n_periodos: int) -> str:
    if dias_origen is None or dias_destino is None:
        return "sin datos"
    dif = dias_destino - dias_origen
    if abs(dif) <= 1:
        return "igual"
    if dif < 0 and n_periodos > 1:
        return "menor en destino: descuenta interrupciones entre períodos"
    return "diferente (revisar)"


def comparar(origen: Any, destino: Any) -> bool:
    if isinstance(origen, date) or isinstance(destino, date):
        return parse_date(origen) == parse_date(destino)
    if origen is None or destino is None:
        return (texto(origen) or None) == (texto(destino) or None)
    return compacto(origen) == compacto(destino)


# ---------------------------------------------------------------------------
# Validación contra las dos BD
# ---------------------------------------------------------------------------


class Validador:
    def __init__(self, origen: Origen, conn: Any, zona: str | None, muestras: int,
                 semilla: int, hoy: date) -> None:
        self.o = origen
        self.c = conn
        self.zona_arg = zona
        self.n = muestras
        self.semilla = semilla
        self.hoy = hoy
        self._cache: dict[str, list[dict]] = {}
        self.res: dict[str, Any] = {"generado": datetime.now().isoformat(timespec="seconds")}

    def leer(self, t: str) -> list[dict]:
        if t not in self._cache:
            self._cache[t] = list(self.o.leer(t))
        return self._cache[t]

    async def q(self, sql: str, *a: Any) -> list[dict]:
        return [dict(r) for r in await self.c.fetch(sql, *a)]

    async def v(self, sql: str, *a: Any) -> Any:
        return await self.c.fetchval(sql, *a)

    # -- alcance ---------------------------------------------------------------
    async def alcance(self) -> None:
        corrida = await self.q("SELECT id, zona, inicio, fin FROM migracion.corridas "
                               "WHERE modo = 'apply' ORDER BY id DESC LIMIT 1")
        self.res["ultima_corrida_aplicada"] = {k: a_json(v) for k, v in corrida[0].items()} \
            if corrida else None
        if self.zona_arg is None and corrida:
            self.zona_arg = corrida[0]["zona"]
        est_zona = {parse_int(e.get("COD_ESTACION")): parse_int(e.get("COD_ZONA"))
                    for e in self.leer("ESTACIONES")}
        self.est_zona = {k: v for k, v in est_zona.items() if k is not None and v is not None}
        cod = None
        if self.zona_arg:
            rows = await self.q("""SELECT t.clave_origen, z.codigo FROM migracion.trazas t
                                   JOIN org.zonas z ON z.id = t.id_destino
                                   WHERE t.tabla_origen = 'ZONAS'""")
            dest = {parse_int(r["clave_origen"]): r["codigo"] for r in rows}
            cod = resolver_zona(self.zona_arg, self.leer("ZONAS"),
                                {k: v for k, v in dest.items() if k is not None})
        self.exp, _ = agrupar_expedientes(self.leer("FUNCIONARIOS"),
                                          self.leer("FUNCIONARIOS_EGRESADOS"))
        self.vig = ubicaciones_vigentes(self.leer("UBICACION_ADMINISTRATIVA"),
                                        self.leer("HISTORICO_UBICACION_ADMINISTRATIVA"))
        self.alc = calcular_alcance(set(self.exp), self.vig, self.est_zona, cod)
        self.res["zona"] = self.zona_arg
        self.res["alcance"] = self.alc.como_dict()

    def claves_en_alcance(self, tabla: str) -> set[str]:
        col = COL_CEDULA.get(tabla)
        filas = self.leer(tabla)
        if tabla in ("FUNCIONARIOS", "FUNCIONARIOS_EGRESADOS"):
            # Las filas con cédula inválida no tienen clave útil: se cuentan aparte.
            return {str(parse_cedula(f.get("CEDULA"))) for f in filas
                    if parse_cedula(f.get("CEDULA")) in self.alc.cedulas}
        if col is None:
            return {clave_origen(tabla, f) for f in filas}
        out = set()
        for f in filas:
            ced = parse_cedula(f.get(col))
            if ced is not None and ced in self.alc.cedulas:
                out.add(clave_origen(tabla, f))
            elif self.alc.zona is None and (ced is None or ced not in self.exp):
                out.add(clave_origen(tabla, f))  # huérfana: debe figurar como descartada
        return out

    # -- 1. cuadre ---------------------------------------------------------------
    async def conteos(self) -> None:
        tablas = {}
        trz = defaultdict(set)
        for r in await self.q("SELECT DISTINCT tabla_origen, clave_origen FROM migracion.trazas"):
            trz[r["tabla_origen"]].add(r["clave_origen"])
        dsc = defaultdict(set)
        motivos: dict[str, Counter] = defaultdict(Counter)
        for r in await self.q("SELECT tabla_origen, clave_origen, motivo FROM migracion.descartes"):
            dsc[r["tabla_origen"]].add(r["clave_origen"])
            motivos[r["tabla_origen"]][r["motivo"]] += 1
        for tabla in COL_CEDULA:
            if not self.o.existe(tabla):
                tablas[tabla] = {"ausente_en_origen": True}
                continue
            alc = self.claves_en_alcance(tabla)
            if tabla == "ENC_GUARDIAS" and self.alc.zona is not None:
                continue
            c = cuadre(alc, trz.get(tabla, set()), dsc.get(tabla, set()))
            c["destino"] = MAPEOS[tabla].destino if tabla in MAPEOS else None
            c["descartes_por_motivo"] = dict(motivos.get(tabla, Counter()).most_common(10))
            tablas[tabla] = c
        # Conteo en destino por tabla_destino (filas enlazadas a una traza)
        destino = {}
        for r in await self.q("""SELECT tabla_destino, count(DISTINCT id_destino) AS n
                                   FROM migracion.trazas GROUP BY tabla_destino"""):
            destino[r["tabla_destino"]] = r["n"]
        self.res["conteos"] = {"por_tabla_origen": tablas, "filas_destino_enlazadas": destino}

    # -- 2. integridad -----------------------------------------------------------
    async def integridad(self) -> None:
        out: dict[str, Any] = {}
        tablas = [r["tabla_destino"] for r in await self.q(
            "SELECT DISTINCT tabla_destino FROM migracion.trazas")]
        rotas = {}
        for t in tablas:
            if "(" in t or " " in t:
                continue
            n = await self.v(f"""SELECT count(*) FROM migracion.trazas tr
                                 WHERE tr.tabla_destino = $1 AND NOT EXISTS (
                                   SELECT 1 FROM {t} x WHERE x.id = tr.id_destino)""", t)
            if n:
                rotas[t] = n
        out["trazas_sin_fila_destino"] = rotas
        hijos = {
            "personal.periodos_servicio": "funcionario_id",
            "personal.historico_jerarquias": "funcionario_id",
            "personal.historico_ubicaciones": "funcionario_id",
            "personal.carga_familiar": "funcionario_id",
            "personal.educacion": "funcionario_id",
            "salud.reposos": "funcionario_id",
            "ops.vacaciones": "funcionario_id",
            "ops.faltas": "funcionario_id",
            "ops.guardia_funcionarios": "funcionario_id",
            "carrera.ascensos": "funcionario_id",
            "carrera.evaluaciones": "funcionario_id",
            "carrera.cursos_realizados": "funcionario_id",
            "egresos.jubilados": "funcionario_id",
        }
        sin_padre = {}
        for t, col in hijos.items():
            sin_padre[t] = await self.v(f"""SELECT count(*) FROM {t} h LEFT JOIN
                personal.funcionarios f ON f.id = h.{col} WHERE f.id IS NULL""")
        out["hijos_sin_funcionario"] = sin_padre
        out["guardia_funcionarios_sin_guardia"] = await self.v(
            """SELECT count(*) FROM ops.guardia_funcionarios gf
               LEFT JOIN ops.guardias g ON g.id = gf.guardia_id WHERE g.id IS NULL""")
        out["estaciones_sin_zona"] = await self.v(
            """SELECT count(*) FROM org.estaciones e LEFT JOIN org.zonas z ON z.id = e.zona_id
               WHERE z.id IS NULL""")
        migrados = """SELECT DISTINCT id_destino FROM migracion.trazas
                       WHERE tabla_destino = 'personal.funcionarios'"""
        out["funcionarios_sin_periodos"] = await self.v(
            f"""SELECT count(*) FROM ({migrados}) m WHERE NOT EXISTS (
                  SELECT 1 FROM personal.periodos_servicio p
                   WHERE p.funcionario_id = m.id_destino)""")
        out["funcionarios_con_varios_periodos_abiertos"] = await self.v(
            """SELECT count(*) FROM (SELECT funcionario_id FROM personal.periodos_servicio
               WHERE fecha_egreso IS NULL GROUP BY funcionario_id HAVING count(*) > 1) x""")
        out["estatus_incoherente_con_periodos"] = await self.q(
            f"""SELECT estatus, abierto AS tiene_periodo_abierto, count(*) AS n FROM (
                  SELECT f.estatus::text AS estatus,
                         EXISTS (SELECT 1 FROM personal.periodos_servicio p
                                  WHERE p.funcionario_id = f.id AND p.fecha_egreso IS NULL)
                           AS abierto
                    FROM personal.funcionarios f
                   WHERE f.id IN ({migrados})
                     AND EXISTS (SELECT 1 FROM personal.periodos_servicio p
                                  WHERE p.funcionario_id = f.id)) x
                WHERE (abierto AND estatus IN ('EGRESADO', 'JUBILADO', 'FALLECIDO'))
                   OR (NOT abierto AND estatus IN ('ACTIVO', 'REPOSO', 'COMISION',
                                                   'SUSPENDIDO', 'PERMISO_LARGO'))
                GROUP BY 1, 2""")
        self.res["integridad"] = out

    # -- 3. solapamientos ------------------------------------------------------
    async def solapes(self) -> None:
        out: dict[str, Any] = {}
        out["periodos_solapados_en_destino"] = await self.v(
            """SELECT count(*) FROM personal.periodos_servicio a
                 JOIN personal.periodos_servicio b
                   ON a.funcionario_id = b.funcionario_id AND a.id < b.id
                  AND daterange(a.fecha_ingreso, COALESCE(a.fecha_egreso, 'infinity'), '[)')
                   && daterange(b.fecha_ingreso, COALESCE(b.fecha_egreso, 'infinity'), '[)')""")
        out["reposos_solapados_en_destino"] = await self.v(
            """SELECT count(*) FROM salud.reposos a JOIN salud.reposos b
                   ON a.funcionario_id = b.funcionario_id AND a.id < b.id
                  AND NOT a.anulado AND NOT b.anulado
                  AND daterange(a.fecha_inicio, a.fecha_fin, '[]')
                   && daterange(b.fecha_inicio, b.fecha_fin, '[]')""")
        out["vacaciones_solapadas_en_destino"] = await self.v(
            """SELECT count(*) FROM ops.vacaciones a JOIN ops.vacaciones b
                   ON a.funcionario_id = b.funcionario_id AND a.id < b.id
                  AND daterange(a.fecha_inicio, a.fecha_fin, '[]')
                   && daterange(b.fecha_inicio, b.fecha_fin, '[]')""")
        rech = await self.q(
            """SELECT tabla_origen, motivo, count(DISTINCT clave_origen) AS n
                 FROM migracion.descartes
                WHERE motivo LIKE 'rechazado por el motor%'
                GROUP BY 1, 2 ORDER BY 3 DESC""")
        out["rechazados_por_el_motor"] = rech
        out["rechazados_por_solapamiento"] = {
            r["tabla_origen"]: r["n"] for r in rech if "solapamiento" in r["motivo"]}
        self.res["solapamientos"] = out

    # -- 4. antigüedad -----------------------------------------------------------
    async def antiguedad(self) -> None:
        rows = await self.q(
            """SELECT f.cedula, f.id, f.fecha_primer_ingreso,
                      personal.fn_antiguedad_dias(f.id) AS dias,
                      (SELECT count(*) FROM personal.periodos_servicio p
                        WHERE p.funcionario_id = f.id) AS periodos
                 FROM personal.funcionarios f
                WHERE f.cedula = ANY($1::int[])""", sorted(self.alc.cedulas))
        clases: Counter = Counter()
        primer_ingreso_igual = 0
        ejemplos: list[dict] = []
        for r in rows:
            exp = self.exp.get(int(r["cedula"]))
            if exp is None:
                continue
            filas = [exp.base] + [f for f in exp.filas if f is not exp.base]
            primero, dias_o = antiguedad_registrada(filas, self.hoy)
            clase = clasificar_antiguedad(dias_o, r["dias"], r["periodos"])
            clases[clase] += 1
            if primero and r["fecha_primer_ingreso"] == primero:
                primer_ingreso_igual += 1
            if clase == "diferente (revisar)" and len(ejemplos) < 10:
                ejemplos.append({"cedula": r["cedula"], "dias_origen": dias_o,
                                 "dias_destino": r["dias"], "periodos": r["periodos"]})
        self.res["antiguedad"] = {
            "funcionarios_comparados": len(rows),
            "clasificacion": dict(clases),
            "fecha_primer_ingreso_coincide": primer_ingreso_igual,
            "ejemplos_a_revisar": ejemplos,
            "nota": "El origen no guarda antigüedad: se compara con FECHA_INGRESO → "
                    "FECHA_EGRESO/hoy. El destino suma los períodos de servicio.",
        }

    # -- 5. muestreo -------------------------------------------------------------
    async def _traza_ids(self, tabla_origen: str) -> dict[int | None, int]:
        rows = await self.q("SELECT clave_origen, id_destino FROM migracion.trazas "
                            "WHERE tabla_origen = $1", tabla_origen)
        return {parse_int(r["clave_origen"]): int(r["id_destino"]) for r in rows}

    async def muestreo(self) -> None:
        migrados = {int(r["cedula"]): r for r in await self.q(
            """SELECT id, cedula, zona_id, jerarquia_id FROM personal.funcionarios
                WHERE cedula = ANY($1::int[])""", sorted(self.alc.cedulas))}
        rnd = random.Random(self.semilla)
        cands = sorted(migrados)
        elegidas = rnd.sample(cands, min(self.n, len(cands)))
        jer = {parse_int(j.get("COD_JERARQUIA")): texto(j.get("JERARQUIA"))
               for j in self.leer("JERARQUIAS")}
        zon = {parse_int(z.get("COD_ZONA")): texto(z.get("ZONA")) for z in self.leer("ZONAS")}
        jer_id = await self._traza_ids("JERARQUIAS")
        zon_id = await self._traza_ids("ZONAS")
        descartadas: dict[str, set[str]] = defaultdict(set)
        for r in await self.q("SELECT tabla_origen, clave_origen FROM migracion.descartes"):
            descartadas[r["tabla_origen"]].add(r["clave_origen"])
        dep_origen: dict[str, dict[int | None, list[str]]] = {}
        for t, (col, _) in DEPENDIENTES_MUESTRA.items():
            grupos: dict[int | None, list[str]] = defaultdict(list)
            for f in self.leer(t):
                grupos[parse_cedula(f.get(col))].append(clave_origen(t, f))
            dep_origen[t] = grupos
        muestras = []
        for ced in elegidas:
            exp = self.exp[ced]
            b = exp.base
            fila = migrados[ced]
            d = (await self.q("SELECT * FROM personal.v_funcionarios_completo WHERE id = $1",
                              fila["id"]))[0]
            pers, _ = reconstruir_periodos_servicio(exp.filas)
            cod_jer = parse_int(b.get("COD_JERARQUIA"))
            cod_zon = zona_de(self.vig.get(ced), self.est_zona)
            campos: list[tuple[str, Any, Any, bool | None]] = [
                ("cédula", f"{texto(b.get('NACIONALIDAD')) or 'V'}-{ced}",
                 f"{d['nacionalidad']}-{d['cedula']}", None),
                ("apellidos", texto(b.get("APELLIDOS")), d["apellidos"], None),
                ("nombres", texto(b.get("NOMBRES")), d["nombres"], None),
                ("fecha de nacimiento", parse_date(b.get("FECHA_NACIMIENTO")),
                 d["fecha_nacimiento"], None),
                ("sexo", parse_sexo(b.get("SEXO")), d["sexo"], None),
                ("estatus", normalizar_estatus(b.get("ESTATUS")) or texto(b.get("ESTATUS")),
                 d["estatus"], None),
                # Catálogos: coinciden si el código del origen se resolvió al mismo id.
                ("jerarquía", jer.get(cod_jer), d["jerarquia"],
                 jer_id.get(cod_jer) == fila["jerarquia_id"]),
                ("zona vigente", zon.get(cod_zon), d["zona"],
                 zon_id.get(cod_zon) == fila["zona_id"]),
                ("primer ingreso", min((p["fecha_ingreso"] for p in pers), default=None),
                 d["fecha_primer_ingreso"], None),
                ("períodos de servicio", len(pers), d["total_periodos"], None),
                ("correo", texto(b.get("CORREO_ELECTRONICO")), d["correo"], None),
                ("teléfono móvil", texto(b.get("TELEFONO_MOBIL")), d["telefono_movil"], None),
                ("n.º de empleado", texto(b.get("N_EMPLEADO")), d["numero_empleado"], None),
            ]
            for t, (_, destino) in DEPENDIENTES_MUESTRA.items():
                n_dest = await self.v(f"SELECT count(*) FROM {destino} WHERE funcionario_id = $1",
                                      fila["id"])
                claves = dep_origen[t].get(ced, [])
                n_desc = sum(1 for k in claves if k in descartadas.get(t, set()))
                txt = f"{len(claves)}" + (f" (−{n_desc} descartadas)" if n_desc else "")
                campos.append((f"filas {t}", txt, n_dest, len(claves) - n_desc == n_dest))
            muestras.append({
                "cedula": ced,
                "antiguedad_destino": d["antiguedad"],
                "campos": [{"campo": c, "origen": a_json(o), "destino": a_json(de),
                            "coincide": comparar(o, de) if ok is None else ok}
                           for c, o, de, ok in campos],
            })
        self.res["muestreo"] = {"semilla": self.semilla, "expedientes": muestras}

    async def ejecutar(self) -> dict:
        await self.alcance()
        await self.conteos()
        await self.integridad()
        await self.solapes()
        await self.antiguedad()
        await self.muestreo()
        self.res["veredicto"] = veredicto(self.res)
        return self.res


def veredicto(res: dict) -> dict:
    problemas = []
    for t, c in res.get("conteos", {}).get("por_tabla_origen", {}).items():
        if c.get("faltantes"):
            problemas.append(f"{t}: {c['faltantes']} filas sin migrar ni descartar")
    integ = res.get("integridad", {})
    if integ.get("trazas_sin_fila_destino"):
        problemas.append("hay trazas que apuntan a filas inexistentes")
    if any(integ.get("hijos_sin_funcionario", {}).values()):
        problemas.append("hay registros hijos sin funcionario")
    if integ.get("funcionarios_con_varios_periodos_abiertos"):
        problemas.append("hay funcionarios con más de un período abierto")
    sol = res.get("solapamientos", {})
    for k in ("periodos_solapados_en_destino", "reposos_solapados_en_destino",
              "vacaciones_solapadas_en_destino"):
        if sol.get(k):
            problemas.append(f"{k}: {sol[k]}")
    return {"aprobado": not problemas, "problemas": problemas}


def imprimir(res: dict) -> None:
    zona = res.get("zona") or "todas"
    console.print(f"\n[bold green]== Validación post-carga ==[/]  zona: {zona}")
    a = res.get("alcance", {})
    console.print(f"Expedientes en alcance: {a.get('expedientes_en_alcance', 0):,}")
    t = Table(title="Cuadre origen ↔ destino")
    for c in ("Tabla origen", "Alcance", "Migradas", "Descart.", "Faltan", "¿Cuadra?"):
        t.add_column(c, justify="left" if c == "Tabla origen" else "right")
    for tabla, c in res["conteos"]["por_tabla_origen"].items():
        if c.get("ausente_en_origen"):
            t.add_row(tabla, "—", "—", "—", "—", "ausente")
            continue
        t.add_row(tabla, f"{c['en_alcance']:,}", f"{c['migradas']:,}", f"{c['descartadas']:,}",
                  f"{c['faltantes']:,}", "sí" if c["cuadra"] else "[red]NO[/]")
    console.print(t)
    integ = res["integridad"]
    console.print("\n[bold]Integridad[/]")
    console.print(f"  trazas sin fila destino: {integ['trazas_sin_fila_destino'] or 0}")
    console.print(f"  hijos sin funcionario: {sum(integ['hijos_sin_funcionario'].values())}")
    console.print(f"  funcionarios sin períodos: {integ['funcionarios_sin_periodos']}")
    console.print(f"  con varios períodos abiertos: "
                  f"{integ['funcionarios_con_varios_periodos_abiertos']}")
    for r in integ["estatus_incoherente_con_periodos"]:
        console.print(f"  estatus {r['estatus']} con período abierto={r['tiene_periodo_abierto']}:"
                      f" {r['n']}")
    s = res["solapamientos"]
    console.print("\n[bold]Solapamientos[/] (deben ser 0 en destino)")
    for k in ("periodos_solapados_en_destino", "reposos_solapados_en_destino",
              "vacaciones_solapadas_en_destino"):
        console.print(f"  {k}: {s[k]}")
    for r in s["rechazados_por_el_motor"]:
        console.print(f"  rechazadas por el motor — {r['tabla_origen']}: {r['n']} ({r['motivo']})")
    an = res["antiguedad"]
    console.print(f"\n[bold]Antigüedad[/] ({an['funcionarios_comparados']} funcionarios): "
                  f"{an['clasificacion']}; primer ingreso coincide en "
                  f"{an['fecha_primer_ingreso_coincide']}")
    for m in res["muestreo"]["expedientes"]:
        tt = Table(title=f"Expediente {m['cedula']} (antigüedad destino: "
                         f"{m['antiguedad_destino']})")
        for c in ("Campo", "Origen", "Destino", ""):
            tt.add_column(c)
        for c in m["campos"]:
            tt.add_row(c["campo"], str(c["origen"]), str(c["destino"]),
                       "✓" if c["coincide"] else "[red]≠[/]")
        console.print(tt)
    v = res["veredicto"]
    color = "green" if v["aprobado"] else "red"
    console.print(f"\n[bold {color}]Veredicto: {'APROBADO' if v['aprobado'] else 'CON PROBLEMAS'}"
                  "[/]")
    for p in v["problemas"]:
        console.print(f"  · {p}")


async def validar(config: Config, zona: str | None, muestras: int, semilla: int,
                  carpeta: Path, origen: Origen | None = None) -> tuple[dict, Path]:
    import asyncpg

    origen = origen or OrigenSqlServer(config.legacy_dsn)
    conn = await asyncpg.connect(config.target_dsn)
    tr = conn.transaction(readonly=True)
    await tr.start()
    try:
        res = await Validador(origen, conn, zona, muestras, semilla, date.today()).ejecutar()
    finally:
        await tr.rollback()
        await conn.close()
        origen.cerrar()
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / f"reporte_migracion_{datetime.now():%Y%m%d_%H%M%S}.json"
    ruta.write_text(json.dumps(res, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return res, ruta


def run(config: Config, zona: str | None, muestras: int, semilla: int, carpeta: Path,
        origen: Origen | None = None) -> dict:
    res, ruta = asyncio.run(validar(config, zona, muestras, semilla, carpeta, origen))
    imprimir(res)
    console.print(f"\nReporte JSON: [bold]{ruta}[/]")
    return res
