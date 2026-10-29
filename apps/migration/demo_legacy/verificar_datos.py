"""Verifica ``ddl_legacy.sql`` y ``datos_legacy.sql`` sin necesidad de SQL Server.

1. Sintaxis: cada lote (separado por ``GO``) se analiza con ``sqlglot`` en
   dialecto T-SQL; ninguna sentencia puede quedar como ``Command`` sin analizar.
2. Carga: el DDL se traduce a SQLite (tipos simplificados, PK conservadas) y los
   INSERT se ejecutan en una base SQLite en memoria (se quita el prefijo N'').
3. Coherencia: cédulas únicas, referencias a expedientes y catálogos existentes,
   ubicaciones con zona/estación válidas, conteos por zona, históricos coherentes
   con el expediente, y que las anomalías sembradas aparezcan EXACTAMENTE las
   veces previstas (ni más ni menos).

Uso:
    python verificar_datos.py               # todo
    python verificar_datos.py --sin-sqlglot # omite el análisis sintáctico
Sale con código 1 si alguna comprobación falla.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent
DDL = DIR / "ddl_legacy.sql"
DATOS = DIR / "datos_legacy.sql"
CONTEOS = DIR / "conteos_esperados.json"

SEP_GO = re.compile(r"(?im)^\s*GO\s*$")
CEDULA_MIN = 90_000_001
CENTINELA = "1900-01-01T00:00:00"


# =============================================================================
# Utilidades de texto SQL
# =============================================================================
def lotes(sql: str) -> list[str]:
    return [b for b in SEP_GO.split(sql) if b.strip()]


def sentencias(lote: str) -> list[str]:
    """Divide un lote en sentencias por ';' fuera de literales de cadena."""
    out, actual, en_cadena, i = [], [], False, 0
    while i < len(lote):
        ch = lote[i]
        if ch == "'":
            if en_cadena and i + 1 < len(lote) and lote[i + 1] == "'":
                actual.append("''")
                i += 2
                continue
            en_cadena = not en_cadena
        if ch == ";" and not en_cadena:
            out.append("".join(actual))
            actual = []
        else:
            actual.append(ch)
        i += 1
    if "".join(actual).strip():
        out.append("".join(actual))
    return [s for s in out if s.strip() and not _solo_comentarios(s)]


def _solo_comentarios(s: str) -> bool:
    return all(not ln.strip() or ln.strip().startswith("--") for ln in s.splitlines())


def quitar_prefijo_n(sql: str) -> str:
    """N'texto' -> 'texto' (solo fuera de cadenas y si N no es parte de un identificador)."""
    out, en_cadena, i = [], False, 0
    while i < len(sql):
        ch = sql[i]
        if not en_cadena and ch in "Nn" and i + 1 < len(sql) and sql[i + 1] == "'" \
                and (i == 0 or not (sql[i - 1].isalnum() or sql[i - 1] in "_]")):
            i += 1
            continue
        if ch == "'":
            if en_cadena and i + 1 < len(sql) and sql[i + 1] == "'":
                out.append("''")
                i += 2
                continue
            en_cadena = not en_cadena
        out.append(ch)
        i += 1
    return "".join(out)


# =============================================================================
# 1. Sintaxis con sqlglot
# =============================================================================
def validar_sintaxis() -> list[str]:
    try:
        import sqlglot
        from sqlglot import exp
        from sqlglot.errors import ErrorLevel
    except ImportError:
        return ["sqlglot no está instalado (python -m pip install sqlglot)"]
    fallas = []
    for ruta in (DDL, DATOS):
        n = 0
        for k, lote in enumerate(lotes(ruta.read_text(encoding="utf-8"))):
            try:
                arboles = sqlglot.parse(lote, read="tsql", error_level=ErrorLevel.RAISE)
            except Exception as e:  # noqa: BLE001 — se reporta el lote fallido
                fallas.append(f"{ruta.name} lote {k}: {str(e)[:200]}")
                continue
            for a in arboles:
                if a is None:
                    continue
                n += 1
                if isinstance(a, exp.Command):
                    fallas.append(f"{ruta.name} lote {k}: sentencia no analizada: {a.sql()[:120]}")
        print(f"  sqlglot/tsql: {ruta.name}: {n} sentencias analizadas")
    return fallas


# =============================================================================
# 2. Carga en SQLite
# =============================================================================
TIPOS_SQLITE = {
    "numeric": "NUMERIC", "decimal": "NUMERIC", "int": "INTEGER", "smallint": "INTEGER",
    "bit": "INTEGER", "float": "REAL", "real": "REAL", "money": "NUMERIC",
    "datetime": "TEXT", "date": "TEXT", "time": "TEXT", "nvarchar": "TEXT", "varchar": "TEXT",
    "nchar": "TEXT", "char": "TEXT", "text": "TEXT", "uniqueidentifier": "TEXT", "image": "BLOB",
    "varbinary": "BLOB",
}
RE_CREATE = re.compile(r"CREATE TABLE dbo\.(\[[^\]]+\]) \((.*?)\n\);", re.S)
RE_COL = re.compile(r"^\s*(\[[^\]]+\]) (\w+)(\([^)]*\))? (NOT NULL|NULL)(?: DEFAULT (.+))?$")


def ddl_a_sqlite(ddl: str) -> list[str]:
    salida = []
    for nombre, cuerpo in RE_CREATE.findall(ddl):
        defs = []
        for linea in cuerpo.split(",\n"):
            linea = linea.rstrip(",")
            if linea.strip().startswith("CONSTRAINT"):
                pk = re.search(r"PRIMARY KEY \((.*)\)", linea).group(1)
                defs.append(f"PRIMARY KEY ({pk})")
                continue
            m = RE_COL.match(linea)
            if not m:
                raise ValueError(f"Línea de DDL no reconocida en {nombre}: {linea!r}")
            col, tipo, _, nulo, defecto = m.groups()
            d = f"{col} {TIPOS_SQLITE[tipo.lower()]} {nulo}"
            if defecto:
                d += " DEFAULT (lower(hex(randomblob(16))))" if "newid" in defecto else f" DEFAULT {defecto}"
            defs.append(d)
        salida.append(f"CREATE TABLE {nombre} (\n  " + ",\n  ".join(defs) + "\n)")
    return salida


def cargar_sqlite() -> sqlite3.Connection:
    cn = sqlite3.connect(":memory:")
    for st in ddl_a_sqlite(DDL.read_text(encoding="utf-8")):
        cn.execute(st)
    n = 0
    for lote in lotes(DATOS.read_text(encoding="utf-8")):
        for st in sentencias(lote):
            st = "\n".join(ln for ln in st.splitlines()
                           if not ln.lstrip().startswith("--")).strip()
            if st.upper().startswith("SET "):
                continue
            st = quitar_prefijo_n(st.replace("INSERT INTO dbo.[", "INSERT INTO ["))
            cn.execute(st)
            n += 1
    cn.commit()
    print(f"  SQLite: {n} sentencias INSERT ejecutadas")
    return cn


# =============================================================================
# 3. Comprobaciones de coherencia
# =============================================================================
class Verificador:
    def __init__(self, cn: sqlite3.Connection, esperado: dict) -> None:
        self.cn = cn
        self.esp = esperado
        self.fallas: list[str] = []
        self.ok = 0

    def valor(self, sql: str):
        return self.cn.execute(sql).fetchone()[0]

    def igual(self, nombre: str, sql: str, esperado) -> None:
        real = self.valor(sql)
        if real == esperado:
            self.ok += 1
        else:
            self.fallas.append(f"{nombre}: obtenido {real!r}, esperado {esperado!r}")

    def cero(self, nombre: str, sql: str) -> None:
        self.igual(nombre, f"SELECT COUNT(*) FROM ({sql})", 0)

    def anomalia(self, tabla: str, texto: str) -> int:
        for a in self.esp["anomalias"]:
            if a["tabla"] == tabla and texto in a["descripcion"]:
                return a["cantidad"]
        raise KeyError((tabla, texto))

    # ------------------------------------------------------------------
    def correr(self) -> None:
        self.conteos()
        self.unicidad()
        self.referencias_expediente()
        self.referencias_catalogo()
        self.ubicaciones()
        self.por_zona()
        self.historicos()
        self.egresos_y_reingresos()
        self.solapes_y_anomalias()
        self.fechas()

    def conteos(self) -> None:
        for t, n in self.esp["filas"].items():
            self.igual(f"filas {t}", f"SELECT COUNT(*) FROM [{t}]", n)
        self.igual("activos", "SELECT COUNT(*) FROM FUNCIONARIOS", 150)
        self.igual("egresados", "SELECT COUNT(*) FROM FUNCIONARIOS_EGRESADOS", 40)
        self.igual("zonas", "SELECT COUNT(*) FROM ZONAS", 10)
        self.igual("estaciones", "SELECT COUNT(*) FROM ESTACIONES", 29)
        self.igual("jubilados", "SELECT COUNT(*) FROM JUBILADOS", 10)
        self.igual("FALTAS (1 fila, como el real)", "SELECT COUNT(*) FROM FALTAS", 1)
        for t in ("ACCESO", "AUDIT_FUNCIONARIOS", "AUDIT_HISTORICO_JERARQUIA",
                  "FUNCIONARIOS_VIEJA", "HISTORICO_JERARQUIA_OLD", "REPOSOS_BD_VIEJA",
                  "REPOSOS(ORIGINAL)", "BENEFICIO_ENE22", "Hoja1$", "dtproperties"):
            self.igual(f"tabla a descartar con filas: {t}",
                       f"SELECT COUNT(*) > 0 FROM [{t}]", 1)

    def unicidad(self) -> None:
        for t, c in [("FUNCIONARIOS", "CEDULA"), ("FUNCIONARIOS_EGRESADOS", "CEDULA"),
                     ("UBICACION_ADMINISTRATIVA", "CEDULA"), ("JUBILADOS", "CEDULA"),
                     ("BENEFICIO", "Cedula")]:
            self.cero(f"cédula única en {t}",
                      f"SELECT {c} FROM [{t}] GROUP BY {c} HAVING COUNT(*) > 1")
        self.cero("cédula en activos Y egresados",
                  "SELECT CEDULA FROM FUNCIONARIOS INTERSECT SELECT CEDULA FROM FUNCIONARIOS_EGRESADOS")
        self.cero("N_EMPLEADO único (activos + egresados)",
                  "SELECT N_EMPLEADO FROM (SELECT N_EMPLEADO FROM FUNCIONARIOS UNION ALL "
                  "SELECT N_EMPLEADO FROM FUNCIONARIOS_EGRESADOS) GROUP BY N_EMPLEADO HAVING COUNT(*) > 1")
        self.cero("cédulas ficticias (>= 90.000.001)",
                  f"SELECT CEDULA FROM FUNCIONARIOS WHERE CEDULA < {CEDULA_MIN} UNION ALL "
                  f"SELECT CEDULA FROM FUNCIONARIOS_EGRESADOS WHERE CEDULA < {CEDULA_MIN}")
        self.igual("correos duplicados (anomalía)",
                   "SELECT COUNT(*) FROM (SELECT CORREO_ELECTRONICO FROM FUNCIONARIOS "
                   "WHERE CORREO_ELECTRONICO LIKE '%@%' GROUP BY CORREO_ELECTRONICO HAVING COUNT(*) > 1)", 1)
        self.igual("correos 'NO POSEE' (anomalía)",
                   "SELECT COUNT(*) FROM FUNCIONARIOS WHERE CORREO_ELECTRONICO = 'NO POSEE'",
                   self.anomalia("FUNCIONARIOS", "NO POSEE"))

    def referencias_expediente(self) -> None:
        self.cn.execute("CREATE TEMP VIEW EXP AS SELECT CEDULA, FECHA_INGRESO, "
                        "NULL AS FECHA_FIN, 1 AS ACTIVO FROM FUNCIONARIOS UNION ALL "
                        "SELECT CEDULA, FECHA_INGRESO, FECHA_EGRESO, 0 FROM FUNCIONARIOS_EGRESADOS")
        refs = [
            ("HISTORICO_JERARQUIA", "CEDULA"), ("HISTORICO_UBICACION_ADMINISTRATIVA", "CEDULA"),
            ("UBICACION_ADMINISTRATIVA", "CEDULA"), ("DETALLE_EGRESO", "CEDULA"),
            ("CARGA_FAMILIAR", "CEDULA"), ("NIVEL_EDUCATIVO", "CEDULA"), ("VACACIONES", "Cedula"),
            ("RECURRENCIA", "CEDULA_CUESTIONADO"), ("DET_GUARDIAS", "CEDULA"),
            ("ASCENSOS", "CEDULA"), ("EVALUACIONES", "CEDULA"), ("EVALUACIONES_CURSOS", "CEDULA"),
            ("EVALUACIONES_CURSOS", "CEDULA_INSTRUCTOR"), ("CONDECORACIONES", "CEDULA"),
            ("ACERVO_HISTORICO_GENERAL", "CEDULA"), ("JUBILADOS", "CEDULA"),
            ("EQUIPOS_PROTECCION_FUNCIONARIOS", "CEDULA"), ("UNIFORMES_FUNCIONARIOS", "CEDULA"),
            ("ASIGNACION_RADIO_INDIVIDUAL", "CEDULA_FUNCIONARIO"),
            ("ASIGNACION_RADIO_INDIVIDUAL", "CEDULA_JEFE"), ("BENEFICIO", "Cedula"),
            ("REGISTRO_BENEFICIO", "CEDULA"), ("Diagnostico_Consulta", "cedula"),
            ("Diagnostico_Consulta", "QuienRecibeCI"),
        ]
        for t, c in refs:
            self.cero(f"{t}.{c} apunta a un expediente",
                      f"SELECT 1 FROM [{t}] WHERE [{c}] IS NOT NULL AND "
                      f"CAST([{c}] AS INTEGER) NOT IN (SELECT CEDULA FROM EXP)")
        self.igual("REPOSOS huérfanos (anomalía)",
                   "SELECT COUNT(*) FROM REPOSOS WHERE CEDULA NOT IN (SELECT CEDULA FROM EXP)",
                   self.anomalia("REPOSOS", "no existe"))
        self.cero("JUBILADOS son egresados con estatus JUBILADO",
                  "SELECT 1 FROM JUBILADOS j WHERE CAST(j.CEDULA AS INTEGER) NOT IN "
                  "(SELECT CEDULA FROM FUNCIONARIOS_EGRESADOS WHERE ESTATUS = 'JUBILADO')")
        self.cero("guardias solo con activos",
                  "SELECT 1 FROM DET_GUARDIAS WHERE CEDULA NOT IN (SELECT CEDULA FROM FUNCIONARIOS)")

    def referencias_catalogo(self) -> None:
        cat = [
            ("FUNCIONARIOS", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("FUNCIONARIOS_EGRESADOS", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("HISTORICO_JERARQUIA", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("ASCENSOS", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("DET_GUARDIAS", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("EVALUACIONES_CURSOS", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("CURSOS", "COD_JERARQUIA", "JERARQUIAS", "COD_JERARQUIA"),
            ("FUNCIONARIOS", "COD_CARGO", "CARGOS", "COD_CARGO"),
            ("FUNCIONARIOS_EGRESADOS", "COD_CARGO", "CARGOS", "COD_CARGO"),
            ("HISTORICO_JERARQUIA", "COD_CARGO", "CARGOS", "COD_CARGO"),
            ("FUNCIONARIOS", "CONDICION", "CONDICIONES", "DESCRIPCION"),
            ("FUNCIONARIOS_EGRESADOS", "CONDICION", "CONDICIONES", "DESCRIPCION"),
            ("FUNCIONARIOS", "NIVEL_EDUCATIVO", "TIPO_NIVEL_EDUCATIVO", "COD_NIVEL"),
            ("NIVEL_EDUCATIVO", "NIVEL_EDUCATIVO", "TIPO_NIVEL_EDUCATIVO", "COD_NIVEL"),
            ("ESTACIONES", "COD_ZONA", "ZONAS", "COD_ZONA"),
            ("DIVISIONES", "COD_AREA", "AREAS", "COD_AREA"),
            ("DIAGNOSTICOS", "CodGrupoDiagnostico", "GRUPOSDIAGNOSTICOS", "CodGrupoDiagnostico"),
            ("REPOSOS", "CODDIAGNOSTICO", "DIAGNOSTICOS", "CODDIAGNOSTICO"),
            ("REPOSOS", "IDMEDICO", "MEDICO_TRATANTE", "ID_MEDICO"),
            ("REPOSOS", "COD_INSTITUCION", "CENTROS_MEDICOS", "COD_INSTITUCION"),
            ("DET_GUARDIAS", "ID_ENCABEZADO", "ENC_GUARDIAS", "ID_ENCABEZADO"),
            ("DET_GUARDIAS", "COD_DEPENDENCIA_OPERATIVA", "AREA_DEPENDENCIA_OPERATIVA",
             "COD_AREA_DEPENDENCIA"),
            ("ENC_GUARDIAS", "COD_AREA_DEPENDENCIA", "AREA_DEPENDENCIA_OPERATIVA",
             "COD_AREA_DEPENDENCIA"),
            ("EVALUACIONES_CURSOS", "COD_CURSO", "CURSOS", "COD_CURSO"),
            ("EQUIPOS_PROTECCION_FUNCIONARIOS", "ID_EQUIPO_PROTECCION", "EQUIPOS_PROTECCION", "ID"),
            ("UNIFORMES_FUNCIONARIOS", "ID_UNIFORME", "UNIFORMES", "ID"),
            ("INVENTARIORADIOS", "COD_MARCA", "MARCA_TALLER_RADIO", "COD_MARCA"),
            ("INVENTARIORADIOS", "COD_MODELO", "MODELO_TALLER_RADIO", "COD_MODELO"),
            ("INVENTARIORADIOS", "COD_TIPO_EQUIPO", "EQUIPOS_TALLER_RADIO", "COD_EQUIPO"),
            ("RECURRENCIA", "COD_FALTA", "FALTAS", "COD_FALTAS"),
            ("MEDICO_TRATANTE", "ID_ESPE", "ESPECIALIDADES", "ID_ESPE"),
            ("REGISTRO_BENEFICIO", "BANCO_EMISOR", "BANCOS", "NOMBRE"),
            ("VACACIONES", "COD_AREA", "AREAS", "COD_AREA"),
        ]
        for t, c, tc, cc in cat:
            self.cero(f"{t}.{c} existe en {tc}",
                      f"SELECT 1 FROM [{t}] WHERE [{c}] IS NOT NULL AND "
                      f"CAST([{c}] AS TEXT) NOT IN (SELECT CAST([{cc}] AS TEXT) FROM [{tc}])"
                      if c in ("CONDICION", "BANCO_EMISOR") else
                      f"SELECT 1 FROM [{t}] WHERE [{c}] IS NOT NULL AND "
                      f"CAST(TRIM([{c}]) AS INTEGER) NOT IN (SELECT CAST([{cc}] AS INTEGER) FROM [{tc}])")
        for t in ("FUNCIONARIOS", "FUNCIONARIOS_EGRESADOS"):
            self.cero(f"{t}.ESTATUS (normalizado) existe en ESTATUS",
                      f"SELECT 1 FROM {t} WHERE UPPER(TRIM(ESTATUS)) NOT IN "
                      f"(SELECT DESCRIPCION FROM ESTATUS)")
        self.cero("FUNCIONARIOS.COD_UBICACION apunta a su fila de UBICACION_ADMINISTRATIVA",
                  "SELECT 1 FROM (SELECT CEDULA, COD_UBICACION FROM FUNCIONARIOS UNION ALL "
                  "SELECT CEDULA, COD_UBICACION FROM FUNCIONARIOS_EGRESADOS) f "
                  "LEFT JOIN UBICACION_ADMINISTRATIVA u ON u.ID = f.COD_UBICACION "
                  "WHERE u.ID IS NULL OR u.CEDULA <> f.CEDULA")

    def ubicaciones(self) -> None:
        for t in ("UBICACION_ADMINISTRATIVA", "HISTORICO_UBICACION_ADMINISTRATIVA",
                  "ENC_GUARDIAS", "ASIGNACION_RADIO_INDIVIDUAL"):
            self.cero(f"{t}: zona existe",
                      f"SELECT 1 FROM [{t}] WHERE COD_ZONA IS NULL OR COD_ZONA NOT IN "
                      f"(SELECT COD_ZONA FROM ZONAS)")
            self.cero(f"{t}: estación existe",
                      f"SELECT 1 FROM [{t}] WHERE COD_ESTACION IS NOT NULL AND COD_ESTACION "
                      f"NOT IN (SELECT COD_ESTACION FROM ESTACIONES)")
        for t in ("UBICACION_ADMINISTRATIVA", "HISTORICO_UBICACION_ADMINISTRATIVA"):
            self.cero(f"{t}: área existe",
                      f"SELECT 1 FROM [{t}] WHERE COD_AREA NOT IN (SELECT COD_AREA FROM AREAS)")
            self.cero(f"{t}: división existe y cuelga del área",
                      f"SELECT 1 FROM [{t}] x LEFT JOIN DIVISIONES d ON d.COD_DIVISION = x.COD_DIVISION "
                      f"WHERE d.COD_DIVISION IS NULL OR d.COD_AREA <> x.COD_AREA")
        sql_incoh = ("SELECT COUNT(*) FROM [{t}] x JOIN ESTACIONES e ON e.COD_ESTACION = x.COD_ESTACION "
                     "WHERE e.COD_ZONA <> x.COD_ZONA")
        for t in ("UBICACION_ADMINISTRATIVA", "ENC_GUARDIAS", "ASIGNACION_RADIO_INDIVIDUAL"):
            self.igual(f"{t}: estación pertenece a la zona", sql_incoh.format(t=t), 0)
        self.igual("HISTORICO_UBICACION: zona distinta a la de la estación (anomalía)",
                   sql_incoh.format(t="HISTORICO_UBICACION_ADMINISTRATIVA"),
                   self.anomalia("HISTORICO_UBICACION_ADMINISTRATIVA", "COD_ZONA distinta"))

    def por_zona(self) -> None:
        esperado = self.esp["por_zona_vigente"]
        for tabla_, clave, z1, otras in (("FUNCIONARIOS", "activos", 90, 60),
                                         ("FUNCIONARIOS_EGRESADOS", "egresados", 25, 15)):
            base = (f"SELECT u.COD_ZONA AS z FROM {tabla_} f JOIN UBICACION_ADMINISTRATIVA u "
                    f"ON u.ID = f.COD_UBICACION")
            self.igual(f"{clave} con ubicación vigente en Zona 1",
                       f"SELECT COUNT(*) FROM ({base}) WHERE z = 1", z1)
            self.igual(f"{clave} en otras zonas", f"SELECT COUNT(*) FROM ({base}) WHERE z <> 1", otras)
            for z, n in esperado[clave].items():
                self.igual(f"{clave} en zona {z}", f"SELECT COUNT(*) FROM ({base}) WHERE z = {z}", n)
            # La ubicación vigente debe ser la última fila del histórico.
            self.cero(f"{clave}: ubicación vigente = última fila del histórico",
                      f"SELECT 1 FROM {tabla_} f JOIN UBICACION_ADMINISTRATIVA u ON u.ID = f.COD_UBICACION "
                      f"JOIN HISTORICO_UBICACION_ADMINISTRATIVA h ON h.CEDULA = f.CEDULA AND "
                      f"h.FECHA_DESDE = (SELECT MAX(FECHA_DESDE) FROM HISTORICO_UBICACION_ADMINISTRATIVA "
                      f"WHERE CEDULA = f.CEDULA) WHERE h.COD_ZONA <> u.COD_ZONA "
                      f"OR IFNULL(h.COD_ESTACION, -1) <> IFNULL(u.COD_ESTACION, -1) "
                      f"OR h.COD_AREA <> u.COD_AREA OR h.FECHA_DESDE <> u.FECHA_DESDE")
        self.igual("zonas con expedientes activos", "SELECT COUNT(DISTINCT u.COD_ZONA) FROM "
                   "FUNCIONARIOS f JOIN UBICACION_ADMINISTRATIVA u ON u.ID = f.COD_UBICACION", 10)

    def historicos(self) -> None:
        for t, lo, hi in (("HISTORICO_JERARQUIA", 3, 6),
                          ("HISTORICO_UBICACION_ADMINISTRATIVA", 2, 5),
                          ("CARGA_FAMILIAR", 0, 4)):
            self.cero(f"{t}: entre {lo} y {hi} filas por expediente",
                      f"SELECT x.CEDULA FROM EXP x LEFT JOIN [{t}] h ON h.CEDULA = x.CEDULA "
                      f"GROUP BY x.CEDULA HAVING COUNT(h.CEDULA) < {lo} OR COUNT(h.CEDULA) > {hi}")
        for t in ("FUNCIONARIOS", "FUNCIONARIOS_EGRESADOS"):
            self.cero(f"{t}: jerarquía y cargo = última fila de HISTORICO_JERARQUIA",
                      f"SELECT 1 FROM {t} f JOIN HISTORICO_JERARQUIA h ON h.CEDULA = f.CEDULA AND "
                      f"h.ID = (SELECT ID FROM HISTORICO_JERARQUIA WHERE CEDULA = f.CEDULA "
                      f"ORDER BY FECHA DESC, ID DESC LIMIT 1) "
                      f"WHERE h.COD_JERARQUIA <> f.COD_JERARQUIA OR h.COD_CARGO <> f.COD_CARGO")
        self.cero("HISTORICO_JERARQUIA no desciende de jerarquía",
                  "SELECT 1 FROM HISTORICO_JERARQUIA a JOIN HISTORICO_JERARQUIA b ON a.CEDULA = b.CEDULA "
                  "AND b.FECHA > a.FECHA WHERE b.COD_JERARQUIA < a.COD_JERARQUIA")
        self.cero("cada ASCENSO corresponde a una fila del histórico",
                  "SELECT 1 FROM ASCENSOS a WHERE NOT EXISTS (SELECT 1 FROM HISTORICO_JERARQUIA h "
                  "WHERE h.CEDULA = a.CEDULA AND h.COD_JERARQUIA = a.COD_JERARQUIA "
                  "AND h.FECHA = a.FECHA_ASCENSO)")
        for t, c in (("HISTORICO_JERARQUIA", "FECHA"),
                     ("HISTORICO_UBICACION_ADMINISTRATIVA", "FECHA_DESDE")):
            self.cero(f"{t}: fechas dentro del servicio (>= ingreso, <= egreso o corte)",
                      f"SELECT 1 FROM [{t}] h JOIN EXP x ON x.CEDULA = h.CEDULA "
                      f"WHERE h.{c} < x.FECHA_INGRESO OR h.{c} > IFNULL(x.FECHA_FIN, "
                      f"'{self.esp['fecha_corte']}T00:00:00')")
        self.cero("VACACIONES dentro del servicio",
                  "SELECT 1 FROM VACACIONES v JOIN EXP x ON x.CEDULA = v.Cedula "
                  "WHERE v.FechaDesde < x.FECHA_INGRESO OR v.FechaHasta > IFNULL(x.FECHA_FIN, '2026-12-31')")

    def egresos_y_reingresos(self) -> None:
        reing = ("SELECT CEDULA FROM FUNCIONARIOS WHERE FECHA_EGRESO > '1900-01-01T00:00:00' "
                 "AND FECHA_REINTEGRO > FECHA_EGRESO")
        n_reing = self.valor(f"SELECT COUNT(*) FROM ({reing})")
        self.igual("reingresos activos (>= 10)", f"SELECT {n_reing} >= 10", 1)
        self.igual("reingresos activos = conteo esperado", f"SELECT {n_reing}",
                   self.esp["reingresos"]["activos"])
        self.igual("egresados con dos ciclos", "SELECT COUNT(*) FROM FUNCIONARIOS_EGRESADOS "
                   "WHERE FECHA_REINTEGRO IS NOT NULL", self.esp["reingresos"]["egresados"])
        self.cero("todo egresado tiene DETALLE_EGRESO",
                  "SELECT CEDULA FROM FUNCIONARIOS_EGRESADOS WHERE CEDULA NOT IN "
                  "(SELECT CEDULA FROM DETALLE_EGRESO)")
        self.igual("egresados de dos ciclos con 2 filas en DETALLE_EGRESO",
                   "SELECT COUNT(*) FROM (SELECT CEDULA FROM DETALLE_EGRESO WHERE CEDULA IN "
                   "(SELECT CEDULA FROM FUNCIONARIOS_EGRESADOS) GROUP BY CEDULA HAVING COUNT(*) = 2)",
                   self.esp["reingresos"]["egresados"])
        self.igual("reingresos sin DETALLE_EGRESO (anomalía)",
                   f"SELECT COUNT(*) FROM ({reing}) WHERE CEDULA NOT IN (SELECT CEDULA FROM DETALLE_EGRESO)",
                   self.anomalia("DETALLE_EGRESO", "sin fila"))
        self.cero("activos sin reingreso no tienen DETALLE_EGRESO",
                  f"SELECT CEDULA FROM DETALLE_EGRESO WHERE CEDULA IN (SELECT CEDULA FROM FUNCIONARIOS) "
                  f"AND CEDULA NOT IN ({reing})")
        self.cero("egresados con FECHA_EGRESO posterior al ingreso",
                  "SELECT 1 FROM FUNCIONARIOS_EGRESADOS WHERE FECHA_EGRESO IS NULL "
                  "OR FECHA_EGRESO <= FECHA_INGRESO")
        self.igual("activos con la fecha centinela 1900-01-01 en FECHA_EGRESO (> 0)",
                   "SELECT COUNT(*) > 0 FROM FUNCIONARIOS WHERE FECHA_EGRESO = '1900-01-01T00:00:00'", 1)

    def solapes_y_anomalias(self) -> None:

        self.igual("REPOSOS con FECHA_FIN < FECHA_INICIO (anomalía)",
                   "SELECT COUNT(*) FROM REPOSOS WHERE FECHA_FIN < FECHA_INICIO",
                   self.anomalia("REPOSOS", "FECHA_FIN anterior"))
        esperado = (self.anomalia("REPOSOS", "solapa parcialmente")
                    + self.anomalia("REPOSOS", "duplicado exacto"))
        self.igual("pares de REPOSOS solapados (anomalía: parciales + duplicados)",
                   f"SELECT COUNT(*) FROM REPOSOS a JOIN REPOSOS b ON a.CEDULA = b.CEDULA AND a.ID < b.ID "
                   f"WHERE a.FECHA_FIN >= a.FECHA_INICIO AND b.FECHA_FIN >= b.FECHA_INICIO AND a.FECHA_INICIO <= b.FECHA_FIN "
                   f"AND b.FECHA_INICIO <= a.FECHA_FIN", esperado)
        self.igual("pares de VACACIONES solapadas (anomalía)",
                   "SELECT COUNT(*) FROM VACACIONES a JOIN VACACIONES b ON a.Cedula = b.Cedula "
                   "AND a.Id < b.Id WHERE a.FechaDesde <= b.FechaHasta AND b.FechaDesde <= a.FechaHasta",
                   self.anomalia("VACACIONES", "dos veces"))
        self.igual("estatus escritos con variantes (minúsculas/espacios) presentes",
                   "SELECT COUNT(*) > 0 FROM FUNCIONARIOS WHERE ESTATUS <> UPPER(TRIM(ESTATUS))", 1)
        self.cero("REPOSOS_BD_VIEJA: las copias con ID repiten un reposo canónico",
                  "SELECT 1 FROM REPOSOS_BD_VIEJA v WHERE v.ID IS NOT NULL AND NOT EXISTS "
                  "(SELECT 1 FROM REPOSOS r WHERE r.ID = v.ID AND r.CEDULA = v.CEDULA)")

    def fechas(self) -> None:
        """Fechas de eventos entre 1995 y 2026 o centinela (nacimientos y horas exentos)."""
        exentas = {("NIVEL_EDUCATIVO", "FECHA"), ("NIVEL_EDUCATIVO", "FECHA_RECEPCION")}
        tablas_ = [r[0] for r in self.cn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'")]
        malas = []
        for t in tablas_:
            for col in self.cn.execute(f"PRAGMA table_info([{t}])"):
                nombre = col[1]
                if col[2] != "TEXT" or (t, nombre) in exentas:
                    continue
                u = nombre.upper()
                if "NACIMIENTO" in u or u.startswith("HORA") or u in ("FECHA_PASS",):
                    continue
                n = self.valor(
                    f"SELECT COUNT(*) FROM [{t}] WHERE [{nombre}] GLOB '[0-9][0-9][0-9][0-9]-*T*' "
                    f"AND [{nombre}] <> '{CENTINELA}' AND ([{nombre}] < '1995-01-01' "
                    f"OR [{nombre}] > '2026-12-31T23:59:59')")
                if n:
                    malas.append(f"{t}.{nombre} ({n})")
        if malas:
            self.fallas.append("fechas fuera de 1995–2026: " + ", ".join(malas))
        else:
            self.ok += 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sin-sqlglot", action="store_true", help="omitir análisis sintáctico")
    args = ap.parse_args()
    fallas: list[str] = []
    print("1) Sintaxis T-SQL")
    if not args.sin_sqlglot:
        f = validar_sintaxis()
        fallas += f
        print(f"  {'OK' if not f else f'{len(f)} FALLAS'}")
    print("2) Carga en SQLite en memoria")
    cn = cargar_sqlite()
    print("3) Coherencia")
    esperado = json.loads(CONTEOS.read_text(encoding="utf-8"))
    v = Verificador(cn, esperado)
    v.correr()
    print(f"  {v.ok} comprobaciones OK, {len(v.fallas)} fallas")
    fallas += v.fallas
    print("\nConteo de expedientes por zona (ubicación vigente):")
    for fila in cn.execute(
            "SELECT z.COD_ZONA, z.ZONA, "
            "(SELECT COUNT(*) FROM FUNCIONARIOS f JOIN UBICACION_ADMINISTRATIVA u ON u.ID = f.COD_UBICACION "
            " WHERE u.COD_ZONA = z.COD_ZONA), "
            "(SELECT COUNT(*) FROM FUNCIONARIOS_EGRESADOS f JOIN UBICACION_ADMINISTRATIVA u "
            " ON u.ID = f.COD_UBICACION WHERE u.COD_ZONA = z.COD_ZONA) FROM ZONAS z ORDER BY 1"):
        print(f"  {int(fila[0]):>2} {fila[1]:<22} activos {fila[2]:>3}  egresados {fila[3]:>3}")
    if fallas:
        print("\nFALLAS:")
        for f in fallas:
            print(f"  - {f}")
        return 1
    print("\nTODO OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
