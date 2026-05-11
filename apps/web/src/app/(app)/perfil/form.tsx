"use client";

import { useFormState, useFormStatus } from "react-dom";
import { cambiarPassword, type State } from "./actions";

const initial: State = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Guardando…" : "Cambiar contraseña"}
    </button>
  );
}

export default function PerfilForm({ okFlag }: { okFlag: boolean }) {
  const [state, action] = useFormState(cambiarPassword, initial);
  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5 max-w-lg">
      {okFlag && !state.error && (
        <div className="rounded-md bg-green-100 border border-green-300 p-3 text-sm text-green-800">
          Contraseña actualizada correctamente.
        </div>
      )}
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium mb-1">Contraseña actual *</label>
        <input type="password" name="password_actual" required autoComplete="current-password" className="input" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Contraseña nueva *</label>
        <input type="password" name="password_nuevo" required minLength={10} autoComplete="new-password" className="input" />
        <p className="text-[11px] text-muted-foreground mt-1">
          Mínimo 10 caracteres, con mayúscula, minúscula, dígito y carácter especial.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Confirmar nueva *</label>
        <input type="password" name="password_confirm" required minLength={10} autoComplete="new-password" className="input" />
      </div>
      <div className="pt-3 border-t flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
