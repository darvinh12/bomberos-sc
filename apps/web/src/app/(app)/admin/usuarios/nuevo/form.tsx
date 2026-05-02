"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { crearUsuario, type NuevoUsuarioState } from "./actions";

interface RolDef {
  codigo: string;
  nombre: string;
  descripcion: string;
}

const initial: NuevoUsuarioState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Creando…" : "Crear usuario"}
    </button>
  );
}

export default function NuevoForm({
  rolesDisponibles,
}: {
  rolesDisponibles: RolDef[];
}) {
  const [state, action] = useFormState(crearUsuario, initial);
  const [showPwd, setShowPwd] = useState(false);

  const generarPassword = () => {
    const especiales = "!@#$%&*";
    const c = (s: string) => s[Math.floor(Math.random() * s.length)];
    const pwd =
      c("ABCDEFGHJKLMNPQRSTUVWXYZ") +
      Array.from({ length: 6 }, () => c("abcdefghijkmnpqrstuvwxyz")).join("") +
      Math.floor(10 + Math.random() * 89) +
      c(especiales) +
      c("ABCDEFGHJKLMNPQRSTUVWXYZ");
    const inp = document.querySelector<HTMLInputElement>("input[name='password']");
    if (inp) {
      inp.value = pwd;
      inp.type = "text";
      setShowPwd(true);
    }
  };

  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium mb-1">Usuario *</label>
        <input
          name="usuario"
          required
          minLength={3}
          maxLength={50}
          pattern="^[a-zA-Z0-9_.-]+$"
          className="input"
          placeholder="ej. ana.perez"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Nombre completo *</label>
        <input
          name="nombre_completo"
          required
          minLength={3}
          maxLength={100}
          className="input"
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Correo</label>
        <input type="email" name="correo" className="input" />
      </div>

      <div>
        <div className="flex justify-between items-end mb-1">
          <label className="block text-xs font-medium">Password temporal *</label>
          <button
            type="button"
            onClick={generarPassword}
            className="text-xs text-primary hover:underline"
          >
            Generar
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type={showPwd ? "text" : "password"}
            name="password"
            required
            minLength={10}
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="rounded-md border border-input px-3 py-2 text-xs hover:bg-accent"
          >
            {showPwd ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Mínimo 10 caracteres con mayúscula, minúscula, dígito y carácter especial.
        </p>
      </div>

      <fieldset className="border rounded-lg p-4">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
          Roles iniciales
        </legend>
        <div className="space-y-2 mt-2">
          {rolesDisponibles.map((r) => (
            <label
              key={r.codigo}
              className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 cursor-pointer"
            >
              <input type="checkbox" name="roles" value={r.codigo} className="mt-1" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {r.nombre}
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    {r.codigo}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{r.descripcion}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-between pt-4 border-t">
        <Link
          href="/admin/usuarios"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <Submit />
      </div>
    </form>
  );
}
