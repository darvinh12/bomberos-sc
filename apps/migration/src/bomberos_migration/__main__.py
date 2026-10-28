"""CLI: bomberos-migrate analyze | mapping | migrate | validate."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import click
from rich.console import Console

from . import __version__
from .config import Config
from .mapping import opciones_only

# Las consolas de Windows en cp1252 no tienen «→» ni «∪»: se reemplazan en vez de abortar.
for _flujo in (sys.stdout, sys.stderr):
    if hasattr(_flujo, "reconfigure"):
        _flujo.reconfigure(errors="replace")

console = Console()


@click.group(invoke_without_command=False)
@click.version_option(__version__)
def cli() -> None:
    """Migración del sistema anterior PERSONALINTEGRADA al nuevo bomberos_caracas."""


@cli.command()
def analyze() -> None:
    """Inventario del origen: tablas mapeadas, excluidas y pendientes; columnas vs mapa."""
    from .analyze import run_analyze

    run_analyze(Config.from_env())


@cli.command()
@click.option("--yaml", "como_yaml", is_flag=True, help="Imprime el mapa en YAML.")
@click.option("--json", "como_json", is_flag=True, help="Imprime el mapa en JSON.")
def mapping(como_yaml: bool, como_json: bool) -> None:
    """Muestra el mapa origen -> destino (tabla y columna)."""
    from .mapping import MAPEOS, como_dict

    if como_yaml:
        import yaml

        click.echo(yaml.safe_dump(como_dict(), allow_unicode=True, sort_keys=False, width=100))
        return
    if como_json:
        click.echo(json.dumps(como_dict(), ensure_ascii=False, indent=2))
        return
    for m in MAPEOS.values():
        console.print(f"[bold cyan]{m.origen}[/] → [bold]{m.destino}[/] "
                      f"(fase {m.fase}, legacy_extra en {m.extra_en})")
        for col, dest in m.columnas.items():
            console.print(f"    {col:<32} {dest}")


@cli.command()
@click.option("--apply", "aplicar", is_flag=True,
              help="Escribe de verdad (confirma lote a lote). Sin esto es un ENSAYO: se "
                   "ejecuta todo dentro de una transacción que se revierte al final.")
@click.option("--zona", default=None,
              help="Acota a los expedientes cuya ubicación vigente está en esta zona: código "
                   "del origen (1), nombre (\"ZONA 1\") o código destino (Z1).")
@click.option("--only", multiple=True, type=click.Choice(opciones_only()),
              help="Solo estas fases o unidades (repetible). Por defecto: todas.")
@click.option("--solo-origen", is_flag=True,
              help="Ensayo sin BD destino: lee y transforma, simula la carga en memoria.")
@click.option("--reportes", type=click.Path(path_type=Path), default=Path("."),
              help="Carpeta donde se guarda reporte_carga_<fecha>.json.")
@click.option("--origen-sql", type=click.Path(exists=True, dir_okay=False, path_type=Path),
              default=None, help="Lee el origen de un script T-SQL de INSERTs (p. ej. "
                                 "demo_legacy/datos_legacy.sql) en vez de SQL Server.")
@click.option("--dry-run", is_flag=True, hidden=True,
              help="Compatibilidad: el ensayo ya es el modo por defecto.")
def migrate(aplicar: bool, zona: str | None, only: tuple[str, ...], solo_origen: bool,
            reportes: Path, origen_sql: Path | None, dry_run: bool) -> None:
    """Migra los datos del origen al destino. Por defecto es un ENSAYO."""
    from .migrate import Opciones, run

    if aplicar and (dry_run or solo_origen):
        raise click.UsageError("--apply no se combina con --dry-run ni --solo-origen.")
    config = Config.from_env()
    if not aplicar:
        console.print("[yellow]ENSAYO: no quedará nada escrito (pase --apply para escribir).[/]")
    else:
        console.print(f"[red]APLICANDO sobre {config.target_dsn_seguro}[/]")
    op = Opciones(aplicar=aplicar, solo_origen=solo_origen, zona=zona,
                  only=list(only) or None, batch=config.batch_size, carpeta_reporte=reportes)
    run(config, op, origen=_origen(origen_sql))


def _origen(origen_sql: Path | None):  # noqa: ANN202
    if origen_sql is None:
        return None
    from .origen import OrigenScriptTsql

    console.print(f"[cyan]Origen: script T-SQL {origen_sql}[/]")
    return OrigenScriptTsql(origen_sql)


@cli.command()
@click.option("--zona", default=None,
              help="Zona a validar (por defecto la de la última corrida aplicada).")
@click.option("--muestras", default=5, show_default=True, help="Expedientes a comparar.")
@click.option("--semilla", default=2026, show_default=True, help="Semilla del muestreo.")
@click.option("--reportes", type=click.Path(path_type=Path), default=Path("."),
              help="Carpeta donde se guarda reporte_migracion_<fecha>.json.")
@click.option("--origen-sql", type=click.Path(exists=True, dir_okay=False, path_type=Path),
              default=None, help="Origen desde un script T-SQL de INSERTs (como en migrate).")
def validate(zona: str | None, muestras: int, semilla: int, reportes: Path,
             origen_sql: Path | None) -> None:
    """Validaciones post-carga (solo lectura): conteos, integridad, solapes, antigüedad."""
    from .validate import run

    res = run(Config.from_env(), zona, muestras, semilla, reportes, origen=_origen(origen_sql))
    raise SystemExit(0 if res["veredicto"]["aprobado"] else 1)


if __name__ == "__main__":
    cli()
