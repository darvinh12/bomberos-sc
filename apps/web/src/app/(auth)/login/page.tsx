"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full py-2.5 font-semibold"
    >
      {pending ? "Verificando…" : "Ingresar al sistema"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, initial);

  return (
    <div className="min-h-[100dvh] flex bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold tracking-wide">CB</span>
          </div>
          <span className="text-foreground text-sm font-semibold">
            Cuerpo de Bomberos del Distrito Capital
          </span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground leading-tight">
            Sistema Integrado<br />de Gestión de Personal
          </h1>
          <p className="mt-4 text-muted-foreground text-sm leading-relaxed max-w-sm">
            Plataforma institucional para la administración del recurso humano,
            operaciones y carrera del cuerpo de bomberos.
          </p>
          <div className="mt-8 flex items-center gap-2">
            <div className="w-1 h-8 bg-primary rounded-full" />
            <p className="text-muted-foreground/80 text-xs">
              Acceso restringido a personal autorizado.<br />
              Las sesiones son auditadas.
            </p>
          </div>
        </div>
        <div className="text-muted-foreground/60 text-xs">
          Bomberos Caracas · Sistema SIGP v2
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold tracking-wide">CB</span>
            </div>
            <div>
              <div className="text-foreground text-sm font-semibold">Bomberos Caracas</div>
              <div className="text-muted-foreground text-xs">Cuerpo del Distrito Capital</div>
            </div>
          </div>

          <div className="bg-card rounded p-8 border border-border">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">Iniciar sesión</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ingrese sus credenciales institucionales
              </p>
            </div>

            {state.error && (
              <div
                role="alert"
                className="mb-5 px-4 py-3 rounded border border-destructive/30 bg-destructive/10 text-destructive text-sm"
              >
                {state.error}
              </div>
            )}

            <form action={action} className="space-y-4">
              <div>
                <label htmlFor="usuario" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                  Usuario
                </label>
                <input
                  id="usuario"
                  name="usuario"
                  type="text"
                  autoComplete="username"
                  required
                  autoFocus
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                  Contraseña
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="input"
                />
              </div>

              <div className="pt-1">
                <SubmitButton />
              </div>
            </form>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground/70">
            Acceso restringido · Sesiones auditadas
          </p>
        </div>
      </div>
    </div>
  );
}
