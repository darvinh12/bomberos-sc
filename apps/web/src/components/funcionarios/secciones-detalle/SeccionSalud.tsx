"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface Reposo {
  id: number;
  funcionario_id: number;
  tipo_reposo_id: number | null;
  diagnostico_libre: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number | null;
  anulado: boolean;
}

interface Lesion {
  id: number;
  funcionario_id: number;
  fecha: string;
  descripcion: string;
  gravedad: string;
  requirio_hospitalizacion: boolean;
}

interface EvalFisica {
  id: number;
  funcionario_id: number;
  fecha: string;
  resultado: string;
  peso_kg: number | null;
  talla_m: number | null;
  imc: number | null;
  observaciones: string | null;
}

interface Datos {
  reposos: Reposo[];
  lesiones: Lesion[];
  evaluaciones: EvalFisica[];
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
  nivelAcceso: NivelAcceso;
}

const PAGE_SIZE = "100";

export default function SeccionSalud({ funcionarioId, nivelAcceso }: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeCrear = nivelAcceso === "edit";
  const soloLectura = nivelAcceso === "view";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rep, les, ef] = await Promise.all([
          api
            .get<Page<Reposo>>(
              `/salud/reposos?funcionario_id=${funcionarioId}&page_size=${PAGE_SIZE}`,
            )
            .catch(() => ({ items: [] }) as Page<Reposo>),
          api
            .get<Page<Lesion>>(
              `/salud/lesiones?funcionario_id=${funcionarioId}&page_size=${PAGE_SIZE}`,
            )
            .catch(() => ({ items: [] }) as Page<Lesion>),
          api
            .get<Page<EvalFisica>>(
              `/salud/evaluacion-fisica?funcionario_id=${funcionarioId}&page_size=${PAGE_SIZE}`,
            )
            .catch(() => ({ items: [] }) as Page<EvalFisica>),
        ]);
        if (!alive) return;
        setData({
          reposos: rep.items ?? [],
          lesiones: les.items ?? [],
          evaluaciones: ef.items ?? [],
        });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId]);

  if (error) {
    return (
      <SectionShell title="Salud" soloLectura={soloLectura}>
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell title="Salud" soloLectura={soloLectura}>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Salud"
      description="Reposos, lesiones y evaluaciones físicas del funcionario."
      soloLectura={soloLectura}
      actions={
        puedeCrear ? (
          <Link
            href={`/salud/reposos/nuevo?funcionario_id=${funcionarioId}`}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
          >
            + Nuevo reposo
          </Link>
        ) : null
      }
    >
      <Card title="Reposos">
        {data.reposos.length === 0 ? (
          <EmptyState title="Sin reposos registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Inicio</th>
                  <th scope="col" className="text-left p-2 font-medium">Fin</th>
                  <th scope="col" className="text-right p-2 font-medium">Días</th>
                  <th scope="col" className="text-left p-2 font-medium">Diagnóstico</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.reposos.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">{formatDate(r.fecha_inicio)}</td>
                    <td className="p-2">{formatDate(r.fecha_fin)}</td>
                    <td className="p-2 text-right tabular-nums">{r.dias ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{r.diagnostico_libre ?? "—"}</td>
                    <td className="p-2">
                      <span className={r.anulado ? "badge badge-danger" : "badge badge-neutral"}>
                        {r.anulado ? "ANULADO" : "VIGENTE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Lesiones">
        {data.lesiones.length === 0 ? (
          <EmptyState title="Sin lesiones registradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Descripción</th>
                  <th scope="col" className="text-left p-2 font-medium">Gravedad</th>
                  <th scope="col" className="text-left p-2 font-medium">Hospitalización</th>
                </tr>
              </thead>
              <tbody>
                {data.lesiones.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-2">{formatDate(l.fecha)}</td>
                    <td className="p-2 text-muted-foreground">{l.descripcion}</td>
                    <td className="p-2">
                      <span
                        className={
                          l.gravedad === "GRAVE"
                            ? "badge badge-danger"
                            : l.gravedad === "MODERADA"
                              ? "badge badge-warning"
                              : "badge badge-neutral"
                        }
                      >
                        {l.gravedad}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {l.requirio_hospitalizacion ? "Sí" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Evaluaciones físicas">
        {data.evaluaciones.length === 0 ? (
          <EmptyState title="Sin evaluaciones registradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Resultado</th>
                  <th scope="col" className="text-right p-2 font-medium">Peso (kg)</th>
                  <th scope="col" className="text-right p-2 font-medium">Talla (m)</th>
                  <th scope="col" className="text-right p-2 font-medium">IMC</th>
                  <th scope="col" className="text-left p-2 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {data.evaluaciones.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-2">{formatDate(e.fecha)}</td>
                    <td className="p-2">
                      <span
                        className={
                          e.resultado === "APTO"
                            ? "badge badge-success"
                            : e.resultado === "NO_APTO"
                              ? "badge badge-danger"
                              : "badge badge-warning"
                        }
                      >
                        {e.resultado.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums">{e.peso_kg ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{e.talla_m ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{e.imc?.toFixed(1) ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{e.observaciones ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </SectionShell>
  );
}
