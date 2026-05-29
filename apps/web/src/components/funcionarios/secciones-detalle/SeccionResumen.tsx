"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CalendarDays,
  GraduationCap,
  HeartPulse,
  ShieldCheck,
  Briefcase,
  HandCoins,
  Activity,
  CalendarOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

interface Page<T> {
  items: T[];
}

interface Reposo {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number | null;
  diagnostico_libre: string | null;
  anulado: boolean;
}

interface Vacacion {
  id: number;
  periodo_anio: number;
  fecha_inicio: string;
  fecha_fin: string;
}

interface Curso {
  id: number;
  nombre_libre: string | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  aprobado: boolean | null;
}

interface Ascenso {
  id: number;
  fecha_efectiva: string;
  jerarquia_nueva_id: number;
}

interface Reconocimiento {
  id: number;
  nombre_libre: string | null;
  fecha_otorgamiento: string;
}

interface Permiso {
  id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
}

interface Comision {
  id: number;
  institucion_libre: string | null;
  fecha_inicio: string;
}

interface Ayuda {
  id: number;
  estatus: string;
  fecha_solicitud: string;
  motivo: string;
}

interface Datos {
  reposos: Reposo[];
  vacaciones: Vacacion[];
  cursos: Curso[];
  ascensos: Ascenso[];
  reconocimientos: Reconocimiento[];
  permisos: Permiso[];
  comisiones: Comision[];
  ayudas: Ayuda[];
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funcionario: any;
  userRoles: string[];
  nivelAcceso: NivelAcceso;
}

type IconCmp = typeof Activity;

interface Evento {
  key: string;
  fecha: string;
  icon: IconCmp;
  iconClass: string;
  titulo: string;
  detalle: string;
  seccion: string;
}

function getPage<T>(p: Page<T> | { items?: T[] } | null | undefined): T[] {
  return (p?.items ?? []) as T[];
}

