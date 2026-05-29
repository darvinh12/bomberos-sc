"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { crearCarnet } from "./actions";

interface Props {
  funcionarioId: number;
}

const TIPOS_SUGERIDOS = ["INSTITUCIONAL", "BRIGADISTA", "OPERATIVO"];

export default function NuevoCarnetForm({ funcionarioId }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState("");
  const [numero, setNumero] = useState("");
  const [fechaEmision, setFechaEmision] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [brigadista, setBrigadista] = useState(false);
  const [libro, setLibro] = useState("");
  const [folio, setFolio] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!tipo.trim()) {
      setError("El tipo es obligatorio");
      return;
    }
    if (!numero.trim()) {
      setError("El número es obligatorio");
      return;
    }
    if (!fechaEmision) {
      setError("La fecha de emisión es obligatoria");
      return;
    }
    startTransition(async () => {
      const r = await crearCarnet(funcionarioId, {
        tipo,
        numero,
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVencimiento,
        brigadista,
        libro,
        folio,
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
        <Field label="Tipo" required>
          <input
            type="text"
            value={tipo}
            onChange={(e) => setTipo(e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="INSTITUCIONAL"
            list="tipos-carnet"
            required
            maxLength={80}
          />
          <datalist id="tipos-carnet">
            {TIPOS_SUGERIDOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>

        <Field label="Número" required>
          <input
            type="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className={inputClass}
            placeholder="CN-2025-00001"
            required
            maxLength={80}
          />
        </Field>

        <Field label="Fecha de emisión" required>
          <input
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            className={inputClass}
            required
          />
        </Field>

        <Field label="Fecha de vencimiento">
          <input
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Libro">
          <input
            type="text"
            value={libro}
            onChange={(e) => setLibro(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Folio">
          <input
            type="text"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            className={inputClass}
          />
        </Field>

        <label className="flex items-center gap-2 md:col-span-2 select-none">
          <input
            type="checkbox"
            checked={brigadista}
            onChange={(e) => setBrigadista(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Es brigadista</span>
        </label>
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
          {pending ? "Guardando…" : "Crear carnet"}
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
