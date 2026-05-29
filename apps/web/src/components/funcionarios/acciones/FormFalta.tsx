"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarFalta } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

const TIPOS = [
  { value: "LEVE", label: "Leve" },
  { value: "MEDIA", label: "Media" },
  { value: "GRAVE", label: "Grave" },
];

export default function FormFalta({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState("");
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sancion, setSancion] = useState("");
  const [dias, setDias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!tipo) {
      setError("Seleccione el tipo de falta");
      return;
    }
    if (!fecha) {
      setError("La fecha es obligatoria");
      return;
    }
    if (!descripcion.trim()) {
      setError("La descripción es obligatoria");
      return;
    }
    start(async () => {
      const r = await registrarFalta(funcionarioId, {
        tipo_falta: tipo,
        fecha,
        descripcion,
        sancion,
        dias_suspension: dias,
      });
      if (r.ok) {
        onSuccess();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tipo de falta" required>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Seleccione…</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
      </div>

      <Field label="Descripción" required>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
          required
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Sanción aplicada">
          <input
            type="text"
            value={sancion}
            onChange={(e) => setSancion(e.target.value)}
            className={inputClass}
            placeholder="Ej. Amonestación escrita"
          />
        </Field>
        <Field label="Días de suspensión">
          <input
            type="number"
            min={0}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Registrar falta" />
    </form>
  );
}
