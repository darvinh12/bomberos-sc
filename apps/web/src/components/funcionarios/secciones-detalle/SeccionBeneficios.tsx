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

interface Ayuda {
  id: number;
  funcionario_id: number;
  tipo_solicitud_id: number;
  monto_solicitado: number | null;
  monto_aprobado: number | null;
  monto_pagado: number | null;
  fecha_solicitud: string;
  fecha_aprobacion: string | null;
  fecha_pago: string | null;
  motivo: string;
  estatus: string;
}

interface Entrega {
  id: number;
  funcionario_id: number;
  fecha_entrega: string;
  observaciones: string | null;
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  devuelto?: boolean;
}

interface Datos {
  ayudas: Ayuda[];
  entregas: Entrega[];
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

const ESTATUS_BADGE: Record<string, string> = {
  SOLICITADO: "badge badge-warning",
  EN_REVISION: "badge badge-info",
  APROBADO: "badge badge-success",
  PAGADO: "badge badge-success",
  RECHAZADO: "badge badge-danger",
  CANCELADO: "badge badge-neutral",
};

const fmtMoney = (v: number | null) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("es-VE", {
        style: "currency",
        currency: "VES",
        maximumFractionDigits: 2,
      }).format(v);

export default function SeccionBeneficios({ funcionarioId, userRoles }: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeCrear = hasAnyRole(userRoles, ["ADMIN", "RRHH"]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ay, en] = await Promise.all([
          api
            .get<Page<Ayuda>>(`/beneficios/ayudas?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Ayuda>),
          api
            .get<Page<Entrega>>(`/beneficios/entregas?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Entrega>),
        ]);
        if (!alive) return;
        setData({
          ayudas: ay.items ?? [],
          entregas: en.items ?? [],
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
      <SectionShell title="Beneficios">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell title="Beneficios">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Beneficios"
      description="Ayudas económicas y entregas recibidas por el funcionario."
      actions={
        puedeCrear ? (
          <Link
            href={`/beneficios/nuevo?funcionario_id=${funcionarioId}`}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
          >
            + Nueva ayuda
          </Link>
        ) : null
      }
    >
      <Card title="Ayudas económicas">
        {data.ayudas.length === 0 ? (
          <EmptyState title="Sin ayudas solicitadas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Concepto</th>
                  <th scope="col" className="text-right p-2 font-medium">Solicitado</th>
                  <th scope="col" className="text-right p-2 font-medium">Aprobado</th>
                  <th scope="col" className="text-right p-2 font-medium">Pagado</th>
                  <th scope="col" className="text-left p-2 font-medium">Solicitud</th>
                  <th scope="col" className="text-left p-2 font-medium">Pago</th>
                  <th scope="col" className="text-left p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.ayudas.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-2 text-muted-foreground max-w-[260px] truncate" title={a.motivo}>
                      {a.motivo}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(a.monto_solicitado)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(a.monto_aprobado)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(a.monto_pagado)}</td>
                    <td className="p-2">{formatDate(a.fecha_solicitud)}</td>
                    <td className="p-2 text-muted-foreground">
                      {a.fecha_pago ? formatDate(a.fecha_pago) : "—"}
                    </td>
                    <td className="p-2">
                      <span className={ESTATUS_BADGE[a.estatus] ?? "badge badge-neutral"}>
                        {a.estatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Entregas">
        {data.entregas.length === 0 ? (
          <EmptyState
            title="Sin entregas registradas"
            hint="Las entregas materiales (uniformes, kits, dotación) aparecerán aquí."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Beneficio</th>
                  <th scope="col" className="text-left p-2 font-medium">Marca / Modelo</th>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {data.entregas.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-2 font-medium">{e.tipo ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">
                      {[e.marca, e.modelo].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-2">{formatDate(e.fecha_entrega)}</td>
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
