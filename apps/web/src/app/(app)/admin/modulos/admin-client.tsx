"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  actualizarModulo,
  borrarModulo,
  type ModuloFormState,
} from "./actions";
import type { Modulo } from "../permisos/actions";

function BoolIcon({ value }: { value: boolean }) {
  return value ? (
    <Check className="w-4 h-4 text-emerald-400 inline" aria-label="Activo" />
  ) : (
    <X className="w-4 h-4 text-muted-foreground inline" aria-label="Inactivo" />
  );
}

export default function ModulosAdmin({ modulos }: { modulos: Modulo[] }) {
  const [editando, setEditando] = useState<number | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3 font-medium">Código</th>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">Descripción</th>
              <th className="text-center p-3 font-medium w-20">Orden</th>
              <th className="text-center p-3 font-medium w-20">Activo</th>
              <th className="text-right p-3 font-medium w-44">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {modulos.map((m) => {
              const enEdicion = editando === m.id;
              return (
                <tr key={m.id} className="border-t hover:bg-muted/20 align-top">
                  {enEdicion ? (
                    <FilaEdicion
                      modulo={m}
                      onDone={() => setEditando(null)}
                    />
                  ) : (
                    <>
                      <td className="p-3 font-mono text-xs">{m.codigo}</td>
                      <td className="p-3 font-medium">{m.nombre}</td>
                      <td className="p-3 text-muted-foreground">
                        {m.descripcion ?? "—"}
                      </td>
                      <td className="p-3 text-center">{m.orden}</td>
                      <td className="p-3 text-center"><BoolIcon value={m.activo} /></td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditando(m.id)}
                          className="text-xs underline"
                        >
                          editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoBorrar(m.id)}
                          className="text-xs underline text-destructive"
                        >
                          borrar
                        </button>
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
          moduloId={confirmandoBorrar}
          modulo={modulos.find((m) => m.id === confirmandoBorrar)!}
          onDone={() => setConfirmandoBorrar(null)}
        />
      )}
    </div>
  );
}

function FilaEdicion({
  modulo,
  onDone,
}: {
  modulo: Modulo;
  onDone: () => void;
}) {
  const [nombre, setNombre] = useState(modulo.nombre);
  const [descripcion, setDescripcion] = useState(modulo.descripcion ?? "");
  const [icono, setIcono] = useState(modulo.icono ?? "");
  const [orden, setOrden] = useState(modulo.orden);
  const [activo, setActivo] = useState(modulo.activo);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const guardar = () => {
    setError(null);
    start(async () => {
      const r = await actualizarModulo(modulo.id, {
        nombre,
        descripcion: descripcion || null,
        icono: icono || null,
        orden,
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
          <div className="font-mono">{modulo.codigo}</div>
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
          <span className="text-xs text-muted-foreground">Icono</span>
          <input
            value={icono}
            onChange={(e) => setIcono(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-muted-foreground">Descripción</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Orden</span>
          <input
            type="number"
            value={orden}
            onChange={(e) => setOrden(Number(e.target.value))}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
          Activo
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
  moduloId,
  modulo,
  onDone,
}: {
  moduloId: number;
  modulo: Modulo;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirmar = () => {
    setError(null);
    start(async () => {
      const r = await borrarModulo(moduloId);
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="font-semibold">¿Borrar módulo &quot;{modulo.nombre}&quot;?</h3>
        <p className="text-sm text-muted-foreground">
          Si solo querés ocultarlo, desactivalo en lugar de borrarlo. Borrar
          también elimina todos sus permisos por rol.
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
