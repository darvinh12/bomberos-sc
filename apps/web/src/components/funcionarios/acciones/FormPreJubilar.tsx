"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { solicitarJubilacion } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  WarningBanner,
  inputClass,
} from "./_form-shared";

const TIPOS = [
  { value: "ORDINARIA", label: "Ordinaria" },
  { value: "ESPECIAL", label: "Especial" },
  { value: "INVALIDEZ", label: "Invalidez" },
];

export default function FormPreJubilar({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState("ORDINARIA");
  const [anios, setAnios] = useState("");
  const [baseLegal, setBaseLegal] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha de solicitud es obligatoria");
      return;
    }
    start(async () => {
      const r = await solicitarJubilacion(funcionarioId, {
        fecha_solicitud: fecha,
        tipo_jubilacion: tipo,
        anios_servicio: anios,
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
        Esto inicia el trámite de jubilación. El funcionario pasa a estatus{" "}
        <strong>PRE_JUBILADO</strong> hasta que se complete con la acción "Jubilar".
      </WarningBanner>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Fecha de solicitud" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Tipo de jubilación">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={inputClass}
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Años de servicio">
          <input
            type="number"
            step="0.5"
            min={0}
            value={anios}
            onChange={(e) => setAnios(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Base legal">
        <input
          type="text"
          value={baseLegal}
          onChange={(e) => setBaseLegal(e.target.value)}
          className={inputClass}
          placeholder="Ej. Art. 13 Ley del Estatuto sobre el Régimen de Jubilaciones"
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

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Crear solicitud" />
    </form>
  );
}
