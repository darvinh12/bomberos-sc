"""Genera ``datos_legacy.sql``: INSERT T-SQL con datos FICTICIOS y coherentes.

Reproduce la forma de los datos de PERSONALINTEGRADA (SQL Server) para correr
``bomberos-migrate`` de punta a punta sin un solo dato personal real.

- Determinista: semilla fija (``SEMILLA``); dos corridas producen el mismo archivo.
- Cada fila se valida contra los metadatos REALES (``metadatos.py``): que la
  columna exista, longitud de cadenas, precisión numérica, NOT NULL, rangos de
  fecha de ``datetime``. Si algo no cuadra, el script aborta.
- Cédulas ficticias desde V-90.000.001; nombres combinados al azar de un
  diccionario propio (``catalogos.py``); fechas 1995–2026; fecha de corte
  04-05-2026 (día de la inspección del real); centinela ``1900-01-01`` donde el
  sistema anterior la usaba en vez de NULL.
- Anomalías sembradas A PROPÓSITO (para probar el motor), documentadas en
  ``ANOMALIAS`` y en TABLAS.md.

Uso:
    python generar_datos.py      # escribe datos_legacy.sql, conteos_esperados.json y TABLAS.md
"""
from __future__ import annotations

import json
import random
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import catalogos as C
from metadatos import DIR_DEMO, TABLAS, q, tabla

SEMILLA = 20260504
CORTE = date(2026, 5, 4)
CENTINELA = date(1900, 1, 1)
CEDULA_INICIAL = 90_000_001
CEDULAS_HUERFANAS = [89_999_901, 89_999_902, 89_999_903]  # reposos sin expediente
LOTE = 100  # filas por INSERT

SALIDA_SQL = DIR_DEMO / "datos_legacy.sql"
SALIDA_CONTEOS = DIR_DEMO / "conteos_esperados.json"
SALIDA_TABLAS_MD = DIR_DEMO / "TABLAS.md"
README = DIR_DEMO / "README.md"

# Anomalías intencionales: (tabla, cantidad, descripción). Se completan al generar.
ANOMALIAS: list[tuple[str, int, str]] = []


