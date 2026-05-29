"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import ConfirmarBorrado from "../ConfirmarBorrado";
import {
  borrarActividad,
  borrarHabilidad,
  restaurarActividad,
  restaurarHabilidad,
} from "./actions";
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
  deleted_at?: string | null;
  deleted_by?: number | null;
  delete_reason?: string | null;
}

interface Actividad {
  id: number;
  funcionario_id: number;
  tipo: string;
  actividad: string;
  observaciones: string | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  delete_reason?: string | null;
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
  userRoles,
  nivelAcceso,
}: Props) {
  const [habilidades, setHabilidades] = useState<Habilidad[] | null>(null);
  const [actividades, setActividades] = useState<Actividad[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<ObjetivoBorrado | null>(null);
  const [restaurandoHabilidad, setRestaurandoHabilidad] = useState<number | null>(null);
  const [restaurandoActividad, setRestaurandoActividad] = useState<number | null>(null);
  const [mostrarBorradosHab, setMostrarBorradosHab] = useState(false);
  const [mostrarBorradosAct, setMostrarBorradosAct] = useState(false);

  const puedeEditar = nivelAcceso === "edit";
  const soloLectura = nivelAcceso === "view";
  const esAdmin = userRoles.includes("ADMIN");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qs = mostrarBorradosHab ? "&incluir_borrados=true" : "";
        const res = await api
          .get<Page<Habilidad>>(
            `/funcionarios/${funcionarioId}/habilidades?page_size=100${qs}`,
          )
          .catch(() => ({ items: [] }) as Page<Habilidad>);
        if (!alive) return;
        setHabilidades(res.items ?? []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId, mostrarBorradosHab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qs = mostrarBorradosAct ? "&incluir_borrados=true" : "";
        const res = await api
          .get<Page<Actividad>>(
            `/funcionarios/${funcionarioId}/actividades?page_size=100${qs}`,
          )
          .catch(() => ({ items: [] }) as Page<Actividad>);
        if (!alive) return;
        setActividades(res.items ?? []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId, mostrarBorradosAct]);

  async function ejecutarBorrado(
    objetivo: ObjetivoBorrado,
    motivo: string,
  ): Promise<void> {
    const res =
      objetivo.tipo === "habilidad"
        ? await borrarHabilidad(funcionarioId, objetivo.id, motivo)
        : await borrarActividad(funcionarioId, objetivo.id, motivo);
    if (!res.ok) throw new Error(res.error);
    if (objetivo.tipo === "habilidad") {
      setHabilidades((prev) => {
        if (prev === null) return prev;
        if (mostrarBorradosHab) {
          return prev.map((h) =>
            h.id === objetivo.id
              ? {
                  ...h,
                  deleted_at: new Date().toISOString(),
                  delete_reason: motivo,
                }
              : h,
          );
        }
        return prev.filter((h) => h.id !== objetivo.id);
      });
    } else {
      setActividades((prev) => {
        if (prev === null) return prev;
        if (mostrarBorradosAct) {
          return prev.map((a) =>
            a.id === objetivo.id
              ? {
                  ...a,
                  deleted_at: new Date().toISOString(),
                  delete_reason: motivo,
                }
              : a,
          );
        }
        return prev.filter((a) => a.id !== objetivo.id);
      });
    }
  }

  async function restaurarHab(id: number) {
    setRestaurandoHabilidad(id);
    try {
      const res = await restaurarHabilidad(funcionarioId, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHabilidades((prev) =>
        prev === null
          ? prev
          : prev.map((h) =>
              h.id === id
                ? {
                    ...h,
                    deleted_at: null,
                    deleted_by: null,
                    delete_reason: null,
                  }
                : h,
            ),
      );
    } finally {
      setRestaurandoHabilidad(null);
    }
  }

  async function restaurarAct(id: number) {
    setRestaurandoActividad(id);
    try {
      const res = await restaurarActividad(funcionarioId, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setActividades((prev) =>
        prev === null
          ? prev
          : prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    deleted_at: null,
                    deleted_by: null,
                    delete_reason: null,
                  }
                : a,
            ),
      );
    } finally {
      setRestaurandoActividad(null);
    }
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

  if (habilidades === null || actividades === null) {
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
        {esAdmin && (
          <div className="mb-3 flex justify-end">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarBorradosHab}
                onChange={(e) => setMostrarBorradosHab(e.target.checked)}
                className="rounded border-input"
              />
              Mostrar borrados
            </label>
          </div>
        )}
        {habilidades.length === 0 ? (
          <EmptyState
            title={
              mostrarBorradosHab
                ? "Sin habilidades borradas"
                : "Sin habilidades registradas"
            }
            hint={
              !mostrarBorradosHab && puedeEditar
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
                  {mostrarBorradosHab && (
                    <th scope="col" className="text-left p-2 font-medium">
                      Motivo borrado
                    </th>
                  )}
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
                {habilidades.map((h) => {
                  const borrado = Boolean(h.deleted_at);
                  return (
                    <tr
                      key={h.id}
                      className={`border-t border-border ${borrado ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="p-2 font-medium">{h.nombre}</td>
                      <td className="p-2 text-muted-foreground">
                        {h.descripcion ?? "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {formatDate(h.fecha_registro)}
                      </td>
                      {mostrarBorradosHab && (
                        <td className="p-2 text-xs text-muted-foreground">
                          {h.delete_reason ?? "—"}
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {borrado ? (
                            esAdmin ? (
                              <button
                                type="button"
                                onClick={() => restaurarHab(h.id)}
                                disabled={restaurandoHabilidad === h.id}
                                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                                title="Restaurar"
                              >
                                <RotateCcw
                                  className="w-3 h-3"
                                  aria-hidden="true"
                                />
                                Restaurar
                              </button>
                            ) : null
                          ) : (
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
                              <Trash2
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && !mostrarBorradosHab && (
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
        {esAdmin && (
          <div className="mb-3 flex justify-end">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarBorradosAct}
                onChange={(e) => setMostrarBorradosAct(e.target.checked)}
                className="rounded border-input"
              />
              Mostrar borrados
            </label>
          </div>
        )}
        {actividades.length === 0 ? (
          <EmptyState
            title={
              mostrarBorradosAct
                ? "Sin actividades borradas"
                : "Sin actividades registradas"
            }
            hint={
              !mostrarBorradosAct && puedeEditar
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
                  {mostrarBorradosAct && (
                    <th scope="col" className="text-left p-2 font-medium">
                      Motivo borrado
                    </th>
                  )}
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
                {actividades.map((a) => {
                  const borrado = Boolean(a.deleted_at);
                  return (
                    <tr
                      key={a.id}
                      className={`border-t border-border ${borrado ? "opacity-50 line-through" : ""}`}
                    >
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
                      {mostrarBorradosAct && (
                        <td className="p-2 text-xs text-muted-foreground">
                          {a.delete_reason ?? "—"}
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {borrado ? (
                            esAdmin ? (
                              <button
                                type="button"
                                onClick={() => restaurarAct(a.id)}
                                disabled={restaurandoActividad === a.id}
                                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                                title="Restaurar"
                              >
                                <RotateCcw
                                  className="w-3 h-3"
                                  aria-hidden="true"
                                />
                                Restaurar
                              </button>
                            ) : null
                          ) : (
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
                              <Trash2
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && !mostrarBorradosAct && (
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
