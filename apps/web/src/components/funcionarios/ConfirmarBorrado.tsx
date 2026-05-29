"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  titulo: string;
  descripcion: string;
  onConfirm: (motivo: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Modal de confirmación con motivo obligatorio para borrado lógico.
 *
 * - `onConfirm(motivo)` debe llamar a la server-action correspondiente y lanzar
 *   en caso de error. Si resuelve sin lanzar, el modal cierra solo.
 * - Validación: mínimo 3 caracteres (alineado con el `min_length=3` del API).
 * - Bloquea cierre por overlay mientras hay una llamada en curso.
 * - Tecla Escape cierra; foco inicial sobre el textarea.
 */
export default function ConfirmarBorrado({
  titulo,
  descripcion,
  onConfirm,
  onClose,
}: Props) {
  const [motivo, setMotivo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const limpio = motivo.trim();
    if (limpio.length < 3) {
      setError("Debes indicar un motivo (mínimo 3 caracteres)");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onConfirm(limpio);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setPending(false);
    }
  }

  function handleOverlay() {
    if (pending) return;
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-borrado-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlay}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onClose();
      }}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3
            id="confirmar-borrado-titulo"
            className="font-bold text-destructive"
          >
            {titulo}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">{descripcion}</p>

          {error && (
            <div
              role="alert"
              className="rounded bg-destructive/10 border border-destructive/30 p-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium">
              Motivo del borrado <span className="text-destructive">*</span>
            </span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={3}
              rows={3}
              placeholder="Ej: Dato registrado por error, duplicado, etc."
              disabled={pending}
              className="w-full mt-1 rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </label>

          <p className="text-xs text-muted-foreground">
            El registro se marcará como eliminado pero se conservará en
            auditoría. Solo el rol ADMIN puede restaurarlo.
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
