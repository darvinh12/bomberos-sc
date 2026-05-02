"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearItem, type State } from "./actions";

interface Cat { id: number; codigo: string; nombre: string }

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60">
      {pending ? "Guardando…" : "Crear ítem"}
    </button>
  );
}

export default function Form({ estaciones }: { estaciones: Cat[] }) {
  const [state, action] = useFormState(crearItem, initial);
  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{state.error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Tipo (id) *</label>
          <input type="number" name="tipo_id" required min="1" defaultValue="1" className="input" />
          <p className="text-[10px] text-muted-foreground mt-1">Ej: 1=Casco, 2=Chaqueta, 3=Guantes, 4=Botas</p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Talla (id)</label>
          <input type="number" name="talla_id" min="1" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Marca</label>
          <input name="marca" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Modelo</label>
          <input name="modelo" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Color</label>
          <input name="color" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Número de serie</label>
          <input name="numero_serie" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Lote</label>
          <input name="lote" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Adquisición</label>
          <input type="date" name="fecha_adquisicion" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Vence</label>
          <input type="date" name="fecha_vence" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Costo</label>
          <input type="number" step="0.01" name="costo" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Estatus</label>
          <select name="estatus" defaultValue="DISPONIBLE" className="input">
            <option value="DISPONIBLE">DISPONIBLE</option>
            <option value="ASIGNADO">ASIGNADO</option>
            <option value="EN_REPARACION">EN_REPARACION</option>
            <option value="DADO_DE_BAJA">DADO_DE_BAJA</option>
            <option value="PERDIDO">PERDIDO</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Estación</label>
          <select name="estacion_id" defaultValue="" className="input">
            <option value="">—</option>
            {estaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea name="observaciones" rows={2} className="input" />
      </div>
      <div className="flex justify-between pt-4 border-t">
        <Link href="/equipo/proteccion" className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent">Cancelar</Link>
        <Submit />
      </div>
    </form>
  );
}
