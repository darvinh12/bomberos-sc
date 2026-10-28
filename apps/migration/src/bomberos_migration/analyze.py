"""Análisis del origen: inventario de tablas clasificado y columnas reales vs el mapa.

Solo lee metadatos y cuenta filas (``sys.tables``/``sys.partitions`` y
``SELECT TOP 0``); no extrae datos personales.
"""
from __future__ import annotations

from rich.console import Console
from rich.table import Table

from .config import Config
from .mapping import MAPEOS, TABLAS_APOYO, motivo_exclusion
from .texto import norm_col

console = Console()


def clasificar(tablas: list[tuple[str, int]]) -> dict[str, list[dict]]:
    """Separa las tablas del origen en mapeadas, excluidas (con regla) y pendientes."""
    mapeadas = {norm_col(t) for t in MAPEOS} | {norm_col(t) for t in TABLAS_APOYO}
    out: dict[str, list[dict]] = {"mapeadas": [], "excluidas": [], "pendientes": []}
    for nombre, filas in tablas:
        regla = motivo_exclusion(nombre)
        if norm_col(nombre) in mapeadas:
            out["mapeadas"].append({"tabla": nombre, "filas": filas})
        elif regla:
            out["excluidas"].append({"tabla": nombre, "filas": filas, "regla": regla})
        else:
            out["pendientes"].append({"tabla": nombre, "filas": filas})
    return out


def run_analyze(config: Config) -> None:
    import pyodbc

    from .origen import OrigenSqlServer

    origen = OrigenSqlServer(config.legacy_dsn)
    try:
        tablas = origen.listar_tablas()
        cls = clasificar(tablas)
        for clave, titulo in (("mapeadas", "Tablas mapeadas"),
                              ("excluidas", "Tablas excluidas por regla"),
                              ("pendientes", "Tablas canónicas aún sin mapeo")):
            t = Table(title=f"{titulo} ({len(cls[clave])}, "
                            f"{sum(x['filas'] for x in cls[clave]):,} filas)")
            t.add_column("Tabla", style="cyan")
            t.add_column("Filas", justify="right")
            if clave == "excluidas":
                t.add_column("Regla")
            for x in sorted(cls[clave], key=lambda x: -x["filas"]):
                fila = [x["tabla"], f"{x['filas']:,}"]
                if clave == "excluidas":
                    fila.append(x["regla"])
                t.add_row(*fila)
            console.print(t)

        # Columnas reales vs mapa (detecta columnas nuevas o renombradas)
        cur = origen._cn.cursor()
        for tabla, m in MAPEOS.items():
            if not origen.existe(tabla):
                console.print(f"[red]Falta en el origen:[/] {tabla}")
                continue
            try:
                cur.execute(f"SELECT TOP 0 * FROM dbo.[{origen._nombre_real(tabla)}]")
            except pyodbc.Error as e:  # pragma: no cover - depende del servidor
                console.print(f"[red]No se pudo leer {tabla}: {e}[/]")
                continue
            reales = {norm_col(c[0]) for c in cur.description}
            nuevas = sorted(reales - set(m.columnas))
            faltan = sorted(set(m.columnas) - reales)
            estado = "[green]OK[/]" if not (nuevas or faltan) else "[yellow]REVISAR[/]"
            console.print(f"{estado} {tabla}: {len(reales)} columnas"
                          + (f"; no previstas (irán a legacy_extra): {', '.join(nuevas)}"
                             if nuevas else "")
                          + (f"; del mapa ausentes: {', '.join(faltan)}" if faltan else ""))
        cur.close()
    finally:
        origen.cerrar()
