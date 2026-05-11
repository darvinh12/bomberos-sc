"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearCurso, type State } from "./actions";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60">
      {pending ? "Guardando…" : "Registrar curso"}
    </button>
  );
}

export default function Form({ funcionarios }: { funcionarios: Func[] }) {
  const [state, action] = useFormState(crearCurso, initial);
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
      <div>
        <label className="block text-xs font-medium mb-1">Nombre del curso *</label>
        <input name="nombre_libre" required minLength={3} className="input" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Institución</label>
        <input name="institucion" className="input" placeholder="ej. UNES, IUTB" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Inicio</label>
          <input type="date" name="fecha_inicio" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fin</label>
          <input type="date" name="fecha_fin" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Horas</label>
          <input type="number" name="horas" min="0" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Nota (0-100)</label>
          <input type="number" step="0.01" name="nota" min="0" max="100" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Resultado</label>
          <select name="aprobado" defaultValue="" className="input">
            <option value="">—</option>
            <option value="true">Aprobado</option>
            <option value="false">Reprobado</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea name="observaciones" rows={2} className="input" />
      </div>
      <div className="flex justify-between pt-4 border-t">
        <Link href="/carrera" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancelar</Link>
        <Submit />
      </div>
    </form>
  );
}
