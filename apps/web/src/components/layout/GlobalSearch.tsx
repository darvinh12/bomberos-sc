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
  ACTIVO:       "bg-emerald-500",
  REPOSO:       "bg-amber-500",
  COMISION:     "bg-blue-500",
  PRE_JUBILADO: "bg-violet-500",
  JUBILADO:     "bg-slate-400",
  EGRESADO:     "bg-slate-300",
  FALLECIDO:    "bg-slate-900",
  SUSPENDIDO:   "bg-red-600",
};

function SearchIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  );
}

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [q, setQ]             = useState("");
  const [hits, setHits]       = useState<Hit[]>([]);
  const [active, setActive]   = useState(0);
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
      } catch { /* abort */ } finally {
        setLoading(false);
      }
    }, 180);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [q, open]);

  const go = useCallback((h: Hit) => {
    setOpen(false);
    router.push(`/funcionarios/${h.id}`);
  }, [router]);

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
      {/* Trigger — dark sidebar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded text-[12px] bg-slate-800 hover:bg-slate-700 transition-colors text-slate-400"
        title="Buscar (Ctrl+K)"
      >
        <SearchIcon />
        <span className="flex-1 text-left">Buscar funcionario…</span>
        <kbd className="text-[10px] bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-slate-800 rounded shadow-2xl border border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <SearchIcon className="w-4 h-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Nombre, cédula o nº empleado…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              {loading && (
                <span className="text-xs text-muted-foreground">Buscando…</span>
              )}
              <kbd className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border font-mono">
                Esc
              </kbd>
            </div>

            <div className="max-h-80 overflow-auto">
              {q.trim().length < 2 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Escribe al menos 2 caracteres
                </div>
              )}
              {q.trim().length >= 2 && !loading && hits.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Sin resultados
                </div>
              )}
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b last:border-b-0 transition-colors ${
                    i === active ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${ESTATUS_DOT[h.estatus] ?? "bg-slate-400"}`}
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
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                    {h.estatus}
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t px-4 py-2 text-[10px] text-muted-foreground flex justify-between">
              <span>↑↓ navegar</span>
              <span>↵ abrir ficha</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
