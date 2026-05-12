"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MoreVertical, Eye, Pencil } from "lucide-react";

interface Props {
  id: number;
  puedeEditar: boolean;
}

export default function FuncionarioActions({ id, puedeEditar }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="flex items-center justify-end gap-3">
      {/* Desktop: text links */}
      <Link
        href={`/funcionarios/${id}`}
        className="hidden md:inline text-primary hover:underline text-xs"
      >
        Ver
      </Link>
      {puedeEditar && (
        <Link
          href={`/funcionarios/${id}/editar`}
          className="hidden md:inline text-primary hover:underline text-xs font-medium"
        >
          Editar →
        </Link>
      )}

      {/* Mobile: ⋮ dropdown */}
      <div className="relative md:hidden" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          aria-label="Acciones"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-1 w-36 bg-card border border-border rounded shadow-xl overflow-hidden">
            <Link
              href={`/funcionarios/${id}`}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
              onClick={() => setOpen(false)}
            >
              <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              Ver ficha
            </Link>
            {puedeEditar && (
              <Link
                href={`/funcionarios/${id}/editar`}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors border-t border-border"
                onClick={() => setOpen(false)}
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                Editar
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
