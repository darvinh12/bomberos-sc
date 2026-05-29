"use client";

import { useMemo, useState, useTransition } from "react";
import { actualizarParametro, type Parametro } from "./actions";

export default function ParametrosList({
  parametros,
}: {
  parametros: Parametro[];
}) {
  const grupos = useMemo(() => {
    const m = new Map<string, Parametro[]>();
    for (const p of parametros) {
      const arr = m.get(p.grupo) ?? [];
      arr.push(p);
      m.set(p.grupo, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [parametros]);

  return (
    <div className="space-y-6">
      {grupos.map(([grupo, params]) => (
        <section key={grupo} className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/30 border-b">
            <h2 className="font-semibold capitalize">{grupo}</h2>
            <p className="text-xs text-muted-foreground">
              {params.length} parámetro{params.length !== 1 && "s"}
            </p>
          </div>
          <div className="divide-y">
            {params.map((p) => (
              <Fila key={p.id} p={p} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Fila({ p }: { p: Parametro }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(p.valor);
  const [savedValor, setSavedValor] = useState(p.valor);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const guardar = () => {
    if (!p.editable) return;
    setError(null);
    start(async () => {
      const r = await actualizarParametro(p.id, valor);
      if (r.ok) {
        setSavedValor(valor);
        setEditando(false);
      } else {
        setError(r.error ?? "Error");
      }
    });
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{p.nombre}</h3>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              {p.codigo}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">
              {p.tipo_dato}
            </span>
            {!p.editable && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-700/50 bg-amber-900/40 text-amber-300">
                read-only
              </span>
            )}
            {p.sensible && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-700/50 bg-red-900/40 text-red-300">
                sensible
              </span>
            )}
          </div>
          {p.descripcion && (
            <p className="text-xs text-muted-foreground mt-1">{p.descripcion}</p>
          )}
        </div>
        <div className="min-w-[260px]">
          {editando && p.editable ? (
            <div className="space-y-2">
              <InputPorTipo
                tipo={p.tipo_dato}
                valor={valor}
                onChange={setValor}
              />
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(false);
                    setValor(savedValor);
                    setError(null);
                  }}
                  className="rounded-md border px-3 py-1 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardar}
                  disabled={pending}
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-xs font-medium disabled:opacity-60"
                >
                  {pending ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-end">
              <code className="px-2 py-1 rounded bg-muted/40 text-xs font-mono max-w-[200px] truncate">
                {savedValor}
              </code>
              {p.editable && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="text-xs underline"
                >
                  editar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InputPorTipo({
  tipo,
  valor,
  onChange,
}: {
  tipo: Parametro["tipo_dato"];
  valor: string;
  onChange: (v: string) => void;
}) {
  if (tipo === "boolean") {
    return (
      <select
        value={valor.toLowerCase() === "true" ? "true" : "false"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (tipo === "int" || tipo === "decimal") {
    return (
      <input
        type="number"
        step={tipo === "decimal" ? "0.01" : "1"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    );
  }
  if (tipo === "date") {
    return (
      <input
        type="date"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    );
  }
  if (tipo === "json") {
    return (
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
      />
    );
  }
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
    />
  );
}
