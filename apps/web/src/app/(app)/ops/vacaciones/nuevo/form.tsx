"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearVacaciones, type State } from "./actions";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60">
      {pending ? "Guardando…" : "Crear"}
    </button>
  );
}

export default function Form({ funcionarios }: { funcionarios: Func[] }) {
  const [state, action] = useFormState(crearVacaciones, initial);
  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{state.error}</div>}
      <div>
        <label className="block text-xs font-medium mb-1">Funcionario *</label>
        <select name="funcionario_id" required defaultValue="" className="input">
          <option value="" disabled>— Seleccione —</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>{f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`} ({f.nacionalidad}-{f.cedula})</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Período (año)</label>
          <input type="number" name="periodo_anio" defaultValue={new Date().getFullYear()} min="2000" max="2100" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Inicio *</label>
          <input type="date" name="fecha_inicio" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fin *</label>
          <input type="date" name="fecha_fin" required className="input" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Días hábiles</label>
        <input type="number" name="dias_habiles" min="1" max="60" className="input w-32" />
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="fraccionada" /> Fraccionada</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autorizado" defaultChecked /> Autorizada</label>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea name="observaciones" rows={2} className="input" />
      </div>
      <div className="flex justify-between pt-4 border-t">
        <Link href="/ops/vacaciones" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancelar</Link>
        <Submit />
      </div>
    </form>
  );
}
