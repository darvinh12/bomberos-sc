"""Análisis del esquema legacy: conteos por tabla, columnas, ejemplos."""
from __future__ import annotations

from rich.console import Console
from rich.table import Table

from .config import Config
from .io import legacy_conn

console = Console()


def run_analyze(config: Config) -> None:
    """Lista tablas legacy con conteo y reporta columnas de las tablas clave."""
    with legacy_conn(config.legacy_dsn) as cn:
        cur = cn.cursor()
        cur.execute(
            """
            SELECT t.name AS tabla,
                   SUM(p.rows) AS filas
            FROM sys.tables t
            INNER JOIN sys.partitions p ON p.object_id = t.object_id
            WHERE p.index_id IN (0, 1)
            GROUP BY t.name
            ORDER BY filas DESC, t.name
            """
        )
        tables = [(r.tabla, int(r.filas or 0)) for r in cur.fetchall()]

        t = Table(title=f"Tablas legacy ({len(tables)})", show_lines=False)
        t.add_column("Tabla", style="cyan")
        t.add_column("Filas", justify="right")
        for name, rows in tables[:80]:
            t.add_row(name, f"{rows:,}")
        console.print(t)

        for tname in ("FUNCIONARIOS", "REPOSOS", "VACACIONES", "DETALLE_EGRESO"):
            try:
                cur.execute(
                    """
                    SELECT TOP 0 * FROM dbo.[%s]
                    """
                    % tname
                )
                cols = [c[0] for c in cur.description]
                console.print(f"[bold]Columnas de {tname}:[/] {', '.join(cols)}")
            except Exception as e:
                console.print(f"[red]No se pudo leer {tname}: {e}[/]")
        cur.close()
