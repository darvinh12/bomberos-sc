"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
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

interface Carnet {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  brigadista: boolean | null;
  observaciones: string | null;
}

interface CarnetHistorico {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  motivo_cambio: string | null;
}

interface Datos {
  carnets: Carnet[];
  historico: CarnetHistorico[];
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funcionario: any;
  userRoles: string[];
}

type EstadoVigencia = "VIGENTE" | "POR_VENCER" | "VENCIDO" | "SIN_FECHA";

function calcularVigencia(fechaIso: string | null): EstadoVigencia {
  if (!fechaIso) return "SIN_FECHA";
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return "SIN_FECHA";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = fecha.getTime() - hoy.getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "POR_VENCER";
  return "VIGENTE";
}

function BadgeVigencia({ fecha }: { fecha: string | null }) {
  const estado = calcularVigencia(fecha);
  if (estado === "SIN_FECHA") {
    return <span className="badge badge-neutral">SIN FECHA</span>;
  }
  if (estado === "VENCIDO") {
    return <span className="badge badge-danger">VENCIDO</span>;
  }
  if (estado === "POR_VENCER") {
    return <span className="badge badge-warning">PRÓXIMO A VENCER</span>;
  }
  return <span className="badge badge-success">VIGENTE</span>;
}

export default function SeccionDocumentos({ funcionario: f }: Props) {
  const fotoSrc =
    f.foto_url && (f.foto_url.startsWith("/") || f.foto_url.startsWith("http"))
      ? f.foto_url
      : f.foto_url
        ? `/api/funcionarios/${f.id}/foto`
        : null;

  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, h] = await Promise.all([
          api
            .get<Page<Carnet>>(`/funcionarios/${f.id}/carnets?page_size=100`)
            .catch(() => ({ items: [] }) as Page<Carnet>),
          api
            .get<Page<CarnetHistorico>>(
              `/funcionarios/${f.id}/historico-carnets?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<CarnetHistorico>),
        ]);
        if (!alive) return;
        setData({
          carnets: c.items ?? [],
          historico: h.items ?? [],
        });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [f.id]);

  return (
    <SectionShell
      title="Documentos"
      description="Foto, huella, firma y documentos digitales del funcionario."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Foto">
          <div className="w-full aspect-[3/4] bg-muted border border-border rounded overflow-hidden flex items-center justify-center">
            {fotoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoSrc}
                alt="Foto del funcionario"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-12 h-12 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        </Card>
        <Card title="Huella">
          <EmptyState
            title="Sin huella registrada"
            hint="Subida disponible en módulo de documentos (próximamente)."
          />
        </Card>
        <Card title="Firma">
          <EmptyState
            title="Sin firma registrada"
            hint="Subida disponible en módulo de documentos (próximamente)."
          />
        </Card>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Card title="Carnets activos">
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.carnets.length === 0 ? (
          <EmptyState
            title="Sin carnets registrados"
            hint="No hay carnets activos para este funcionario."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Tipo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Número
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Emisión
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Vencimiento
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Brigadista
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Observaciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.carnets.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-2 font-medium">{c.tipo}</td>
                    <td className="p-2 font-mono text-xs">{c.numero ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(c.fecha_emision)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(c.fecha_vencimiento)}
                    </td>
                    <td className="p-2">
                      <BadgeVigencia fecha={c.fecha_vencimiento} />
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {c.brigadista === null
                        ? "—"
                        : c.brigadista
                          ? "Sí"
                          : "No"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {c.observaciones ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Histórico de carnets">
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.historico.length === 0 ? (
          <EmptyState
            title="Sin historial de carnets"
            hint="No hay cambios o reemplazos de carnets registrados."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Tipo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Número
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Emisión
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Vencimiento
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Motivo cambio
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.historico.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-2 font-medium">{h.tipo}</td>
                    <td className="p-2 font-mono text-xs">{h.numero ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(h.fecha_emision)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(h.fecha_vencimiento)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {h.motivo_cambio ?? "—"}
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
