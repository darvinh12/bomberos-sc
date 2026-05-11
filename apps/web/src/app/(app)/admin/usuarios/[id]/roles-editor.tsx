"use client";

import { useState, useTransition } from "react";
import { toggleRol } from "./actions";

interface RolDef {
  codigo: string;
  nombre: string;
  descripcion: string;
}

export default function RolesEditor({
  usuarioId,
  rolesDisponibles,
  rolesAsignados,
}: {
  usuarioId: number;
  rolesDisponibles: RolDef[];
  rolesAsignados: string[];
}) {
  const [asignados, setAsignados] = useState<Set<string>>(
    new Set(rolesAsignados),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cambiar = (codigo: string, asignar: boolean) => {
    setError(null);
    const next = new Set(asignados);
    if (asignar) next.add(codigo);
    else next.delete(codigo);
    setAsignados(next);
    start(async () => {
      const res = await toggleRol(usuarioId, codigo, asignar);
      if (!res.ok) {
        // rollback
        setAsignados(asignados);
        setError(res.error ?? "Error al actualizar");
      }
    });
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {rolesDisponibles.map((r) => {
        const activo = asignados.has(r.codigo);
        return (
          <label
            key={r.codigo}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
              activo
                ? "bg-primary/5 border-primary/40"
                : "bg-background hover:bg-muted/30"
            } ${pending ? "opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={activo}
              disabled={pending}
              onChange={(e) => cambiar(r.codigo, e.target.checked)}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {r.nombre}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                  {r.codigo}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{r.descripcion}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
