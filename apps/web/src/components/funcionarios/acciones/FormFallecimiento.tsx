"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarFallecimiento } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  WarningBanner,
  inputClass,
} from "./_form-shared";

export default function FormFallecimiento({
  funcionarioId,
  onSuccess,
  onCancel,
}: BaseFormProps) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [causa, setCausa] = useState("");
  const [lugar, setLugar] = useState("");
  const [certificado, setCertificado] = useState("");
  const [obs, setObs] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fecha) {
      setError("La fecha de fallecimiento es obligatoria");
      return;
    }
    if (confirm !== "CONFIRMO") {
      setError("Para confirmar escriba CONFIRMO");
      return;
    }
    start(async () => {
      const r = await registrarFallecimiento(funcionarioId, {
        fecha_fallecimiento: fecha,
        causa,
        lugar,
        numero_certificado_defuncion: certificado,
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
        estatus a <strong>FALLECIDO</strong>. No puede revertirse.
      </WarningBanner>

      <Field label="Fecha de fallecimiento" required>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className={inputClass}
          required
        />
      </Field>

      <Field label="Causa">
        <input
          type="text"
          value={causa}
          onChange={(e) => setCausa(e.target.value)}
          className={inputClass}
          placeholder="Ej. Infarto agudo de miocardio"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Lugar">
          <input
            type="text"
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            className={inputClass}
            placeholder="Ej. Hospital Militar"
          />
        </Field>
        <Field label="N° certificado defunción">
          <input
            type="text"
            value={certificado}
            onChange={(e) => setCertificado(e.target.value)}
            className={inputClass}
            placeholder="Ej. CD-2026-1234"
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

      <Field label="Escriba CONFIRMO para confirmar" required>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder="CONFIRMO"
          required
        />
      </Field>

      <FormActions
        onCancel={onCancel}
        pending={pending}
        submitLabel="Registrar fallecimiento"
        danger
      />
    </form>
  );
}
