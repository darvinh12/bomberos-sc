"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Modal reusable para las acciones del funcionario.
 *
 * - Cierra con ESC y con click fuera del contenido.
 * - Foco inicial sobre el botón cerrar (focus trap básico).
 * - Bloquea el scroll del body mientras está abierto.
 * - Marcado accesible (`role="dialog"`, `aria-modal`, `aria-labelledby`).
 */
export default function ModalAccion({ title, description, onClose, children }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco inicial deliberado para que ESC funcione sin click previo.
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-2xl max-w-2xl w-full my-8 md:my-0 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="font-bold text-foreground truncate">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
