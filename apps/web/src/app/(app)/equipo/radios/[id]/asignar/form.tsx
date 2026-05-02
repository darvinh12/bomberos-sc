"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { asignarRadio, type State } from "./actions";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }
interface Cat { id: number; codigo: string; nombre: string }

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60">
      {pending ? "Asignando…" : "Asignar"}
    </button>
  );
}

export default function Form({
  radioId,
  funcionarios,
  estaciones,
}: {
  radioId: number;
  funcionarios: Func[];
  estaciones: Cat[];
}) {
  const action = asignarRadio.bind(null, radioId);
  const [state, formAction] = useFormState(action, initial);
  return (
    <form action={formAction} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{state.error}</div>}
      <p className="text-xs text-muted-foreground">
        Asigna el radio a un funcionario o a una estación (al menos uno).
      </p>
      <div>
        <label className="block text-xs font-medium mb-1">Funcionario</label>
        <select name="funcionario_id" defaultValue="" className="input">
          <option value="">— Sin funcionario —</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>{f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`} ({f.nacionalidad}-{f.cedula})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Estación</label>
        <select name="estacion_id" defaultValue="" className="input">
          <option value="">— Sin estación —</option>
          {estaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Fecha asignación *</label>
        <input type="date" name="fecha_asignacion" required className="input w-48" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">URL documento</label>
        <input name="documento_url" type="url" className="input" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea name="observaciones" rows={2} className="input" />
      </div>
      <div className="flex justify-between pt-4 border-t">
        <Link href="/equipo/radios" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancelar</Link>
        <Submit />
      </div>
    </form>
  );
}
