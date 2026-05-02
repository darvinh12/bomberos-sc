"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { actualizarAyuda, type EditState } from "./actions";

interface Ayuda {
  id: number;
  funcionario_id: number;
  monto_solicitado: number | null;
  monto_aprobado: number | null;
  monto_pagado: number | null;
  fecha_solicitud: string;
  fecha_aprobacion: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
  motivo: string;
  estatus: string;
  observaciones: string | null;
}

const ESTATUS_OPCIONES = [
  "SOLICITADO",
  "EN_REVISION",
  "APROBADO",
  "PAGADO",
  "RECHAZADO",
  "CANCELADO",
];

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

export default function EditarForm({ ayuda }: { ayuda: Ayuda }) {
  const action = actualizarAyuda.bind(null, ayuda.id);
  const [state, dispatch] = useFormState(action, initial);

  return (
    <form action={dispatch} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <section className="rounded-lg bg-muted/30 p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Solicitud original
        </div>
        <p className="text-sm">{ayuda.motivo}</p>
        <div className="mt-3 flex gap-6 text-sm">
          <span>
            <span className="text-muted-foreground">Monto solicitado:</span>{" "}
            <strong>
              {ayuda.monto_solicitado?.toLocaleString("es-VE", {
                style: "currency",
                currency: "VES",
              }) ?? "—"}
            </strong>
          </span>
          <span>
            <span className="text-muted-foreground">Solicitada el:</span>{" "}
            {ayuda.fecha_solicitud}
          </span>
        </div>
      </section>

      <div>
        <label className="block text-xs font-medium mb-1">Estatus *</label>
        <select
          name="estatus"
          required
          defaultValue={ayuda.estatus}
          className="input"
        >
          {ESTATUS_OPCIONES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Monto aprobado (VES)</label>
          <input
            type="number"
            step="0.01"
            name="monto_aprobado"
            defaultValue={ayuda.monto_aprobado ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fecha aprobación</label>
          <input
            type="date"
            name="fecha_aprobacion"
            defaultValue={ayuda.fecha_aprobacion ?? ""}
            className="input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Monto pagado (VES)</label>
          <input
            type="number"
            step="0.01"
            name="monto_pagado"
            defaultValue={ayuda.monto_pagado ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fecha pago</label>
          <input
            type="date"
            name="fecha_pago"
            defaultValue={ayuda.fecha_pago ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Referencia</label>
          <input
            name="referencia_pago"
            defaultValue={ayuda.referencia_pago ?? ""}
            className="input"
            placeholder="Nº transferencia"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea
          name="observaciones"
          rows={3}
          defaultValue={ayuda.observaciones ?? ""}
          className="input"
        />
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Link
          href="/beneficios"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <Submit />
      </div>
    </form>
  );
}
