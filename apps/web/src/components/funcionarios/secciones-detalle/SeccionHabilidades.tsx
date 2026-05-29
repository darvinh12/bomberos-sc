"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import ConfirmarBorrado from "../ConfirmarBorrado";
import { borrarActividad, borrarHabilidad } from "./actions";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

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
  nivelAcceso: NivelAcceso;
}

const TIPO_ACTIVIDAD_BADGE: Record<string, string> = {
  DEPORTIVA: "badge badge-info",
  CULTURAL: "badge badge-info",
  MUSICAL: "badge badge-info",
  CIENTIFICA: "badge badge-info",
  LABORAL: "badge badge-neutral",
  ACADEMICA: "badge badge-neutral",
};

type ObjetivoBorrado =
  | { tipo: "habilidad"; id: number; nombre: string }
  | { tipo: "actividad"; id: number; nombre: string };

export default function SeccionHabilidades({
  funcionarioId,
  nivelAcceso,
}: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<ObjetivoBorrado | null>(null);
  const puedeEditar = nivelAcceso === "edit";
  const soloLectura = nivelAcceso === "view";

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

  async function ejecutarBorrado(
    objetivo: ObjetivoBorrado,
    motivo: string,
  ): Promise<void> {
    const res =
      objetivo.tipo === "habilidad"
        ? await borrarHabilidad(funcionarioId, objetivo.id, motivo)
        : await borrarActividad(funcionarioId, objetivo.id, motivo);
    if (!res.ok) throw new Error(res.error);
    setData((prev) => {
      if (prev === null) return prev;
      if (objetivo.tipo === "habilidad") {
        return {
          ...prev,
          habilidades: prev.habilidades.filter((h) => h.id !== objetivo.id),
        };
      }
      return {
        ...prev,
        actividades: prev.actividades.filter((a) => a.id !== objetivo.id),
      };
    });
  }

  if (error) {
    return (
      <SectionShell title="Habilidades y actividades" soloLectura={soloLectura}>
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
      <SectionShell title="Habilidades y actividades" soloLectura={soloLectura}>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Habilidades y actividades"
      description="Habilidades específicas declaradas y actividades culturales, deportivas, científicas y laborales del funcionario."
      soloLectura={soloLectura}
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
                  {puedeEditar && (
                    <th
                      scope="col"
                      className="text-right p-2 font-medium w-1"
                      aria-label="Acciones"
                    />
                  )}
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
                    {puedeEditar && (
                      <td className="p-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setBorrando({
                              tipo: "habilidad",
                              id: h.id,
                              nombre: h.nombre,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                          Eliminar
                        </button>
                      </td>
                    )}
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
                  {puedeEditar && (
                    <th
                      scope="col"
                      className="text-right p-2 font-medium w-1"
                      aria-label="Acciones"
                    />
                  )}
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
                    {puedeEditar && (
                      <td className="p-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setBorrando({
                              tipo: "actividad",
                              id: a.id,
                              nombre: a.actividad,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                          Eliminar
                        </button>
                      </td>
                    )}
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

      {borrando && (
        <ConfirmarBorrado
          titulo={
            borrando.tipo === "habilidad"
              ? "Eliminar habilidad"
              : "Eliminar actividad"
          }
          descripcion={`Vas a marcar como eliminado el registro "${borrando.nombre}".`}
          onConfirm={(motivo) => ejecutarBorrado(borrando, motivo)}
          onClose={() => setBorrando(null)}
        />
      )}
    </SectionShell>
  );
}