function diffYears(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

export default function SeccionResumen({ funcionario: f, nivelAcceso }: Props) {
  const soloLectura = nivelAcceso === "view";
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fid = f.id;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const safe = <T,>(p: Promise<Page<T>>) =>
          p.catch(() => ({ items: [] }) as Page<T>);
        const ps = `&page_size=100`;
        const [rep, vac, cur, asc, rec, per, com, ay] = await Promise.all([
          safe(api.get<Page<Reposo>>(`/salud/reposos?funcionario_id=${fid}${ps}`)),
          safe(api.get<Page<Vacacion>>(`/ops/vacaciones?funcionario_id=${fid}${ps}`)),
          safe(api.get<Page<Curso>>(`/carrera/cursos-realizados?funcionario_id=${fid}${ps}`)),
          safe(api.get<Page<Ascenso>>(`/carrera/ascensos?funcionario_id=${fid}${ps}`)),
          safe(
            api.get<Page<Reconocimiento>>(`/carrera/reconocimientos?funcionario_id=${fid}${ps}`),
          ),
          safe(api.get<Page<Permiso>>(`/ops/permisos?funcionario_id=${fid}${ps}`)),
          safe(api.get<Page<Comision>>(`/ops/comisiones?funcionario_id=${fid}${ps}`)),
          safe(api.get<Page<Ayuda>>(`/beneficios/ayudas?funcionario_id=${fid}${ps}`)),
        ]);
        if (!alive) return;
        setData({
          reposos: getPage(rep),
          vacaciones: getPage(vac),
          cursos: getPage(cur),
          ascensos: getPage(asc),
          reconocimientos: getPage(rec),
          permisos: getPage(per),
          comisiones: getPage(com),
          ayudas: getPage(ay),
        });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [fid]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const aniosServicio = diffYears(f.fecha_primer_ingreso);
    const hoy = new Date();
    const haceUnAnio = new Date(hoy);
    haceUnAnio.setDate(haceUnAnio.getDate() - 365);
    const diasReposoUltAnio = data.reposos
      .filter((r) => !r.anulado && new Date(r.fecha_fin) >= haceUnAnio)
      .reduce((acc, r) => acc + (r.dias ?? 0), 0);
    const anioActual = hoy.getFullYear();
    const vacacionesAnio = data.vacaciones.filter((v) => v.periodo_anio === anioActual).length;
    const cursosTotal = data.cursos.length;
    return { aniosServicio, diasReposoUltAnio, vacacionesAnio, cursosTotal };
  }, [data, f.fecha_primer_ingreso]);

  const eventos = useMemo<Evento[]>(() => {
    if (!data) return [];
    const items: Evento[] = [];
    for (const r of data.reposos) {
      items.push({
        key: `rep-${r.id}`,
        fecha: r.fecha_inicio,
        icon: HeartPulse,
        iconClass: "text-rose-400",
        titulo: "Reposo médico",
        detalle: r.diagnostico_libre ?? `${r.dias ?? "—"} días`,
        seccion: "Salud",
      });
    }
    for (const a of data.ascensos) {
      items.push({
        key: `asc-${a.id}`,
        fecha: a.fecha_efectiva,
        icon: Award,
        iconClass: "text-amber-400",
        titulo: "Ascenso",
        detalle: `Promovido a jerarquía #${a.jerarquia_nueva_id}`,
        seccion: "Carrera",
      });
    }
    for (const c of data.cursos) {
      if (!c.fecha_fin && !c.fecha_inicio) continue;
      items.push({
        key: `cur-${c.id}`,
        fecha: c.fecha_fin ?? c.fecha_inicio ?? "",
        icon: GraduationCap,
        iconClass: "text-sky-400",
        titulo: c.aprobado === false ? "Curso (no aprobado)" : "Curso realizado",
        detalle: c.nombre_libre ?? "—",
        seccion: "Carrera",
      });
    }
    for (const r of data.reconocimientos) {
      items.push({
        key: `rec-${r.id}`,
        fecha: r.fecha_otorgamiento,
        icon: ShieldCheck,
        iconClass: "text-emerald-400",
        titulo: "Reconocimiento",
        detalle: r.nombre_libre ?? "—",
        seccion: "Carrera",
      });
    }
    for (const v of data.vacaciones) {
      items.push({
        key: `vac-${v.id}`,
        fecha: v.fecha_inicio,
        icon: CalendarDays,
        iconClass: "text-violet-400",
        titulo: `Vacaciones ${v.periodo_anio}`,
        detalle: `${formatDate(v.fecha_inicio)} → ${formatDate(v.fecha_fin)}`,
        seccion: "Operativo",
      });
    }
    for (const p of data.permisos) {
      items.push({
        key: `per-${p.id}`,
        fecha: p.fecha_inicio,
        icon: CalendarOff,
        iconClass: "text-yellow-400",
        titulo: `Permiso ${p.tipo}`,
        detalle: `${formatDate(p.fecha_inicio)} → ${formatDate(p.fecha_fin)}`,
        seccion: "Operativo",
      });
    }
    for (const c of data.comisiones) {
      items.push({
        key: `com-${c.id}`,
        fecha: c.fecha_inicio,
        icon: Briefcase,
        iconClass: "text-indigo-400",
        titulo: "Comisión de servicio",
        detalle: c.institucion_libre ?? "—",
        seccion: "Operativo",
      });
    }
    for (const a of data.ayudas) {
      items.push({
        key: `ay-${a.id}`,
        fecha: a.fecha_solicitud,
        icon: HandCoins,
        iconClass: "text-teal-400",
        titulo: `Ayuda · ${a.estatus}`,
        detalle: a.motivo,
        seccion: "Beneficios",
      });
    }
    return items
      .filter((e) => !!e.fecha)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, 6);
  }, [data]);

  if (error) {
    return (
      <SectionShell title="Resumen" soloLectura={soloLectura}>
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data || !kpis) {
    return (
      <SectionShell title="Resumen" soloLectura={soloLectura}>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Resumen"
      description="Indicadores clave, actividad reciente y próximos vencimientos."
      soloLectura={soloLectura}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Activity}
          iconClass="text-emerald-400"
          label="Años de servicio"
          value={kpis.aniosServicio !== null ? kpis.aniosServicio.toFixed(1) : "—"}
          hint={f.fecha_primer_ingreso ? `Ingreso ${formatDate(f.fecha_primer_ingreso)}` : ""}
        />
        <KpiCard
          icon={HeartPulse}
          iconClass="text-rose-400"
          label="Días reposo (12m)"
          value={kpis.diasReposoUltAnio.toString()}
          hint="Suma de reposos vigentes en el último año"
        />
        <KpiCard
          icon={CalendarDays}
          iconClass="text-violet-400"
          label={`Vacaciones ${new Date().getFullYear()}`}
          value={kpis.vacacionesAnio.toString()}
          hint="Períodos disfrutados o programados"
        />
        <KpiCard
          icon={GraduationCap}
          iconClass="text-sky-400"
          label="Cursos realizados"
          value={kpis.cursosTotal.toString()}
          hint="Total acumulado"
        />
      </div>

      <Card title="Últimos eventos">
        {eventos.length === 0 ? (
          <EmptyState
            title="Sin actividad reciente"
            hint="El funcionario no tiene movimientos registrados todavía."
          />
        ) : (
          <ul className="divide-y divide-border">
            {eventos.map((e) => {
              const Icon = e.icon;
              return (
                <li key={e.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Icon
                    className={`w-4 h-4 mt-0.5 flex-none ${e.iconClass}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-foreground truncate">{e.titulo}</p>
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(e.fecha)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      <span className="font-medium text-foreground/70">{e.seccion}</span> ·{" "}
                      {e.detalle}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Próximos vencimientos">
        <EmptyState
          title="Sin vencimientos próximos"
          hint="Carnets, licencias y certificaciones aparecerán aquí cuando se habilite el módulo."
        />
      </Card>
    </SectionShell>
  );
}

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: IconCmp;
  iconClass: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3.5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <Icon className={`w-3.5 h-3.5 ${iconClass}`} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}
