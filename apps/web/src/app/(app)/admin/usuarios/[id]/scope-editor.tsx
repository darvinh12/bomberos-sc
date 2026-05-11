"use client";

import { useState, useTransition } from "react";
import { asignarScope, quitarScope, type Scope } from "./scope-actions";

type Lookup = { id: number; nombre: string };
type LookupConPadre = Lookup & { zona_id?: number; division_id?: number | null };

export default function ScopeEditor({
  usuarioId,
  scopesIniciales,
  zonas,
  estaciones,
  divisiones,
  areas,
}: {
  usuarioId: number;
  scopesIniciales: Scope[];
  zonas: Lookup[];
  estaciones: LookupConPadre[];
  divisiones: Lookup[];
  areas: LookupConPadre[];
}) {
  const [scopes, setScopes] = useState<Scope[]>(scopesIniciales);
  const [creando, setCreando] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tipo, setTipo] = useState<
    "zona" | "estacion" | "division" | "area"
  >("zona");
  const [valorId, setValorId] = useState<string>("");

  const reset = () => {
    setTipo("zona");
    setValorId("");
    setError(null);
  };

  const nombreLookup = (s: Scope): string => {
    if (s.zona_id != null) {
      const z = zonas.find((x) => x.id === s.zona_id);
      return `Zona: ${z?.nombre ?? `#${s.zona_id}`}`;
    }
    if (s.estacion_id != null) {
      const e = estaciones.find((x) => x.id === s.estacion_id);
      return `Estación: ${e?.nombre ?? `#${s.estacion_id}`}`;
    }
    if (s.division_id != null) {
      const d = divisiones.find((x) => x.id === s.division_id);
      return `División: ${d?.nombre ?? `#${s.division_id}`}`;
    }
    if (s.area_id != null) {
      const a = areas.find((x) => x.id === s.area_id);
      return `Área: ${a?.nombre ?? `#${s.area_id}`}`;
    }
    return "—";
  };

  const opciones = (): { id: number; label: string }[] => {
    switch (tipo) {
      case "zona":
        return zonas.map((z) => ({ id: z.id, label: z.nombre }));
      case "estacion":
        return estaciones.map((e) => ({
          id: e.id,
          label: e.nombre + (e.zona_id ? "" : ""),
        }));
      case "division":
        return divisiones.map((d) => ({ id: d.id, label: d.nombre }));
      case "area":
        return areas.map((a) => ({ id: a.id, label: a.nombre }));
    }
  };

  const guardar = () => {
    const idNum = Number(valorId);
    if (!idNum) {
      setError("Elegí una opción");
      return;
    }
    const payload =
      tipo === "zona"
        ? { zona_id: idNum }
        : tipo === "estacion"
          ? { estacion_id: idNum }
          : tipo === "division"
            ? { division_id: idNum }
            : { area_id: idNum };
    setError(null);
    start(async () => {
      const r = await asignarScope(usuarioId, payload);
      if (!r.ok) {
        setError(r.error ?? "Error");
        return;
      }
      // recargar
      setCreando(false);
      reset();
      // Optimista: agregamos al state local; al recargar la página será re-resuelto.
      setScopes((prev) => [
        ...prev,
        {
          id: -Math.random(),
          usuario_id: usuarioId,
          zona_id: tipo === "zona" ? idNum : null,
          estacion_id: tipo === "estacion" ? idNum : null,
          division_id: tipo === "division" ? idNum : null,
          area_id: tipo === "area" ? idNum : null,
        },
      ]);
    });
  };

  const quitar = (id: number) => {
    setError(null);
    start(async () => {
      const r = await quitarScope(usuarioId, id);
      if (!r.ok) {
        setError(r.error ?? "Error");
        return;
      }
      setScopes((prev) => prev.filter((s) => s.id !== id));
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Si no asignás ningún departamento, el usuario ve toda la organización.
        Si asignás uno o más, solo verá los datos de esos departamentos. ADMIN
        siempre ve todo, sin importar el scope.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {scopes.length === 0 && !creando && (
        <p className="text-sm text-muted-foreground italic">
          Sin restricciones — el usuario ve toda la organización.
        </p>
      )}

      <ul className="space-y-1">
        {scopes.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 text-sm"
          >
            <span>{nombreLookup(s)}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => quitar(s.id)}
              className="text-xs underline text-destructive disabled:opacity-60"
            >
              quitar
            </button>
          </li>
        ))}
      </ul>

      {creando ? (
        <div className="rounded-md border bg-card p-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as typeof tipo);
                  setValorId("");
                }}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="zona">Zona</option>
                <option value="estacion">Estación</option>
                <option value="division">División</option>
                <option value="area">Área</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Valor</span>
              <select
                value={valorId}
                onChange={(e) => setValorId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">— Elegí —</option>
                {opciones().map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreando(false);
                reset();
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Asignar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          + Asignar departamento
        </button>
      )}
    </div>
  );
}
