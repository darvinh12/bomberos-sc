"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Catalogo } from "@/lib/catalogos";
import { crearFamiliar } from "./actions";

interface Props {
  funcionarioId: number;
  parentescos: Catalogo[];
}

const CONDICIONES = [
  { value: "TITULAR", label: "Titular" },
  { value: "BENEFICIARIO_HCM", label: "Beneficiario HCM" },
  { value: "NINGUNA", label: "Ninguna" },
];

export default function NuevoFamiliarForm({ funcionarioId, parentescos }: Props) {
  const router = useRouter();
  const [parentesco, setParentesco] = useState("");
  const [nacionalidad, setNacionalidad] = useState("V");
  const [cedula, setCedula] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [nombres, setNombres] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [sexo, setSexo] = useState("");
  const [condicion, setCondicion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!parentesco) {
      setError("El parentesco es obligatorio");
      return;
    }
    if (!apellidos.trim() || !nombres.trim()) {
      setError("Apellidos y nombres son obligatorios");
      return;
    }
    startTransition(async () => {
      const r = await crearFamiliar(funcionarioId, {
        parentesco,
        nacionalidad,
        cedula,
        apellidos,
        nombres,
        fecha_nacimiento: fechaNacimiento,
        sexo,
        condicion,
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
        <Field label="Parentesco" required>
          <select
            value={parentesco}
            onChange={(e) => setParentesco(e.target.value)}
            className={selectClass}
            required
          >
            <option value="">— Seleccionar —</option>
            {parentescos.map((p) => (
              <option key={p.id} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Condición">
          <select
            value={condicion}
            onChange={(e) => setCondicion(e.target.value)}
            className={selectClass}
          >
            <option value="">—</option>
            {CONDICIONES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nacionalidad">
          <select
            value={nacionalidad}
            onChange={(e) => setNacionalidad(e.target.value)}
            className={selectClass}
          >
            <option value="V">V — Venezolano</option>
            <option value="E">E — Extranjero</option>
          </select>
        </Field>

        <Field label="Cédula">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={cedula}
            onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
            className={inputClass}
            placeholder="12345678"
          />
        </Field>

        <Field label="Apellidos" required>
          <input
            type="text"
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            className={inputClass}
            required
            maxLength={120}
          />
        </Field>

        <Field label="Nombres" required>
          <input
            type="text"
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            className={inputClass}
            required
            maxLength={120}
          />
        </Field>

        <Field label="Fecha de nacimiento">
          <input
            type="date"
            value={fechaNacimiento}
            onChange={(e) => setFechaNacimiento(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Sexo">
          <select
            value={sexo}
            onChange={(e) => setSexo(e.target.value)}
            className={selectClass}
          >
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
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
          {pending ? "Guardando…" : "Crear familiar"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const selectClass = inputClass;

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
