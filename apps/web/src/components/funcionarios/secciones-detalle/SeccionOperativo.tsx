"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { SectionShell, Card, EmptyState } from "./_shared";

interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface Guardia {
  id: number;
  fecha: string;
  estacion_id: number;
  estacion?: string | null;
  seccion: string | null;
  turno: string;
  hora_inicio: string;
  hora_fin: string;
  cerrada: boolean;
}

interface Vacacion {
  id: number;
  funcionario_id: number;
  periodo_anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_calendario: number | null;
  dias_habiles: number | null;
  bono_pagado: boolean;
  monto_bono: number | null;
  autorizado: boolean;
  estado?: string;
}

interface Permiso {
  id: number;
  funcionario_id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  horas: number | null;
  motivo: string | null;
  autorizado: boolean;
}

interface Comision {
  id: number;
  funcionario_id: number;
  institucion_libre: string | null;
  cargo_comision: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  resolucion: string | null;
  activo: boolean;
}

interface Falta {
  id: number;
  funcionario_id: number;
  tipo_falta: string;
  fecha: string;
  descripcion: string;
  sancion: string | null;
  dias_suspension: number | null;
  apelada: boolean;
}

interface Datos {
  guardias: Guardia[];
  vacaciones: Vacacion[];
  permisos: Permiso[];
  comisiones: Comision[];
  faltas: Falta[];
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

const TIPO_FALTA_BADGE: Record<string, string> = {
  LEVE: "badge badge-warning",
  MEDIA: "badge badge-warning",
  GRAVE: "badge badge-danger",
};

export default function SeccionOperativo({ funcionarioId, userRoles }: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeEditarRRHH = hasAnyRole(userRoles, ["ADMIN", "RRHH"]);
  const puedeEditarOps = hasAnyRole(userRoles, ["ADMIN", "OPERADOR", "RRHH"]);
  const puedeEditarFaltas = hasAnyRole(userRoles, ["ADMIN", "SUPERVISOR", "INSPECTOR"]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [g, v, p, c, f] = await Promise.all([
          api
            .get<Page<Guardia>>(`/ops/guardias?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Guardia>),
          api
            .get<Page<Vacacion>>(`/ops/vacaciones?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Vacacion>),
          api
            .get<Page<Permiso>>(`/ops/permisos?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Permiso>),
          api
            .get<Page<Comision>>(`/ops/comisiones?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Comision>),
          api
            .get<Page<Falta>>(`/ops/faltas?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Falta>),
        ]);
        if (!alive) return;
        setData({
          guardias: g.items ?? [],
          vacaciones: v.items ?? [],
          permisos: p.items ?? [],
          comisiones: c.items ?? [],
          faltas: f.items ?? [],
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
      <SectionShell title="Operativo">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell title="Operativo">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  const hh = (t: string) => t?.slice(0, 5) ?? "";

  return (
    <SectionShell
      title="Operativo"
      description="Guardias, vacaciones, permisos, comisiones y faltas del funcionario."
    >
      <Card title="Guardias">
        {data.guardias.length === 0 ? (
          <EmptyState title="Sin guardias asignadas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Turno</th>
                  <th scope="col" className="text-left p-2 font-medium">Estación</th>
                  <th scope="col" className="text-left p-2 font-medium">Sección</th>
                  <th scope="col" className="text-left p-2 font-medium">Horario</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.guardias.map((g) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="p-2">{formatDate(g.fecha)}</td>
                    <td className="p-2 font-medium">{g.turno}</td>
                    <td className="p-2 text-muted-foreground">
                      {g.estacion ?? `Estación #${g.estacion_id}`}
                    </td>
                    <td className="p-2">{g.seccion ?? "—"}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">
                      {hh(g.hora_inicio)} – {hh(g.hora_fin)}
                    </td>
                    <td className="p-2">
                      <span className={g.cerrada ? "badge badge-neutral" : "badge badge-info"}>
                        {g.cerrada ? "CERRADA" : "ABIERTA"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Vacaciones">
        {data.vacaciones.length === 0 ? (
          <EmptyState title="Sin vacaciones registradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Período</th>
                  <th scope="col" className="text-left p-2 font-medium">Inicio</th>
                  <th scope="col" className="text-left p-2 font-medium">Fin</th>
                  <th scope="col" className="text-right p-2 font-medium">Días cal.</th>
                  <th scope="col" className="text-right p-2 font-medium">Hábiles</th>
                  <th scope="col" className="text-left p-2 font-medium">Autorizado</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.vacaciones.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="p-2 font-medium tabular-nums">{v.periodo_anio}</td>
                    <td className="p-2">{formatDate(v.fecha_inicio)}</td>
                    <td className="p-2">{formatDate(v.fecha_fin)}</td>
                    <td className="p-2 text-right tabular-nums">{v.dias_calendario ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{v.dias_habiles ?? "—"}</td>
                    <td className="p-2">
                      <span
                        className={v.autorizado ? "badge badge-success" : "badge badge-warning"}
                      >
                        {v.autorizado ? "SÍ" : "PENDIENTE"}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">{v.estado ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditarRRHH && (
          <div className="mt-3 text-right">
            <Link
              href={`/ops/vacaciones/nuevo?funcionario_id=${funcionarioId}`}
              className="text-xs text-primary hover:underline"
            >
              + Nuevas vacaciones
            </Link>
          </div>
        )}
      </Card>

      <Card title="Permisos">
        {data.permisos.length === 0 ? (
          <EmptyState title="Sin permisos registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Tipo</th>
                  <th scope="col" className="text-left p-2 font-medium">Inicio</th>
                  <th scope="col" className="text-left p-2 font-medium">Fin</th>
                  <th scope="col" className="text-right p-2 font-medium">Horas</th>
                  <th scope="col" className="text-left p-2 font-medium">Motivo</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.permisos.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 font-medium">{p.tipo}</td>
                    <td className="p-2">{formatDate(p.fecha_inicio)}</td>
                    <td className="p-2">{formatDate(p.fecha_fin)}</td>
                    <td className="p-2 text-right tabular-nums">{p.horas ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{p.motivo ?? "—"}</td>
                    <td className="p-2">
                      <span
                        className={p.autorizado ? "badge badge-success" : "badge badge-warning"}
                      >
                        {p.autorizado ? "AUTORIZADO" : "PENDIENTE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditarOps && (
          <div className="mt-3 text-right">
            <Link
              href={`/ops/permisos/nuevo?funcionario_id=${funcionarioId}`}
              className="text-xs text-primary hover:underline"
            >
              + Nuevo permiso
            </Link>
          </div>
        )}
      </Card>

      <Card title="Comisiones de servicio">
        {data.comisiones.length === 0 ? (
          <EmptyState title="Sin comisiones registradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Institución</th>
                  <th scope="col" className="text-left p-2 font-medium">Cargo</th>
                  <th scope="col" className="text-left p-2 font-medium">Desde</th>
                  <th scope="col" className="text-left p-2 font-medium">Hasta</th>
                  <th scope="col" className="text-left p-2 font-medium">Resolución</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.comisiones.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-2 font-medium">{c.institucion_libre ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{c.cargo_comision ?? "—"}</td>
                    <td className="p-2">{formatDate(c.fecha_inicio)}</td>
                    <td className="p-2">{c.fecha_fin ? formatDate(c.fecha_fin) : "—"}</td>
                    <td className="p-2 font-mono text-xs">{c.resolucion ?? "—"}</td>
                    <td className="p-2">
                      <span className={c.activo ? "badge badge-success" : "badge badge-neutral"}>
                        {c.activo ? "ACTIVA" : "FINALIZADA"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Faltas">
        {data.faltas.length === 0 ? (
          <EmptyState title="Sin faltas registradas" hint="El funcionario no tiene faltas registradas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Tipo</th>
                  <th scope="col" className="text-left p-2 font-medium">Descripción</th>
                  <th scope="col" className="text-left p-2 font-medium">Sanción</th>
                  <th scope="col" className="text-right p-2 font-medium">Días susp.</th>
                  <th scope="col" className="text-left p-2 font-medium">Apelada</th>
                </tr>
              </thead>
              <tbody>
                {data.faltas.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="p-2">{formatDate(f.fecha)}</td>
                    <td className="p-2">
                      <span className={TIPO_FALTA_BADGE[f.tipo_falta] ?? "badge badge-neutral"}>
                        {f.tipo_falta}
                      </span>
                    </td>
                    <td className="p-2 text-muted-foreground">{f.descripcion}</td>
                    <td className="p-2">{f.sancion ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{f.dias_suspension ?? 0}</td>
                    <td className="p-2 text-muted-foreground">{f.apelada ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditarFaltas && (
          <div className="mt-3 text-right">
            <Link
              href={`/ops/faltas/nuevo?funcionario_id=${funcionarioId}`}
              className="text-xs text-primary hover:underline"
            >
              + Nueva falta
            </Link>
          </div>
        )}
      </Card>
    </SectionShell>
  );
}