# =============================================================================
# Utilidades de fecha y azar
# =============================================================================
class Azar(random.Random):
    def fecha(self, desde: date, hasta: date) -> date:
        if hasta <= desde:
            return desde
        return desde + timedelta(days=self.randint(0, (hasta - desde).days))

    def fechas_ordenadas(self, n: int, desde: date, hasta: date, sep_min: int) -> list[date]:
        """n fechas crecientes en [desde, hasta] separadas al menos ``sep_min`` días."""
        if n <= 0:
            return []
        span = (hasta - desde).days
        if span < sep_min * (n - 1):
            sep_min = max(1, span // max(1, n))
        for _ in range(200):
            fs = sorted(self.fecha(desde, hasta) for _ in range(n))
            if all((b - a).days >= sep_min for a, b in zip(fs, fs[1:])):
                return fs
        # Respaldo: equiespaciadas
        paso = span // max(1, n)
        return [desde + timedelta(days=paso * i) for i in range(n)]


def anios(desde: date, hasta: date) -> float:
    return (hasta - desde).days / 365.25


def mas_anios(d: date, a: float) -> date:
    return d + timedelta(days=int(a * 365.25))


def dias_habiles(desde: date, n: int) -> date:
    """Fecha en la que se cumplen n días hábiles (lun-vie) contando ``desde``."""
    d = desde
    contados = 0
    while True:
        if d.weekday() < 5:
            contados += 1
            if contados == n:
                return d
        d += timedelta(days=1)


def siguiente_habil(d: date) -> date:
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def rif(nacionalidad: str, cedula: int) -> str:
    """RIF con dígito verificador calculado (algoritmo SENIAT)."""
    pref = {"V": 1, "E": 2, "J": 3, "P": 4, "G": 5}[nacionalidad]
    digitos = f"{cedula:08d}"
    pesos = [3, 2, 7, 6, 5, 4, 3, 2]
    suma = pref * 4 + sum(int(x) * w for x, w in zip(digitos, pesos))
    dv = 11 - suma % 11
    dv = 0 if dv >= 10 else dv
    return f"{nacionalidad}-{digitos}-{dv}"


MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
         "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]


# =============================================================================
# Contenedor de filas con validación contra el JSON real
# =============================================================================
class Datos:
    def __init__(self) -> None:
        self.filas: dict[str, list[dict]] = {t: [] for t, _, _ in TABLAS}

    def agregar(self, t: str, **valores) -> dict:
        if t not in self.filas:
            raise KeyError(f"Tabla {t!r} no está en la lista del demo")
        meta = tabla(t)
        for col in valores:
            meta.columna(col)  # KeyError si la columna no existe en el real
        self.filas[t].append(valores)
        return valores

    def validar(self) -> None:
        errores: list[str] = []
        for t, filas in self.filas.items():
            meta = tabla(t)
            obligatorias = [c for c in meta.columnas if not c.nula and not c.defecto]
            for i, fila in enumerate(filas):
                for c in obligatorias:
                    if fila.get(c.nombre) is None:
                        errores.append(f"{t}[{i}].{c.nombre}: NOT NULL sin valor")
                for col, v in fila.items():
                    e = _validar_valor(meta.columna(col), v)
                    if e:
                        errores.append(f"{t}[{i}].{col}={v!r}: {e}")
            if meta.pk:
                vistos = set()
                for fila in filas:
                    clave = tuple(fila.get(c) for c in meta.pk)
                    if clave in vistos:
                        errores.append(f"{t}: PK duplicada {clave}")
                    vistos.add(clave)
        if errores:
            print("\n".join(errores[:50]), file=sys.stderr)
            raise SystemExit(f"{len(errores)} errores de validación contra el JSON real")


def _validar_valor(col, v) -> str | None:
    if v is None:
        return None
    t = col.tipo.lower()
    if t in ("nvarchar", "varchar", "nchar", "char"):
        if not isinstance(v, str):
            return "se esperaba texto"
        if "\n" in v or "\r" in v:
            return "texto con salto de línea"
        if col.longitud != -1 and len(v) > col.longitud:
            return f"longitud {len(v)} > {col.longitud}"
    elif t in ("numeric", "decimal"):
        if not isinstance(v, int) or isinstance(v, bool):
            return "se esperaba entero (escala 0)"
        if len(str(abs(v))) > col.precision - col.escala:
            return f"excede {col.tipo_sql()}"
    elif t in ("int", "smallint"):
        if not isinstance(v, int) or isinstance(v, bool) or not -2**31 <= v < 2**31:
            return "entero fuera de rango"
    elif t in ("float", "real"):
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            return "se esperaba número"
    elif t == "bit":
        if v not in (0, 1, True, False):
            return "bit inválido"
    elif t == "datetime":
        if not isinstance(v, (date, datetime)):
            return "se esperaba fecha"
        if v.year < 1753:
            return "fuera de rango de datetime"
    else:
        return f"tipo {t} no admite valores en el demo"
    return None


def literal(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, datetime):
        return f"'{v:%Y-%m-%dT%H:%M:%S}'"
    if isinstance(v, date):
        return f"'{v:%Y-%m-%d}T00:00:00'"
    return "N'" + str(v).replace("'", "''") + "'"


# =============================================================================
# Modelo de expediente
# =============================================================================
@dataclass
class Expediente:
    cedula: int
    nacionalidad: str
    nombres: str
    apellidos: str
    sexo: str  # "M" / "F"
    nacimiento: date
    activo: bool
    tipo: str  # TROPA / OFICIAL / CIVIL
    zona: int
    estacion: int | None
    area: int
    division: int
    jer_objetivo: int | None
    cargo: str | None
    condicion: str = "FIJO"
    estatus: str = "ACTIVO"
    periodos: list[tuple[date, date | None]] = field(default_factory=list)
    motivos_egreso: list[str] = field(default_factory=list)
    hist_jer: list[dict] = field(default_factory=list)
    hist_ubi: list[dict] = field(default_factory=list)
    id_ubicacion: int | None = None
    correo: str | None = None
    movil: str | None = None
    hijos: int = 0

    @property
    def ingreso(self) -> date:
        return self.periodos[0][0]

    @property
    def fin(self) -> date:
        """Último día de servicio (fecha de corte si sigue activo)."""
        return self.periodos[-1][1] or CORTE

    @property
    def jerarquia(self) -> int:
        return self.hist_jer[-1]["COD_JERARQUIA"]

    @property
    def ubic(self) -> dict:
        return self.hist_ubi[-1]

    def en_servicio(self, d: date) -> bool:
        return any(a <= d <= (b or CORTE) for a, b in self.periodos)

    def nombre_completo(self) -> str:
        return f"{self.apellidos} {self.nombres}"


# =============================================================================
# Generador
# =============================================================================
class Generador:
    def __init__(self) -> None:
        self.r = Azar(SEMILLA)
        self.d = Datos()
        self.exps: list[Expediente] = []
        self.nombres_usados: set[str] = set()
        self.siguiente_cedula = CEDULA_INICIAL
        self.ids: dict[str, int] = {}

    def nuevo_id(self, serie: str) -> int:
        self.ids[serie] = self.ids.get(serie, 0) + 1
        return self.ids[serie]

    # ------------------------------------------------------------------ nombres
    def persona(self, sexo: str) -> tuple[str, str]:
        r = self.r
        pool = C.NOMBRES_M if sexo == "M" else C.NOMBRES_F
        while True:
            n1, n2 = r.sample(pool, 2)
            a1, a2 = r.sample(C.APELLIDOS, 2)
            nombres, apellidos = f"{n1} {n2}", f"{a1} {a2}"
            if apellidos + nombres not in self.nombres_usados:
                self.nombres_usados.add(apellidos + nombres)
                return nombres, apellidos

    def telefono(self, movil: bool = True) -> str:
        pref = self.r.choice(["0412", "0414", "0416", "0424", "0426"]) if movil else "0212"
        return f"{pref}-555{self.r.randint(0, 9999):04d}"

    # ------------------------------------------------------------------ catálogos
    def catalogos(self) -> None:
        d = self.d
        for cod, nom in C.ZONAS:
            d.agregar("ZONAS", COD_ZONA=cod, ZONA=nom)
        for cod, zona, sector in C.ESTACIONES:
            d.agregar(
                "ESTACIONES", COD_ESTACION=cod, COD_ZONA=zona,
                NOMBRE_CORTO=f"E-{cod:02d} {sector}",
                NOMBRE_LARGO=f"ESTACION N° {cod:02d} {sector}",
                CODIGO_RADIO=f"E-{cod:02d}",
                DIRECCION=f"AV. PRINCIPAL DE {sector}, CARACAS (DIRECCION FICTICIA)",
                TELEFONOS=f"0212-555{1000 + cod:04d}",
                FAX=None if cod % 3 else f"0212-555{2000 + cod:04d}",
            )
        for cod, nom in C.AREAS:
            d.agregar("AREAS", COD_AREA=cod, AREA=nom)
        for cod, nom, area in C.DIVISIONES:
            d.agregar("DIVISIONES", COD_DIVISION=cod, DIVISION=nom, COD_AREA=area)
        for cod, nom in C.DEPENDENCIAS:
            d.agregar("DEPENDENCIAS", COD_DEPENDENCIA=cod, DEPENDENCIA=nom)
        for cod, nom in C.AREA_DEPENDENCIA_OPERATIVA:
            d.agregar("AREA_DEPENDENCIA_OPERATIVA", COD_AREA_DEPENDENCIA=cod, AREA_DEPENDENCIA=nom)
        for cod, nom in C.JERARQUIAS:
            d.agregar("JERARQUIAS", COD_JERARQUIA=cod, JERARQUIA=nom)
        for cod, nom in C.CARGOS:
            d.agregar("CARGOS", COD_CARGO=cod, CARGO=nom)
        for cod, nom in C.CONDICIONES:
            d.agregar("CONDICIONES", COD_CONDICION=cod, DESCRIPCION=nom)
        for cod, nom in C.ESTATUS:
            d.agregar("ESTATUS", COD_ESTATUS=cod, DESCRIPCION=nom)
        for cod, nom in C.BANCOS:
            d.agregar("BANCOS", COD_BANCO=cod, NOMBRE=nom)
        for cod, nom in C.TIPO_NIVEL_EDUCATIVO:
            # msrepl_tran_version se omite: lo llena su DEFAULT (newid()).
            d.agregar("TIPO_NIVEL_EDUCATIVO", COD_NIVEL=cod, TIPO_NIVEL=nom, ID_NIVEL=cod)
        for cod, nom in C.GRUPOS_DIAGNOSTICOS:
            d.agregar("GRUPOSDIAGNOSTICOS", CodGrupoDiagnostico=cod, GrupoDiagnostico=nom)
        for cod, nom, grupo in C.DIAGNOSTICOS:
            d.agregar("DIAGNOSTICOS", CODDIAGNOSTICO=cod, DIAGNOSTICO=nom,
                      CodGrupoDiagnostico=float(grupo))
        for cod, nom in C.ESPECIALIDADES:
            d.agregar("ESPECIALIDADES", ID_ESPE=cod, ESPECIALIDAD=nom)
        for i in range(1, 13):
            sexo = "M" if i % 2 else "F"
            nombres, apellidos = self.persona(sexo)
            d.agregar(
                "MEDICO_TRATANTE", ID_MEDICO=i, CEDULA_MEDICO=91_000_000 + i,
                TIPO_MEDICO="INSTITUCIONAL" if i <= 4 else "EXTERNO",
                NOMBRES=nombres, APELLIDOS=apellidos, MSAS=f"MS-{70000 + i * 37}",
                ID_ESPE=str(1 + (i - 1) % len(C.ESPECIALIDADES)),
            )
        for cod, nom, tipo, ivss in C.CENTROS_MEDICOS:
            d.agregar("CENTROS_MEDICOS", COD_INSTITUCION=cod, INSTITUCION=nom,
                      TIPO_CENTRO=tipo, COD_IVSS=ivss or None)
        for cod, nom in C.FALTAS:
            d.agregar("FALTAS", COD_FALTAS=cod, FALTAS=nom)
        for cod, desc, jer, asc, val in C.CURSOS:
            d.agregar("CURSOS", COD_CURSO=cod, DESCRIPCION=desc, COD_JERARQUIA=jer,
                      ASCENSO=asc, CURSOS_VALOR=val)
        for cod, nom in C.MARCAS_RADIO:
            d.agregar("MARCA_TALLER_RADIO", COD_MARCA=cod, MARCA=nom)
        for cod, nom in C.MODELOS_RADIO:
            d.agregar("MODELO_TALLER_RADIO", COD_MODELO=cod, MODELO=nom)
        for cod, nom in C.EQUIPOS_TALLER_RADIO:
            d.agregar("EQUIPOS_TALLER_RADIO", COD_EQUIPO=cod, EQUIPO=nom)
        self.equipos_proteccion: list[tuple[int, str, str]] = []
        for nombre, tallas in C.EQUIPOS_PROTECCION:
            for talla in tallas:
                i = self.nuevo_id("EP")
                self.equipos_proteccion.append((i, nombre, talla))
                d.agregar("EQUIPOS_PROTECCION", ID=i, EQUIPO_PROTECCION=nombre, TALLA=talla,
                          EXISTENCIA_ACTUAL=self.r.randint(0, 40),
                          EXISTENCIA_MINIMA=self.r.choice([5, 10]))
        self.uniformes: list[tuple[int, str, str]] = []
        for nombre, tallas in C.UNIFORMES:
            for talla in tallas:
                i = self.nuevo_id("UN")
                self.uniformes.append((i, nombre, talla))
                d.agregar("UNIFORMES", ID=i, UNIFORME=nombre, TALLA=talla,
                          EXISTENCIA_ACTUAL=self.r.randint(0, 80),
                          EXISTENCIA_MINIMA=self.r.choice([10, 20]))

    # ------------------------------------------------------------------ plazas
    def plazas_activos(self) -> list[dict]:
        """150 plazas: 90 con ubicación vigente en Zona 1 y 60 en otras zonas."""
        r = self.r
        p: list[dict] = []

        def oper(zona, est, tipo, jer=None, cargo=None):
            p.append(dict(zona=zona, estacion=est, area=1, division=zona, tipo=tipo,
                          jer=jer, cargo=cargo))

        # Zona 1: 6 estaciones x 14 + 6 en la jefatura de zona (sin estación)
        for est in range(1, 7):
            jefe = r.choice([11, 12])
            oper(1, est, "OFICIAL", jefe, "JEFE DE ESTACION")
            oper(1, est, "OFICIAL", jefe - 1, "SUB-JEFE DE ESTACION")
            for _ in range(12):
                oper(1, est, "TROPA")
        oper(1, None, "OFICIAL", r.choice([13, 14]), "JEFE DE ZONA")
        oper(1, None, "TROPA", None, "OPERADOR DE RADIO")
        for cargo, jer, cond in [
            ("ASISTENTE ADMINISTRATIVO", 21, "EMPLEADO FIJO"),
            ("SECRETARIA", 21, "EMPLEADO CONTRATADO"),
            ("ASEADOR(A)", 22, "OBRERO FIJO"),
            ("VIGILANTE", 27, "OBRERO CONTRATADO"),
        ]:
            p.append(dict(zona=1, estacion=None, area=1, division=1, tipo="CIVIL",
                          jer=jer, cargo=cargo, condicion=cond))
        # Zonas 2..6 (40 plazas operativas, una civil por zona)
        reparto = {2: [2, 2, 2, 2, 2], 3: [2, 2, 2, 2, 1], 4: [2, 2, 2, 2],
                   5: [2, 2, 2, 2], 6: [3, 2]}
        for zona, cuentas in reparto.items():
            estaciones = [c for c, z, _ in C.ESTACIONES if z == zona]
            for k, (est, n) in enumerate(zip(estaciones, cuentas)):
                oper(zona, est, "OFICIAL", r.choice([10, 11]), "JEFE DE ESTACION")
                for j in range(n - 1):
                    if k == 0 and j == n - 2:
                        cargo = r.choice(["OBRERO DE MANTENIMIENTO", "COCINERO"])
                        p.append(dict(zona=zona, estacion=est, area=1, division=zona,
                                      tipo="CIVIL", jer=22, cargo=cargo,
                                      condicion="OBRERO FIJO"))
                    else:
                        oper(zona, est, "TROPA")
        # Zona 7 — Comandancia General
        p.append(dict(zona=7, estacion=None, area=2, division=10, tipo="OFICIAL", jer=15,
                      cargo="COMANDANTE GENERAL"))
        p.append(dict(zona=7, estacion=None, area=2, division=11, tipo="OFICIAL", jer=14,
                      cargo="SEGUNDO COMANDANTE"))
        p.append(dict(zona=7, estacion=27, area=2, division=11, tipo="OFICIAL", jer=13,
                      cargo="JEFE DE AREA"))
        for area, div, cargo, jer, cond in [
            (2, 12, "SECRETARIA", 21, "EMPLEADO FIJO"),
            (11, 33, "ABOGADO", 21, "EMPLEADO FIJO"),
            (3, 13, "ASESOR", 26, "EMPLEADO FIJO"),
            (2, 10, "CHOFER", 22, "OBRERO FIJO"),
        ]:
            p.append(dict(zona=7, estacion=None, area=area, division=div, tipo="CIVIL",
                          jer=jer, cargo=cargo, condicion=cond))
        # Zona 8 — Sede administrativa (8 civiles)
        for area, div, cargo, jer, cond in [
            (3, 13, "ANALISTA DE PERSONAL", 21, "EMPLEADO FIJO"),
            (3, 14, "ASISTENTE ADMINISTRATIVO", 21, "EMPLEADO FIJO"),
            (4, 17, "CONTADOR", 21, "EMPLEADO FIJO"),
            (5, 19, "MEDICO", 25, "EMPLEADO FIJO"),
            (5, 20, "MEDICO", 25, "EMPLEADO CONTRATADO"),
            (13, 36, "PROGRAMADOR", 23, "EMPLEADO CONTRATADO"),
            (15, 38, "OBRERO DE MANTENIMIENTO", 22, "OBRERO FIJO"),
            (16, 40, "MECANICO", 22, "OBRERO CONTRATADO"),
        ]:
            p.append(dict(zona=8, estacion=None, area=area, division=div, tipo="CIVIL",
                          jer=jer, cargo=cargo, condicion=cond))
        # Zona 9 — Academia
        p.append(dict(zona=9, estacion=None, area=9, division=31, tipo="OFICIAL", jer=11,
                      cargo="INSTRUCTOR"))
        p.append(dict(zona=9, estacion=None, area=9, division=29, tipo="TROPA", jer=6,
                      cargo="INSTRUCTOR"))
        p.append(dict(zona=9, estacion=None, area=9, division=31, tipo="CIVIL", jer=24,
                      cargo="ASISTENTE ADMINISTRATIVO", condicion="PASANTE"))
        # Zona 10 — Grupos especiales
        p.append(dict(zona=10, estacion=28, area=17, division=8, tipo="TROPA", jer=None,
                      cargo="BUZO"))
        p.append(dict(zona=10, estacion=29, area=17, division=9, tipo="TROPA", jer=None,
                      cargo="GUIA CANINO"))
        assert len(p) == 150, len(p)
        assert sum(1 for x in p if x["zona"] == 1) == 90
        return p

    def plazas_egresados(self) -> list[dict]:
        """40 plazas de egresados: 25 con última ubicación en Zona 1."""
        r = self.r
        p: list[dict] = []
        for i in range(23):
            p.append(dict(zona=1, estacion=r.randint(1, 6), area=1, division=1,
                          tipo="OFICIAL" if i < 3 else "TROPA", jer=None, cargo=None))
        p.append(dict(zona=1, estacion=None, area=1, division=1, tipo="TROPA", jer=None,
                      cargo="OPERADOR DE RADIO"))
        p.append(dict(zona=1, estacion=None, area=1, division=1, tipo="CIVIL", jer=21,
                      cargo="ASISTENTE ADMINISTRATIVO", condicion="EMPLEADO FIJO"))
        for _ in range(10):
            est = r.randint(7, 26)
            z = C.ZONA_DE_ESTACION[est]
            p.append(dict(zona=z, estacion=est, area=1, division=z, tipo="TROPA", jer=None,
                          cargo=None))
        p.append(dict(zona=8, estacion=None, area=3, division=15, tipo="CIVIL", jer=21,
                      cargo="ANALISTA DE PERSONAL", condicion="EMPLEADO FIJO"))
        p.append(dict(zona=8, estacion=None, area=6, division=24, tipo="CIVIL", jer=23,
                      cargo="ALMACENISTA", condicion="EMPLEADO CONTRATADO"))
        p.append(dict(zona=7, estacion=None, area=2, division=12, tipo="CIVIL", jer=21,
                      cargo="SECRETARIA", condicion="EMPLEADO FIJO"))
        p.append(dict(zona=9, estacion=None, area=9, division=29, tipo="TROPA", jer=None,
                      cargo="INSTRUCTOR"))
        p.append(dict(zona=7, estacion=None, area=2, division=11, tipo="OFICIAL", jer=13,
                      cargo="JEFE DE AREA"))
        assert len(p) == 40 and sum(1 for x in p if x["zona"] == 1) == 25
        return p

    # ------------------------------------------------------------------ carrera
    def jer_por_antiguedad(self, tipo: str, a: float) -> int:
        r = self.r
        if tipo == "TROPA":
            tabla_ = [(6, [1, 2]), (10, [2, 3, 4]), (15, [4, 5, 6]), (20, [5, 6, 7]),
                      (99, [6, 7, 8])]
        else:
            tabla_ = [(5, [9, 10]), (10, [10, 11]), (18, [11, 12]), (25, [12, 13]),
                      (99, [13, 14])]
        for limite, opciones in tabla_:
            if a < limite:
                return r.choice(opciones)
        raise AssertionError

    def anios_para(self, tipo: str, jer: int) -> float:
        """Antigüedad plausible para haber llegado a una jerarquía."""
        r = self.r
        if tipo == "OFICIAL":
            return (jer - 9) * 3.5 + r.uniform(1.5, 4)
        return (jer - 1) * 2.8 + r.uniform(0.5, 3)

    CARGOS_TROPA = ["BOMBERO OPERATIVO"] * 4 + ["RESCATISTA", "PARAMEDICO",
                                                 "CONDUCTOR DE UNIDADES",
                                                 "TECNICO EN MATERIALES PELIGROSOS"]
    CARGOS_CIVILES = ["ASISTENTE ADMINISTRATIVO", "SECRETARIA", "ANALISTA DE PERSONAL",
                      "ALMACENISTA", "OBRERO DE MANTENIMIENTO", "CHOFER"]

    def cargo_generico(self, tipo: str, jer: int) -> str:
        r = self.r
        if tipo == "CIVIL":
            return r.choice(self.CARGOS_CIVILES)
        if tipo == "OFICIAL":
            return r.choice(["JEFE DE GUARDIA", "JEFE DE GUARDIA", "INSTRUCTOR",
                             "JEFE DE DEPENDENCIA"])
        if jer >= 5 and r.random() < 0.35:
            return "JEFE DE GUARDIA"
        return r.choice(self.CARGOS_TROPA)

    def construir_hist_jer(self, e: Expediente) -> None:
        r = self.r
        n = r.randint(3, 6)
        final = e.jer_objetivo
        if e.tipo == "CIVIL":
            rangos = [final] * n
            base = final
        else:
            base = 1 if e.tipo == "TROPA" else 9
            distintos = min(n, final - base + 1)
            inicio = final - distintos + 1
            rangos = list(range(inicio, final + 1))
            while len(rangos) < n:  # rellenos: cambio de cargo sin ascenso
                k = r.randrange(len(rangos))
                rangos.insert(k, rangos[k])
        carga_inicial = e.tipo != "CIVIL" and rangos[0] > base
        d0 = e.ingreso
        if carga_inicial and e.ingreso < date(2003, 3, 1):
            d0 = date(2003, 3, 1)
        fin = e.fin - timedelta(days=30)
        fechas = [d0] + r.fechas_ordenadas(n - 1, d0 + timedelta(days=180), fin, 180)
        # Ninguna fecha puede caer en un hueco entre egreso y reintegro.
        fechas = [self._mover_a_servicio(e, f) for f in fechas]
        fechas = sorted(fechas)
        for i in range(1, len(fechas)):
            if fechas[i] <= fechas[i - 1]:
                fechas[i] = fechas[i - 1] + timedelta(days=30)
        cargos = [self.cargo_generico(e.tipo, j) for j in rangos]
        cargos[-1] = e.cargo
        for i, (f, j, cg) in enumerate(zip(fechas, rangos, cargos)):
            if i > 0 and cg == cargos[i - 1] and j == rangos[i - 1]:
                cg = self.cargo_generico(e.tipo, j) if i < n - 1 else cg
                cargos[i] = cg
            asciende = i > 0 and j > rangos[i - 1]
            if i == 0 and carga_inicial:
                tipo_doc, nro = "CARGA INICIAL", None
            elif i == 0:
                tipo_doc, nro = "INGRESO", f"RES-{f.year}-{r.randint(1, 400):03d}"
            elif asciende:
                tipo_doc, nro = "ORDEN GENERAL", f"OG-{f.year}-{r.randint(1, 120):03d}"
            else:
                tipo_doc, nro = "RESOLUCION", f"RES-{f.year}-{r.randint(1, 400):03d}"
            ultimo_asc = f
            nivelacion = 0
            if asciende:
                previos = [h for h in e.hist_jer if h["COD_JERARQUIA"] < j]
                if previos and (f - previos[-1]["FECHA"]).days < 730:
                    nivelacion = 1
            elif e.hist_jer:
                ultimo_asc = e.hist_jer[-1]["Fecha Ultimo Ascenso"]
            e.hist_jer.append({
                "FECHA": f, "COD_JERARQUIA": j, "COD_CARGO": C.COD_CARGO[cg],
                "TIPO_DOCUMENTO": tipo_doc, "NUMERO_DOCUMENTO": nro,
                "REFERENCIA": ("ASCENSO A " + C.NOMBRE_JERARQUIA[j]) if asciende else
                              ("REGISTRO INICIAL DEL SISTEMA" if tipo_doc == "CARGA INICIAL"
                               else f"DESIGNACION COMO {cg}"),
                "Jerarquia": C.NOMBRE_JERARQUIA[j], "Fecha Ultimo Ascenso": ultimo_asc,
                "Nivelacion": nivelacion, "asciende": asciende,
            })

    def _mover_a_servicio(self, e: Expediente, f: date) -> date:
        if e.en_servicio(f):
            return f
        for a, b in e.periodos:
            if f < a:
                return a + timedelta(days=self.r.randint(15, 90))
        return e.fin - timedelta(days=30)

    def lugar_aleatorio(self, e: Expediente) -> dict:
        """Ubicación anterior plausible para el tipo de expediente."""
        r = self.r
        if e.tipo == "CIVIL" or e.area != 1:
            area, div = r.choice([(3, 13), (3, 14), (4, 16), (6, 22), (12, 34), (15, 39),
                                  (2, 12), (9, 29)])
            zona = {2: 7, 9: 9}.get(area, 8)
            return dict(zona=zona, estacion=None, area=area, division=div)
        est = r.randint(1, 26)
        z = C.ZONA_DE_ESTACION[est]
        return dict(zona=z, estacion=est, area=1, division=z)

    def construir_hist_ubi(self, e: Expediente, seccion: str | None, horario: str) -> None:
        r = self.r
        m = r.randint(2, 5)
        fin = e.fin - timedelta(days=60)
        fechas = [e.ingreso] + r.fechas_ordenadas(m - 1, e.ingreso + timedelta(days=90),
                                                  fin, 120)
        if len(e.periodos) > 1:  # reingreso: una ubicación nueva al reintegrarse
            fechas[-1 if m == 2 else 1] = e.periodos[1][0]
        fechas = sorted(self._mover_a_servicio(e, f) for f in fechas)
        for i in range(1, len(fechas)):
            if fechas[i] <= fechas[i - 1]:
                fechas[i] = fechas[i - 1] + timedelta(days=15)
        actual = dict(zona=e.zona, estacion=e.estacion, area=e.area, division=e.division)
        lugares = [self.lugar_aleatorio(e) for _ in range(m - 1)] + [actual]
        for f, lugar in zip(fechas, lugares):
            sec = seccion if lugar["estacion"] else None
            if lugar["estacion"] and not sec:
                sec = r.choice("ABCD")
            e.hist_ubi.append({
                "FECHA_DESDE": f, "COD_ZONA": lugar["zona"], "COD_ESTACION": lugar["estacion"],
                "COD_AREA": lugar["area"], "COD_DIVISION": lugar["division"],
                "AGRUPACION": "OPERATIVA" if lugar["area"] in (1, 17) else "ADMINISTRATIVA",
                "SECCION": sec,
                "HORARIO": "24X72" if lugar["estacion"] else "ADMINISTRATIVO 8AM-4PM",
            })

    # ------------------------------------------------------------------ expedientes
    def crear_expediente(self, plaza: dict, activo: bool, motivo: str | None = None,
                         ciclos: int = 1) -> Expediente:
        r = self.r
        sexo = "F" if r.random() < (0.45 if plaza["tipo"] == "CIVIL" else 0.18) else "M"
        nombres, apellidos = self.persona(sexo)
        cedula = self.siguiente_cedula
        self.siguiente_cedula += 1
        nac = "E" if r.random() < 0.03 else "V"
        tipo = plaza["tipo"]
        e = Expediente(
            cedula=cedula, nacionalidad=nac, nombres=nombres, apellidos=apellidos, sexo=sexo,
            nacimiento=CENTINELA, activo=activo, tipo=tipo, zona=plaza["zona"],
            estacion=plaza["estacion"], area=plaza["area"], division=plaza["division"],
            jer_objetivo=plaza["jer"], cargo=plaza["cargo"],
            condicion=plaza.get("condicion", "FIJO"),
        )
        # --- Períodos de servicio
        tope = date(2026, 3, 31)
        if activo:
            if plaza["jer"] and tipo != "CIVIL":
                ingreso = mas_anios(CORTE, -self.anios_para(tipo, plaza["jer"]))
            else:
                ingreso = r.fecha(date(1995, 1, 1), date(2021, 12, 31))
            ingreso = min(max(ingreso, date(1995, 1, 9)), date(2021, 12, 31))
            if ciclos == 2:
                ingreso = r.fecha(date(1995, 1, 9), date(2012, 12, 31))
                e1 = mas_anios(ingreso, r.uniform(2, 6))
                r1 = min(mas_anios(e1, r.uniform(0.5, 4)), date(2022, 12, 31))
                e.periodos = [(ingreso, e1), (r1, None)]
                e.motivos_egreso = [r.choice(["RENUNCIA", "RENUNCIA", "DESTITUCION",
                                              "NO RATIFICADO"])]
            else:
                e.periodos = [(ingreso, None)]
        else:
            if motivo == "JUBILACION":
                ingreso = r.fecha(date(1995, 1, 9), date(1999, 12, 31))
                egreso = min(mas_anios(ingreso, r.uniform(25, 27)), tope)
            else:
                ingreso = r.fecha(date(1995, 1, 9), date(2016, 12, 31))
                egreso = r.fecha(mas_anios(ingreso, 3), tope)
            if ciclos == 2:
                e1 = mas_anios(ingreso, r.uniform(2, 5))
                r1 = mas_anios(e1, r.uniform(1, 3))
                e2 = max(egreso, mas_anios(r1, r.uniform(2, 4)))
                e2 = min(e2, tope)
                e.periodos = [(ingreso, e1), (r1, e2)]
                e.motivos_egreso = ["RENUNCIA", motivo]
            else:
                e.periodos = [(ingreso, egreso)]
                e.motivos_egreso = [motivo]
        e.nacimiento = mas_anios(e.ingreso, -r.uniform(18.5, 29))
        # --- Jerarquía objetivo y cargo
        if tipo != "CIVIL" and not e.jer_objetivo:
            e.jer_objetivo = self.jer_por_antiguedad(tipo, anios(e.ingreso, e.fin))
        if not e.cargo:
            e.cargo = self.cargo_generico(tipo, e.jer_objetivo)
        if tipo != "CIVIL":
            e.condicion = r.choices(["FIJO", "FUNCIONARIO", "CONTRATADO"], [85, 10, 5])[0]
        self.construir_hist_jer(e)
        seccion = r.choice("ABCD") if e.estacion else None
        self.construir_hist_ubi(e, seccion, "")
        e.correo = (f"{nombres.split()[0].lower()}.{apellidos.split()[0].lower()}"
                    f"{cedula % 10000:04d}@example.com").replace("ñ", "n")
        e.movil = self.telefono()
        self.exps.append(e)
        return e

    def expedientes(self) -> None:
        r = self.r
        # --- Activos: 12 reingresos (8 en Zona 1)
        plazas = self.plazas_activos()
        z1 = [i for i, p in enumerate(plazas) if p["zona"] == 1 and p["tipo"] == "TROPA"]
        otras = [i for i, p in enumerate(plazas) if p["zona"] in (2, 3, 4, 5, 6)
                 and p["tipo"] == "TROPA"]
        reingresos = set(r.sample(z1, 8) + r.sample(otras, 4))
        for i, plaza in enumerate(plazas):
            self.crear_expediente(plaza, True, ciclos=2 if i in reingresos else 1)
        # --- Egresados: 10 jubilados, 4 fallecidos, 26 por otros motivos
        motivos = (["JUBILACION"] * 10 + ["FALLECIMIENTO"] * 4 + ["RENUNCIA"] * 18
                   + ["DESTITUCION"] * 4 + ["ABANDONO DEL CARGO"] * 4)
        plazas_e = self.plazas_egresados()
        civiles = [i for i, p in enumerate(plazas_e) if p["tipo"] == "CIVIL"]
        uniformados = [i for i, p in enumerate(plazas_e) if p["tipo"] != "CIVIL"]
        r.shuffle(uniformados)
        asignacion: dict[int, str] = {}
        # Jubilados y fallecidos solo entre uniformados; dos contratados «no ratificados».
        for i, m in zip(uniformados, motivos[:14]):
            asignacion[i] = m
        resto = [i for i in range(40) if i not in asignacion]
        resto_motivos = motivos[14:]
        r.shuffle(resto_motivos)
        for i, m in zip(resto, resto_motivos):
            asignacion[i] = m
        for i in civiles:
            if plazas_e[i]["condicion"] == "EMPLEADO CONTRATADO":
                asignacion[i] = "NO RATIFICADO"
        dobles = set(r.sample([i for i in resto if asignacion[i] == "RENUNCIA"], 3))
        for i, plaza in enumerate(plazas_e):
            e = self.crear_expediente(plaza, False, asignacion[i], ciclos=2 if i in dobles else 1)
            m = asignacion[i]
            e.estatus = "JUBILADO" if m == "JUBILACION" else "EGRESADO"
            if m == "JUBILACION":
                e.condicion = "JUBILADO"

        activos = [e for e in self.exps if e.activo]
        # --- Estatus de los activos (texto libre, con variantes reales de escritura)
        candidatos = [e for e in activos if e.cargo not in ("COMANDANTE GENERAL",)]
        r.shuffle(candidatos)
        plan = (["REPOSO"] * 8 + ["COMISION"] * 5 + ["VACACIONES"] * 6 + ["PERMISO"] * 2
                + ["SUSPENDIDO"] * 2 + ["Activo", "ACTIVO ", "activo"])
        for e, est in zip(candidatos, plan):
            e.estatus = est
        for e in activos:
            if anios(e.ingreso, CORTE) >= 25 and e.tipo != "CIVIL":
                if r.random() < 0.5:
                    e.condicion = "PRE-JUBILADO"

        # --- Cargos de estación: el oficial de mayor rango es el jefe
        for e in activos:
            e.hist_jer[-1]["COD_CARGO"] = C.COD_CARGO[e.cargo]

    # ------------------------------------------------------------------ tablas de personal
    def tablas_personal(self) -> None:
        d, rr = self.d, self.r
        id_ubi = 0
        activos = [e for e in self.exps if e.activo]
        # Anomalía: dos expedientes con el mismo correo (el destino tiene UNIQUE).
        activos[20].correo = activos[21].correo
        ANOMALIAS.append(("FUNCIONARIOS", 2,
                          "Dos expedientes comparten CORREO_ELECTRONICO (destino: correo UNIQUE)"))
        for k in (30, 31, 32):
            activos[k].correo = "NO POSEE"
        ANOMALIAS.append(("FUNCIONARIOS", 3, "CORREO_ELECTRONICO = 'NO POSEE' (no es correo)"))
        for k in range(40, 50):
            activos[k].correo = None

        for idx, e in enumerate(self.exps):
            id_ubi += 1
            e.id_ubicacion = id_ubi
            u = e.ubic
            jefe = self.jefe_de(e)
            d.agregar(
                "UBICACION_ADMINISTRATIVA", ID=id_ubi, CEDULA=e.cedula, COD_ZONA=u["COD_ZONA"],
                COD_AREA=u["COD_AREA"], COD_ESTACION=u["COD_ESTACION"],
                COD_DIVISION=u["COD_DIVISION"], AGRUPACION=u["AGRUPACION"],
                DEPENDENCIA=self.dependencia_de(e), HORARIO=u["HORARIO"], SECCION=u["SECCION"],
                TELEFONO_OFICINA=None if u["COD_ESTACION"] else f"0212-555{3000 + e.area:04d}",
                EXTENSION=None if u["COD_ESTACION"] else str(100 + e.division),
                JEFE_INMEDIATO=jefe, FECHA_DESDE=u["FECHA_DESDE"],
            )
            fila = self.fila_funcionario(e)
            if e.activo:
                d.agregar("FUNCIONARIOS", **fila)
            else:
                fila.pop("FECHA_INGRESOGDF")
                fila.pop("PRE_JUBILADOS")
                egreso = e.periodos[-1][1]
                d.agregar("FUNCIONARIOS_EGRESADOS", **fila,
                          FECHA_TRANSACCION=datetime.combine(
                              egreso + timedelta(days=rr.randint(1, 20)),
                              datetime.min.time()).replace(hour=rr.randint(8, 16),
                                                           minute=rr.randint(0, 59)),
                          USUARIO=f"usuario_demo{rr.randint(1, 5):02d}",
                          TRANSACCION="EGRESO", ESTATUS_ANTERIOR="ACTIVO")

        # Historicos de jerarquía y ubicación, ascensos
        for e in self.exps:
            for h in e.hist_jer:
                hid = self.nuevo_id("HJ")
                h["ID"] = hid
                d.agregar("HISTORICO_JERARQUIA", ID=hid, CEDULA=e.cedula,
                          **{k: v for k, v in h.items() if k not in ("asciende", "ID")})
                if h["asciende"]:
                    d.agregar("ASCENSOS", CEDULA=e.cedula, COD_JERARQUIA=h["COD_JERARQUIA"],
                              JERARQUIA=h["Jerarquia"], FECHA_ASCENSO=h["FECHA"],
                              ORDEN_GENERAL=f"O.G. N° {h['NUMERO_DOCUMENTO']}")
            for h in e.hist_ubi:
                d.agregar("HISTORICO_UBICACION_ADMINISTRATIVA",
                          ID_UBIADM=self.nuevo_id("HU"), CEDULA=e.cedula, **h)
        # Anomalía: dos filas históricas (no vigentes) con zona que no corresponde a la estación.
        sembradas = 0
        for fila in d.filas["HISTORICO_UBICACION_ADMINISTRATIVA"]:
            if sembradas == 2:
                break
            est = fila["COD_ESTACION"]
            exp = self.por_cedula(fila["CEDULA"])
            if est and fila["FECHA_DESDE"] != exp.ubic["FECHA_DESDE"]:
                fila["COD_ZONA"] = 1 if C.ZONA_DE_ESTACION[est] != 1 else 2
                sembradas += 1
        ANOMALIAS.append(("HISTORICO_UBICACION_ADMINISTRATIVA", 2,
                          "Fila histórica (no vigente) con COD_ZONA distinta a la zona de su estación"))

        # Detalle de egreso: un registro por cada egreso (salvo 2 reingresos sin detalle)
        sin_detalle = [e for e in self.exps if e.activo and len(e.periodos) > 1][:2]
        ANOMALIAS.append(("DETALLE_EGRESO", 2,
                          "Reingresos (FECHA_EGRESO+FECHA_REINTEGRO en FUNCIONARIOS) sin fila en DETALLE_EGRESO"))
        for e in self.exps:
            if e in sin_detalle:
                continue
            for (a, b), motivo in zip(e.periodos, e.motivos_egreso):
                if b is None:
                    continue
                nomina = b + timedelta(days=rr.randint(0, 45))
                d.agregar("DETALLE_EGRESO", ID_EGRESO=self.nuevo_id("DE"), CEDULA=e.cedula,
                          FECHA_EGRESO_NOTIF=b,
                          FECHA_EGRESO_NOMI=rr.choice([nomina, nomina, nomina, CENTINELA, None]),
                          BASAMENTO_LEGAL=BASAMENTOS[motivo],
                          OBSERVACIONES=rr.choice([None, "EXPEDIENTE ARCHIVADO",
                                                   f"MEMO N° M-{rr.randint(10, 999)}/{b.year % 100:02d}"]))

    def jefe_de(self, e: Expediente) -> str | None:
        if e.estacion:
            for o in self.exps:
                if o.activo and o.estacion == e.estacion and o.cargo == "JEFE DE ESTACION" and o is not e:
                    return f"{C.ABREVIATURA[o.jerarquia]} {o.nombre_completo()}"[:80]
        for o in self.exps:
            if o.activo and o.zona == e.zona and o.cargo in ("JEFE DE ZONA", "COMANDANTE GENERAL") and o is not e:
                return f"{C.ABREVIATURA[o.jerarquia]} {o.nombre_completo()}"[:80]
        return None

    def dependencia_de(self, e: Expediente) -> str:
        nombres = dict(C.DEPENDENCIAS)
        if e.estacion:
            return {"PARAMEDICO": nombres[28], "RESCATISTA": nombres[26],
                    "TECNICO EN MATERIALES PELIGROSOS": nombres[29]}.get(e.cargo, nombres[27])
        if e.zona <= 6:
            return nombres[3 + e.zona]
        return C.NOMBRE_DIVISION[e.division]

    def por_cedula(self, cedula: int) -> Expediente:
        if not hasattr(self, "_idx"):
            self._idx = {e.cedula: e for e in self.exps}
        return self._idx[cedula]

    def fila_funcionario(self, e: Expediente) -> dict:
        r = self.r
        grupo = r.choices(["O", "A", "B", "AB"], [45, 35, 15, 5])[0]
        factor = r.choices(["POSITIVO", "NEGATIVO"], [90, 10])[0]
        nivel = (r.choices([2, 3, 4, 5, 6], [40, 25, 25, 7, 3])[0] if e.tipo != "CIVIL"
                 else r.choices([1, 2, 3, 4, 5], [10, 30, 25, 30, 5])[0])
        if e.cargo in ("MEDICO", "ABOGADO", "CONTADOR"):
            nivel = r.choice([4, 5, 6])
        e.nivel = nivel
        egreso = reintegro = None
        if len(e.periodos) > 1:
            egreso, reintegro = e.periodos[0][1], e.periodos[1][0]
            if not e.activo:  # egresado de dos ciclos: el último egreso manda
                egreso = e.periodos[-1][1]
        elif not e.activo:
            egreso = e.periodos[0][1]
        if e.activo and egreso is None:
            # El sistema anterior guardaba 1900-01-01 en vez de NULL en parte de los casos.
            egreso = CENTINELA if r.random() < 0.3 else None
            reintegro = CENTINELA if r.random() < 0.2 else None
        sexo = "MASCULINO" if e.sexo == "M" else "FEMENINO"
        if r.random() < 0.015:
            sexo = e.sexo  # variante de escritura: 'M' / 'F'
        return dict(
            CEDULA=e.cedula, NACIONALIDAD=e.nacionalidad,
            RIF=rif(e.nacionalidad, e.cedula) if r.random() < 0.85 else None,
            APELLIDOS=e.apellidos, NOMBRES=e.nombres, FECHA_INGRESO=e.ingreso,
            FECHA_ESTE=e.ingreso if r.random() < 0.9 else CENTINELA,
            FECHA_INGRESOGDF=(CENTINELA if r.random() < 0.4
                              else max(date(1995, 1, 1),
                                       e.ingreso - timedelta(days=r.choice([0, 0, 30, 365])))),
            COD_JERARQUIA=e.jerarquia, SECCION=e.ubic["SECCION"],
            COD_CARGO=C.COD_CARGO[e.cargo],
            N_EQUIPO=None if e.tipo == "CIVIL" else str(1000 + (e.cedula - CEDULA_INICIAL) * 7 % 9000),
            N_EMPLEADO=f"{e.cedula - CEDULA_INICIAL + 100001:09d}",
            CONDICION=e.condicion, ESTATUS=e.estatus, HORARIO=e.ubic["HORARIO"], SEXO=sexo,
            FECHA_NACIMIENTO=e.nacimiento,
            ESTADO_CIVIL=r.choices(["SOLTERO", "CASADO", "DIVORCIADO", "VIUDO", "CONCUBINATO"],
                                   [40, 38, 12, 3, 7])[0],
            GRUPO_SANGUINEO=grupo, FACTOR_SANGUINEO=factor, CORREO_ELECTRONICO=e.correo,
            NIVEL_EDUCATIVO=nivel,
            PROMOCION=None if e.tipo == "CIVIL" else str(e.ingreso.year - 1960),
            FECHA_EGRESO=egreso, FECHA_REINTEGRO=reintegro,
            TELEFONO_HABITACION=self.telefono(False) if r.random() < 0.6 else None,
            TELEFONO_MOBIL=e.movil,
            TELEFONO_OTROS=self.telefono() if r.random() < 0.15 else None,
            PERSONA_CONTACTO=self.contacto(),
            LICENCIA=r.choice([None, "3RA", "4TA", "5TA", "2DA"]) if e.tipo != "CIVIL" else None,
            COD_UBICACION=e.id_ubicacion,
            FECHA_ACTUALIZACION=datetime.combine(r.fecha(date(2019, 1, 1), CORTE),
                                                 datetime.min.time()),
            PRE_JUBILADOS=("SI" if e.condicion == "PRE-JUBILADO" else
                           r.choice(["NO", "NO", None])),
        )

    def contacto(self) -> str:
        sexo = self.r.choice("MF")
        nombres, apellidos = self.persona(sexo)
        par = self.r.choice(["MADRE", "ESPOSA", "HERMANA"] if sexo == "F"
                            else ["PADRE", "ESPOSO", "HERMANO"])
        return f"{nombres.split()[0]} {apellidos.split()[0]} ({par}) {self.telefono()}"[:100]

    # ------------------------------------------------------------------ familia y estudios
    def familia_y_estudios(self) -> None:
        d, r = self.d, self.r
        for e in self.exps:
            n = r.choices([0, 1, 2, 3, 4], [20, 25, 25, 18, 12])[0]
            miembros: list[tuple[str, str]] = []
            if n and r.random() < 0.55:
                miembros.append(("CONYUGE" if r.random() < 0.8 else
                                 ("ESPOSA" if e.sexo == "M" else "ESPOSO"),
                                 "F" if e.sexo == "M" else "M"))
            while len(miembros) < n:
                tipo = r.choices(["HIJO", "PADRE", "MADRE", "HERMANO"], [70, 8, 15, 7])[0]
                if tipo == "HIJO":
                    s = r.choice("MF")
                    miembros.append(("HIJO" if s == "M" else "HIJA", s))
                elif tipo == "HERMANO":
                    s = r.choice("MF")
                    miembros.append(("HERMANO" if s == "M" else "HERMANA", s))
                else:
                    miembros.append((tipo, "M" if tipo == "PADRE" else "F"))
            e.hijos = sum(1 for p, _ in miembros if p in ("HIJO", "HIJA"))
            for parentesco, sexo in miembros:
                nombres, _ = self.persona(sexo)
                ap = e.apellidos.split()[0]
                if parentesco in ("HIJO", "HIJA"):
                    nac = r.fecha(mas_anios(e.nacimiento, 20), min(CORTE, mas_anios(e.nacimiento, 45)))
                    apellidos = f"{ap} {r.choice(C.APELLIDOS)}"
                elif parentesco in ("PADRE", "MADRE"):
                    nac = mas_anios(e.nacimiento, -r.uniform(20, 38))
                    apellidos = f"{ap if parentesco == 'PADRE' else r.choice(C.APELLIDOS)} {r.choice(C.APELLIDOS)}"
                else:
                    nac = mas_anios(e.nacimiento, r.uniform(-8, 8))
                    apellidos = f"{r.choice(C.APELLIDOS)} {r.choice(C.APELLIDOS)}"
                desconocida = r.random() < 0.06
                fnac = CENTINELA if desconocida else nac
                edad = None if desconocida else int(anios(nac, CORTE))
                # Se incluye en la carga después del ingreso del titular y del nacimiento.
                inclusion = r.fecha(max(e.ingreso, nac), e.fin) if nac < e.fin else e.fin
                vive = "NO" if parentesco in ("PADRE", "MADRE") and r.random() < 0.25 else "SI"
                estudia = "SI" if edad is not None and 4 <= edad <= 24 else "NO"
                grado = ("PREESCOLAR" if edad is not None and edad < 6 else
                         "PRIMARIA" if edad is not None and edad < 12 else
                         "BACHILLERATO" if edad is not None and edad < 18 else
                         r.choice(["BACHILLERATO", "UNIVERSITARIO", "TSU", None]))
                d.agregar(
                    "CARGA_FAMILIAR", ID=self.nuevo_id("CF"),
                    COMPANIA=r.choice([1, 2, 3]), RAMOPOLIZA="HCM",
                    NROPOLIZA=f"POL-DEMO-{r.randint(1, 30):04d}",
                    CERTIFICADO=r.randint(10000, 99999), CEDULA=e.cedula, NOMBRES=nombres,
                    APELLIDOS=apellidos, PARENTESCO=parentesco, EDAD=edad, FECHA_NACIMIENTO=fnac,
                    SEXO="MASCULINO" if sexo == "M" else "FEMENINO",
                    TIPO_MOVIMIENTO=r.choice(["I", "I", "I", "M", "E"]),
                    CONDICION="ACTIVO" if vive == "SI" else "INACTIVO",
                    TELEFONO_FUN=e.movil, FECHA_INGRESO=inclusion,
                    OBSERVACION=r.choice([None, None, "ACTUALIZADO EN JORNADA DE DATOS",
                                          "CONSIGNO PARTIDA DE NACIMIENTO"]),
                    P_M=r.choice(["P", "M", None]),
                    VIGENCIA=date(r.randint(2020, 2026), 12, 31),
                    VIVE=vive, FECHA_ACTUALIZACION=r.fecha(max(inclusion, date(2018, 1, 1)), CORTE),
                    ESTUDIA=estudia, GRADO_INSTRUCCION=grado,
                )
            # Estudios (1..3 registros, el último coincide con FUNCIONARIOS.NIVEL_EDUCATIVO)
            niveles = sorted({2, e.nivel} | ({3} if e.nivel > 3 and r.random() < 0.3 else set()))
            if e.nivel == 1:
                niveles = [1]
            for nv in niveles:
                f = mas_anios(e.nacimiento, {1: 12, 2: 17, 3: 21, 4: 23, 5: 26, 6: 28}[nv]
                              + r.uniform(0, 3))
                iutb = 1 if nv == 3 and e.tipo != "CIVIL" and r.random() < 0.6 else 0
                unes = 1 if nv in (3, 4) and e.tipo != "CIVIL" and not iutb and r.random() < 0.4 else 0
                d.agregar(
                    "NIVEL_EDUCATIVO", ID_NIVEL=self.nuevo_id("NE"), CEDULA=e.cedula,
                    NIVEL_EDUCATIVO=nv,
                    LICEO_UNIVERSIDAD=("INSTITUTO UNIVERSITARIO DE BOMBEROS (DEMO)" if iutb else
                                       "UNIVERSIDAD NACIONAL EXPERIMENTAL DE LA SEGURIDAD (DEMO)" if unes
                                       else r.choice(["LICEO DEMO ANDRES BELLO", "U.E. DEMO SIMON RODRIGUEZ",
                                                      "UNIVERSIDAD DEMO DE CARACAS",
                                                      "INSTITUTO TECNOLOGICO DEMO"])),
                    ESPECIALIDAD=(None if nv <= 2 else
                                  r.choice(["GESTION DE RIESGOS", "ADMINISTRACION",
                                            "ENFERMERIA", "INGENIERIA CIVIL", "DERECHO",
                                            "PROTECCION CIVIL"])),
                    FECHA=f if f < CORTE else CENTINELA,
                    FECHA_RECEPCION=r.choice([None, CENTINELA, min(CORTE, f + timedelta(days=90))]),
                    NUMERO_TITULO=None if nv == 1 else f"T-{r.randint(1000, 99999)}",
                    IUTB=iutb, UNES=unes,
                    OBSERVACIONES=None,
                )

    # ------------------------------------------------------------------ salud
    def salud(self) -> None:
        d, r = self.d, self.r
        tipos = list(C.TIPOS_REPOSO)
        self.reposos_por_cedula: dict[int, list[tuple[date, date]]] = {}
        nroorden = 5000

        def agregar_reposo(e_ced: int, ini: date, fin: date, tipo: str) -> dict:
            nonlocal nroorden
            nroorden += 1
            diag = (23 if tipo == "PRE Y POST NATAL" else
                    r.choice([14, 15, 16, 17, 18, 13]) if tipo == "ACCIDENTE DE TRABAJO" else
                    r.choice([9, 15, 14]) if tipo == "POST OPERATORIO" else
                    26 if tipo == "PATERNIDAD" else r.randint(1, 22))
            centro = r.randint(1, len(C.CENTROS_MEDICOS))
            conv = r.choice(["CONVALIDADO", "CONVALIDADO", "PENDIENTE", "NO CONVALIDADO"])
            return d.agregar(
                "REPOSOS", ID=self.nuevo_id("RE"), NROORDEN=nroorden,
                FECHA_RECEPCION=ini + timedelta(days=r.randint(0, 5)),
                FECHA_INICIO=ini, FECHA_FIN=fin, CEDULA=e_ced, CODDIAGNOSTICO=diag,
                TIPOREPOSO=tipo, ORIGEN=r.choice(["IVSS", "PRIVADO", "INSTITUCIONAL"]),
                IDMEDICO=r.randint(1, 12), COD_INSTITUCION=str(centro),
                ESTATUS_CONVALIDADO_IVSS=conv,
                CODCENTRO_IVSS=C.CENTROS_MEDICOS[centro - 1][3] or None,
                FECHA_CITA=r.choice([CENTINELA, None, ini + timedelta(days=r.randint(7, 30))]),
                NROREPOSO=r.randint(100000, 999999), LUGAREXPEDICION="CARACAS",
                FECHA_CONVALIDACION_IVSS=(ini + timedelta(days=r.randint(3, 20))
                                          if conv == "CONVALIDADO" else CENTINELA),
                IDDRCONVA_IVSS=f"DR-{r.randint(1000, 9999)}" if conv == "CONVALIDADO" else None,
                VERIFICADO_INSPECTORIA=r.choice(["SI", "NO"]),
                RE_LABORAL=r.choice(["SI", "NO", "NO"]), ARCHIVADO=r.choice(["SI", "NO"]),
            )

        for e in self.exps:
            libres: list[tuple[date, date]] = []
            if e.activo and e.estatus == "REPOSO":
                ini = CORTE - timedelta(days=r.randint(3, 15))
                fin = CORTE + timedelta(days=r.randint(5, 25))
                agregar_reposo(e.cedula, ini, fin, r.choice(["PROLONGADO", "ENFERMEDAD GENERAL"]))
                libres.append((ini, fin))
            if r.random() < 0.65:
                for _ in range(r.randint(1, 4)):
                    tipo = r.choice(tipos)
                    if tipo == "PRE Y POST NATAL" and e.sexo != "F":
                        tipo = "PATERNIDAD"
                    elif tipo == "PATERNIDAD" and e.sexo != "M":
                        tipo = "ORDINARIO"
                    _, dmin, dmax = C.TIPOS_REPOSO[tipo]
                    dur = r.randint(dmin, dmax)
                    for _intento in range(30):
                        ini = r.fecha(max(e.ingreso, date(2008, 1, 1)), e.fin - timedelta(days=dur))
                        fin = ini + timedelta(days=dur - 1)
                        if e.en_servicio(ini) and e.en_servicio(fin) and all(
                                fin < a or ini > b for a, b in libres):
                            libres.append((ini, fin))
                            agregar_reposo(e.cedula, ini, fin, tipo)
                            break
            self.reposos_por_cedula[e.cedula] = sorted(libres)

        # --- Anomalías: solapes, duplicados exactos, fechas invertidas y huérfanos
        con_reposo = [e for e in self.exps if self.reposos_por_cedula.get(e.cedula)]
        elegidos = r.sample(con_reposo, 8)
        for e in elegidos[:6]:
            ini, fin = self.reposos_por_cedula[e.cedula][0]
            nuevo_ini = ini + timedelta(days=max(0, (fin - ini).days // 2))
            agregar_reposo(e.cedula, nuevo_ini, nuevo_ini + timedelta(days=r.randint(5, 12)),
                           "ORDINARIO")
        ANOMALIAS.append(("REPOSOS", 6, "Reposo que se solapa parcialmente con otro del mismo funcionario"))
        for e in elegidos[6:8]:
            original = next(f for f in d.filas["REPOSOS"] if f["CEDULA"] == e.cedula)
            copia = dict(original, ID=self.nuevo_id("RE"))
            d.filas["REPOSOS"].append(copia)
        ANOMALIAS.append(("REPOSOS", 2, "Reposo duplicado exacto (mismas fechas y NROORDEN, otro ID)"))
        for e in r.sample(con_reposo, 2):
            ini = r.fecha(max(e.ingreso, date(2010, 1, 1)), e.fin - timedelta(days=40))
            agregar_reposo(e.cedula, ini, ini - timedelta(days=r.randint(2, 10)), "ORDINARIO")
        ANOMALIAS.append(("REPOSOS", 2, "FECHA_FIN anterior a FECHA_INICIO"))
        for ced in CEDULAS_HUERFANAS:
            ini = r.fecha(date(2015, 1, 1), date(2024, 1, 1))
            agregar_reposo(ced, ini, ini + timedelta(days=5), "ORDINARIO")
        ANOMALIAS.append(("REPOSOS", 3, "Reposo de una cédula que no existe en FUNCIONARIOS ni en egresados"))

        # --- Consultas (Diagnostico_Consulta) a partir de una muestra de reposos
        recibe = [e.cedula for e in self.exps if e.activo and e.area == 5] or [CEDULA_INICIAL]
        medicos = {f["ID_MEDICO"]: f for f in d.filas["MEDICO_TRATANTE"]}
        diags = {c: n for c, n, _ in C.DIAGNOSTICOS}
        validos = [f for f in d.filas["REPOSOS"]
                   if f["CEDULA"] not in CEDULAS_HUERFANAS and f["FECHA_FIN"] >= f["FECHA_INICIO"]]
        for f in r.sample(validos, 70):
            e = self.por_cedula(f["CEDULA"])
            m = medicos[f["IDMEDICO"]]
            centro = C.CENTROS_MEDICOS[int(f["COD_INSTITUCION"]) - 1][1]
            d.agregar(
                "Diagnostico_Consulta", QuienRecibeCI=float(r.choice(recibe)),
                cedula=float(e.cedula), Apellidos=e.apellidos, Nombres=e.nombres,
                FechaRececion=f["FECHA_RECEPCION"], FechaIncio=f["FECHA_INICIO"],
                FechaFin=f["FECHA_FIN"], FechReintegro=siguiente_habil(f["FECHA_FIN"]),
                Diagnostico=diags[f["CODDIAGNOSTICO"]].split(" ", 1)[1],
                MedicoNombre=f"{m['NOMBRES']} {m['APELLIDOS']}", Relativo=r.choice([0, 0, 1]),
                Institucion=centro, **{"Centro Asistencial Quien confirma": r.choice([centro, None]),
                                       "Código": diags[f["CODDIAGNOSTICO"]].split(" ", 1)[0]},
                Observacion=r.choice([None, "SIN OBSERVACION", "REQUIERE CONTROL"]),
            )

    # ------------------------------------------------------------------ operaciones
    def vacaciones(self) -> None:
        d, r = self.d, self.r
        self.vacaciones_por_cedula: dict[int, list[tuple[date, date]]] = {}
        for e in self.exps:
            lista = []
            desde_anio = max(e.ingreso.year + 1, 2017)
            hasta_anio = (2025 if e.activo else e.fin.year - 1)
            for anio in range(desde_anio, hasta_anio + 1):
                antig = max(1, anio - e.ingreso.year)
                dias = min(15 + antig - 1, 30)
                fraccionada = r.random() < 0.15
                partes = ([(date(anio, 1, 15), date(anio, 5, 15), dias // 2),
                           (date(anio, 7, 1), date(anio, 10, 15), dias - dias // 2)]
                          if fraccionada else [(date(anio, 1, 10), date(anio, 10, 15), dias)])
                for a, b, n in partes:
                    ini = r.fecha(a, b)
                    while ini.weekday() >= 5:
                        ini += timedelta(days=1)
                    fin = dias_habiles(ini, n)
                    if not (e.en_servicio(ini) and e.en_servicio(fin)):
                        continue
                    lista.append((ini, fin))
                    self._fila_vacacion(e, anio, ini, fin, n, "DISFRUTADA")
            if e.activo and e.estatus == "VACACIONES":
                ini = CORTE - timedelta(days=r.randint(2, 8))
                fin = dias_habiles(ini, 15)
                lista.append((ini, fin))
                self._fila_vacacion(e, 2026, ini, fin, 15, "EN CURSO")
            self.vacaciones_por_cedula[e.cedula] = lista
        # Anomalía: la misma vacación cargada dos veces (solapa consigo misma)
        for fila in r.sample(d.filas["VACACIONES"], 2):
            d.filas["VACACIONES"].append(dict(fila, Id=self.nuevo_id("VA"),
                                              NroMemo=(fila["NroMemo"] or "")[:8] + "-B"))
        ANOMALIAS.append(("VACACIONES", 2, "Vacación registrada dos veces (mismo período y fechas)"))

    def _fila_vacacion(self, e: Expediente, anio: int, ini: date, fin: date, n: int,
                       estatus: str) -> None:
        r = self.r
        antig = max(1, anio - e.ingreso.year)
        firma = r.choice(["SI", "SI", "NO"])
        self.d.agregar(
            "VACACIONES", Id=self.nuevo_id("VA"), Cedula=e.cedula,
            Quinquenio=f"QUINQUENIO {antig // 5 + 1}", Periodos=f"{anio - 1}-{anio}",
            FechaDesde=ini, FechaHasta=fin, FechaReingreso=siguiente_habil(fin),
            DiasDisfrute=n, PeriodosPendientes=r.choice([None, None, "", f"{anio - 2}-{anio - 1}"]),
            NroMemo=f"M-{r.randint(1, 999):03d}/{anio % 100:02d}",
            FechaProceso=ini - timedelta(days=r.randint(5, 30)),
            FechaCalculoQuinquenio=date(anio, e.ingreso.month, min(e.ingreso.day, 28)),
            Firma=firma, FechaFirma=(ini - timedelta(days=r.randint(1, 4))) if firma == "SI" else CENTINELA,
            Observaciones=r.choice([None, None, "SIN OBSERVACIONES", "FRACCIONADA A SOLICITUD"]),
            COD_AREA=e.area, QuinquenioSegunBonoVacacional=str(antig // 5 + 1),
            ESTATUS=estatus,
        )

    def faltas(self) -> None:
        d, r = self.d, self.r
        self.con_recurrencia: set[int] = set()
        for e in self.exps:
            if r.random() >= 0.28:
                continue
            for _ in range(r.randint(1, 3)):
                f = r.fecha(max(e.ingreso, date(2005, 1, 1)), e.fin)
                if not e.en_servicio(f):
                    continue
                desc = r.choice(C.DESCRIPCIONES_FALTA)
                benef = r.random() < 0.3
                if benef and f.year >= 2025:
                    self.con_recurrencia.add(e.cedula)
                d.agregar(
                    "RECURRENCIA", COD_RECURRENCIA=self.nuevo_id("RC"), CEDULA_CUESTIONADO=e.cedula,
                    FECHA=f, OBSERVACIONES=f"{desc} SEGUN PARTE DIARIO DE LA {r.choice(['ESTACION', 'DIVISION'])}",
                    COD_FALTA=1 if desc == "INASISTENCIA" else None, DESCRIPCION_FALTA=desc,
                    # La hora se guardaba como datetime sobre la fecha 1900-01-01.
                    HORA=datetime(1900, 1, 1, r.randint(6, 20), r.choice([0, 15, 30, 45])),
                    NRO_PARTE=f"P-{f.year}-{r.randint(1, 999):04d}",
                    TOMO_LIBRO=f"T{r.randint(1, 9)}-L{r.randint(1, 40)}", BENEFICIOS=int(benef),
                )

    def guardias(self) -> None:
        d, r = self.d, self.r
        estaciones = [1, 2, 3, 4, 5, 6, 7, 12, 17, 21]
        for k, est in enumerate(estaciones):
            fecha = date(2026, 3, 2) + timedelta(days=k * 2 + r.randint(0, 1))
            zona = C.ZONA_DE_ESTACION[est]
            personal = [e for e in self.exps if e.activo and e.estacion == est
                        and e.ubic["FECHA_DESDE"] <= fecha]
            jefe = next((e for e in personal if e.cargo == "JEFE DE ESTACION"), None)
            seccion = r.choice("ABCD")
            id_enc = self.nuevo_id("EG")
            d.agregar(
                "ENC_GUARDIAS", ID_ENCABEZADO=id_enc, COD_ZONA=zona, COD_ESTACION=est,
                SECCION=seccion, HORARIO="24 HORAS", COD_AREA_DEPENDENCIA=10, MES=MESES[fecha.month - 1],
                DIA=fecha.day, FECHA=fecha,
                OFICIAL_COMANDO=(f"{C.NOMBRE_JERARQUIA[jefe.jerarquia]} {jefe.nombre_completo()}"[:60]
                                 if jefe else None),
                RESPONSABLE_CARGA=f"usuario_demo{r.randint(1, 5):02d}",
            )
            for e in personal:
                if e.tipo == "CIVIL":
                    continue
                inicial = "P"
                if any(a <= fecha <= b for a, b in self.reposos_por_cedula.get(e.cedula, [])):
                    inicial = "R"
                elif any(a <= fecha <= b for a, b in self.vacaciones_por_cedula.get(e.cedula, [])):
                    inicial = "V"
                elif r.random() < 0.06:
                    inicial = "A"
                final = inicial if inicial != "A" or r.random() < 0.5 else "P"
                dep = {"PARAMEDICO": 3, "RESCATISTA": 2, "CONDUCTOR DE UNIDADES": 5,
                       "TECNICO EN MATERIALES PELIGROSOS": 4, "JEFE DE ESTACION": 10,
                       "SUB-JEFE DE ESTACION": 10, "JEFE DE GUARDIA": 10}.get(e.cargo, 1)
                d.agregar(
                    "DET_GUARDIAS", ID_ENCABEZADO=id_enc, ID_DETALLE=self.nuevo_id("DG"),
                    COD_DEPENDENCIA_OPERATIVA=dep, CEDULA=e.cedula, COD_JERARQUIA=e.jerarquia,
                    ESTATUS_INICIAL=inicial, ESTATUS_FINAL=final,
                    OBSERVACIONES={"R": "DE REPOSO", "V": "DE VACACIONES",
                                   "A": "NO SE PRESENTO"}.get(inicial),
                )

    # ------------------------------------------------------------------ carrera
    def carrera(self) -> None:
        d, r = self.d, self.r
        uniformados = [e for e in self.exps if e.tipo != "CIVIL"]
        instructores = [e.cedula for e in self.exps if e.cargo == "INSTRUCTOR"]
        jefes = {e.zona: e for e in self.exps if e.activo and e.cargo in ("JEFE DE ZONA",
                                                                       "COMANDANTE GENERAL")}
        for e in uniformados:
            if e.activo:
                for anio in sorted(r.sample(range(2021, 2026), r.randint(0, 3))):
                    evaluador = self.jefe_de(e) or "SIN EVALUADOR ASIGNADO"
                    gerente = jefes.get(e.zona) or jefes.get(7)
                    d.agregar(
                        "EVALUACIONES", IDEVALUACION=self.nuevo_id("EV"), CEDULA=e.cedula,
                        CAPACITACION=r.randint(10, 20), FISICA=round(r.uniform(10, 20), 2),
                        NOMBRE_EVALUADOR=evaluador[:61], NUMERO_EVALUADOR=r.choice([1, 2]),
                        **{"DESEMPEÑO": round(r.uniform(12, 20), 2)},
                        GERENTE=gerente.nombre_completo()[:61] if gerente else None,
                        RECOMENDACIONES=r.choice([None, "MANTENER DESEMPEÑO",
                                                  "REFORZAR CAPACITACION TECNICA",
                                                  "APTO PARA ASCENSO"]),
                        FECHA=date(anio, r.randint(10, 12), r.randint(1, 28)),
                    )
            for _ in range(r.randint(1, 3)):
                curso = r.choice(C.CURSOS)
                f = r.fecha(e.ingreso, e.fin)
                if not e.en_servicio(f):
                    continue
                jer_en_fecha = max((h["COD_JERARQUIA"] for h in e.hist_jer if h["FECHA"] <= f),
                                   default=e.hist_jer[0]["COD_JERARQUIA"])
                acudio = 1 if r.random() < 0.93 else 0
                nota = r.randint(10, 20) if acudio else 0
                d.agregar(
                    "EVALUACIONES_CURSOS", ID=self.nuevo_id("EC"), CEDULA=e.cedula,
                    COD_JERARQUIA=jer_en_fecha, COD_CURSO=curso[0], NOTA=nota, FECHA=f,
                    CEDULA_INSTRUCTOR=r.choice(instructores + [None]),
                    ACUDIO=acudio,
                    OBSERVACION=("NO ASISTIO" if not acudio else
                                 "APROBADO" if nota >= 14 else "REPROBADO"),
                    EXTRA=1 if r.random() < 0.1 else 0,
                )
        for e in self.exps:
            if r.random() < 0.4 and e.tipo != "CIVIL":
                for _ in range(r.randint(1, 2)):
                    f = r.fecha(mas_anios(e.ingreso, 1), e.fin)
                    d.agregar(
                        "CONDECORACIONES", ID=self.nuevo_id("CO"), CEDULA=e.cedula,
                        PROMOCION=str(e.ingreso.year - 1960),
                        NOMBRE_DOCUMENTO=r.choice(["CRUZ DE LOS BOMBEROS 1RA CLASE",
                                                   "CRUZ DE LOS BOMBEROS 2DA CLASE",
                                                   "MEDALLA AL MERITO", "BOTON DE ANTIGUEDAD",
                                                   "ORDEN AL MERITO BOMBERIL"]),
                        REFERENCIA=f"RESOLUCION N° {r.randint(1, 300):03d}-{f.year}",
                        FECHA=f, NOMBRE=e.nombres, APELLIDO=e.apellidos,
                    )
            for doc in r.sample(["CEDULA DE IDENTIDAD", "PARTIDA DE NACIMIENTO",
                                 "TITULO DE BACHILLER", "CONSTANCIA DE TRABAJO",
                                 "RESOLUCION DE ASCENSO", "CONSTANCIA DE RESIDENCIA"],
                                r.randint(2, 3)):
                d.agregar(
                    "ACERVO_HISTORICO_GENERAL", ID=self.nuevo_id("AC"), CEDULA=e.cedula,
                    PROMOCION=None if e.tipo == "CIVIL" else str(e.ingreso.year - 1960),
                    NOMBRE_DOCUMENTO=doc, REFERENCIA=f"CAJA {r.randint(1, 120)} - CARPETA {r.randint(1, 60)}",
                    FECHA=r.fecha(e.ingreso, e.fin), NOMBRE=e.nombres, APELLIDO=e.apellidos,
                )
        # Jubilados: los 10 egresados por jubilación
        for e in self.exps:
            if e.estatus == "JUBILADO":
                d.agregar(
                    "JUBILADOS", CEDULA=float(e.cedula), NOMINA="JUBILADOS",
                    UNIDAD_EJECUTORA="CUERPO DE BOMBEROS (DEMO)",
                    NRO_NOMINA=f"{r.randint(1, 60):04d}", APELLIDOS_NOMBRES=e.nombre_completo(),
                    JERARQUIA=C.NOMBRE_JERARQUIA[e.jerarquia], FECHA_INGRESO=e.ingreso,
                )

    # ------------------------------------------------------------------ equipo y beneficios
    def equipo_y_beneficios(self) -> None:
        d, r = self.d, self.r
        activos = [e for e in self.exps if e.activo]
        for e in activos:
            if e.estacion and e.tipo != "CIVIL":
                for eq in r.sample(self.equipos_proteccion, r.randint(0, 2)):
                    d.agregar("EQUIPOS_PROTECCION_FUNCIONARIOS", ID=self.nuevo_id("EPF"),
                              CEDULA=e.cedula, ID_EQUIPO_PROTECCION=eq[0], TALLA=eq[2],
                              FECHA_ACTUALIZACION=r.fecha(date(2020, 1, 1), CORTE))
            for un in r.sample(self.uniformes, r.randint(0, 2)):
                d.agregar("UNIFORMES_FUNCIONARIOS", ID=self.nuevo_id("UF"), CEDULA=e.cedula,
                          ID_UNIFORME=un[0], TALLA=un[2],
                          FECHA_ACTUALIZACION=r.fecha(date(2020, 1, 1), CORTE))
        # Radios
        con_estacion = [e for e in activos if e.estacion and e.tipo != "CIVIL"]
        for i in range(1, 16):
            modelo = r.randint(1, 9)
            estatus = "ASIGNADO" if i <= 8 else r.choice(["DISPONIBLE", "EN TALLER",
                                                          "DESINCORPORADO"])
            d.agregar(
                "INVENTARIORADIOS", RADIOID=f"RAD-{i:04d}", SERIAL=f"SN{r.randint(10**7, 10**8 - 1)}",
                COD_MARCA=C.MARCA_DE_MODELO[modelo], COD_MODELO=modelo, ESTATUS=estatus,
                CONDICION="INOPERATIVO" if estatus in ("EN TALLER", "DESINCORPORADO") else "OPERATIVO",
                OBSERVACION=None, COD_TIPO_EQUIPO=1 if i <= 12 else 2, ALIAS=f"CARACAS-{i:02d}",
            )
            if estatus == "ASIGNADO":
                e = r.choice(con_estacion)
                jefe = next((o for o in activos if o.estacion == e.estacion
                             and o.cargo == "JEFE DE ESTACION"), None)
                d.agregar(
                    "ASIGNACION_RADIO_INDIVIDUAL", ID=i, COD_ZONA=e.zona,
                    CEDULA_JEFE=jefe.cedula if jefe else None, CEDULA_FUNCIONARIO=e.cedula,
                    COD_ESTACION=e.estacion, COD_AREA=e.area, PUESTO_DE_TRABAJO=e.cargo,
                    FECHA_ASIGNACION=r.fecha(date(2023, 1, 1), CORTE), SERIAL=None,
                    ID_EQUIPO=f"RAD-{i:04d}", COD_EQUIPO=1, COD_MARCA=C.MARCA_DE_MODELO[modelo],
                    COD_MODELO=modelo, ASIGNADO="SI",
                )
        # Beneficios
        for e in activos:
            d.agregar("BENEFICIO", ApellidosYNombres=e.nombre_completo(), Cedula=float(e.cedula),
                      des_carg=e.cargo,
                      RECURRENCIA="CON RECURRENCIA" if e.cedula in self.con_recurrencia
                      else "SIN RECURRENCIA",
                      DATOS=r.choice(["ACTUALIZADOS", "ACTUALIZADOS", "NO ACTUALIZADOS"]))
            for tipo in C.TIPOS_BENEFICIO:
                if tipo in ("JUGUETES", "UTILES ESCOLARES", "UNIFORMES ESCOLARES") and not e.hijos:
                    continue
                if r.random() < 0.25:
                    continue
                anio = r.randint(max(2021, e.ingreso.year + 1), 2025)
                f = date(anio, 12 if "NAVID" in tipo or "AÑO" in tipo else r.randint(1, 11),
                         r.randint(1, 28))
                banco = r.choice(C.BANCOS)
                recibe = "NO" if e.cedula in self.con_recurrencia and r.random() < 0.5 else "SI"
                d.agregar(
                    "REGISTRO_BENEFICIO", CEDULA=e.cedula, FECHA_REGISTRO=f, TIPO_BENEFICIO=tipo,
                    RECIBE_BENEFICIO=recibe, FUNCIONARIO_TITULAR="SI", OTRO="NO",
                    ESPECIFIQUE=None if recibe == "SI" else "SUSPENDIDO POR RECURRENCIA",
                    FECHA_DEPOSITO=(f + timedelta(days=r.randint(1, 10))) if recibe == "SI" else None,
                    NUMERO_REFERENCIA=f"{r.randint(10**9, 10**10 - 1)}" if recibe == "SI" else None,
                    BANCO_EMISOR=banco[1] if recibe == "SI" else None,
                )

    # ------------------------------------------------------------------ tablas a descartar
    def tablas_descartables(self) -> None:
        d, r = self.d, self.r
        activos = [e for e in self.exps if e.activo]
        for i in range(1, 11):
            e = activos[i * 7]
            d.agregar(
                "ACCESO", ID_ACCESO=i, USUARIO=f"usuario_demo{i:02d}", CEDULA=e.cedula,
                CLAVE=f"NO-VALIDA-{i:04d}", FECHA_PASS=r.fecha(date(2015, 1, 1), CORTE),
                HORA_PASS=datetime(1900, 1, 1, r.randint(7, 18), r.randint(0, 59)),
                NIVEL=r.choice(["ADMINISTRADOR", "OPERADOR", "CONSULTA"]),
                PREGUNTA_SEGURIDAD="PREGUNTA DE PRUEBA", RESPUESTA_PREGUNTA="RESPUESTA DE PRUEBA",
                CONSULTAR="SI", ELIMINAR=r.choice(["SI", "NO"]), MODIFICAR=r.choice(["SI", "NO"]),
                INCLUIR=r.choice(["SI", "NO"]), SECCION=r.choice(["A", "B", None]),
                MODULO=r.choice(["PERSONAL", "REPOSOS", "VACACIONES", "TODOS"]),
            )
        funcs = {f["CEDULA"]: f for f in d.filas["FUNCIONARIOS"]}
        for k, e in enumerate(r.sample(activos, 40)):
            f = funcs[e.cedula]
            nuevo_movil = self.telefono()
            d.agregar(
                "AUDIT_FUNCIONARIOS", ID_AUDIT=k + 1, USUARIO=f"usuario_demo{r.randint(1, 5):02d}",
                USUARIO_APLICACION="SISTEMA_PERSONAL",
                DIR_MAC=f"00-00-5E-00-53-{r.randint(0, 255):02X}", TRANSACCION="MODIFICACION",
                FECHA_TRANSACCION=datetime.combine(r.fecha(date(2018, 1, 1), CORTE), datetime.min.time()),
                CEDULA=e.cedula, CEDULA_MOD=e.cedula, NACIONALIDAD=f["NACIONALIDAD"],
                NACIONALIDAD_MOD=f["NACIONALIDAD"], APELLIDOS=f["APELLIDOS"],
                APELLIDOS_MOD=f["APELLIDOS"], NOMBRES=f["NOMBRES"], NOMBRES_MOD=f["NOMBRES"],
                COD_JERARQUIA=f["COD_JERARQUIA"], COD_JERARQUIA_MOD=f["COD_JERARQUIA"],
                ESTATUS="ACTIVO", ESTATUS_MOD=f["ESTATUS"], TELEFONO_MOBIL=nuevo_movil,
                TELEFONO_MOBIL_MOD=f["TELEFONO_MOBIL"],
            )
        hist = d.filas["HISTORICO_JERARQUIA"]
        for k, h in enumerate(r.sample(hist, 20)):
            d.agregar(
                "AUDIT_HISTORICO_JERARQUIA", ID_HISTO_JERARQUIA=k + 1,
                USUARIO=f"usuario_demo{r.randint(1, 5):02d}", USUARIO_APLICACION="SISTEMA_PERSONAL",
                TRANSACCION="INSERCION", FECHA_TRANSACCION=h["FECHA"] + timedelta(days=3),
                CEDULA=h["CEDULA"], CEDULA_MOD=h["CEDULA"], TIPO_DOCUMENTO=h["TIPO_DOCUMENTO"],
                TIPO_DOCUMENTO_MOD=h["TIPO_DOCUMENTO"], FECHA=h["FECHA"], FECHA_MOD=h["FECHA"],
                COD_JERARQUIA=h["COD_JERARQUIA"], COD_JERARQUIA_MOD=h["COD_JERARQUIA"],
                **{"FECHA ULTIMO ASCENSO": h["Fecha Ultimo Ascenso"],
                   "FECHA_ULTIMO_ASCENSO_MOD": h["Fecha Ultimo Ascenso"]},
                NIVELACION=h["Nivelacion"], NIVELACION_MOD=h["Nivelacion"],
            )
        # FUNCIONARIOS_VIEJA: instantánea antigua (jerarquía inicial, columnas distintas)
        for e in r.sample(self.exps, 60):
            h0, u0 = e.hist_jer[0], e.hist_ubi[0]
            d.agregar(
                "FUNCIONARIOS_VIEJA", CEDULA=e.cedula, APELLIDOS=e.apellidos[:30],
                NOMBRES=e.nombres, FECHA_INGRESO=e.ingreso, FECHA_INGRESO_ESTE=e.ingreso,
                COD_JERARQUIA=h0["COD_JERARQUIA"], COD_CARGO=h0["COD_CARGO"],
                CONDICION=e.condicion[:25], ESTATUS="ACTIVO", COD_AREA=u0["COD_AREA"],
                HORARIO=u0["HORARIO"][:15], SECCION=u0["SECCION"], COD_ESTACION=u0["COD_ESTACION"],
                COD_ZONA=u0["COD_ZONA"], SEXO=e.sexo, NIVEL_EDUCATIVO=2, FECHA_NACIMIENTO=e.nacimiento,
                N_EMPLEADO=f"{e.cedula - CEDULA_INICIAL + 100001:09d}", TELEFONO_MOVIL=e.movil,
                CORREO_ELECTRONICO=e.correo, N_EQUIPO=None if e.tipo == "CIVIL" else 1000 + e.cedula % 9000,
            )
        for h in r.sample(hist, 100):
            d.agregar(
                "HISTORICO_JERARQUIA_OLD", ID=float(h["ID"]), CEDULA=h["CEDULA"],
                TIPO_DOCUMENTO=h["TIPO_DOCUMENTO"], NUMERO_DOCUMENTO=h["NUMERO_DOCUMENTO"],
                REFERENCIA=h["REFERENCIA"], FECHA=h["FECHA"], COD_JERARQUIA=float(h["COD_JERARQUIA"]),
                COD_CARGO=float(h["COD_CARGO"]), Jerarquia=h["Jerarquia"],
                **{"Fecha Ultimo Ascenso": h["Fecha Ultimo Ascenso"]}, Nivelacion=h["Nivelacion"],
            )
        reposos = [f for f in d.filas["REPOSOS"] if f["CEDULA"] not in CEDULAS_HUERFANAS]
        for f in r.sample(reposos, 50):
            d.agregar("REPOSOS_BD_VIEJA", CEDULA=f["CEDULA"], FECHA_RECEPCION=f["FECHA_RECEPCION"],
                      FECHA_INICIO=f["FECHA_INICIO"], FECHA_FIN=f["FECHA_FIN"], ID=f["ID"])
        for e in r.sample(self.exps, 10):  # reposos viejos que solo existen en la copia
            ini = r.fecha(e.ingreso, min(e.fin, date(2007, 12, 31))) if e.ingreso < date(2007, 1, 1) \
                else r.fecha(e.ingreso, e.fin)
            d.agregar("REPOSOS_BD_VIEJA", CEDULA=e.cedula, FECHA_RECEPCION=ini, FECHA_INICIO=ini,
                      FECHA_FIN=ini + timedelta(days=r.randint(2, 10)), ID=None)
        for i, f in enumerate(r.sample(reposos, 15), start=1):
            d.agregar("REPOSOS(ORIGINAL)", Id=i, NROORDEN=f["NROORDEN"],
                      FECHA_RECEPCION=f["FECHA_RECEPCION"], FECHA_INICIO=f["FECHA_INICIO"],
                      FECHA_FIN=f["FECHA_FIN"], FECHA_REINTEGRO=siguiente_habil(f["FECHA_FIN"]),
                      DIAGNOSTICO=dict((c, n) for c, n, _ in C.DIAGNOSTICOS)[f["CODDIAGNOSTICO"]],
                      MEDICO_TRATANTE=f"MEDICO {f['IDMEDICO']}", RELATIVO=0,
                      INSTITUCION=C.CENTROS_MEDICOS[int(f["COD_INSTITUCION"]) - 1][1][:50])
        for b in r.sample(d.filas["BENEFICIO"], 100):
            d.agregar("BENEFICIO_ENE22", **dict(b, DATOS="NO ACTUALIZADOS"))
        for e in r.sample(activos, 20):
            d.agregar("Hoja1$", **{"FICTICIO DEMO NOMBRE APELLIDO ": e.nombre_completo(),
                                   "90999999": float(e.cedula),
                                   "EMPLEADOS FIJOS": "EMPLEADOS FIJOS" if e.tipo == "CIVIL"
                                   else "BOMBEROS", "F4": None,
                                   "NO EXISTE": r.choice(["EXISTE", "NO EXISTE"])})
        for i in range(1, 4):
            d.agregar("dtproperties", id=i, objectid=1000 + i, property="DtgSchemaOBJECT",
                      value=None, uvalue=None, lvalue=None, version=0)

    # ------------------------------------------------------------------ orquestación
    def generar(self) -> Datos:
        self.catalogos()
        self.expedientes()
        self.tablas_personal()
        self.familia_y_estudios()
        self.salud()
        self.vacaciones()
        self.faltas()
        self.guardias()
        self.carrera()
        self.equipo_y_beneficios()
        self.tablas_descartables()
        self.d.validar()
        return self.d


BASAMENTOS = {
    "RENUNCIA": "RENUNCIA VOLUNTARIA - LEY DEL ESTATUTO DE LA FUNCION PUBLICA, ART. 78 NUM. 1",
    "JUBILACION": "JUBILACION - LEY DEL ESTATUTO DE LA FUNCION PUBLICA, ART. 78 NUM. 4",
    "DESTITUCION": "DESTITUCION - LEY DEL ESTATUTO DE LA FUNCION PUBLICA, ART. 78 NUM. 6",
    "FALLECIMIENTO": "FALLECIMIENTO - LEY DEL ESTATUTO DE LA FUNCION PUBLICA, ART. 78 NUM. 7",
    "ABANDONO DEL CARGO": "ABANDONO INJUSTIFICADO DEL CARGO - DESTITUCION POR PROCEDIMIENTO DISCIPLINARIO",
    "NO RATIFICADO": "CULMINACION DE CONTRATO SIN RATIFICACION",
}


# =============================================================================
# Escritura de salidas
# =============================================================================
def escribir_sql(d: Datos) -> None:
    partes = [
        "-- =============================================================================",
        "-- PERSONALINTEGRADA_DEMO — datos FICTICIOS. GENERADO por generar_datos.py",
        f"-- (semilla {SEMILLA}, fecha de corte {CORTE.isoformat()}). No editar a mano.",
        "-- Ningún dato corresponde a una persona real. Cédulas desde V-90.000.001.",
        "-- =============================================================================",
        "SET NOCOUNT ON;",
        "GO",
    ]
    for t, _, _ in TABLAS:
        filas = d.filas[t]
        if not filas:
            continue
        meta = tabla(t)
        presentes = {k for f in filas for k in f}
        cols = [c.nombre for c in meta.columnas if c.nombre in presentes]
        cab = f"INSERT INTO dbo.{q(t)} ({', '.join(q(c) for c in cols)}) VALUES"
        partes.append(f"-- {t}: {len(filas)} filas")
        for i in range(0, len(filas), LOTE):
            lote = filas[i:i + LOTE]
            valores = ",\n".join("(" + ", ".join(literal(f.get(c)) for c in cols) + ")"
                                 for f in lote)
            partes.append(f"{cab}\n{valores};\nGO")
    SALIDA_SQL.write_text("\n".join(partes) + "\n", encoding="utf-8", newline="\n")


def conteos_por_zona(g: Generador) -> dict:
    res = {"activos": {}, "egresados": {}}
    for e in g.exps:
        clave = "activos" if e.activo else "egresados"
        z = str(e.ubic["COD_ZONA"])
        res[clave][z] = res[clave].get(z, 0) + 1
    for k in res:
        res[k] = dict(sorted(res[k].items(), key=lambda x: int(x[0])))
    return res


def escribir_conteos(d: Datos, g: Generador) -> dict:
    datos = {
        "semilla": SEMILLA,
        "fecha_corte": CORTE.isoformat(),
        "filas": {t: len(d.filas[t]) for t, _, _ in TABLAS},
        "por_zona_vigente": conteos_por_zona(g),
        "reingresos": {
            "activos": sum(1 for e in g.exps if e.activo and len(e.periodos) > 1),
            "egresados": sum(1 for e in g.exps if not e.activo and len(e.periodos) > 1),
        },
        "anomalias": [{"tabla": t, "cantidad": n, "descripcion": s} for t, n, s in ANOMALIAS],
    }
    SALIDA_CONTEOS.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n",
                              encoding="utf-8")
    return datos


def escribir_tablas_md(datos: dict) -> None:
    lineas = [
        "# Tablas del conjunto demostrativo `PERSONALINTEGRADA_DEMO`",
        "",
        "Generado por `generar_datos.py` (no editar a mano). Columnas y filas reales salen de",
        "`apps/migration/legacy_inspection_20260504_174805.json`; las filas demo, de esta corrida",
        f"(semilla {SEMILLA}, corte {CORTE.isoformat()}).",
        "",
        "| # | Tabla | Rol | Columnas (JSON) | Filas en el real | Filas demo | Uso |",
        "|---:|---|---|---:|---:|---:|---|",
    ]
    for i, (t, rol_, uso) in enumerate(TABLAS, start=1):
        meta = tabla(t)
        lineas.append(f"| {i} | `{t}` | {'canónica' if rol_ == 'canonica' else '**descartar**'} | "
                      f"{len(meta.columnas)} | {meta.filas_reales:,} | {datos['filas'][t]:,} | {uso} |")
    total = sum(datos["filas"].values())
    lineas += [
        "",
        f"Total de filas demo: **{total:,}** en {len(TABLAS)} tablas "
        f"({sum(1 for _, r, _ in TABLAS if r == 'descartar')} para descartar).",
        "",
        "## Expedientes por zona de la ubicación vigente",
        "",
    ]
    nombres = dict(C.ZONAS)
    lineas += tabla_zonas_md(datos)
    lineas += [
        "",
        f"Reingresos (ingreso → egreso → reintegro): {datos['reingresos']['activos']} activos y "
        f"{datos['reingresos']['egresados']} egresados con dos ciclos.",
        "",
        "## Anomalías sembradas a propósito",
        "",
        "| Tabla | Casos | Descripción |",
        "|---|---:|---|",
    ]
    for a in datos["anomalias"]:
        lineas.append(f"| `{a['tabla']}` | {a['cantidad']} | {a['descripcion']} |")
    lineas += [
        "",
        "## Desviaciones respecto al JSON",
        "",
        "- `Hoja1$`: dos columnas del real se llaman con el nombre y la cédula de una persona",
        "  real (fila de encabezado de Excel). Se renombraron a `FICTICIO DEMO NOMBRE APELLIDO `",
        "  y `90999999` conservando tipo, posición y el espacio final. Es la única desviación.",
        f"- Sin `IDENTITY`, índices ni claves foráneas: el JSON no los reporta (0 FK en el real).",
        "",
        f"Nota: los catálogos `ZONAS` usan nombres de zona que no son datos personales; "
        f"las zonas 7–10 ({', '.join(nombres[z] for z in (7, 8, 9, 10))}) no existen en el destino.",
        "",
    ]
    SALIDA_TABLAS_MD.write_text("\n".join(lineas), encoding="utf-8")


def tabla_zonas_md(datos: dict) -> list[str]:
    pz = datos["por_zona_vigente"]
    lineas = ["| Zona | Activos (`FUNCIONARIOS`) | Egresados (`FUNCIONARIOS_EGRESADOS`) |",
              "|---|---:|---:|"]
    for cod, nom in C.ZONAS:
        a, e = pz["activos"].get(str(cod), 0), pz["egresados"].get(str(cod), 0)
        if cod == 1:
            lineas.append(f"| {cod} — {nom} | **{a}** | **{e}** |")
        else:
            lineas.append(f"| {cod} — {nom} | {a} | {e} |")
    ta, te = sum(pz["activos"].values()), sum(pz["egresados"].values())
    lineas.append(f"| **Total** | **{ta}** ({ta - pz['activos'].get('1', 0)} fuera de Z1) | "
                  f"**{te}** ({te - pz['egresados'].get('1', 0)} fuera de Z1) |")
    return lineas


def actualizar_readme(datos: dict) -> None:
    """Rellena en README.md las secciones de conteos entre marcadores."""
    if not README.exists():
        return
    texto = README.read_text(encoding="utf-8")
    filas = ["| Tabla | Rol | Filas demo |", "|---|---|---:|"]
    for t, rol_, _ in TABLAS:
        filas.append(f"| `{t}` | {'canónica' if rol_ == 'canonica' else 'descartar'} | "
                     f"{datos['filas'][t]:,} |")
    filas.append(f"| **Total** | | **{sum(datos['filas'].values()):,}** |")
    for marca, contenido in (("CONTEOS", filas), ("ZONAS", tabla_zonas_md(datos))):
        ini, fin = f"<!-- {marca}:INICIO -->", f"<!-- {marca}:FIN -->"
        a, b = texto.index(ini) + len(ini), texto.index(fin)
        texto = texto[:a] + "\n" + "\n".join(contenido) + "\n" + texto[b:]
    README.write_text(texto, encoding="utf-8")


def main() -> int:
    g = Generador()
    d = g.generar()
    escribir_sql(d)
    datos = escribir_conteos(d, g)
    escribir_tablas_md(datos)
    actualizar_readme(datos)
    total = sum(datos["filas"].values())
    print(f"Escrito {SALIDA_SQL.name}: {total:,} filas en {len(TABLAS)} tablas")
    print(f"Por zona vigente: {datos['por_zona_vigente']}")
    print(f"Reingresos: {datos['reingresos']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
