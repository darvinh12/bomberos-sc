"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { iniciarPermiso } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

const TIPOS = [
  { value: "PATERNIDAD", label: "Paternidad" },
  { value: "MATERNIDAD", label: "Maternidad" },
  { value: "DUELO", label: "Duelo" },
  { value: "DEPORTIVO", label: "Deportivo" },
  { value: "NO_REMUNERADO", label: "No remunerado" },
  { value: "ESTUDIO", label: "Estudio" },
  { value: "OTRO", label: "Otro" },
];

export default function FormPermiso({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horas, setHoras] = useState("");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!tipo) {
      setError("Seleccione el tipo de permiso");
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
    if (!motivo.trim()) {
      setError("El motivo es obligatorio");
      return;
    }
    start(async () => {
      const r = await iniciarPermiso(funcionarioId, {
        tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        horas,
        motivo,
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
        <Field label="Tipo" required>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Horas (opcional)">
          <input
            type="number"
            min={0}
            step="0.5"
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            className={inputClass}
            placeholder="Ej. 4"
          />
        </Field>
      </div>

      <Field label="Motivo" required>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          className={`${inputClass} resize-y`}
          required
        />
      </Field>

      <Field label="Observaciones">
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Registrar permiso" />
    </form>
  );
}
