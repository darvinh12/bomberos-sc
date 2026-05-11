"use client";

import { useState, useTransition } from "react";
import {
  asignarRolScope,
  quitarRolScope,
  type RolScope,
} from "./rol-scope-actions";

type Lookup = { id: number; nombre: string };

export default function RolScopeEditor({
  usuarioId,
  scopesIniciales,
  roles,
  zonas,
  estaciones,
  divisiones,
  areas,
}: {
  usuarioId: number;
  scopesIniciales: RolScope[];
  roles: { id: number; codigo: string; nombre: string }[];
  zonas: Lookup[];
  estaciones: Lookup[];
  divisiones: Lookup[];
  areas: Lookup[];
}) {
  const [items, setItems] = useState<RolScope[]>(scopesIniciales);
  const [creando, setCreando] = useState(false);
  const [rolId, setRolId] = useState<number>(roles[0]?.id ?? 0);
  const [tipo, setTipo] = useState<"zona" | "estacion" | "division" | "area">(
    "zona",
  );
  const [valorId, setValorId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const descripcion = (s: RolScope): string => {
    const rol = roles.find((r) => r.id === s.rol_id);
    const rolStr = rol ? rol.nombre : `Rol #${s.rol_id}`;
    let scope = "";
    if (s.zona_id != null)
      scope = `Zona: ${zonas.find((z) => z.id === s.zona_id)?.nombre ?? `#${s.zona_id}`}`;
    else if (s.estacion_id != null)
      scope = `Estación: ${estaciones.find((e) => e.id === s.estacion_id)?.nombre ?? `#${s.estacion_id}`}`;
    else if (s.division_id != null)
      scope = `División: ${divisiones.find((d) => d.id === s.division_id)?.nombre ?? `#${s.division_id}`}`;
    else if (s.area_id != null)
      scope = `Área: ${areas.find((a) => a.id === s.area_id)?.nombre ?? `#${s.area_id}`}`;
    return `${rolStr} · ${scope}`;
  };

  const opciones = (): Lookup[] => {
    switch (tipo) {
      case "zona":
        return zonas;
      case "estacion":
        return estaciones;
      case "division":
        return divisiones;
      case "area":
        return areas;
    }
  };

  const guardar = () => {
    const idNum = Number(valorId);
    if (!rolId) {
      setError("Elegí un rol");
      return;
    }
    if (!idNum) {
      setError("Elegí el departamento");
      return;
    }
    const payload =
      tipo === "zona"
        ? { rol_id: rolId, zona_id: idNum }
        : tipo === "estacion"
          ? { rol_id: rolId, estacion_id: idNum }
          : tipo === "division"
            ? { rol_id: rolId, division_id: idNum }
            : { rol_id: rolId, area_id: idNum };
    setError(null);
    start(async () => {
      const r = await asignarRolScope(usuarioId, payload);
      if (!r.ok) {
        setError(r.error ?? "Error");
        return;
      }
      setItems((prev) => [
        ...prev,
        {
          id: -Math.random(),
          usuario_id: usuarioId,
          rol_id: rolId,
          zona_id: tipo === "zona" ? idNum : null,
          estacion_id: tipo === "estacion" ? idNum : null,
          division_id: tipo === "division" ? idNum : null,
          area_id: tipo === "area" ? idNum : null,
        },
      ]);
      setCreando(false);
      setValorId("");
    });
  };

  const quitar = (id: number) => {
    start(async () => {
      const r = await quitarRolScope(usuarioId, id);
      if (!r.ok) {
        setError(r.error ?? "Error");
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== id));
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Para casos donde la persona necesita un rol distinto según el
        departamento (ej: <em>Supervisor</em> en Zona 2, <em>Lectura</em> en
        Zona 3). Estos roles se <strong>suman</strong> a los roles globales
        asignados arriba — no los reemplazan.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {items.length === 0 && !creando && (
        <p className="text-sm text-muted-foreground italic">
          Sin asignaciones rol-por-departamento.
        </p>
      )}

      <ul className="space-y-1">
        {items.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 text-sm"
          >
            <span>{descripcion(s)}</span>
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
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Rol</span>
              <select
                value={rolId}
                onChange={(e) => setRolId(Number(e.target.value))}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Departamento</span>
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
                    {o.nombre}
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
                setError(null);
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
          + Asignar rol por departamento
        </button>
      )}
    </div>
  );
}
