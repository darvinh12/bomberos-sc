"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { Check, X } from "lucide-react";
import {
  actualizarRol,
  borrarRol,
  crearRol,
  type RolFormState,
} from "./actions";
import type { Rol } from "../permisos/actions";

export default function RolesAdmin({ roles }: { roles: Rol[] }) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
        >
          {creando ? "Cancelar" : "+ Nuevo rol"}
        </button>
      </div>

      {creando && <FormularioCrear onDone={() => setCreando(false)} />}

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3 font-medium">Código</th>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">Descripción</th>
              <th className="text-center p-3 font-medium w-24">Sistema</th>
              <th className="text-center p-3 font-medium w-20">Activo</th>
              <th className="text-right p-3 font-medium w-44">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const enEdicion = editando === r.id;
              return (
                <tr key={r.id} className="border-t hover:bg-muted/20 align-top">
                  {enEdicion ? (
                    <FilaEdicion
                      rol={r}
                      onDone={() => setEditando(null)}
                    />
                  ) : (
                    <>
                      <td className="p-3 font-mono text-xs">{r.codigo}</td>
                      <td className="p-3 font-medium">{r.nombre}</td>
                      <td className="p-3 text-muted-foreground">
                        {r.descripcion ?? "—"}
                      </td>
                      <td className="p-3 text-center">
                        {r.es_sistema ? "Sí" : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {r.activo ? (
                          <Check className="w-4 h-4 text-emerald-400 inline" aria-label="Activo" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground inline" aria-label="Inactivo" />
                        )}
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditando(r.id)}
                          className="text-xs underline"
                        >
                          editar
                        </button>
                        {!r.es_sistema && (
                          <button
                            type="button"
                            onClick={() => setConfirmandoBorrar(r.id)}
                            className="text-xs underline text-destructive"
                          >
                            borrar
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmandoBorrar !== null && (
        <ConfirmarBorrar
          rolId={confirmandoBorrar}
          rol={roles.find((r) => r.id === confirmandoBorrar)!}
          onDone={() => setConfirmandoBorrar(null)}
        />
      )}
    </div>
  );
}

function FormularioCrear({ onDone }: { onDone: () => void }) {
  const [state, action] = useFormState<RolFormState, FormData>(crearRol, {});
  if (state.ok) {
    queueMicrotask(onDone);
  }
  return (
    <form
      action={action}
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      <h3 className="font-semibold">Nuevo rol</h3>
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
          {state.error}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground">Código</span>
          <input
            name="codigo"
            required
            placeholder="MEDICO"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono uppercase"
          />
          <span className="text-[10px] text-muted-foreground">
            Mayúsculas, dígitos o &apos;_&apos;. Empieza con letra.
          </span>
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Nombre</span>
          <input
            name="nombre"
            required
            placeholder="Médico"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-muted-foreground">Descripción</span>
          <input
            name="descripcion"
            placeholder="Personal de salud"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked />
          Activo
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
        >
          Crear
        </button>
      </div>
    </form>
  );
}

function FilaEdicion({ rol, onDone }: { rol: Rol; onDone: () => void }) {
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? "");
  const [activo, setActivo] = useState(rol.activo);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const guardar = () => {
    setError(null);
    start(async () => {
      const r = await actualizarRol(rol.id, {
        nombre,
        descripcion: descripcion || null,
        activo,
      });
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };

  return (
    <td colSpan={6} className="p-3 bg-muted/10">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Código</div>
          <div className="font-mono">{rol.codigo}</div>
        </div>
        <label className="block">
          <span className="text-xs text-muted-foreground">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Descripción</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activo}
            disabled={rol.es_sistema}
            onChange={(e) => setActivo(e.target.checked)}
          />
          Activo {rol.es_sistema && "(rol de sistema)"}
        </label>
      </div>
      {error && (
        <div className="mt-2 rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={pending}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </td>
  );
}

function ConfirmarBorrar({
  rolId,
  rol,
  onDone,
}: {
  rolId: number;
  rol: Rol;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirmar = () => {
    setError(null);
    start(async () => {
      const r = await borrarRol(rolId);
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="font-semibold">¿Borrar el rol &quot;{rol.nombre}&quot;?</h3>
        <p className="text-sm text-muted-foreground">
          Si el rol tiene usuarios asignados, no se puede borrar. Desasignalos
          primero.
        </p>
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border px-3 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={pending}
            className="rounded-md bg-destructive text-destructive-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Borrando…" : "Borrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
