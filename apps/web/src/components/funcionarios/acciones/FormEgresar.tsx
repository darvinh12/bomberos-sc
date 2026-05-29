"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { egresar } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  WarningBanner,
  inputClass,
} from "./_form-shared";

const MOTIVOS = [
  { value: "RENUNCIA", label: "Renuncia" },
  { value: "DESTITUCION", label: "Destitución" },
  { value: "ABANDONO_TRABAJO", label: "Abandono de trabajo" },
  { value: "OTRO", label: "Otro" },
];

export default function FormEgresar({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [baseLegal, setBaseLegal] = useState("");
  const [obs, setObs] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha de egreso es obligatoria");
      return;
    }
    if (!motivo) {
      setError("Seleccione el motivo del egreso");
      return;
    }
    if (confirm !== "EGRESAR") {
      setError("Para confirmar escriba EGRESAR");
      return;
    }
    start(async () => {
      const r = await egresar(funcionarioId, {
        fecha_egreso: fecha,
        motivo,
        base_legal: baseLegal,
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
        El egreso es una baja administrativa. El estatus pasa a{" "}
        <strong>EGRESADO</strong> y el funcionario sale de la nómina activa.
      </WarningBanner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha de egreso" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Motivo" required>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Seleccione…</option>
            {MOTIVOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Base legal">
        <input
          type="text"
          value={baseLegal}
          onChange={(e) => setBaseLegal(e.target.value)}
          className={inputClass}
          placeholder="Ej. Art. 78 Estatuto Funcionarial"
        />
      </Field>

      <Field label="Observaciones">
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <Field label="Escriba EGRESAR para confirmar" required>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder="EGRESAR"
          required
        />
      </Field>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Egresar" danger />
    </form>
  );
}
