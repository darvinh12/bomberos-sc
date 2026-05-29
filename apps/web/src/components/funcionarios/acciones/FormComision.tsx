"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarComision } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

export default function FormComision({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [institucion, setInstitucion] = useState("");
  const [cargo, setCargo] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [resolucion, setResolucion] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!institucion.trim()) {
      setError("La institución es obligatoria");
      return;
    }
    if (!fechaInicio) {
      setError("La fecha de inicio es obligatoria");
      return;
    }
    if (fechaFin && fechaFin < fechaInicio) {
      setError("La fecha fin no puede ser anterior a la fecha inicio");
      return;
    }
    start(async () => {
      const r = await asignarComision(funcionarioId, {
        institucion_libre: institucion,
        cargo_comision: cargo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin || undefined,
        resolucion,
        motivo,
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

      <Field label="Institución" required>
        <input
          type="text"
          value={institucion}
          onChange={(e) => setInstitucion(e.target.value)}
          className={inputClass}
          placeholder="Ej. Protección Civil"
          required
        />
      </Field>

      <Field label="Cargo en comisión">
        <input
          type="text"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          className={inputClass}
          placeholder="Ej. Coordinador operativo"
        />
      </Field>

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
        <Field label="Fecha de fin (opcional)">
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Resolución">
        <input
          type="text"
          value={resolucion}
          onChange={(e) => setResolucion(e.target.value)}
          className={inputClass}
          placeholder="Ej. RES-2026-100"
        />
      </Field>

      <Field label="Motivo">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Asignar comisión" />
    </form>
  );
}
