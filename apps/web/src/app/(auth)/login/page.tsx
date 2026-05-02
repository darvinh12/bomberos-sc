"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary text-primary-foreground py-2.5 font-semibold hover:opacity-90 disabled:opacity-60 transition"
    >
      {pending ? "Verificando…" : "Ingresar"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, initial);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-700 to-red-900 p-4">
      <div className="w-full max-w-md bg-card text-card-foreground rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🚒</div>
          <h1 className="text-2xl font-bold">Bomberos Caracas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cuerpo de Bomberos del Distrito Capital
          </p>
        </div>

        {state.error && (
          <div className="mb-4 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            {state.error}
          </div>
        )}

        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="usuario" className="block text-sm font-medium mb-1.5">
              Usuario
            </label>
            <input
              id="usuario"
              name="usuario"
              type="text"
              autoComplete="username"
              required
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <SubmitButton />
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acceso restringido a personal autorizado.{" "}
          <Link href="https://github.com/ganesh4494/bomberos-caracas-bd" className="underline">
            Repo
          </Link>
        </p>
      </div>
    </div>
  );
}
