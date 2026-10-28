"""Lectura del origen PERSONALINTEGRADA (SQL Server) en modo SOLO LECTURA.

Las filas se entregan como ``dict`` con las claves normalizadas por
:func:`norm_col`, de modo que el código no depende de mayúsculas, tildes ni
espacios en los nombres reales (``Fecha Ultimo Ascenso``, ``DESEMPEÑO``…).
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol

from .texto import norm_col


class Origen(Protocol):
    def listar_tablas(self) -> list[tuple[str, int]]: ...

    def existe(self, tabla: str) -> bool: ...

    def leer(self, tabla: str) -> Iterator[dict[str, Any]]: ...

    def cerrar(self) -> None: ...


class OrigenSqlServer:
    """Origen real vía pyodbc. Nunca escribe: la conexión se abre ``readonly``."""

    def __init__(self, dsn: str, fetch_size: int = 1000) -> None:
        import pyodbc  # import diferido: las pruebas no necesitan el controlador

        self._cn = pyodbc.connect(dsn, readonly=True)
        self._cn.setdecoding(pyodbc.SQL_CHAR, encoding="latin-1")
        self._cn.setdecoding(pyodbc.SQL_WCHAR, encoding="utf-16-le")
        self._cn.setencoding(encoding="utf-8")
        self._fetch = fetch_size
        self._tablas: dict[str, str] | None = None

    def listar_tablas(self) -> list[tuple[str, int]]:
        cur = self._cn.cursor()
        cur.execute(
            """
            SELECT t.name AS tabla, SUM(p.rows) AS filas
            FROM sys.tables t
            JOIN sys.schemas s ON s.schema_id = t.schema_id AND s.name = 'dbo'
            JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
            GROUP BY t.name
            ORDER BY t.name
            """
        )
        out = [(r.tabla, int(r.filas or 0)) for r in cur.fetchall()]
        cur.close()
        self._tablas = {norm_col(n): n for n, _ in out}
        return out

    def _nombre_real(self, tabla: str) -> str | None:
        if self._tablas is None:
            self.listar_tablas()
        assert self._tablas is not None
        return self._tablas.get(norm_col(tabla))

    def existe(self, tabla: str) -> bool:
        return self._nombre_real(tabla) is not None

    def leer(self, tabla: str) -> Iterator[dict[str, Any]]:
        real = self._nombre_real(tabla)
        if real is None:
            return
        cur = self._cn.cursor()
        cur.execute(f"SELECT * FROM dbo.[{real.replace(']', ']]')}]")
        cols = [norm_col(c[0]) for c in cur.description]
        while True:
            filas = cur.fetchmany(self._fetch)
            if not filas:
                break
            for r in filas:
                yield dict(zip(cols, r, strict=True))
        cur.close()

    def cerrar(self) -> None:
        self._cn.close()


_ISO_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?)?$")
_INSERT = re.compile(r"INSERT\s+INTO\s+(?:dbo\.)?\[([^\]]+)\]\s*\(([^)]*)\)\s*VALUES\s*",
                     re.IGNORECASE)


def _valores_tsql(texto: str, i: int) -> tuple[list[list[Any]], int]:
    """Lee ``(v, v, …), (…);`` desde ``i``. Literales: N'…', '…', NULL, números."""
    filas: list[list[Any]] = []
    n = len(texto)
    while i < n:
        while i < n and texto[i] in " \t\r\n,":
            i += 1
        if i >= n or texto[i] == ";" or texto[i] != "(":
            break
        i += 1
        fila: list[Any] = []
        while True:
            while texto[i] in " \t\r\n":
                i += 1
            c = texto[i]
            if c in "Nn" and texto[i + 1] == "'" or c == "'":
                unicode = c != "'"
                i += 2 if unicode else 1
                partes = []
                while True:
                    j = texto.index("'", i)
                    partes.append(texto[i:j])
                    if j + 1 < n and texto[j + 1] == "'":
                        partes.append("'")
                        i = j + 2
                        continue
                    i = j + 1
                    break
                s = "".join(partes)
                if not unicode and _ISO_FECHA.match(s):
                    fila.append(datetime.fromisoformat(s))
                else:
                    fila.append(s)
            else:
                j = i
                while texto[j] not in ",)":
                    j += 1
                tok = texto[i:j].strip()
                i = j
                if tok.upper() == "NULL":
                    fila.append(None)
                else:
                    fila.append(Decimal(tok) if any(x in tok for x in ".eE") else int(tok))
            while texto[i] in " \t\r\n":
                i += 1
            if texto[i] == ",":
                i += 1
                continue
            if texto[i] == ")":
                i += 1
                break
        filas.append(fila)
    return filas, i


class OrigenScriptTsql:
    """Origen leído de un script T-SQL de INSERTs (p. ej. ``demo_legacy/datos_legacy.sql``).

    Permite ensayar la migración completa del conjunto demostrativo sin
    instalar SQL Server. Solo entiende ``INSERT INTO dbo.[T] ([c], …) VALUES (…)``
    con literales ``N'…'``, ``'…'``, ``NULL`` y números; las cadenas sin ``N``
    con forma ISO (``'2012-12-24T00:00:00'``) se leen como ``datetime``, igual
    que las columnas ``datetime`` de SQL Server.
    """

    def __init__(self, ruta: str | Path) -> None:
        texto = Path(ruta).read_text(encoding="utf-8-sig")
        self._t: dict[str, tuple[str, list[dict[str, Any]]]] = {}
        for m in _INSERT.finditer(texto):
            tabla = m.group(1)
            cols = [norm_col(c.strip().strip("[]")) for c in m.group(2).split(",")]
            filas, _ = _valores_tsql(texto, m.end())
            _, destino = self._t.setdefault(norm_col(tabla), (tabla, []))
            destino.extend(dict(zip(cols, f, strict=True)) for f in filas)

    def listar_tablas(self) -> list[tuple[str, int]]:
        return sorted((nombre, len(filas)) for nombre, filas in self._t.values())

    def existe(self, tabla: str) -> bool:
        return norm_col(tabla) in self._t

    def leer(self, tabla: str) -> Iterator[dict[str, Any]]:
        _, filas = self._t.get(norm_col(tabla), (tabla, []))
        yield from (dict(f) for f in filas)

    def cerrar(self) -> None:
        return None


class OrigenMemoria:
    """Origen en memoria para pruebas: ``{"TABLA": [ {col: valor}, ... ]}``."""

    def __init__(self, tablas: dict[str, list[dict[str, Any]]],
                 filas_declaradas: dict[str, int] | None = None) -> None:
        self._t = {norm_col(k): (k, v) for k, v in tablas.items()}
        self._extra = filas_declaradas or {}

    def listar_tablas(self) -> list[tuple[str, int]]:
        out = [(nombre, len(filas)) for nombre, filas in self._t.values()]
        out += [(n, c) for n, c in self._extra.items() if norm_col(n) not in self._t]
        return sorted(out)

    def existe(self, tabla: str) -> bool:
        return norm_col(tabla) in self._t

    def leer(self, tabla: str) -> Iterator[dict[str, Any]]:
        _, filas = self._t.get(norm_col(tabla), (tabla, []))
        for f in filas:
            yield {norm_col(k): v for k, v in f.items()}

    def cerrar(self) -> None:
        return None
