"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearGuardia, type State } from "./actions";

interface Cat { id: number; codigo: string; nombre: string }

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60">{pending ? "Creando…" : "Crear guardia"}</button>;
}

export default function Form({ estaciones }: { estaciones: Cat[] }) {
  const [state, action] = useFormState(crearGuardia, initial);
  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{state.error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Fecha *</label>
          <input type="date" name="fecha" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Estación *</label>
          <select name="estacion_id" required defaultValue="" className="input">
            <option value="" disabled>— Seleccione —</option>
            {estaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Turno *</label>
          <select name="turno" required defaultValue="DIURNO" className="input">
            <option value="DIURNO">Diurno</option>
            <option value="NOCTURNO">Nocturno</option>
            <option value="24H">24 horas</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Sección</label>
          <input name="seccion" maxLength={1} className="input" placeholder="A" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Hora inicio *</label>
          <input type="time" name="hora_inicio" required defaultValue="07:00" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Hora fin *</label>
          <input type="time" name="hora_fin" required defaultValue="19:00" className="input" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea name="observaciones" rows={2} className="input" />
      </div>
      <div className="flex justify-between pt-4 border-t">
        <Link href="/ops/guardias" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancelar</Link>
        <Submit />
      </div>
    </form>
  );
}
