"""Escritura en el destino PostgreSQL (``bomberos_caracas``) y destino simulado.

Garantías de :class:`DestinoPg`:

* **Ensayo** (por defecto): todo ocurre dentro de UNA transacción que se
  revierte al final. El motor valida de verdad (EXCLUDE, CHECK, FK, UNIQUE) y
  el reporte es exacto, pero no queda nada escrito.
* **--apply**: cada lote de 500 filas se confirma por separado; una caída a
  mitad deja lo anterior confirmado y la herramienta es re-ejecutable.
* **Idempotencia**: ``personal.funcionarios`` se fusiona por
  ``(nacionalidad, cedula)``. El resto se enlaza con la fila de origen en
  ``migracion.trazas`` (tabla_origen, clave_origen → id_destino): si la fila ya
  fue migrada se actualiza solo si cambió; nunca se duplica.
* **Rechazos del motor**: si un lote falla por una restricción, se reintenta
  fila a fila con SAVEPOINT; las filas rechazadas quedan en
  ``migracion.descartes`` con el nombre de la restricción como motivo.
"""
from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from .reporte import EstadisticaTabla

DDL_MIGRACION = """
CREATE SCHEMA IF NOT EXISTS migracion;
COMMENT ON SCHEMA migracion IS
  'Trazabilidad de la migración desde PERSONALINTEGRADA (herramienta bomberos-migrate).';
CREATE TABLE IF NOT EXISTS migracion.corridas (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    modo        TEXT NOT NULL,
    zona        TEXT,
    parametros  JSONB,
    inicio      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fin         TIMESTAMPTZ,
    reporte     JSONB
);
CREATE TABLE IF NOT EXISTS migracion.trazas (
    tabla_origen   TEXT NOT NULL,
    clave_origen   TEXT NOT NULL,
    tabla_destino  TEXT NOT NULL,
    id_destino     BIGINT NOT NULL,
    legacy_extra   JSONB,
    corrida_id     BIGINT,
    actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tabla_origen, clave_origen, tabla_destino)
);
CREATE INDEX IF NOT EXISTS ix_trazas_destino ON migracion.trazas (tabla_destino, id_destino);
CREATE TABLE IF NOT EXISTS migracion.descartes (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    corrida_id     BIGINT NOT NULL,
    tabla_origen   TEXT NOT NULL,
    clave_origen   TEXT,
    tabla_destino  TEXT,
    motivo         TEXT NOT NULL,
    detalle        TEXT,
    creado_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_descartes_corrida ON migracion.descartes (corrida_id, tabla_origen);
"""

# Columnas de personal.funcionarios que NO se pisan al re-ejecutar: las gobierna
# el disparador de períodos de servicio (sql/03_funciones_vistas.sql).
NO_ACTUALIZAR_FUNCIONARIO = frozenset({"estatus", "fecha_primer_ingreso", "nacionalidad",
                                       "cedula"})


@dataclass
class FilaDestino:
    clave: str
    valores: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)
    id_existente: int | None = None        # vincular (catálogo que casó con una semilla)
    rechazo_previsto: str | None = None    # previsión de transform (solo la usa el simulado)
    trazas_extra: list[tuple[str, str]] = field(default_factory=list)  # (tabla_origen, clave)


def _lotes(items: list, n: int) -> Iterable[list]:
    for i in range(0, len(items), n):
        yield items[i:i + n]


def motivo_error(e: Exception) -> str:
    nombre = type(e).__name__.replace("Error", "")
    restriccion = getattr(e, "constraint_name", None)
    msg = str(e).splitlines()[0][:160]
    if nombre == "ExclusionViolation":
        return f"rechazado por el motor: solapamiento ({restriccion})"
    if restriccion:
        return f"rechazado por el motor: {nombre} ({restriccion})"
    return f"rechazado por el motor: {nombre}: {msg}"


