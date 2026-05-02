"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { actualizarVacaciones, type EditState } from "./actions";

interface Vacaciones {
  id: number;
  funcionario_id: number;
  periodo_anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_habiles: number | null;
  fraccionada: boolean;
  autorizado: boolean;
  observaciones: string | null;
}

const initial: EditState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

export default function EditarForm({ vacaciones }: { vacaciones: Vacaciones }) {
  const action = actualizarVacaciones.bind(null, vacaciones.id);
  const [state, dispatch] = useFormState(action, initial);

  return (
    <form action={dispatch} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Fecha inicio *</label>
          <input
            type="date"
            name="fecha_inicio"
            required
            defaultValue={vacaciones.fecha_inicio}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fecha fin *</label>
          <input
            type="date"
            name="fecha_fin"
            required
            defaultValue={vacaciones.fecha_fin}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Días hábiles</label>
        <input
          type="number"
          name="dias_habiles"
          defaultValue={vacaciones.dias_habiles ?? ""}
          min="1"
          max="60"
          className="input w-32"
        />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="fraccionada"
            defaultChecked={vacaciones.fraccionada}
          />
          Fraccionada
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="autorizado"
            defaultChecked={vacaciones.autorizado}
          />
          Autorizada
        </label>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea
          name="observaciones"
          rows={3}
          defaultValue={vacaciones.observaciones ?? ""}
          className="input"
        />
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Link
          href="/ops/vacaciones"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <Submit />
      </div>
    </form>
  );
}
