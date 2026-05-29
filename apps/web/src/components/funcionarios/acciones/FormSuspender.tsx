"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suspender } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  WarningBanner,
  inputClass,
} from "./_form-shared";

export default function FormSuspender({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [resolucion, setResolucion] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fechaInicio) {
      setError("La fecha de inicio es obligatoria");
      return;
    }
    if (fechaFin && fechaFin < fechaInicio) {
      setError("La fecha fin no puede ser anterior a la fecha inicio");
      return;
    }
    if (!motivo.trim()) {
      setError("El motivo es obligatorio");
      return;
    }
    if (confirm !== "SUSPENDER") {
      setError("Para confirmar escriba SUSPENDER");
      return;
    }
    start(async () => {
      const r = await suspender(funcionarioId, {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin || undefined,
        motivo,
        resolucion,
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

      <WarningBanner>
        La suspensión cambia el estatus del funcionario a <strong>SUSPENDIDO</strong>.
        Si no indica fecha fin, la suspensión queda indefinida.
      </WarningBanner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha de inicio" required>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Fecha de fin (opcional)" hint="Vacío = indefinida">
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Motivo" required>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
          required
        />
      </Field>

      <Field label="Resolución">
        <input
          type="text"
          value={resolucion}
          onChange={(e) => setResolucion(e.target.value)}
          className={inputClass}
          placeholder="Ej. RES-2026-045"
        />
      </Field>

      <Field
        label='Escriba SUSPENDER para confirmar'
        required
      >
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder="SUSPENDER"
          required
        />
      </Field>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Suspender" danger />
    </form>
  );
}
