"use client";

import { Fragment, useState, useTransition } from "react";
import { devolverAsignacion } from "./actions";

interface Asignacion {
  id: number;
  inventario_id: number;
  funcionario_id: number;
  fecha_entrega: string;
  estado_entrega: string | null;
  observaciones: string | null;
  fecha_devolucion: string | null;
  estado_devolucion: string | null;
  devuelto: boolean;
}

export default function DevolverPanel({
  asignaciones: inicial,
}: {
  asignaciones: Asignacion[];
}) {
  const [items, setItems] = useState(inicial);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [estado, setEstado] = useState("Buen estado");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const devolver = (id: number) => {
    setError(null);
    start(async () => {
      const r = await devolverAsignacion(id, estado || null);
      if (r.ok) {
        setItems(items.filter((i) => i.id !== id));
        setActiveId(null);
        setEstado("Buen estado");
      } else {
        setError(r.error ?? "Error");
      }
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No hay asignaciones activas.
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Asignación</th>
              <th className="text-left p-3">Ítem #</th>
              <th className="text-left p-3">Funcionario #</th>
              <th className="text-left p-3">Entregado</th>
              <th className="text-left p-3">Estado entrega</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <Fragment key={a.id}>
                <tr className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">#{a.id}</td>
                  <td className="p-3 font-mono text-xs">#{a.inventario_id}</td>
                  <td className="p-3 font-mono text-xs">#{a.funcionario_id}</td>
                  <td className="p-3">{a.fecha_entrega}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {a.estado_entrega ?? "—"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setActiveId(activeId === a.id ? null : a.id)}
                      className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      {activeId === a.id ? "Cancelar" : "Devolver"}
                    </button>
                  </td>
                </tr>
                {activeId === a.id && (
                  <tr className="border-t bg-muted/10">
                    <td colSpan={6} className="p-4">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium mb-1">
                            Estado al devolver
                          </label>
                          <input
                            value={estado}
                            onChange={(e) => setEstado(e.target.value)}
                            className="input"
                            placeholder="Buen estado / Dañado / Vencido"
                          />
                        </div>
                        <button
                          onClick={() => devolver(a.id)}
                          disabled={pending}
                          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                        >
                          {pending ? "Devolviendo…" : "Confirmar devolución"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
