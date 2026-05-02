"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { crearCampoCustom, type CrearCampoState } from "./actions";

const ENTIDADES = [
  { v: "funcionario", l: "Funcionario" },
  { v: "reposo", l: "Reposo" },
  { v: "vacaciones", l: "Vacaciones" },
  { v: "permiso", l: "Permiso" },
  { v: "comision", l: "Comisión" },
  { v: "falta", l: "Falta" },
  { v: "guardia", l: "Guardia" },
  { v: "ayuda", l: "Ayuda económica" },
  { v: "ascenso", l: "Ascenso" },
  { v: "curso", l: "Curso" },
  { v: "evaluacion", l: "Evaluación" },
  { v: "proteccion", l: "Equipo de protección" },
  { v: "radio", l: "Radio" },
];

const TIPOS = [
  { v: "texto", l: "Texto corto" },
  { v: "texto_largo", l: "Texto largo" },
  { v: "numero", l: "Número" },
  { v: "fecha", l: "Fecha" },
  { v: "booleano", l: "Sí / No" },
  { v: "seleccion", l: "Selección (opciones)" },
];

const initial: CrearCampoState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Guardando…" : "Crear campo"}
    </button>
  );
}

export default function CamposForm() {
  const [state, action] = useFormState(crearCampoCustom, initial);
  const [tipo, setTipo] = useState<string>("texto");

  return (
    <form action={action} className="space-y-4" key={state.ok ? "reset" : "form"}>
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="rounded-md bg-green-50 border border-green-300 p-3 text-sm text-green-800">
          Campo creado correctamente. Refresca para verlo en la lista.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Entidad *</label>
          <select name="entidad" required defaultValue="funcionario" className="input">
            {ENTIDADES.map((e) => (
              <option key={e.v} value={e.v}>
                {e.l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Tipo *</label>
          <select
            name="tipo"
            required
            defaultValue="texto"
            className="input"
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">
            Código * <span className="text-muted-foreground">(snake_case)</span>
          </label>
          <input
            name="codigo"
            required
            pattern="^[a-z][a-z0-9_]*$"
            className="input"
            placeholder="ej. numero_chaleco"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Etiqueta visible *</label>
          <input
            name="etiqueta"
            required
            minLength={2}
            maxLength={100}
            className="input"
            placeholder="ej. Número de chaleco"
          />
        </div>
      </div>

      {tipo === "seleccion" && (
        <div>
          <label className="block text-xs font-medium mb-1">
            Opciones * <span className="text-muted-foreground">(una por línea o separadas por coma)</span>
          </label>
          <textarea
            name="opciones"
            rows={3}
            className="input"
            placeholder="Opción 1&#10;Opción 2&#10;Opción 3"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium mb-1">Texto de ayuda</label>
        <input name="ayuda" maxLength={200} className="input" />
      </div>

      <div className="flex gap-4 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Orden</label>
          <input
            type="number"
            name="orden"
            defaultValue="0"
            min="0"
            max="999"
            className="input w-24"
          />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" name="requerido" />
          Requerido
        </label>
      </div>

      <div className="flex justify-end pt-3 border-t">
        <Submit />
      </div>
    </form>
  );
}
