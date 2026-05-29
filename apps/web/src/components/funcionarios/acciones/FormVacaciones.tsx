"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { iniciarVacaciones } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

export default function FormVacaciones({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [periodo, setPeriodo] = useState(String(currentYear));
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [diasCal, setDiasCal] = useState("");
  const [diasHab, setDiasHab] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const p = Number(periodo);
    if (!Number.isFinite(p) || p < 2000 || p > 2100) {
      setError("Período (año) inválido");
      return;
    }
    if (!fechaInicio || !fechaFin) {
      setError("Fechas de inicio y fin son obligatorias");
      return;
    }
    if (fechaFin < fechaInicio) {
      setError("La fecha fin no puede ser anterior a la fecha inicio");
      return;
    }
    start(async () => {
      const r = await iniciarVacaciones(funcionarioId, {
        periodo_anio: p,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dias_calendario: diasCal,
        dias_habiles: diasHab,
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Período (año)" required>
          <input
            type="number"
            min={2000}
            max={2100}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Fecha de inicio" required>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Fecha de fin" required>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Días calendario">
          <input
            type="number"
            min={0}
            value={diasCal}
            onChange={(e) => setDiasCal(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Días hábiles">
          <input
            type="number"
            min={0}
            value={diasHab}
            onChange={(e) => setDiasHab(e.target.value)}
            className={inputClass}
          />
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

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Registrar vacaciones" />
    </form>
  );
}
