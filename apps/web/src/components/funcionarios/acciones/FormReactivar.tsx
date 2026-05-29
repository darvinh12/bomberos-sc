"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reactivar } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  WarningBanner,
  inputClass,
} from "./_form-shared";

const MOTIVOS = [
  { value: "FIN_REPOSO", label: "Fin de reposo médico" },
  { value: "FIN_COMISION", label: "Fin de comisión" },
  { value: "FIN_SUSPENSION", label: "Fin de suspensión" },
  { value: "OTRO", label: "Otro" },
];

interface Props extends BaseFormProps {
  estatusActual: string;
}

export default function FormReactivar({
  funcionarioId,
  onSuccess,
  onCancel,
  estatusActual,
}: Props) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha efectiva es obligatoria");
      return;
    }
    start(async () => {
      const motivoLabel = MOTIVOS.find((m) => m.value === motivo)?.label ?? motivo;
      const r = await reactivar(funcionarioId, {
        fecha_efectiva: fecha,
        motivo: motivoLabel,
        observaciones: obs,
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
        El funcionario volverá al estatus <strong>ACTIVO</strong> desde{" "}
        <strong>{estatusActual}</strong>.
      </WarningBanner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha efectiva" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Motivo">
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {MOTIVOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Observaciones">
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Reactivar" />
    </form>
  );
}
