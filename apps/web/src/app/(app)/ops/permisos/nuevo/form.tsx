"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearPermiso, type State } from "./actions";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60">{pending ? "Guardando…" : "Crear"}</button>;
}

export default function Form({ funcionarios }: { funcionarios: Func[] }) {
  const [state, action] = useFormState(crearPermiso, initial);
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
          <label className="block text-xs font-medium mb-1">Tipo *</label>
          <select name="tipo" required defaultValue="PERSONAL" className="input">
            <option value="PERSONAL">Personal</option>
            <option value="MEDICO">Médico</option>
            <option value="ESTUDIO">Estudio</option>
            <option value="MATRIMONIO">Matrimonio</option>
            <option value="DUELO">Duelo</option>
            <option value="OTRO">Otro</option>
          </select>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Horas</label>
          <input type="number" step="0.5" name="horas" className="input" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="autorizado" /> Autorizado</label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Motivo *</label>
        <textarea name="motivo" required rows={3} minLength={3} className="input" />
      </div>
      <div className="flex justify-between pt-4 border-t">
        <Link href="/ops/permisos" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancelar</Link>
        <Submit />
      </div>
    </form>
  );
}
