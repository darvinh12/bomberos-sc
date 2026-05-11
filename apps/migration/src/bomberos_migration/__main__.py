"""CLI principal: bomberos-migrate analyze | migrate."""
from __future__ import annotations

import click
from rich.console import Console

from . import __version__
from .analyze import run_analyze
from .config import Config
from .migrate import run as run_migrate

console = Console()


@click.group(invoke_without_command=False)
@click.version_option(__version__)
def cli() -> None:
    """Migración del sistema legacy PERSONALINTEGRADA al nuevo bomberos_caracas."""


@cli.command()
def analyze() -> None:
    """Lista las tablas legacy con conteo y columnas clave."""
    config = Config.from_env()
    run_analyze(config)


@cli.command()
@click.option("--dry-run", is_flag=True, help="No escribe en la BD destino, solo reporta.")
@click.option(
    "--only",
    type=click.Choice(["funcionarios", "reposos", "vacaciones"]),
    multiple=True,
    help="Migrar solo dominios específicos (por defecto: todos).",
)
@click.option(
    "--apply",
    is_flag=True,
    help="Confirma escritura en BD destino. Sin esto se asume --dry-run.",
)
def migrate(dry_run: bool, only: tuple[str, ...], apply: bool) -> None:
    """Migra los datos legacy al esquema nuevo. Ejecuta --dry-run primero."""
    if not apply:
        dry_run = True
        console.print("[yellow]Modo dry-run forzado: pase --apply para escribir.[/]")
    config = Config.from_env()
    run_migrate(config, dry_run=dry_run, only=list(only) if only else None)


if __name__ == "__main__":
    cli()
