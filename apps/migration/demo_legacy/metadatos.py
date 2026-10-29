"""Lectura de los metadatos REALES de PERSONALINTEGRADA y lista de tablas del demo.

Fuente única de verdad: ``apps/migration/legacy_inspection_20260504_174805.json``
(generado en el servidor del Cuerpo de Bomberos el 04-05-2026, sin datos).
Todo nombre de tabla, columna, tipo, longitud, nulabilidad y clave primaria que
usan ``generar_ddl.py`` y ``generar_datos.py`` sale de aquí; nada se inventa.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DIR_DEMO = Path(__file__).resolve().parent
RUTA_JSON = DIR_DEMO.parent / "legacy_inspection_20260504_174805.json"

# -----------------------------------------------------------------------------
# Tablas incluidas en el demo.
#   "canonica"  -> la migración debe LEERLA (dominio a migrar o catálogo).
#   "descartar" -> la migración debe IGNORARLA (copias, auditoría vieja,
#                  importaciones de Excel, tablas del sistema). Se cargan con
#                  datos para comprobar que la herramienta no las toca.
# El orden es el de creación/carga (catálogos primero).
# -----------------------------------------------------------------------------
TABLAS: list[tuple[str, str, str]] = [
    # (tabla, rol, uso)
    ("ZONAS", "canonica", "Catálogo de zonas (10 en el real)"),
    ("ESTACIONES", "canonica", "Catálogo de estaciones (29 en el real)"),
    ("AREAS", "canonica", "Catálogo de áreas"),
    ("DIVISIONES", "canonica", "Catálogo de divisiones (cuelgan de un área)"),
    ("DEPENDENCIAS", "canonica", "Catálogo de dependencias"),
    ("AREA_DEPENDENCIA_OPERATIVA", "canonica", "Catálogo área/dependencia operativa (guardias)"),
    ("JERARQUIAS", "canonica", "Catálogo de jerarquías (27 en el real)"),
    ("CARGOS", "canonica", "Catálogo de cargos"),
    ("CONDICIONES", "canonica", "Catálogo de condiciones (11 en el real)"),
    ("ESTATUS", "canonica", "Catálogo de estatus (8 en el real)"),
    ("BANCOS", "canonica", "Catálogo de bancos (vacío en el real)"),
    ("TIPO_NIVEL_EDUCATIVO", "canonica", "Catálogo de niveles educativos (6 en el real)"),
    ("GRUPOSDIAGNOSTICOS", "canonica", "Catálogo de grupos de diagnóstico"),
    ("DIAGNOSTICOS", "canonica", "Catálogo de diagnósticos"),
    ("ESPECIALIDADES", "canonica", "Catálogo de especialidades médicas"),
    ("MEDICO_TRATANTE", "canonica", "Catálogo de médicos tratantes"),
    ("CENTROS_MEDICOS", "canonica", "Catálogo de centros médicos"),
    ("FALTAS", "canonica", "Catálogo de faltas (1 sola fila en el real; no es la fuente de faltas)"),
    ("CURSOS", "canonica", "Catálogo de cursos"),
    ("MARCA_TALLER_RADIO", "canonica", "Catálogo de marcas de radio"),
    ("MODELO_TALLER_RADIO", "canonica", "Catálogo de modelos de radio"),
    ("EQUIPOS_TALLER_RADIO", "canonica", "Catálogo de tipos de equipo de radio"),
    ("EQUIPOS_PROTECCION", "canonica", "Inventario de equipos de protección"),
    ("UNIFORMES", "canonica", "Inventario de uniformes"),
    ("FUNCIONARIOS", "canonica", "Expedientes activos"),
    ("FUNCIONARIOS_EGRESADOS", "canonica", "Expedientes egresados (UNION con FUNCIONARIOS)"),
    ("DETALLE_EGRESO", "canonica", "Detalle de cada egreso"),
    ("UBICACION_ADMINISTRATIVA", "canonica", "Ubicación vigente por expediente"),
    ("HISTORICO_UBICACION_ADMINISTRATIVA", "canonica", "Histórico de ubicaciones"),
    ("HISTORICO_JERARQUIA", "canonica", "Histórico de jerarquías"),
    ("ASCENSOS", "canonica", "Ascensos"),
    ("CARGA_FAMILIAR", "canonica", "Carga familiar"),
    ("NIVEL_EDUCATIVO", "canonica", "Estudios por expediente (no es catálogo)"),
    ("REPOSOS", "canonica", "Reposos médicos (la canónica)"),
    ("Diagnostico_Consulta", "canonica", "Consultas médicas"),
    ("VACACIONES", "canonica", "Vacaciones"),
    ("RECURRENCIA", "canonica", "Faltas disciplinarias -> ops.faltas"),
    ("ENC_GUARDIAS", "canonica", "Encabezado de guardias"),
    ("DET_GUARDIAS", "canonica", "Detalle de guardias"),
    ("EVALUACIONES", "canonica", "Evaluaciones de desempeño"),
    ("EVALUACIONES_CURSOS", "canonica", "Cursos realizados / notas"),
    ("CONDECORACIONES", "canonica", "Condecoraciones"),
    ("JUBILADOS", "canonica", "Jubilados"),
    ("EQUIPOS_PROTECCION_FUNCIONARIOS", "canonica", "Equipos de protección por funcionario"),
    ("UNIFORMES_FUNCIONARIOS", "canonica", "Uniformes por funcionario"),
    ("INVENTARIORADIOS", "canonica", "Inventario de radios"),
    ("ASIGNACION_RADIO_INDIVIDUAL", "canonica", "Asignación de radios (vacía en el real)"),
    ("BENEFICIO", "canonica", "Beneficio (la canónica)"),
    ("REGISTRO_BENEFICIO", "canonica", "Registro de beneficios"),
    ("ACERVO_HISTORICO_GENERAL", "canonica", "Acervo documental"),
    # --- Tablas que la migración debe DESCARTAR -------------------------------
    ("ACCESO", "descartar", "Usuarios viejos con clave en texto plano"),
    ("AUDIT_FUNCIONARIOS", "descartar", "Auditoría legacy"),
    ("AUDIT_HISTORICO_JERARQUIA", "descartar", "Auditoría legacy"),
    ("FUNCIONARIOS_VIEJA", "descartar", "Copia vieja (_VIEJA)"),
    ("HISTORICO_JERARQUIA_OLD", "descartar", "Copia vieja (_OLD)"),
    ("REPOSOS_BD_VIEJA", "descartar", "Copia vieja de reposos (_VIEJA)"),
    ("REPOSOS(ORIGINAL)", "descartar", "Copia vieja de reposos ((ORIGINAL))"),
    ("BENEFICIO_ENE22", "descartar", "Instantánea mensual de BENEFICIO"),
    ("Hoja1$", "descartar", "Importación puntual desde Excel"),
    ("dtproperties", "descartar", "Tabla de sistema (diagramas de SQL Server 2000)"),
]

# Hoja1$ es una importación de Excel cuya fila de encabezado quedó como nombre
# de columna: en el real, dos columnas llevan el NOMBRE y la CÉDULA de una
# persona real. Por la regla de «cero datos personales» se sustituyen por
# equivalentes ficticios que conservan el patrón (espacio final, nombre
# numérico) y el tipo exacto. Es la ÚNICA desviación de nombres frente al JSON.
RENOMBRES_ANONIMIZADOS: dict[tuple[str, int], str] = {
    ("Hoja1$", 1): "FICTICIO DEMO NOMBRE APELLIDO ",
    ("Hoja1$", 2): "90999999",
}


@dataclass(frozen=True)
class Columna:
    tabla: str
    nombre: str
    posicion: int
    tipo: str
    longitud: int | None  # -1 = (max)
    precision: int | None
    escala: int | None
    nula: bool
    defecto: str | None

    def tipo_sql(self) -> str:
        """Tipo T-SQL exacto tal como lo reporta INFORMATION_SCHEMA."""
        t = self.tipo.lower()
        if t in ("nvarchar", "varchar", "nchar", "char", "varbinary", "binary"):
            return f"{t}(max)" if self.longitud == -1 else f"{t}({self.longitud})"
        if t in ("numeric", "decimal"):
            return f"{t}({self.precision}, {self.escala})"
        # image/text/ntext reportan longitud 2^31-1: en el DDL no llevan longitud.
        return t


@dataclass
class Tabla:
    nombre: str
    filas_reales: int
    columnas: list[Columna]
    pk: list[str]
    pk_nombre: str | None

    def columna(self, nombre: str) -> Columna:
        for c in self.columnas:
            if c.nombre == nombre:
                return c
        raise KeyError(f"La columna {nombre!r} NO existe en {self.nombre} según el JSON real")


@lru_cache(maxsize=1)
def cargar_json() -> dict:
    with RUTA_JSON.open(encoding="utf-8-sig") as fh:
        return json.load(fh)


@lru_cache(maxsize=None)
def tabla(nombre: str) -> Tabla:
    """Devuelve la definición real de una tabla base (no vista)."""
    d = cargar_json()
    reales = {t["table_name"]: t for t in d["tables"]}
    if nombre not in reales:
        raise KeyError(f"La tabla {nombre!r} no existe en el JSON real")
    cols = []
    for c in d["columns"]:
        if c["TABLE_NAME"] != nombre:
            continue
        nom = RENOMBRES_ANONIMIZADOS.get((nombre, c["ORDINAL_POSITION"]), c["COLUMN_NAME"])
        cols.append(
            Columna(
                tabla=nombre,
                nombre=nom,
                posicion=c["ORDINAL_POSITION"],
                tipo=c["DATA_TYPE"],
                longitud=c["CHARACTER_MAXIMUM_LENGTH"],
                precision=c["NUMERIC_PRECISION"],
                escala=c["NUMERIC_SCALE"],
                nula=c["IS_NULLABLE"] == "YES",
                defecto=c["COLUMN_DEFAULT"],
            )
        )
    cols.sort(key=lambda c: c.posicion)
    pks = sorted(
        (p for p in d["primary_keys"] if p["table_name"] == nombre),
        key=lambda p: p["key_ordinal"],
    )
    return Tabla(
        nombre=nombre,
        filas_reales=reales[nombre]["row_count"],
        columnas=cols,
        pk=[p["column_name"] for p in pks],
        pk_nombre=pks[0]["pk_name"] if pks else None,
    )


def nombres_tablas() -> list[str]:
    return [t for t, _, _ in TABLAS]


def rol(nombre: str) -> str:
    for t, r, _ in TABLAS:
        if t == nombre:
            return r
    raise KeyError(nombre)


def q(ident: str) -> str:
    """Cita un identificador T-SQL con corchetes (SQLite también los acepta)."""
    return "[" + ident.replace("]", "]]") + "]"
