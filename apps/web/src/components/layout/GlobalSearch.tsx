"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  id: number;
  nacionalidad: string;
  cedula: number;
  nombre_completo: string | null;
  apellidos: string;
  nombres: string;
  estatus: string;
  jerarquia_id: number | null;
}

const ESTATUS_DOT: Record<string, string> = {
  ACTIVO: "bg-green-500",
  REPOSO: "bg-yellow-500",
  COMISION: "bg-blue-500",
  PRE_JUBILADO: "bg-purple-500",
  JUBILADO: "bg-gray-400",
  EGRESADO: "bg-gray-300",
  FALLECIDO: "bg-black",
  SUSPENDIDO: "bg-red-500",
};

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQ("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/funcionarios?q=${encodeURIComponent(q.trim())}`,
          { signal: ctrl.signal },
        );
        if (res.ok) {
          const json = (await res.json()) as { items: Hit[] };
          setHits(json.items ?? []);
          setActive(0);
        }
      } catch {
        /* abort */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  const go = useCallback(
    (h: Hit) => {
      setOpen(false);
      router.push(`/funcionarios/${h.id}`);
    },
    [router],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-input bg-background hover:bg-accent transition text-muted-foreground"
        title="Buscar (Ctrl+K)"
      >
        <span>🔍</span>
        <span className="flex-1 text-left text-xs">Buscar funcionario…</span>
        <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">Ctrl K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-card rounded-xl shadow-2xl border overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="text-lg">🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Nombre, cédula o nº empleado…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              {loading && <span className="text-xs text-muted-foreground">Buscando…</span>}
              <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">Esc</kbd>
            </div>
            <div className="max-h-80 overflow-auto">
              {q.trim().length < 2 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Escribe al menos 2 caracteres
                </div>
              )}
              {q.trim().length >= 2 && !loading && hits.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Sin resultados
                </div>
              )}
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b last:border-b-0 ${
                    i === active ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ESTATUS_DOT[h.estatus] ?? "bg-gray-400"
                    }`}
                    title={h.estatus}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {h.nombre_completo ?? `${h.apellidos}, ${h.nombres}`}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {h.nacionalidad}-{h.cedula.toLocaleString("es-VE")}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {h.estatus}
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t px-4 py-2 text-[10px] text-muted-foreground flex justify-between">
              <span>↑↓ navegar · ↵ abrir</span>
              <span>Enter para abrir ficha</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