class DestinoPg:
    simulado = False

    def __init__(self, dsn: str, aplicar: bool, batch_size: int = 500) -> None:
        self.dsn = dsn
        self.aplicar = aplicar
        self.batch = batch_size
        self.conn: Any = None
        self._outer: Any = None
        self._tipos: dict[str, dict[str, tuple[str, str]]] = {}
        self._trazas: dict[tuple[str, str], dict[str, int]] = {}
        self.corrida_id: int | None = None

    # -- ciclo de vida ------------------------------------------------------
    async def abrir(self) -> None:
        import asyncpg

        self.conn = await asyncpg.connect(self.dsn)
        await self.conn.set_type_codec(
            "jsonb", schema="pg_catalog",
            encoder=lambda v: json.dumps(v, ensure_ascii=False, default=str),
            decoder=json.loads,
        )
        await self.conn.execute(
            "SELECT set_config('app.usuario_nombre', 'migracion_legacy', false)")
        if not self.aplicar:
            self._outer = self.conn.transaction()
            await self._outer.start()
        await self.conn.execute(DDL_MIGRACION)

    async def terminar(self) -> None:
        if self._outer is not None:
            await self._outer.rollback()
            self._outer = None
        if self.conn is not None:
            await self.conn.close()
            self.conn = None

    def _tx(self) -> Any:
        return self.conn.transaction()

    async def iniciar_corrida(self, modo: str, zona: str | None, parametros: dict) -> int:
        self.corrida_id = await self.conn.fetchval(
            "INSERT INTO migracion.corridas (modo, zona, parametros) VALUES ($1, $2, $3::jsonb)"
            " RETURNING id", modo, zona, parametros)
        return int(self.corrida_id)

    async def cerrar_corrida(self, reporte: dict) -> None:
        await self.conn.execute(
            "UPDATE migracion.corridas SET fin = now(), reporte = $2::jsonb WHERE id = $1",
            self.corrida_id, reporte)

    # -- lectura ------------------------------------------------------------
    async def filas(self, sql: str, *args: Any) -> list[dict]:
        return [dict(r) for r in await self.conn.fetch(sql, *args)]

    async def catalogo(self, tabla: str) -> list[dict]:
        return await self.filas(f"SELECT * FROM {tabla}")  # noqa: S608 — nombre fijo del mapa

    async def trazas(self, tabla_origen: str, tabla_destino: str) -> dict[str, int]:
        k = (tabla_origen, tabla_destino)
        if k not in self._trazas:
            rows = await self.conn.fetch(
                "SELECT clave_origen, id_destino FROM migracion.trazas"
                " WHERE tabla_origen = $1 AND tabla_destino = $2", tabla_origen, tabla_destino)
            self._trazas[k] = {r["clave_origen"]: int(r["id_destino"]) for r in rows}
        return self._trazas[k]

    async def _tipos_de(self, tabla: str) -> dict[str, tuple[str, str]]:
        if tabla not in self._tipos:
            rows = await self.conn.fetch(
                """SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS fmt, t.typname
                     FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
                    WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped""",
                tabla)
            self._tipos[tabla] = {r["attname"]: (r["fmt"], r["typname"]) for r in rows}
        return self._tipos[tabla]

    def _param(self, n: int, tipo: tuple[str, str]) -> str:
        fmt, typname = tipo
        if typname == "citext":
            return f"${n}::text::{fmt}"
        return f"${n}::{fmt}"

    # -- escritura ----------------------------------------------------------
    async def _insertar(self, tabla: str, valores: dict) -> tuple[str, int]:
        tipos = await self._tipos_de(tabla)
        cols = list(valores)
        params = ", ".join(self._param(i + 1, tipos[c]) for i, c in enumerate(cols))
        sql = f"INSERT INTO {tabla} ({', '.join(cols)}) VALUES ({params}) RETURNING id"
        fid = await self.conn.fetchval(sql, *[valores[c] for c in cols])
        return "insertada", int(fid)

    async def _actualizar(self, tabla: str, fid: int, valores: dict) -> tuple[str, int]:
        tipos = await self._tipos_de(tabla)
        cols = list(valores)
        sets, cmp_izq, cmp_der = [], [], []
        for i, c in enumerate(cols):
            p = self._param(i + 2, tipos[c])
            if c == "metadata":
                sets.append(f"metadata = COALESCE(metadata, '{{}}'::jsonb) || {p}")
                cmp_izq.append(f"NOT (COALESCE(metadata, '{{}}'::jsonb) @> {p})")
            else:
                sets.append(f"{c} = {p}")
                cmp_izq.append(c)
                cmp_der.append(p)
        cond = []
        if cmp_der:
            izq = [x for x in cmp_izq if not x.startswith("NOT")]
            cond.append(f"({', '.join(izq)}) IS DISTINCT FROM ({', '.join(cmp_der)})")
        cond += [x for x in cmp_izq if x.startswith("NOT")]
        sql = (f"UPDATE {tabla} SET {', '.join(sets)} WHERE id = $1 AND ("
               f"{' OR '.join(cond) or 'FALSE'}) RETURNING id")
        r = await self.conn.fetchval(sql, fid, *[valores[c] for c in cols])
        return ("actualizada" if r is not None else "sin_cambios"), fid

    async def _upsert_funcionario(self, valores: dict) -> tuple[str, int]:
        tabla = "personal.funcionarios"
        tipos = await self._tipos_de(tabla)
        cols = list(valores)
        params = ", ".join(self._param(i + 1, tipos[c]) for i, c in enumerate(cols))
        upd = [c for c in cols if c not in NO_ACTUALIZAR_FUNCIONARIO]
        sets = [f"{c} = EXCLUDED.{c}" for c in upd if c != "metadata"]
        conds = []
        simples = [c for c in upd if c != "metadata"]
        if simples:
            conds.append(f"({', '.join('f.' + c for c in simples)}) IS DISTINCT FROM "
                         f"({', '.join('EXCLUDED.' + c for c in simples)})")
        if "metadata" in upd:
            sets.append("metadata = COALESCE(f.metadata, '{}'::jsonb) || EXCLUDED.metadata")
            conds.append("NOT (COALESCE(f.metadata, '{}'::jsonb) @> EXCLUDED.metadata)")
        sql = (f"INSERT INTO {tabla} AS f ({', '.join(cols)}) VALUES ({params}) "
               f"ON CONFLICT (nacionalidad, cedula) DO UPDATE SET {', '.join(sets)} "
               f"WHERE {' OR '.join(conds)} RETURNING id, (xmax = 0) AS insertado")
        r = await self.conn.fetchrow(sql, *[valores[c] for c in cols])
        if r is not None:
            return ("insertada" if r["insertado"] else "actualizada"), int(r["id"])
        fid = await self.conn.fetchval(
            "SELECT id FROM personal.funcionarios WHERE nacionalidad = $1 AND cedula = $2",
            valores["nacionalidad"], valores["cedula"])
        return "sin_cambios", int(fid)

    async def _aplicar(self, tabla: str, fila: FilaDestino, trazas: dict[str, int],
                       upsert_funcionario: bool) -> tuple[str, int]:
        if fila.id_existente is not None:
            return "vinculada", fila.id_existente
        assert fila.valores is not None
        if upsert_funcionario:
            return await self._upsert_funcionario(fila.valores)
        if fila.clave in trazas:
            return await self._actualizar(tabla, trazas[fila.clave], fila.valores)
        return await self._insertar(tabla, fila.valores)

    async def cargar(self, tabla_origen: str, tabla_destino: str, filas: list[FilaDestino],
                     est: EstadisticaTabla, upsert_funcionario: bool = False) -> dict[str, int]:
        """Inserta/actualiza ``filas`` y devuelve ``{clave_origen: id_destino}``."""
        import asyncpg

        datos = (asyncpg.exceptions.IntegrityConstraintViolationError,
                 asyncpg.exceptions.DataError)
        trazas = await self.trazas(tabla_origen, tabla_destino)
        ids: dict[str, int] = {}
        for lote in _lotes(filas, self.batch):
            resultados: list[tuple[FilaDestino, str, int | str]] = []
            try:
                async with self._tx():
                    for f in lote:
                        estado, fid = await self._aplicar(tabla_destino, f, trazas,
                                                          upsert_funcionario)
                        resultados.append((f, estado, fid))
                    await self._registrar(tabla_origen, tabla_destino, resultados)
            except datos:
                resultados = []
                async with self._tx():
                    for f in lote:
                        try:
                            async with self.conn.transaction():
                                estado, fid = await self._aplicar(tabla_destino, f, trazas,
                                                                  upsert_funcionario)
                            resultados.append((f, estado, fid))
                        except datos as e:
                            resultados.append((f, "descartada", motivo_error(e)))
                    await self._registrar(tabla_origen, tabla_destino, resultados)
            for f, estado, fid in resultados:
                if estado == "descartada":
                    est.descartar(f.clave, str(fid))
                    continue
                assert isinstance(fid, int)
                ids[f.clave] = fid
                trazas[f.clave] = fid
                if estado == "insertada":
                    est.insertadas += 1
                elif estado == "actualizada":
                    est.actualizadas += 1
                elif estado == "vinculada":
                    est.vinculadas += 1
                else:
                    est.sin_cambios += 1
        return ids

    async def _registrar(self, tabla_origen: str, tabla_destino: str,
                         resultados: list[tuple[FilaDestino, str, Any]]) -> None:
        trazas, descartes = [], []
        for f, estado, fid in resultados:
            if estado == "descartada":
                descartes.append((self.corrida_id, tabla_origen, f.clave, tabla_destino,
                                  str(fid), None))
                continue
            trazas.append((tabla_origen, f.clave, tabla_destino, fid, f.extra or None,
                           self.corrida_id))
            for to, cl in f.trazas_extra:
                trazas.append((to, cl, tabla_destino, fid, None, self.corrida_id))
        if trazas:
            await self.conn.executemany(
                """INSERT INTO migracion.trazas
                     (tabla_origen, clave_origen, tabla_destino, id_destino, legacy_extra,
                      corrida_id)
                   VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                   ON CONFLICT (tabla_origen, clave_origen, tabla_destino) DO UPDATE
                     SET id_destino = EXCLUDED.id_destino, legacy_extra = EXCLUDED.legacy_extra,
                         corrida_id = EXCLUDED.corrida_id, actualizado_at = now()""",
                trazas)
        if descartes:
            await self.registrar_descartes(descartes)

    async def registrar_descartes(self, descartes: list[tuple]) -> None:
        """(corrida_id, tabla_origen, clave, tabla_destino, motivo, detalle)."""
        if descartes:
            await self.conn.executemany(
                """INSERT INTO migracion.descartes
                     (corrida_id, tabla_origen, clave_origen, tabla_destino, motivo, detalle)
                   VALUES ($1, $2, $3, $4, $5, $6)""",
                [(self.corrida_id, *d[1:]) for d in descartes])

    async def crear_catalogo(self, tabla: str, filas: list[dict]) -> None:
        """Inserta entradas nuevas de catálogo (ON CONFLICT (codigo) DO NOTHING)."""
        tipos = await self._tipos_de(tabla)
        for v in filas:
            cols = list(v)
            params = ", ".join(self._param(i + 1, tipos[c]) for i, c in enumerate(cols))
            conflicto = " ON CONFLICT (codigo) DO NOTHING" if "codigo" in cols else ""
            await self.conn.execute(
                f"INSERT INTO {tabla} ({', '.join(cols)}) VALUES ({params}){conflicto}",
                *[v[c] for c in cols])


class DestinoNulo:
    """Destino simulado en memoria (``--solo-origen`` y pruebas unitarias).

    Asigna ids correlativos, respeta las previsiones de rechazo de
    ``transform`` y fusiona funcionarios por (nacionalidad, cedula). No
    reproduce restricciones del motor que no se hayan previsto.
    """

    simulado = True

    def __init__(self, catalogos: dict[str, list[dict]] | None = None) -> None:
        self.catalogos = {k: [dict(x) for x in v] for k, v in (catalogos or {}).items()}
        self.tablas: dict[str, list[dict]] = {}
        self.trazas_mem: dict[tuple[str, str], dict[str, int]] = {}
        self.descartes: list[tuple] = []
        self._seq = 0
        self._func: dict[tuple[str, int], int] = {}
        self.corrida_id = 0

    async def abrir(self) -> None:
        return None

    async def terminar(self) -> None:
        return None

    async def iniciar_corrida(self, modo: str, zona: str | None, parametros: dict) -> int:
        return 0

    async def cerrar_corrida(self, reporte: dict) -> None:
        return None

    async def filas(self, sql: str, *args: Any) -> list[dict]:
        return []

    async def catalogo(self, tabla: str) -> list[dict]:
        return list(self.catalogos.get(tabla, []))

    async def trazas(self, tabla_origen: str, tabla_destino: str) -> dict[str, int]:
        return self.trazas_mem.setdefault((tabla_origen, tabla_destino), {})

    def _nuevo_id(self) -> int:
        self._seq += 1
        return self._seq

    async def cargar(self, tabla_origen: str, tabla_destino: str, filas: list[FilaDestino],
                     est: EstadisticaTabla, upsert_funcionario: bool = False) -> dict[str, int]:
        trazas = await self.trazas(tabla_origen, tabla_destino)
        ids: dict[str, int] = {}
        for f in filas:
            if f.rechazo_previsto:
                est.descartar(f.clave, f.rechazo_previsto)
                self.descartes.append((0, tabla_origen, f.clave, tabla_destino,
                                       f.rechazo_previsto, None))
                continue
            if f.id_existente is not None:
                ids[f.clave] = f.id_existente
                est.vinculadas += 1
            elif upsert_funcionario:
                assert f.valores is not None
                k = (f.valores["nacionalidad"], f.valores["cedula"])
                if k in self._func:
                    ids[f.clave] = self._func[k]
                    est.sin_cambios += 1
                else:
                    ids[f.clave] = self._func[k] = self._nuevo_id()
                    est.insertadas += 1
                    self.tablas.setdefault(tabla_destino, []).append(
                        {"id": ids[f.clave], **f.valores})
            elif f.clave in trazas:
                ids[f.clave] = trazas[f.clave]
                est.sin_cambios += 1
            else:
                ids[f.clave] = self._nuevo_id()
                est.insertadas += 1
                self.tablas.setdefault(tabla_destino, []).append(
                    {"id": ids[f.clave], **(f.valores or {})})
            trazas[f.clave] = ids[f.clave]
            for to, cl in f.trazas_extra:
                self.trazas_mem.setdefault((to, tabla_destino), {})[cl] = ids[f.clave]
        return ids

    async def registrar_descartes(self, descartes: list[tuple]) -> None:
        self.descartes.extend(descartes)

    async def crear_catalogo(self, tabla: str, filas: list[dict]) -> None:
        cat = self.catalogos.setdefault(tabla, [])
        codigos = {c.get("codigo") for c in cat}
        for v in filas:
            if v.get("codigo") is not None and v.get("codigo") in codigos:
                continue
            cat.append({"id": self._nuevo_id(), **v})
            codigos.add(v.get("codigo"))
