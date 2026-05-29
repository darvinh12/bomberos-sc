"use client";

import { Check, Circle, CircleDot, type LucideIcon } from "lucide-react";

export type SeccionEstado = "completo" | "en_proceso" | "vacio";

export interface Seccion {
  id: string;
  label: string;
  icon: LucideIcon;
  estado?: SeccionEstado;
  disabled?: boolean;
}

interface SeccionNavProps {
  secciones: Seccion[];
  activa: string;
  onChange: (id: string) => void;
  modo?: "form" | "lectura";
}

function EstadoIcono({ estado }: { estado: SeccionEstado }) {
  if (estado === "completo") {
    return (
      <Check
        className="w-3.5 h-3.5 text-emerald-500 shrink-0"
        aria-label="Sección completa"
      />
    );
  }
  if (estado === "en_proceso") {
    return (
      <CircleDot
        className="w-3.5 h-3.5 text-primary shrink-0"
        aria-label="Sección en progreso"
      />
    );
  }
  return (
    <Circle
      className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0"
      aria-label="Sección vacía"
    />
  );
}

export default function SeccionNav({
  secciones,
  activa,
  onChange,
  modo = "form",
}: SeccionNavProps) {
  const indexActiva = secciones.findIndex((s) => s.id === activa);
  const mostrarEstado = modo === "form";

  return (
    <>
      {/* ── Stepper móvil ── */}
      <nav
        aria-label="Secciones del formulario"
        className="md:hidden -mx-1 overflow-x-auto"
      >
        <ol
          role="tablist"
          aria-orientation="horizontal"
          className="flex items-stretch gap-1 px-1 pb-2 min-w-max"
        >
          {secciones.map((s, i) => {
            const Icon = s.icon;
            const esActiva = s.id === activa;
            const esAnterior = i < indexActiva;

            return (
              <li key={s.id} role="presentation" className="flex items-center">
                <button
                  type="button"
                  role="tab"
                  aria-selected={esActiva}
                  aria-controls={`panel-${s.id}`}
                  aria-disabled={s.disabled || undefined}
                  disabled={s.disabled}
                  onClick={() => !s.disabled && onChange(s.id)}
                  className={[
                    "group flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                    "transition-opacity transition-transform duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "motion-reduce:transition-none",
                    s.disabled
                      ? "cursor-not-allowed opacity-40"
                      : "cursor-pointer hover:opacity-90 active:scale-[0.98]",
                    esActiva
                      ? "bg-accent text-foreground border-b-2 border-primary rounded-b-none"
                      : esAnterior
                        ? "text-foreground"
                        : "text-muted-foreground",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0",
                      esActiva
                        ? "bg-primary text-primary-foreground"
                        : s.estado === "completo" && mostrarEstado
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-muted text-muted-foreground",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {mostrarEstado && s.estado === "completo" && !esActiva ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>

                {i < secciones.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="mx-1 w-3 h-px bg-border shrink-0"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Sidebar desktop ── */}
      <nav
        aria-label="Secciones del formulario"
        className="hidden md:block"
      >
        <ul
          role="tablist"
          aria-orientation="vertical"
          className="space-y-0.5"
        >
          {secciones.map((s) => {
            const Icon = s.icon;
            const esActiva = s.id === activa;

            return (
              <li key={s.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={esActiva}
                  aria-controls={`panel-${s.id}`}
                  aria-disabled={s.disabled || undefined}
                  disabled={s.disabled}
                  onClick={() => !s.disabled && onChange(s.id)}
                  className={[
                    "group w-full flex items-center gap-2.5 rounded-md pl-3 pr-2.5 py-2 text-[13px] text-left",
                    "border-l-2 transition-opacity transition-transform duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "motion-reduce:transition-none",
                    s.disabled
                      ? "cursor-not-allowed opacity-40 border-transparent text-muted-foreground"
                      : esActiva
                        ? "cursor-pointer bg-accent text-foreground font-medium border-primary"
                        : "cursor-pointer text-muted-foreground hover:bg-accent/60 hover:text-foreground border-transparent",
                  ].join(" ")}
                >
                  <Icon
                    className={[
                      "w-4 h-4 shrink-0",
                      esActiva ? "opacity-100" : "opacity-70",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{s.label}</span>
                  {mostrarEstado && s.estado && (
                    <EstadoIcono estado={s.estado} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
