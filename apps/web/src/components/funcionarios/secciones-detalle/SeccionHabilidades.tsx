"use client";

import { useEffect, useState } from "react";
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

interface Habilidad {
  id: number;
  funcionario_id: number;
  nombre: string;
  descripcion: string | null;
  fecha_registro: string | null;
}

interface Actividad {
  id: number;
  funcionario_id: number;
  tipo: string;
  actividad: string;
  observaciones: string | null;
}

interface Datos {
  habilidades: Habilidad[];
  actividades: Actividad[];
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

const TIPO_ACTIVIDAD_BADGE: Record<string, string> = {
  DEPORTIVA: "badge badge-info",
  CULTURAL: "badge badge-info",
  MUSICAL: "badge badge-info",
  CIENTIFICA: "badge badge-info",
  LABORAL: "badge badge-neutral",
  ACADEMICA: "badge badge-neutral",
};

export default function SeccionHabilidades({
  funcionarioId,
  userRoles,
}: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeEditar = hasAnyRole(userRoles, ["RRHH", "ADMIN"]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [hab, act] = await Promise.all([
          api
            .get<Page<Habilidad>>(
              `/funcionarios/${funcionarioId}/habilidades?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Habilidad>),
          api
            .get<Page<Actividad>>(
              `/funcionarios/${funcionarioId}/actividades?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Actividad>),
        ]);
        if (!alive) return;
        setData({
          habilidades: hab.items ?? [],
          actividades: act.items ?? [],
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
      <SectionShell title="Habilidades y actividades">
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell title="Habilidades y actividades">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Habilidades y actividades"
      description="Habilidades específicas declaradas y actividades culturales, deportivas, científicas y laborales del funcionario."
    >
      <Card title="Habilidades">
        {data.habilidades.length === 0 ? (
          <EmptyState
            title="Sin habilidades registradas"
            hint={
              puedeEditar
                ? "Usa el botón Nueva habilidad para agregar el primer registro."
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Descripción
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Fecha registro
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.habilidades.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-2 font-medium">{h.nombre}</td>
                    <td className="p-2 text-muted-foreground">
                      {h.descripcion ?? "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(h.fecha_registro)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && (
          <div className="mt-3 text-right">
            <a
              href={`/funcionarios/${funcionarioId}/habilidades/nuevo`}
              className="text-xs text-primary hover:underline"
            >
              + Nueva habilidad
            </a>
          </div>
        )}
      </Card>

      <Card title="Actividades">
        {data.actividades.length === 0 ? (
          <EmptyState
            title="Sin actividades registradas"
            hint={
              puedeEditar
                ? "Usa el botón Nueva actividad para agregar el primer registro."
                : undefined
            }
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
                    Actividad
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Observaciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.actividades.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-2">
                      <span
                        className={
                          TIPO_ACTIVIDAD_BADGE[a.tipo] ?? "badge badge-neutral"
                        }
                      >
                        {a.tipo}
                      </span>
                    </td>
                    <td className="p-2 font-medium">{a.actividad}</td>
                    <td className="p-2 text-muted-foreground">
                      {a.observaciones ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && (
          <div className="mt-3 text-right">
            <a
              href={`/funcionarios/${funcionarioId}/actividades/nuevo`}
              className="text-xs text-primary hover:underline"
            >
              + Nueva actividad
            </a>
          </div>
        )}
      </Card>
    </SectionShell>
  );
}
