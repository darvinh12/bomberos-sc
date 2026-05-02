"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { actualizarFuncionario, type EditState } from "./actions";
import type { CampoCustom } from "@/app/(app)/admin/campos-custom/actions";

interface Cat {
  id: number;
  nombre: string;
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
  funcionario,
  jerarquias,
  cargos,
  zonas,
  estaciones,
  camposCustom,
  esAdmin,
}: {
  funcionario: Record<string, unknown>;
  jerarquias: Cat[];
  cargos: Cat[];
  zonas: Cat[];
  estaciones: Cat[];
  camposCustom: CampoCustom[];
  esAdmin: boolean;
}) {
  const id = Number(funcionario.id);
  const action = actualizarFuncionario.bind(null, id);
  const [state, dispatch] = useFormState(action, initial);

  const v = (k: string): string => {
    const val = funcionario[k];
    if (val === null || val === undefined) return "";
    return String(val);
  };
  const meta = (funcionario.metadata as Record<string, unknown> | undefined) ?? {};

  return (
    <form action={dispatch} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Apellidos" required>
          <input name="apellidos" required defaultValue={v("apellidos")} className="input" />
        </Field>
        <Field label="Nombres" required>
          <input name="nombres" required defaultValue={v("nombres")} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Fecha de nacimiento">
          <input
            type="date"
            name="fecha_nacimiento"
            defaultValue={v("fecha_nacimiento")}
            className="input"
          />
        </Field>
        <Field label="Sexo">
          <select name="sexo" defaultValue={v("sexo")} className="input">
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </Field>
        <Field label="Profesión">
          <input name="profesion" defaultValue={v("profesion")} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Jerarquía">
          <select name="jerarquia_id" defaultValue={v("jerarquia_id")} className="input">
            <option value="">—</option>
            {jerarquias.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cargo">
          <select name="cargo_id" defaultValue={v("cargo_id")} className="input">
            <option value="">—</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Zona">
          <select name="zona_id" defaultValue={v("zona_id")} className="input">
            <option value="">—</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estación">
          <select name="estacion_id" defaultValue={v("estacion_id")} className="input">
            <option value="">—</option>
            {estaciones.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Correo">
          <input type="email" name="correo" defaultValue={v("correo")} className="input" />
        </Field>
        <Field label="Teléfono móvil">
          <input
            name="telefono_movil"
            defaultValue={v("telefono_movil")}
            placeholder="+58 414 555-0100"
            className="input"
          />
        </Field>
      </div>

      <Field label="Observaciones">
        <textarea
          name="observaciones"
          rows={3}
          defaultValue={v("observaciones")}
          className="input"
        />
      </Field>

      {camposCustom.length > 0 && (
        <fieldset className="border rounded-lg p-4 bg-muted/20">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
            Campos personalizados
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {camposCustom.map((c) => (
              <Field key={c.id} label={c.etiqueta} required={c.requerido} hint={c.ayuda}>
                <CampoInput campo={c} valor={meta[c.codigo]} />
              </Field>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex justify-between pt-4 border-t">
        <Link
          href={`/funcionarios/${id}`}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <div className="flex items-center gap-3">
          {esAdmin && (
            <span className="text-xs text-muted-foreground">
              Modo administrador — sin restricciones
            </span>
          )}
          <Submit />
        </div>
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

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
