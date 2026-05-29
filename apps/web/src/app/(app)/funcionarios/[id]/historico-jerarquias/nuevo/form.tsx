"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Catalogo } from "@/lib/catalogos";
import { crearHistJerarquia } from "./actions";

interface Props {
  funcionarioId: number;
  jerarquias: Catalogo[];
}

const TIPOS_DOC = [
  { value: "DECRETO", label: "Decreto" },
  { value: "RESOLUCION", label: "Resolución" },
  { value: "OFICIO", label: "Oficio" },
  { value: "ORDEN_GENERAL", label: "Orden general" },
];

export default function NuevoHistJerarquiaForm({
  funcionarioId,
  jerarquias,
}: Props) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [jerarquiaId, setJerarquiaId] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [numeroDoc, setNumeroDoc] = useState("");
  const [fechaEfectiva, setFechaEfectiva] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha es obligatoria");
      return;
    }
    if (!jerarquiaId) {
      setError("Seleccione una jerarquía");
      return;
    }
    startTransition(async () => {
      const r = await crearHistJerarquia(funcionarioId, {
        fecha,
        jerarquia_id: jerarquiaId,
        tipo_documento: tipoDoc,
        numero_documento: numeroDoc,
        fecha_efectiva_nomina: fechaEfectiva,
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Fecha del cambio" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            required
          />
        </Field>

        <Field label="Jerarquía nueva" required>
          <select
            value={jerarquiaId}
            onChange={(e) => setJerarquiaId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Seleccione…</option>
            {jerarquias.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de documento">
          <select
            value={tipoDoc}
            onChange={(e) => setTipoDoc(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {TIPOS_DOC.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Número de documento">
          <input
            type="text"
            value={numeroDoc}
            onChange={(e) => setNumeroDoc(e.target.value)}
            className={inputClass}
            placeholder="Ej. 234-2024"
          />
        </Field>

        <Field label="Fecha efectiva en nómina">
          <input
            type="date"
            value={fechaEfectiva}
            onChange={(e) => setFechaEfectiva(e.target.value)}
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
