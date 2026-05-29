"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { crearHabilidad } from "./actions";

interface Props {
  funcionarioId: number;
}

const GRUPOS = [
  { value: "IDIOMA", label: "Idioma" },
  { value: "INFORMATICA", label: "Informática" },
  { value: "OTRO", label: "Otro" },
];

const NIVELES = [
  { value: "BASICO", label: "Básico" },
  { value: "INTERMEDIO", label: "Intermedio" },
  { value: "AVANZADO", label: "Avanzado" },
];

export default function NuevaHabilidadForm({ funcionarioId }: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [grupo, setGrupo] = useState("");
  const [nivel, setNivel] = useState("");
  const [fechaRegistro, setFechaRegistro] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    startTransition(async () => {
      const r = await crearHabilidad(funcionarioId, {
        nombre,
        descripcion,
        grupo,
        nivel,
        fecha_registro: fechaRegistro,
      });
      if (r.ok) {
        router.push(`/funcionarios/${funcionarioId}`);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card p-6 space-y-4"
      noValidate
    >
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre" required className="md:col-span-2">
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={inputClass}
            placeholder="Ej. Rescate vertical"
            required
            maxLength={120}
          />
        </Field>

        <Field label="Grupo">
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {GRUPOS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nivel">
          <select
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {NIVELES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fecha de registro" className="md:col-span-2">
          <input
            type="date"
            value={fechaRegistro}
            onChange={(e) => setFechaRegistro(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Descripción">
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
          placeholder="Detalle de la habilidad"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Link
          href={`/funcionarios/${funcionarioId}`}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {pending ? "Guardando…" : "Crear habilidad"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
