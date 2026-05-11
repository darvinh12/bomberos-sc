"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { actualizarPermiso, type EditState } from "./actions";

interface Permiso {
  id: number;
  funcionario_id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  horas: number | null;
  motivo: string;
  autorizado: boolean;
}

const initial: EditState = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Procesando…" : label}
    </button>
  );
}

export default function EditarForm({ permiso }: { permiso: Permiso }) {
  const action = actualizarPermiso.bind(null, permiso.id);
  const [state, dispatch] = useFormState(action, initial);

  return (
    <form action={dispatch} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <section className="rounded-lg bg-muted/30 p-4 space-y-2 text-sm">
        <Row label="Tipo" value={permiso.tipo} />
        <Row
          label="Período"
          value={`${permiso.fecha_inicio} → ${permiso.fecha_fin}`}
        />
        {permiso.horas && <Row label="Horas" value={String(permiso.horas)} />}
        <Row label="Motivo" value={permiso.motivo} />
      </section>

      <input type="hidden" name="accion" value="autorizar" />

      <div className="flex justify-between items-center pt-4 border-t">
        <Link
          href="/ops/permisos"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        {permiso.autorizado ? (
          <span className="px-3 py-1 rounded-full text-xs bg-green-100 text-green-800">
            ✓ Ya autorizado
          </span>
        ) : (
          <Submit label="Autorizar permiso" />
        )}
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
