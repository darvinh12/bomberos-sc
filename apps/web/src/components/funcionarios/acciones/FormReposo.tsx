"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Catalogo } from "@/lib/catalogos";
import { iniciarReposo } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

interface Props extends BaseFormProps {
  tiposReposo: Catalogo[];
}

export default function FormReposo({
  funcionarioId,
  onSuccess,
  onCancel,
  tiposReposo,
}: Props) {
  const router = useRouter();
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [tipoReposoId, setTipoReposoId] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [folio, setFolio] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fechaInicio || !fechaFin) {
      setError("Fechas de inicio y fin son obligatorias");
      return;
    }
    if (fechaFin < fechaInicio) {
      setError("La fecha fin no puede ser anterior a la fecha inicio");
      return;
    }
    start(async () => {
      const r = await iniciarReposo(funcionarioId, {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        tipo_reposo_id: tipoReposoId,
        diagnostico_libre: diagnostico,
        folio,
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

      <Field label="Tipo de reposo">
        <select
          value={tipoReposoId}
          onChange={(e) => setTipoReposoId(e.target.value)}
          className={inputClass}
        >
          <option value="">—</option>
          {tiposReposo.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Diagnóstico">
        <input
          type="text"
          value={diagnostico}
          onChange={(e) => setDiagnostico(e.target.value)}
          className={inputClass}
          placeholder="Ej. Lumbalgia aguda"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Folio">
          <input
            type="text"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            className={inputClass}
            placeholder="Ej. F-2026-001"
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

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Registrar reposo" />
    </form>
  );
}
