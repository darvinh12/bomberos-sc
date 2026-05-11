"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearFuncionario, type NuevoFuncionarioState } from "./actions";

interface Cat {
  id: number;
  nombre: string;
}

const initial: NuevoFuncionarioState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60 transition"
    >
      {pending ? "Guardando…" : "Crear funcionario"}
    </button>
  );
}

export default function NuevoForm({
  jerarquias,
  cargos,
  zonas,
  estaciones,
}: {
  jerarquias: Cat[];
  cargos: Cat[];
  zonas: Cat[];
  estaciones: Cat[];
}) {
  const [state, action] = useFormState(crearFuncionario, initial);

  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Nacionalidad" required>
          <select name="nacionalidad" required defaultValue="V" className="input">
            <option value="V">Venezolano</option>
            <option value="E">Extranjero</option>
          </select>
        </Field>
        <Field label="Cédula" required className="md:col-span-2">
          <input type="number" name="cedula" required min="1" className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Apellidos" required>
          <input name="apellidos" required minLength={2} maxLength={100} className="input" />
        </Field>
        <Field label="Nombres" required>
          <input name="nombres" required minLength={2} maxLength={100} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Fecha de nacimiento">
          <input type="date" name="fecha_nacimiento" className="input" />
        </Field>
        <Field label="Sexo">
          <select name="sexo" defaultValue="" className="input">
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </Field>
        <Field label="Fecha de primer ingreso" required>
          <input type="date" name="fecha_primer_ingreso" required className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Jerarquía">
          <select name="jerarquia_id" defaultValue="" className="input">
            <option value="">—</option>
            {jerarquias.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cargo">
          <select name="cargo_id" defaultValue="" className="input">
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
          <select name="zona_id" defaultValue="" className="input">
            <option value="">—</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estación">
          <select name="estacion_id" defaultValue="" className="input">
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
          <input type="email" name="correo" className="input" />
        </Field>
        <Field label="Teléfono móvil">
          <input name="telefono_movil" placeholder="+58 414 555-0100" className="input" />
        </Field>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Link
          href="/funcionarios"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <Submit />
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
