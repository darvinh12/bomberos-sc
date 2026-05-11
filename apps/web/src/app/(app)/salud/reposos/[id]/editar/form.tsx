"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { actualizarReposo, type EditState } from "./actions";
import type { CampoCustom } from "@/app/(app)/admin/campos-custom/actions";

interface Reposo {
  id: number;
  funcionario_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  diagnostico_libre: string | null;
  folio: string | null;
  documento_url: string | null;
  observaciones: string | null;
  anulado: boolean;
  metadata?: Record<string, unknown>;
}

const initial: EditState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}

export default function EditarForm({
  reposo,
  camposCustom,
}: {
  reposo: Reposo;
  camposCustom: CampoCustom[];
}) {
  const action = actualizarReposo.bind(null, reposo.id);
  const [state, dispatch] = useFormState(action, initial);
  const meta = reposo.metadata ?? {};

  return (
    <form action={dispatch} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Fecha inicio</label>
          <input
            type="date"
            value={reposo.fecha_inicio}
            disabled
            className="input opacity-60"
          />
          <p className="text-[10px] text-muted-foreground mt-1">No se puede modificar el inicio</p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fecha fin *</label>
          <input
            type="date"
            name="fecha_fin"
            defaultValue={reposo.fecha_fin}
            required
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Diagnóstico</label>
        <input
          name="diagnostico_libre"
          defaultValue={reposo.diagnostico_libre ?? ""}
          className="input"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Folio</label>
          <input name="folio" defaultValue={reposo.folio ?? ""} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">URL del documento</label>
          <input
            type="url"
            name="documento_url"
            defaultValue={reposo.documento_url ?? ""}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">Observaciones</label>
        <textarea
          name="observaciones"
          rows={3}
          defaultValue={reposo.observaciones ?? ""}
          className="input"
        />
      </div>

      {camposCustom.length > 0 && (
        <fieldset className="border rounded-lg p-4 bg-muted/20">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
            Campos personalizados
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {camposCustom.map((c) => (
              <div key={c.id}>
                <label className="block text-xs font-medium mb-1">
                  {c.etiqueta}
                  {c.requerido && <span className="text-destructive ml-1">*</span>}
                </label>
                <CampoInput campo={c} valor={meta[c.codigo]} />
                {c.ayuda && (
                  <p className="text-[10px] text-muted-foreground mt-1">{c.ayuda}</p>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <details className="rounded-lg border p-3 bg-destructive/5">
        <summary className="text-sm font-medium cursor-pointer text-destructive">
          Anular reposo
        </summary>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="anulado" />
            Marcar como anulado
          </label>
          <div>
            <label className="block text-xs font-medium mb-1">Motivo</label>
            <input name="motivo_anulacion" className="input" />
          </div>
        </div>
      </details>

      <div className="flex justify-between pt-4 border-t">
        <Link
          href="/salud/reposos"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <Submit />
      </div>
    </form>
  );
}

function CampoInput({ campo, valor }: { campo: CampoCustom; valor: unknown }) {
  const name = `metadata.${campo.codigo}`;
  const v = valor === null || valor === undefined ? "" : String(valor);
  switch (campo.tipo) {
    case "texto_largo":
      return <textarea name={name} rows={2} defaultValue={v} className="input" required={campo.requerido} />;
    case "numero":
      return <input type="number" name={name} defaultValue={v} className="input" required={campo.requerido} />;
    case "fecha":
      return <input type="date" name={name} defaultValue={v} className="input" required={campo.requerido} />;
    case "booleano":
      return (
        <select name={name} defaultValue={v} className="input">
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    case "seleccion":
      return (
        <select name={name} defaultValue={v} className="input" required={campo.requerido}>
          <option value="">—</option>
          {(campo.opciones ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    default:
      return <input type="text" name={name} defaultValue={v} className="input" required={campo.requerido} />;
  }
}
