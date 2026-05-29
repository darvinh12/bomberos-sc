"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { SectionShell, Card, EmptyState } from "./_shared";

interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface ProteccionAsignacion {
  id: number;
  inventario_id: number;
  funcionario_id: number;
  fecha_entrega: string;
  estado_entrega: string | null;
  observaciones: string | null;
  fecha_devolucion: string | null;
  estado_devolucion: string | null;
  devuelto: boolean;
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  tipo?: string | null;
}

interface RadioAsignada {
  id: number;
  serial: string;
  placa_inv: string | null;
  frecuencia: string | null;
  canal: string | null;
  estatus: string;
  funcionario_id?: number | null;
  marca?: string | null;
  modelo?: string | null;
  fecha_asignacion?: string | null;
  fecha_adquisicion?: string | null;
}

interface Datos {
  proteccion: ProteccionAsignacion[];
  radios: RadioAsignada[];
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

export default function SeccionEquipos({ funcionarioId }: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [prot, rad] = await Promise.all([
          api
            .get<Page<ProteccionAsignacion>>(
              `/equipo/proteccion/asignaciones?funcionario_id=${funcionarioId}&page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<ProteccionAsignacion>),
          // Si el backend real no soporta funcionario_id en radios, filtramos en cliente.
          api
            .get<Page<RadioAsignada>>(
              `/equipo/radios?funcionario_id=${funcionarioId}&page_size=200`,
            )
            .catch(() => ({ items: [] }) as Page<RadioAsignada>),
        ]);
        if (!alive) return;
        const radiosItems = rad.items ?? [];
        const radiosFiltradas = radiosItems.some(
          (r) => r.funcionario_id !== undefined && r.funcionario_id !== null,
        )
          ? radiosItems.filter(
              (r) => r.funcionario_id === undefined || r.funcionario_id === funcionarioId,
            )
          : radiosItems.filter((r) => r.estatus === "ASIGNADO");
        setData({
          proteccion: prot.items ?? [],
          radios: radiosFiltradas,
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
      <SectionShell title="Equipos">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell title="Equipos">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Equipos"
      description="Equipos de protección personal y radios asignadas al funcionario."
    >
      <Card title="Equipo de protección asignado">
        {data.proteccion.length === 0 ? (
          <EmptyState title="Sin equipos de protección asignados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Tipo</th>
                  <th scope="col" className="text-left p-2 font-medium">Marca / Modelo</th>
                  <th scope="col" className="text-left p-2 font-medium">N° serie</th>
                  <th scope="col" className="text-left p-2 font-medium">Entrega</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                  <th scope="col" className="text-left p-2 font-medium">Devolución</th>
                </tr>
              </thead>
              <tbody>
                {data.proteccion.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 font-medium">{p.tipo ?? `Inv #${p.inventario_id}`}</td>
                    <td className="p-2 text-muted-foreground">
                      {[p.marca, p.modelo].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-2 font-mono text-xs">{p.numero_serie ?? "—"}</td>
                    <td className="p-2">{formatDate(p.fecha_entrega)}</td>
                    <td className="p-2">
                      <span
                        className={p.devuelto ? "badge badge-neutral" : "badge badge-info"}
                      >
                        {p.devuelto ? "DEVUELTO" : "EN USO"}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {p.fecha_devolucion ? formatDate(p.fecha_devolucion) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Radios asignadas">
        {data.radios.length === 0 ? (
          <EmptyState title="Sin radios asignadas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Marca / Modelo</th>
                  <th scope="col" className="text-left p-2 font-medium">N° serial</th>
                  <th scope="col" className="text-left p-2 font-medium">Placa inv.</th>
                  <th scope="col" className="text-left p-2 font-medium">Frecuencia</th>
                  <th scope="col" className="text-left p-2 font-medium">Canal</th>
                  <th scope="col" className="text-left p-2 font-medium">Asignación</th>
                </tr>
              </thead>
              <tbody>
                {data.radios.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 font-medium">
                      {[r.marca, r.modelo].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-2 font-mono text-xs">{r.serial}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">
                      {r.placa_inv ?? "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">{r.frecuencia ?? "—"}</td>
                    <td className="p-2 tabular-nums">{r.canal ?? "—"}</td>
                    <td className="p-2">
                      {formatDate(r.fecha_asignacion ?? r.fecha_adquisicion)}
                    </td>
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
