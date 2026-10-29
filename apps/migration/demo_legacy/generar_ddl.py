"""Genera ``ddl_legacy.sql``: CREATE TABLE T-SQL de un subconjunto de PERSONALINTEGRADA.

Columnas, tipos, longitudes, NULL/NOT NULL, DEFAULT y claves primarias salen
tal cual del JSON de inspección real (ver ``metadatos.py``). El JSON no reporta
IDENTITY ni índices secundarios, así que no se declaran: los generadores de
datos insertan los identificadores de forma explícita. Tampoco hay claves
foráneas en el real (0 declaradas), y aquí tampoco.

Uso:
    python generar_ddl.py            # escribe ddl_legacy.sql junto a este archivo
"""
from __future__ import annotations

import sys
from pathlib import Path

from metadatos import DIR_DEMO, TABLAS, q, tabla

SALIDA = DIR_DEMO / "ddl_legacy.sql"


def ddl_tabla(nombre: str) -> str:
    t = tabla(nombre)
    lineas = []
    for c in t.columnas:
        linea = f"    {q(c.nombre)} {c.tipo_sql()}"
        linea += " NULL" if c.nula else " NOT NULL"
        if c.defecto:
            # El JSON trae el default con sus paréntesis: (newid()), ((0)), (0)
            linea += f" DEFAULT {c.defecto}"
        lineas.append(linea)
    if t.pk:
        cols_pk = ", ".join(q(c) for c in t.pk)
        lineas.append(f"    CONSTRAINT {q(t.pk_nombre)} PRIMARY KEY ({cols_pk})")
    cuerpo = ",\n".join(lineas)
    return (
        f"IF OBJECT_ID(N'dbo.{q(nombre)}', N'U') IS NOT NULL DROP TABLE dbo.{q(nombre)};\n"
        f"GO\n"
        f"CREATE TABLE dbo.{q(nombre)} (\n{cuerpo}\n);\nGO\n"
    )


def generar() -> str:
    partes = [
        "-- =============================================================================",
        "-- PERSONALINTEGRADA_DEMO — DDL de un subconjunto de la BD legacy del Cuerpo de",
        "-- Bomberos (SQL Server). GENERADO por generar_ddl.py; no editar a mano.",
        "-- Fuente: apps/migration/legacy_inspection_20260504_174805.json (metadatos reales).",
        f"-- Tablas: {len(TABLAS)} (canónicas + tablas que la migración debe descartar).",
        "-- =============================================================================",
        "SET NOCOUNT ON;",
        "GO",
        "",
    ]
    for nombre, rol, uso in TABLAS:
        t = tabla(nombre)
        partes.append(
            f"-- {nombre}: {len(t.columnas)} columnas, {t.filas_reales} filas en el real"
            f" — rol: {rol.upper()} — {uso}"
        )
        partes.append(ddl_tabla(nombre))
    return "\n".join(partes)


def main() -> int:
    sql = generar()
    SALIDA.write_text(sql, encoding="utf-8", newline="\n")
    print(f"Escrito {SALIDA} ({len(TABLAS)} tablas, {len(sql.encode('utf-8')):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
