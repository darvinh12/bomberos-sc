"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarProteccion } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

export interface ItemProteccion {
  id: number;
  codigo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  talla?: string | null;
  tipo_nombre?: string | null;
}

interface Props extends BaseFormProps {
  inventario: ItemProteccion[];
}

const ESTADOS = [
  { value: "NUEVO", label: "Nuevo" },
  { value: "USADO", label: "Usado" },
  { value: "REPARADO", label: "Reparado" },
];

function describirItem(it: ItemProteccion): string {
  const partes = [
    it.tipo_nombre,
    it.marca,
    it.modelo,
    it.talla ? `Talla ${it.talla}` : null,
    it.codigo ? `#${it.codigo}` : `#${it.id}`,
  ].filter(Boolean);
  return partes.join(" · ");
}

export default function FormAsignarProteccion({
  funcionarioId,
  onSuccess,
  onCancel,
  inventario,
}: Props) {
  const router = useRouter();
  const [inventarioId, setInventarioId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [estado, setEstado] = useState("NUEVO");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!inventarioId) {
      setError("Seleccione el ítem de inventario");
      return;
    }
    if (!fechaEntrega) {
      setError("La fecha de entrega es obligatoria");
      return;
    }
    start(async () => {
      const r = await asignarProteccion(funcionarioId, {
        inventario_id: inventarioId,
        fecha_entrega: fechaEntrega,
        estado_entrega: estado,
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

      <Field label="Ítem de inventario" required>
        <select
          value={inventarioId}
          onChange={(e) => setInventarioId(e.target.value)}
          className={inputClass}
          required
        >
          <option value="">Seleccione…</option>
          {inventario.map((it) => (
            <option key={it.id} value={it.id}>
              {describirItem(it)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fecha de entrega" required>
          <input
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Estado de entrega">
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className={inputClass}
          >
            {ESTADOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Asignar protección" />
    </form>
  );
}
