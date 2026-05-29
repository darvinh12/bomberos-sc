"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarRadioFuncionario } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

export interface ItemRadio {
  id: number;
  codigo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
  estatus?: string | null;
}

interface Props extends BaseFormProps {
  radios: ItemRadio[];
}

function describirRadio(r: ItemRadio): string {
  const partes = [
    r.marca,
    r.modelo,
    r.serial ? `S/N ${r.serial}` : null,
    r.codigo ? `#${r.codigo}` : `#${r.id}`,
  ].filter(Boolean);
  return partes.join(" · ");
}

export default function FormAsignarRadio({
  funcionarioId,
  onSuccess,
  onCancel,
  radios,
}: Props) {
  const router = useRouter();
  const [radioId, setRadioId] = useState("");
  const [fecha, setFecha] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Por defecto mostramos solo radios disponibles, pero si la lista llega vacía
  // (la API real puede no exponer el filtro), mostramos todas.
  const disponibles = radios.filter(
    (r) => !r.estatus || ["DISPONIBLE", "ALMACEN"].includes(r.estatus.toUpperCase()),
  );
  const lista = disponibles.length > 0 ? disponibles : radios;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!radioId) {
      setError("Seleccione el radio");
      return;
    }
    if (!fecha) {
      setError("La fecha de asignación es obligatoria");
      return;
    }
    start(async () => {
      const r = await asignarRadioFuncionario(funcionarioId, {
        radio_id: radioId,
        fecha_asignacion: fecha,
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

      <Field label="Radio" required>
        <select
          value={radioId}
          onChange={(e) => setRadioId(e.target.value)}
          className={inputClass}
          required
        >
          <option value="">Seleccione…</option>
          {lista.map((r) => (
            <option key={r.id} value={r.id}>
              {describirRadio(r)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Fecha de asignación" required>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className={inputClass}
          required
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

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Asignar radio" />
    </form>
  );
}
