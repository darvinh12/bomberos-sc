"""Helpers de I/O: lectura streaming desde SQL Server, escritura en lote a Postgres."""
from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from typing import Any

import asyncpg
import pyodbc


@contextmanager
def legacy_conn(dsn: str) -> Iterator[pyodbc.Connection]:
    cn = pyodbc.connect(dsn, readonly=True)
    cn.setdecoding(pyodbc.SQL_CHAR, encoding="latin-1")
    cn.setdecoding(pyodbc.SQL_WCHAR, encoding="utf-16-le")
    cn.setencoding(encoding="utf-8")
    try:
        yield cn
    finally:
        cn.close()


def stream_table(
    cn: pyodbc.Connection, sql: str, params: tuple = (), fetch_size: int = 1000
) -> Iterator[dict[str, Any]]:
    """Lee filas de SQL Server en streaming sin cargar todo en memoria."""
    cur = cn.cursor()
    cur.execute(sql, params)
    cols = [c[0] for c in cur.description]
    while True:
        rows = cur.fetchmany(fetch_size)
        if not rows:
            break
        for r in rows:
            yield dict(zip(cols, r, strict=False))
    cur.close()


async def target_pool(dsn: str, max_size: int = 4) -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=max_size)


async def upsert_batch(
    pool: asyncpg.Pool,
    table: str,
    columns: list[str],
    rows: list[tuple],
    conflict: list[str],
    update_cols: list[str] | None = None,
) -> int:
    """Inserción ON CONFLICT DO UPDATE."""
    if not rows:
        return 0
    cols_sql = ", ".join(columns)
    placeholders = ", ".join(
        "(" + ", ".join(f"${j + i * len(columns) + 1}" for j in range(len(columns))) + ")"
        for i in range(len(rows))
    )
    update_cols = update_cols or [c for c in columns if c not in conflict]
    if update_cols:
        upd = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
        on_conflict = f"ON CONFLICT ({', '.join(conflict)}) DO UPDATE SET {upd}"
    else:
        on_conflict = f"ON CONFLICT ({', '.join(conflict)}) DO NOTHING"
    sql = f"INSERT INTO {table} ({cols_sql}) VALUES {placeholders} {on_conflict}"
    flat: list[Any] = []
    for r in rows:
        flat.extend(r)
    async with pool.acquire() as cn:
        await cn.execute(sql, *flat)
    return len(rows)


async def list_legacy_tables(cn: pyodbc.Connection) -> list[tuple[str, int]]:
    """Lista tablas y conteo aproximado."""
    sql = """
    SELECT t.name AS table_name,
           SUM(p.rows) AS total_rows
    FROM sys.tables t
    INNER JOIN sys.partitions p ON p.object_id = t.object_id
    WHERE p.index_id IN (0, 1)
    GROUP BY t.name
    ORDER BY t.name
    """
    cur = cn.cursor()
    cur.execute(sql)
    out = [(r.table_name, int(r.total_rows or 0)) for r in cur.fetchall()]
    cur.close()
    return out


async def aiter_chunks(items: Iterator[dict], size: int) -> AsyncIterator[list[dict]]:
    buf: list[dict] = []
    for item in items:
        buf.append(item)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf
