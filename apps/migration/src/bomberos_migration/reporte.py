"""Reporte de la carga: filas leídas/insertadas/actualizadas/descartadas por tabla."""
from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

MAX_EJEMPLOS = 5


@dataclass
class EstadisticaTabla:
    origen: str
    destino: str
    leidas: int = 0          # filas leídas del origen
    en_alcance: int = 0      # tras la acotación por zona
    insertadas: int = 0
    actualizadas: int = 0
    sin_cambios: int = 0     # ya migradas en una corrida anterior y sin diferencias
    vinculadas: int = 0      # catálogos que casaron con una semilla del destino
    descartes: Counter = field(default_factory=Counter)
    ejemplos: dict[str, list[str]] = field(default_factory=dict)
    avisos: Counter = field(default_factory=Counter)
    previstos_solape: int = 0  # solapamientos detectados antes de enviar al motor
    columnas_extra: list[str] = field(default_factory=list)
    columnas_no_previstas: set[str] = field(default_factory=set)

    @property
    def descartadas(self) -> int:
        return sum(self.descartes.values())

    def descartar(self, clave: Any, motivo: str) -> None:
        self.descartes[motivo] += 1
        ej = self.ejemplos.setdefault(motivo, [])
        if len(ej) < MAX_EJEMPLOS:
            ej.append(str(clave))

    def avisar(self, aviso: str) -> None:
        # Se agrupan por el texto antes de los valores concretos para no explotar.
        self.avisos[aviso[:120]] += 1

    def como_dict(self) -> dict:
        return {
            "origen": self.origen,
            "destino": self.destino,
            "leidas": self.leidas,
            "en_alcance": self.en_alcance,
            "insertadas": self.insertadas,
            "actualizadas": self.actualizadas,
            "sin_cambios": self.sin_cambios,
            "vinculadas": self.vinculadas,
            "descartadas": self.descartadas,
            "descartes_por_motivo": dict(self.descartes),
            "ejemplos_de_descarte": self.ejemplos,
            "previstos_por_solape": self.previstos_solape,
            "avisos": dict(self.avisos.most_common(30)),
            "columnas_en_legacy_extra": self.columnas_extra,
            "columnas_no_previstas": sorted(self.columnas_no_previstas),
        }


@dataclass
class ReporteMigracion:
    modo: str
    zona: str | None
    inicio: datetime = field(default_factory=datetime.now)
    fin: datetime | None = None
    corrida_id: int | None = None
    tablas: dict[str, EstadisticaTabla] = field(default_factory=dict)
    excluidas: list[dict] = field(default_factory=list)
    no_mapeadas: list[dict] = field(default_factory=list)
    ausentes: list[str] = field(default_factory=list)
    alcance: dict = field(default_factory=dict)
    catalogos_creados: dict[str, list[str]] = field(default_factory=dict)
    errores: list[str] = field(default_factory=list)

    def tabla(self, origen: str, destino: str, columnas_extra: list[str] | None = None
              ) -> EstadisticaTabla:
        clave = f"{origen} → {destino}"
        if clave not in self.tablas:
            self.tablas[clave] = EstadisticaTabla(origen, destino,
                                                  columnas_extra=columnas_extra or [])
        return self.tablas[clave]

    def como_dict(self) -> dict:
        return {
            "modo": self.modo,
            "zona": self.zona,
            "corrida_id": self.corrida_id,
            "inicio": self.inicio.isoformat(timespec="seconds"),
            "fin": self.fin.isoformat(timespec="seconds") if self.fin else None,
            "alcance": self.alcance,
            "tablas": [t.como_dict() for t in self.tablas.values()],
            "tablas_excluidas": self.excluidas,
            "tablas_canonicas_no_mapeadas": self.no_mapeadas,
            "tablas_mapeadas_ausentes_en_origen": self.ausentes,
            "catalogos_creados": self.catalogos_creados,
            "errores": self.errores,
        }

    def guardar(self, carpeta: Path, prefijo: str = "reporte_carga") -> Path:
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / f"{prefijo}_{self.inicio:%Y%m%d_%H%M%S}.json"
        ruta.write_text(json.dumps(self.como_dict(), ensure_ascii=False, indent=2, default=str),
                        encoding="utf-8")
        return ruta

    def imprimir(self, console: Console) -> None:
        titulo = {
            "ensayo": "ENSAYO (todo se revirtió: no quedó nada escrito)",
            "solo-origen": "ENSAYO SOLO ORIGEN (sin BD destino)",
            "apply": "APLICADO",
        }.get(self.modo, self.modo)
        console.print(f"\n[bold green]== Reporte de migración — {titulo} ==[/]")
        if self.zona:
            a = self.alcance
            console.print(
                f"Zona {self.zona}: {a.get('expedientes_en_alcance', 0):,} expedientes en "
                f"alcance; {a.get('expedientes_otras_zonas', 0):,} de otras zonas; "
                f"{a.get('expedientes_sin_ubicacion', 0):,} sin ubicación determinable."
            )
        t = Table(title="Filas por tabla", show_lines=False)
        for col in ("Origen → destino", "Leídas", "Alcance", "Insert.", "Actual.",
                    "Sin camb.", "Vinc.", "Descart."):
            t.add_column(col, justify="left" if col.startswith("Origen") else "right")
        for e in self.tablas.values():
            t.add_row(f"{e.origen} → {e.destino}", f"{e.leidas:,}", f"{e.en_alcance:,}",
                      f"{e.insertadas:,}", f"{e.actualizadas:,}", f"{e.sin_cambios:,}",
                      f"{e.vinculadas:,}", f"{e.descartadas:,}")
        console.print(t)
        hay = False
        for e in self.tablas.values():
            if not e.descartes:
                continue
            if not hay:
                console.print("\n[yellow]Descartes por motivo:[/]")
                hay = True
            for motivo, n in e.descartes.most_common():
                ej = ", ".join(e.ejemplos.get(motivo, [])[:3])
                console.print(f"  · {e.origen}: {n:,} — {motivo} (p. ej. {ej})")
        nop = {e.origen: e.columnas_no_previstas for e in self.tablas.values()
               if e.columnas_no_previstas}
        if nop:
            console.print("\n[yellow]Columnas NO previstas en el mapa (guardadas en "
                          "legacy_extra):[/]")
            for tab, cols in nop.items():
                console.print(f"  · {tab}: {', '.join(sorted(cols))}")
        if self.catalogos_creados:
            console.print("\n[cyan]Entradas de catálogo creadas (no casaron con la semilla):[/]")
            for cat, lst in self.catalogos_creados.items():
                console.print(f"  · {cat}: {len(lst)} ({', '.join(lst[:6])}"
                              f"{'…' if len(lst) > 6 else ''})")
        if self.excluidas:
            total = sum(x["filas"] for x in self.excluidas)
            console.print(f"\n[magenta]Tablas descartadas por regla: {len(self.excluidas)} "
                          f"({total:,} filas)[/]")
            for x in self.excluidas:
                console.print(f"  · {x['tabla']} ({x['filas']:,} filas) — {x['regla']}")
        if self.no_mapeadas:
            con_filas = [x for x in self.no_mapeadas if x["filas"]]
            console.print(f"\n[magenta]Tablas canónicas aún sin mapeo: {len(self.no_mapeadas)} "
                          f"({len(con_filas)} con datos, "
                          f"{sum(x['filas'] for x in con_filas):,} filas) — ver JSON[/]")
        if self.ausentes:
            console.print(f"\n[red]Tablas del mapa ausentes en el origen:[/] "
                          f"{', '.join(self.ausentes)}")
        for err in self.errores:
            console.print(f"[red]ERROR:[/] {err}")
