"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import ConfirmarBorrado from "../ConfirmarBorrado";
import { borrarFamiliar, restaurarFamiliar } from "./actions";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface Familiar {
  id: number;
  funcionario_id: number;
  parentesco: string;
  cedula: string | null;
  apellidos: string | null;
  nombres: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  condicion: string | null;
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

function calcularEdad(fechaIso: string | null): string {
  if (!fechaIso) return "—";
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return "—";
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const m = hoy.getMonth() - fecha.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fecha.getDate())) edad--;
  if (edad < 0) return "—";
  return `${edad}`;
}

export default function SeccionFamilia({
  funcionarioId,
  userRoles,
  nivelAcceso,
}: Props) {
  const [items, setItems] = useState<Familiar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<number | null>(null);
  const [restaurandoId, setRestaurandoId] = useState<number | null>(null);
  const [mostrarBorrados, setMostrarBorrados] = useState(false);
  const puedeEditar = nivelAcceso === "edit";
  const soloLectura = nivelAcceso === "view";
  const esAdmin = userRoles.includes("ADMIN");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qs = mostrarBorrados ? "&incluir_borrados=true" : "";
        const res = await api
          .get<Page<Familiar>>(
            `/funcionarios/${funcionarioId}/carga-familiar?page_size=100${qs}`,
          )
          .catch(() => ({ items: [] }) as Page<Familiar>);
        if (!alive) return;
        setItems(res.items ?? []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId, mostrarBorrados]);

  async function confirmarBorrado(cfId: number, motivo: string): Promise<void> {
    const res = await borrarFamiliar(funcionarioId, cfId, motivo);
    if (!res.ok) throw new Error(res.error);
    setItems((prev) => {
      if (prev === null) return prev;
      if (mostrarBorrados) {
        // Vista papelera: marcar localmente para feedback inmediato.
        return prev.map((i) =>
          i.id === cfId
            ? {
                ...i,
                deleted_at: new Date().toISOString(),
                delete_reason: motivo,
              }
            : i,
        );
      }
      return prev.filter((i) => i.id !== cfId);
    });
  }

  async function restaurar(cfId: number) {
    setRestaurandoId(cfId);
    try {
      const res = await restaurarFamiliar(funcionarioId, cfId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) =>
        prev === null
          ? prev
          : prev.map((i) =>
              i.id === cfId
                ? {
                    ...i,
                    deleted_at: null,
                    deleted_by: null,
                    delete_reason: null,
                  }
                : i,
            ),
      );
    } finally {
      setRestaurandoId(null);
    }
  }

  const borrandoItem = items?.find((i) => i.id === borrandoId) ?? null;

  if (error) {
    return (
      <SectionShell title="Familia" soloLectura={soloLectura}>
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      </SectionShell>
    );
  }

  if (items === null) {
    return (
      <SectionShell title="Familia" soloLectura={soloLectura}>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  const nuevoHref = `/funcionarios/${funcionarioId}/carga-familiar/nuevo`;
  const togglePapelera = esAdmin ? (
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <input
        type="checkbox"
        checked={mostrarBorrados}
        onChange={(e) => setMostrarBorrados(e.target.checked)}
        className="rounded border-input"
      />
      Mostrar borrados
    </label>
  ) : null;

  return (
    <SectionShell
      title="Familia"
      description="Carga familiar declarada: hijos, cónyuge, padres y otros beneficiarios HCM."
      soloLectura={soloLectura}
      actions={togglePapelera}
    >
      <Card title="Carga familiar">
        {items.length === 0 ? (
          <EmptyState
            title={
              mostrarBorrados
                ? "Sin registros borrados"
                : "Sin carga familiar registrada"
            }
            hint={
              !mostrarBorrados && puedeEditar
                ? "Usa el botón Nuevo familiar para agregar el primer registro."
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Parentesco
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Cédula
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Nombre completo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Fecha nac.
                  </th>
                  <th scope="col" className="text-right p-2 font-medium">
                    Edad
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Sexo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Condición
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Observaciones
                  </th>
                  {mostrarBorrados && (
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
                {items.map((f) => {
                  const nombre = [f.apellidos, f.nombres]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const borrado = Boolean(f.deleted_at);
                  return (
                    <tr
                      key={f.id}
                      className={`border-t border-border ${borrado ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="p-2 font-medium">{f.parentesco}</td>
                      <td className="p-2 font-mono text-xs">
                        {f.cedula ?? "—"}
                      </td>
                      <td className="p-2">{nombre || "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {formatDate(f.fecha_nacimiento)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {calcularEdad(f.fecha_nacimiento)}
                      </td>
                      <td className="p-2">{f.sexo ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {f.condicion ?? "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {f.observaciones ?? "—"}
                      </td>
                      {mostrarBorrados && (
                        <td className="p-2 text-xs text-muted-foreground">
                          {f.delete_reason ?? "—"}
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {borrado ? (
                            esAdmin ? (
                              <button
                                type="button"
                                onClick={() => restaurar(f.id)}
                                disabled={restaurandoId === f.id}
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
                              onClick={() => setBorrandoId(f.id)}
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
        {puedeEditar && !mostrarBorrados && (
          <div className="mt-3 text-right">
            <a
              href={nuevoHref}
              className="text-xs text-primary hover:underline"
            >
              + Nuevo familiar
            </a>
          </div>
        )}
      </Card>

      {borrandoItem && (
        <ConfirmarBorrado
          titulo="Eliminar familiar"
          descripcion={`Vas a marcar como eliminado al familiar ${
            [borrandoItem.apellidos, borrandoItem.nombres]
              .filter(Boolean)
              .join(" ")
              .trim() || borrandoItem.parentesco
          }.`}
          onConfirm={(motivo) => confirmarBorrado(borrandoItem.id, motivo)}
          onClose={() => setBorrandoId(null)}
        />
      )}
    </SectionShell>
  );
}
