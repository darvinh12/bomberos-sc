"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Catalogo } from "@/lib/catalogos";
import { ascender } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

const TIPOS_DOC = [
  { value: "DECRETO", label: "Decreto" },
  { value: "RESOLUCION", label: "Resolución" },
  { value: "OFICIO", label: "Oficio" },
  { value: "ORDEN_GENERAL", label: "Orden general" },
];

interface Props extends BaseFormProps {
  jerarquias: Catalogo[];
}

export default function FormAscender({
  funcionarioId,
  onSuccess,
  onCancel,
  jerarquias,
}: Props) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [jerarquiaId, setJerarquiaId] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [numeroDoc, setNumeroDoc] = useState("");
  const [fechaEfectiva, setFechaEfectiva] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha es obligatoria");
      return;
    }
    if (!jerarquiaId) {
      setError("Seleccione una jerarquía");
      return;
    }
    start(async () => {
      const r = await ascender(funcionarioId, {
        fecha,
        jerarquia_id: jerarquiaId,
        tipo_documento: tipoDoc || undefined,
        numero_documento: numeroDoc,
        fecha_efectiva_nomina: fechaEfectiva,
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
        <Field label="Fecha del cambio" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Jerarquía nueva" required>
          <select
            value={jerarquiaId}
            onChange={(e) => setJerarquiaId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Seleccione…</option>
            {jerarquias.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tipo de documento">
          <select
            value={tipoDoc}
            onChange={(e) => setTipoDoc(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {TIPOS_DOC.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Número de documento">
          <input
            type="text"
            value={numeroDoc}
            onChange={(e) => setNumeroDoc(e.target.value)}
            className={inputClass}
            placeholder="Ej. 234-2026"
          />
        </Field>
      </div>

      <Field label="Fecha efectiva en nómina">
        <input
          type="date"
          value={fechaEfectiva}
          onChange={(e) => setFechaEfectiva(e.target.value)}
          className={inputClass}
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

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Registrar ascenso" />
    </form>
  );
}
