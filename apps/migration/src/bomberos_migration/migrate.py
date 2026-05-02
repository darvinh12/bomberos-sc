"""Migración por dominio. Soporta --dry-run y --apply."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

import asyncpg
from rich.console import Console
from rich.progress import Progress

from .config import Config
from .io import legacy_conn, stream_table, target_pool, upsert_batch
from .transform import (
    funcionario_from_legacy,
    reconstruir_periodos_servicio,
    reposo_from_legacy,
    vacaciones_from_legacy,
)

console = Console()


@dataclass
class MigrationReport:
    funcionarios_leidos: int = 0
    funcionarios_insertados: int = 0
    funcionarios_descartados: int = 0
    periodos_servicio: int = 0
    reposos: int = 0
    vacaciones: int = 0
    descartes_detalle: list[str] = field(default_factory=list)


async def _build_funcionario_lookup(pool: asyncpg.Pool) -> dict[tuple[str, int], int]:
    async with pool.acquire() as cn:
        rows = await cn.fetch(
            "SELECT id, nacionalidad, cedula FROM personal.funcionarios"
        )
    return {(r["nacionalidad"], int(r["cedula"])): int(r["id"]) for r in rows}


async def migrate_funcionarios(
    legacy_cn, pool: asyncpg.Pool, batch_size: int, dry_run: bool, report: MigrationReport
) -> None:
    """Migra FUNCIONARIOS y reconstruye periodos_servicio."""
    sql = """
    SELECT CEDULA, APELLIDOS, NOMBRES, FECHA_NACIMIENTO, SEXO, TIPO_PERSONAL,
           NUMERO_EMPLEADO, FECHA_INGRESO, FECHA_EGRESO, FECHA_REINTEGRO,
           ESTATUS, TELEFONO_MOVIL, CORREO, PROFESION, IUTB, EGRESADO_UNES
    FROM dbo.FUNCIONARIOS
    WHERE CEDULA IS NOT NULL
    """
    cols = [
        "nacionalidad", "cedula", "apellidos", "nombres",
        "fecha_nacimiento", "sexo", "tipo_personal", "numero_empleado",
        "fecha_primer_ingreso", "estatus",
        "telefono_movil", "correo", "profesion", "iutb", "egresado_unes",
        "pre_jubilado",
    ]
    batch: list[tuple] = []
    legacy_for_periodos: list[tuple[tuple[str, int], dict]] = []

    with Progress() as bar:
        task = bar.add_task("[cyan]FUNCIONARIOS", total=None)
        for raw in stream_table(legacy_cn, sql):
            report.funcionarios_leidos += 1
            mapped = funcionario_from_legacy(raw)
            if mapped is None:
                report.funcionarios_descartados += 1
                if len(report.descartes_detalle) < 20:
                    report.descartes_detalle.append(f"FUNC {raw.get('CEDULA')}: cedula invalida")
                continue
            row = tuple(mapped[c] for c in cols)
            batch.append(row)
            legacy_for_periodos.append(((mapped["nacionalidad"], mapped["cedula"]), raw))
            if len(batch) >= batch_size:
                if not dry_run:
                    inserted = await upsert_batch(
                        pool, "personal.funcionarios", cols, batch,
                        conflict=["nacionalidad", "cedula"],
                    )
                    report.funcionarios_insertados += inserted
                bar.update(task, advance=len(batch))
                batch.clear()
        if batch:
            if not dry_run:
                inserted = await upsert_batch(
                    pool, "personal.funcionarios", cols, batch,
                    conflict=["nacionalidad", "cedula"],
                )
                report.funcionarios_insertados += inserted
            bar.update(task, advance=len(batch))

    # Reconstruir periodos_servicio
    if not dry_run and legacy_for_periodos:
        lookup = await _build_funcionario_lookup(pool)
        async with pool.acquire() as cn:
            for ced, raw in legacy_for_periodos:
                fid = lookup.get(ced)
                if fid is None:
                    continue
                periodos = reconstruir_periodos_servicio(raw)
                for p in periodos:
                    try:
                        await cn.execute(
                            """
                            INSERT INTO personal.periodos_servicio
                              (funcionario_id, fecha_ingreso, fecha_egreso, tipo_egreso)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT DO NOTHING
                            """,
                            fid, p["fecha_ingreso"], p["fecha_egreso"], p["tipo_egreso"],
                        )
                        report.periodos_servicio += 1
                    except asyncpg.PostgresError as e:
                        report.descartes_detalle.append(
                            f"PERIODO func={fid}: {type(e).__name__}"
                        )


async def migrate_reposos(
    legacy_cn, pool: asyncpg.Pool, batch_size: int, dry_run: bool, report: MigrationReport
) -> None:
    """Migra REPOSOS aplicando el lookup de funcionario_id por cédula."""
    if dry_run:
        return
    lookup = await _build_funcionario_lookup(pool)
    sql = """
    SELECT CEDULA, FECHA_INICIO, FECHA_FIN, DIAGNOSTICO, CERTIFICADO, OBSERVACIONES
    FROM dbo.REPOSOS
    WHERE CEDULA IS NOT NULL AND FECHA_INICIO IS NOT NULL
    """
    cols = [
        "funcionario_id", "fecha_inicio", "fecha_fin",
        "diagnostico_libre", "documento_url", "observaciones",
    ]
    batch: list[tuple] = []
    with Progress() as bar:
        task = bar.add_task("[cyan]REPOSOS", total=None)
        for raw in stream_table(legacy_cn, sql):
            mapped = reposo_from_legacy(raw, lookup)
            if mapped is None:
                continue
            batch.append(tuple(mapped[c] for c in cols))
            if len(batch) >= batch_size:
                inserted = await upsert_batch(
                    pool, "salud.reposos", cols, batch,
                    conflict=["funcionario_id", "fecha_inicio"],
                    update_cols=["fecha_fin", "diagnostico_libre", "documento_url", "observaciones"],
                )
                report.reposos += inserted
                bar.update(task, advance=len(batch))
                batch.clear()
        if batch:
            inserted = await upsert_batch(
                pool, "salud.reposos", cols, batch,
                conflict=["funcionario_id", "fecha_inicio"],
                update_cols=["fecha_fin", "diagnostico_libre", "documento_url", "observaciones"],
            )
            report.reposos += inserted
            bar.update(task, advance=len(batch))


async def migrate_vacaciones(
    legacy_cn, pool: asyncpg.Pool, batch_size: int, dry_run: bool, report: MigrationReport
) -> None:
    if dry_run:
        return
    lookup = await _build_funcionario_lookup(pool)
    sql = """
    SELECT CEDULA, FECHA_INICIO, FECHA_FIN, DIAS_HABILES, FRACCIONADA,
           AUTORIZADO, OBSERVACIONES
    FROM dbo.VACACIONES
    WHERE CEDULA IS NOT NULL AND FECHA_INICIO IS NOT NULL
    """
    cols = [
        "funcionario_id", "periodo_anio", "fecha_inicio", "fecha_fin",
        "dias_habiles", "fraccionada", "autorizado", "observaciones",
    ]
    batch: list[tuple] = []
    with Progress() as bar:
        task = bar.add_task("[cyan]VACACIONES", total=None)
        for raw in stream_table(legacy_cn, sql):
            mapped = vacaciones_from_legacy(raw, lookup)
            if mapped is None:
                continue
            batch.append(tuple(mapped[c] for c in cols))
            if len(batch) >= batch_size:
                inserted = await upsert_batch(
                    pool, "ops.vacaciones", cols, batch,
                    conflict=["funcionario_id", "fecha_inicio"],
                )
                report.vacaciones += inserted
                bar.update(task, advance=len(batch))
                batch.clear()
        if batch:
            inserted = await upsert_batch(
                pool, "ops.vacaciones", cols, batch,
                conflict=["funcionario_id", "fecha_inicio"],
            )
            report.vacaciones += inserted
            bar.update(task, advance=len(batch))


async def run_migration(config: Config, dry_run: bool, only: list[str] | None = None) -> None:
    """Punto de entrada: orquesta todos los dominios."""
    report = MigrationReport()
    only = only or ["funcionarios", "reposos", "vacaciones"]
    pool = await target_pool(config.target_dsn)
    try:
        with legacy_conn(config.legacy_dsn) as legacy_cn:
            console.print(
                f"[bold]Iniciando migración[/] (dry_run={dry_run}, batch={config.batch_size})"
            )
            if "funcionarios" in only:
                await migrate_funcionarios(
                    legacy_cn, pool, config.batch_size, dry_run, report
                )
            if "reposos" in only:
                await migrate_reposos(legacy_cn, pool, config.batch_size, dry_run, report)
            if "vacaciones" in only:
                await migrate_vacaciones(
                    legacy_cn, pool, config.batch_size, dry_run, report
                )
    finally:
        await pool.close()

    _print_report(report, dry_run)


def _print_report(report: MigrationReport, dry_run: bool) -> None:
    suffix = " (DRY-RUN, no se escribió en la BD destino)" if dry_run else ""
    console.print(f"\n[bold green]== Reporte de migración =={suffix}[/]")
    console.print(f"  Funcionarios leídos:      {report.funcionarios_leidos:,}")
    console.print(f"  Funcionarios insertados:  {report.funcionarios_insertados:,}")
    console.print(f"  Funcionarios descartados: {report.funcionarios_descartados:,}")
    console.print(f"  Periodos de servicio:     {report.periodos_servicio:,}")
    console.print(f"  Reposos:                  {report.reposos:,}")
    console.print(f"  Vacaciones:               {report.vacaciones:,}")
    if report.descartes_detalle:
        console.print("\n[yellow]Primeros descartes:[/]")
        for d in report.descartes_detalle[:10]:
            console.print(f"  · {d}")


def run(config: Config, dry_run: bool, only: list[str] | None) -> None:
    asyncio.run(run_migration(config, dry_run=dry_run, only=only))
