"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { crearTiempoAdmPublica } from "./actions";

interface Props {
  funcionarioId: number;
}

export default function NuevoTiempoAdmPubForm({ funcionarioId }: Props) {
  const router = useRouter();
  const [dependencia, setDependencia] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [fechaEgreso, setFechaEgreso] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!dependencia.trim()) {
      setError("La dependencia es obligatoria");
      return;
    }
    if (!fechaIngreso) {
      setError("La fecha de ingreso es obligatoria");
      return;
    }
    if (fechaEgreso && fechaEgreso < fechaIngreso) {
      setError("La fecha de egreso no puede ser anterior al ingreso");
      return;
    }
    startTransition(async () => {
      const r = await crearTiempoAdmPublica(funcionarioId, {
        dependencia,
        fecha_ingreso: fechaIngreso,
        fecha_egreso: fechaEgreso,
        observaciones,
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

      <Field label="Dependencia / Institución" required>
        <input
          type="text"
          value={dependencia}
          onChange={(e) => setDependencia(e.target.value)}
          className={inputClass}
          placeholder="Ej. Ministerio del Interior y Justicia"
          required
          maxLength={200}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Fecha de ingreso" required>
          <input
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
            className={inputClass}
            required
          />
        </Field>

        <Field label="Fecha de egreso">
          <input
            type="date"
            value={fechaEgreso}
            onChange={(e) => setFechaEgreso(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Observaciones">
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
          placeholder="Cargo, motivo del egreso, etc."
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
          {pending ? "Guardando…" : "Crear registro"}
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
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
