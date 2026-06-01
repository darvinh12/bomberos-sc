"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, User, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

interface EventoAuditoria {
  id: number;
  funcionario_id: number;
  tipo: "CREAR" | "EDITAR" | "ELIMINAR" | string;
  tabla: string;
  usuario_id: number;
  usuario_nombre: string;
  fecha: string;
  descripcion: string;
  ip?: string | null;
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
  nivelAcceso: NivelAcceso;
}

type FiltroTipo = "TODOS" | "CREAR" | "EDITAR" | "ELIMINAR";

const TIPO_META: Record<
  string,
  { label: string; Icon: typeof Plus; cls: string }
> = {
  CREAR: {
    label: "Creación",
    Icon: Plus,
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  },
  EDITAR: {
    label: "Edición",
    Icon: Pencil,
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
  },
  ELIMINAR: {
    label: "Eliminación",
    Icon: Trash2,
    cls: "bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20",
  },
};

function formatRelativo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace un instante";
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const dias = Math.floor(hrs / 24);
  if (dias < 30) return `hace ${dias} d`;
  return d.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAbsoluto(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeccionAuditoria({
  funcionarioId,
  userRoles: _userRoles,
  nivelAcceso,
}: Props) {
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroTipo>("TODOS");

  const soloLectura = nivelAcceso === "view";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api
          .get<EventoAuditoria[]>(`/funcionarios/${funcionarioId}/auditoria`)
          .catch(() => [] as EventoAuditoria[]);
        if (!alive) return;
        const ordenados = [...res].sort(
          (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
        );
        setEventos(ordenados);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId]);

  const filtrados = useMemo(() => {
    if (!eventos) return [];
    if (filtro === "TODOS") return eventos;
    return eventos.filter((e) => e.tipo === filtro);
  }, [eventos, filtro]);

  const conteos = useMemo(() => {
    const base = { CREAR: 0, EDITAR: 0, ELIMINAR: 0 };
    eventos?.forEach((e) => {
      if (e.tipo in base) base[e.tipo as keyof typeof base] += 1;
    });
    return base;
  }, [eventos]);

  if (error) {
    return (
      <SectionShell title="Auditoría" soloLectura={soloLectura}>
        <EmptyState title="Error" hint={error} />
      </SectionShell>
    );
  }

  if (eventos === null) {
    return (
      <SectionShell title="Auditoría" soloLectura={soloLectura}>
        <div className="text-sm text-muted-foreground">Cargando…</div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Auditoría"
      description="Historial de cambios sobre el funcionario y sus registros relacionados."
      soloLectura={soloLectura}
    >
      {/* Resumen + filtros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ChipFiltro
          label="Todos"
          activo={filtro === "TODOS"}
          cantidad={eventos.length}
          onClick={() => setFiltro("TODOS")}
        />
        <ChipFiltro
          label="Creación"
          activo={filtro === "CREAR"}
          cantidad={conteos.CREAR}
          onClick={() => setFiltro("CREAR")}
          tone="emerald"
        />
        <ChipFiltro
          label="Edición"
          activo={filtro === "EDITAR"}
          cantidad={conteos.EDITAR}
          onClick={() => setFiltro("EDITAR")}
          tone="amber"
        />
        <ChipFiltro
          label="Eliminación"
          activo={filtro === "ELIMINAR"}
          cantidad={conteos.ELIMINAR}
          onClick={() => setFiltro("ELIMINAR")}
          tone="red"
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          title="Sin registros"
          hint={
            filtro === "TODOS"
              ? "Aún no hay eventos auditados para este funcionario."
              : "No hay eventos con el filtro seleccionado."
          }
        />
      ) : (
        <Card>
          <ol className="relative space-y-3">
            {filtrados.map((ev) => {
              const meta = TIPO_META[ev.tipo] ?? {
                label: ev.tipo,
                Icon: Pencil,
                cls: "bg-muted text-muted-foreground ring-1 ring-border",
              };
              const Icon = meta.Icon;
              return (
                <li
                  key={ev.id}
                  className="flex items-start gap-3 pb-3 last:pb-0 border-b last:border-b-0 border-border"
                >
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full ${meta.cls}`}
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {meta.label}
                      </span>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                        {ev.tabla}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/85 mt-0.5">
                      {ev.descripcion}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" aria-hidden="true" />
                        {ev.usuario_nombre}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 tabular-nums"
                        title={formatAbsoluto(ev.fecha)}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {formatRelativo(ev.fecha)}
                      </span>
                      {ev.ip && (
                        <span className="font-mono text-[10px] opacity-70">
                          {ev.ip}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </SectionShell>
  );
}

function ChipFiltro({
  label,
  cantidad,
  activo,
  onClick,
  tone,
}: {
  label: string;
  cantidad: number;
  activo: boolean;
  onClick: () => void;
  tone?: "emerald" | "amber" | "red";
}) {
  const toneCls = activo
    ? tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/10"
        : tone === "red"
          ? "border-red-500/40 bg-red-500/10"
          : "border-primary/50 bg-primary/10"
    : "border-border bg-card hover:bg-muted/50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${toneCls}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">
        {cantidad}
      </div>
    </button>
  );
}
