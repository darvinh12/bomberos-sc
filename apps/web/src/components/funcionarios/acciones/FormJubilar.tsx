"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { jubilar } from "./actions";
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

const MONEDAS = [
  { value: "VES", label: "VES (Bolívares)" },
  { value: "USD", label: "USD" },
];

export default function FormJubilar({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [tipo, setTipo] = useState("ORDINARIA");
  const [numeroResolucion, setNumeroResolucion] = useState("");
  const [pension, setPension] = useState("");
  const [moneda, setMoneda] = useState("VES");
  const [gaceta, setGaceta] = useState("");
  const [obs, setObs] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha de jubilación es obligatoria");
      return;
    }
    if (!numeroResolucion.trim()) {
      setError("El número de resolución es obligatorio");
      return;
    }
    if (confirm !== "JUBILAR") {
      setError("Para confirmar escriba JUBILAR");
      return;
    }
    start(async () => {
      const r = await jubilar(funcionarioId, {
        fecha_jubilacion: fecha,
        tipo_jubilacion: tipo,
        numero_resolucion: numeroResolucion,
        pension_mensual: pension,
        moneda,
        numero_gaceta: gaceta,
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
        Esta acción cierra el período de servicio del funcionario y cambia su
        estatus a <strong>JUBILADO</strong>. No puede revertirse.
      </WarningBanner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha de jubilación" required>
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
      </div>

      <Field label="Número de resolución" required>
        <input
          type="text"
          value={numeroResolucion}
          onChange={(e) => setNumeroResolucion(e.target.value)}
          className={inputClass}
          placeholder="Ej. RES-2026-J-0012"
          required
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Pensión mensual">
          <input
            type="number"
            step="0.01"
            min={0}
            value={pension}
            onChange={(e) => setPension(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Moneda">
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
            className={inputClass}
          >
            {MONEDAS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="N° de Gaceta">
          <input
            type="text"
            value={gaceta}
            onChange={(e) => setGaceta(e.target.value)}
            className={inputClass}
            placeholder="Ej. 41.234"
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

      <Field label="Escriba JUBILAR para confirmar" required>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder="JUBILAR"
          required
        />
      </Field>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Jubilar" danger />
    </form>
  );
}
