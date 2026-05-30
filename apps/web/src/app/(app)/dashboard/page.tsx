import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";

interface Dashboard {
  personal_activo: number;
  personal_jubilado: number;
  personal_reposo: number;
  personal_comision: number;
  personal_pre_jubilado: number;
  personal_fallecido: number;
  hombres: number;
  mujeres: number;
  reposos_vigentes: number;
  vacaciones_en_curso: number;
  permisos_hoy: number;
  postulados_pendientes: number;
  ayudas_pendientes: number;
}

interface DistribucionZona {
  zona_id: number | null;
  zona: string | null;
  jerarquia_id: number | null;
  jerarquia: string | null;
  total: number;
  hombres: number;
  mujeres: number;
  activos: number;
  en_reposo: number;
  en_comision: number;
}

type AccentType = "primary" | "warn" | "ok" | "danger" | "none";

function KpiCard({
  title,
  value,
  hint,
  accent = "none",
  href,
}: {
  title: string;
  value: number | string;
  hint?: string;
  accent?: AccentType;
  href?: string;
}) {
  const bar =
    accent === "primary" ? "border-l-primary"
    : accent === "warn"   ? "border-l-amber-500"
    : accent === "ok"     ? "border-l-emerald-500"
    : accent === "danger" ? "border-l-red-600"
    : "border-l-transparent";

  const content = (
    <div
      className={`bg-card border border-border border-l-2 ${bar} p-5 rounded ${href ? "hover:shadow-sm cursor-pointer transition-shadow" : ""}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

interface QuickAction {
  label: string;
  href: string;
  roles?: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Nuevo funcionario",    href: "/funcionarios/nuevo",    roles: ["ADMIN", "RRHH"] },
  { label: "Iniciar reposo",       href: "/salud/reposos/nuevo",   roles: ["ADMIN", "RRHH"] },
  { label: "Crear guardia",        href: "/ops/guardias/nuevo",    roles: ["ADMIN", "OPERADOR"] },
  { label: "Solicitud de ayuda",   href: "/beneficios/nuevo",      roles: ["ADMIN", "RRHH"] },
  { label: "Registrar permiso",    href: "/ops/permisos/nuevo",    roles: ["ADMIN", "RRHH", "SUPERVISOR"] },
  { label: "Asignar comisión",     href: "/ops/comisiones/nuevo",  roles: ["ADMIN", "RRHH", "SUPERVISOR", "INSPECTOR"] },
];

export default async function DashboardPage() {
  const token = await requireAuth();
  let stats: Dashboard | null = null;
  let dist: DistribucionZona[] = [];
  let me: { roles: string[]; nombre_completo?: string } = { roles: [] };
  let error: string | null = null;

  try {
    [stats, dist, me] = await Promise.all([
      api.get<Dashboard>("/dashboard", token),
      api.get<DistribucionZona[]>("/dashboard/distribucion-zona", token).catch(() => [] as DistribucionZona[]),
      api.get<{ roles: string[]; nombre_completo?: string }>("/auth/me", token).catch(() => ({ roles: [] })),
    ]);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : "Error al conectar con la API";
  }

  const roles = me.roles ?? [];
  const accionesVisibles = QUICK_ACTIONS.filter(
    (a) => !a.roles || a.roles.length === 0 || hasAnyRole(roles, a.roles as never[]),
  );

  const ahora = new Date();
  const hora  = ahora.getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const primerNombre = me.nombre_completo?.split(" ")[0];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {saludo}{primerNombre ? `, ${primerNombre}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ahora.toLocaleDateString("es-VE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Link
          href="/funcionarios"
          className="text-xs text-primary hover:underline font-medium"
        >
          Ver todo el personal →
        </Link>
      </div>

      {/* Quick actions */}
      {accionesVisibles.length > 0 && (
        <div className="bg-card border border-border rounded p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Acciones rápidas
          </div>
          <div className="flex flex-wrap gap-2">
            {accionesVisibles.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudo conectar con la API: {error}
        </div>
      )}

      {/* KPIs */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="Personal activo"
              value={stats.personal_activo}
              accent="primary"
              href="/funcionarios?estatus=ACTIVO"
            />
            <KpiCard
              title="En reposo"
              value={stats.personal_reposo}
              accent="warn"
              href="/funcionarios?estatus=REPOSO"
            />
            <KpiCard
              title="En comisión"
              value={stats.personal_comision}
              href="/funcionarios?estatus=COMISION"
            />
            <KpiCard
              title="Jubilados"
              value={stats.personal_jubilado}
              href="/funcionarios?estatus=JUBILADO"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard
              title="Distribución por sexo"
              value={`${stats.hombres} M / ${stats.mujeres} F`}
              hint="Personal activo"
            />
            <KpiCard
              title="Reposos vigentes"
              value={stats.reposos_vigentes}
              accent="warn"
              href="/salud/reposos"
            />
            <KpiCard
              title="Vacaciones en curso"
              value={stats.vacaciones_en_curso}
              href="/ops/vacaciones"
            />
            <KpiCard
              title="Permisos hoy"
              value={stats.permisos_hoy}
              href="/ops/permisos"
            />
            <KpiCard
              title="Pre-jubilados"
              value={stats.personal_pre_jubilado}
              href="/funcionarios?estatus=PRE_JUBILADO"
            />
            <KpiCard
              title="Ayudas pendientes"
              value={stats.ayudas_pendientes}
              accent={stats.ayudas_pendientes > 0 ? "warn" : "ok"}
              href="/beneficios?estatus=SOLICITADO"
            />
          </div>
        </>
      )}

      {/* Distribution table */}
      {dist.length > 0 && (
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Distribución por zona y jerarquía</h2>
            <Link href="/funcionarios" className="text-xs text-primary hover:underline font-medium">
              Ver personal completo →
            </Link>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-5 py-3 font-semibold">Zona</th>
                  <th className="text-left px-4 py-3 font-semibold">Jerarquía</th>
                  <th className="text-right px-4 py-3 font-semibold">Total</th>
                  <th className="text-right px-4 py-3 font-semibold">Activos</th>
                  <th className="text-right px-4 py-3 font-semibold">Reposo</th>
                  <th className="text-right px-4 py-3 font-semibold">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dist.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium">{row.zona ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.jerarquia ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.activos}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300">{row.en_reposo}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.en_comision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
