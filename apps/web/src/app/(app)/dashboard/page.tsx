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

function Card({
  title,
  value,
  hint,
  accent,
  href,
}: {
  title: string;
  value: number | string;
  hint?: string;
  accent?: "primary" | "warn" | "ok" | "danger";
  href?: string;
}) {
  const cls =
    accent === "primary"
      ? "border-primary/30 bg-primary/5"
      : accent === "warn"
      ? "border-yellow-300 bg-yellow-50"
      : accent === "ok"
      ? "border-green-300 bg-green-50"
      : accent === "danger"
      ? "border-red-300 bg-red-50"
      : "border-border bg-card";
  const content = (
    <div className={`rounded-xl border ${cls} p-5 transition hover:shadow-md ${href ? "cursor-pointer" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

interface QuickAction {
  label: string;
  href: string;
  icon: string;
  color: string;
  roles?: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Nuevo funcionario", href: "/funcionarios/nuevo", icon: "👤", color: "bg-blue-500", roles: ["ADMIN", "RRHH"] },
  { label: "Iniciar reposo", href: "/salud/reposos/nuevo", icon: "🏥", color: "bg-yellow-500", roles: ["ADMIN", "RRHH"] },
  { label: "Crear guardia", href: "/ops/guardias/nuevo", icon: "🚒", color: "bg-red-500", roles: ["ADMIN", "OPERADOR"] },
  { label: "Solicitud de ayuda", href: "/beneficios/nuevo", icon: "💰", color: "bg-emerald-500", roles: ["ADMIN", "RRHH"] },
  { label: "Registrar permiso", href: "/ops/permisos/nuevo", icon: "📝", color: "bg-purple-500", roles: ["ADMIN", "RRHH", "SUPERVISOR"] },
  { label: "Asignar comisión", href: "/ops/comisiones/nuevo", icon: "📋", color: "bg-indigo-500", roles: ["ADMIN", "RRHH", "SUPERVISOR", "INSPECTOR"] },
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
    error = e instanceof Error ? e.message : "Error";
  }
  const roles = me.roles ?? [];

  const accionesVisibles = QUICK_ACTIONS.filter(
    (a) => !a.roles || a.roles.length === 0 || hasAnyRole(roles, a.roles as never[]),
  );

  const ahora = new Date();
  const saludo =
    ahora.getHours() < 12 ? "Buenos días" : ahora.getHours() < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {saludo}{me.nombre_completo ? `, ${me.nombre_completo.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ahora.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {accionesVisibles.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Acciones rápidas</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {accionesVisibles.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-muted/30 transition text-center"
              >
                <span className={`w-10 h-10 rounded-full ${a.color} text-white flex items-center justify-center text-lg`}>
                  {a.icon}
                </span>
                <span className="text-xs font-medium">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          No se pudo conectar con la API: {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card title="Personal activo" value={stats.personal_activo} accent="primary" href="/funcionarios?estatus=ACTIVO" />
            <Card title="En reposo" value={stats.personal_reposo} accent="warn" href="/funcionarios?estatus=REPOSO" />
            <Card title="En comisión" value={stats.personal_comision} href="/funcionarios?estatus=COMISION" />
            <Card title="Jubilados" value={stats.personal_jubilado} href="/funcionarios?estatus=JUBILADO" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card
              title="Distribución por sexo"
              value={`${stats.hombres} ♂ / ${stats.mujeres} ♀`}
              hint="Personal activo"
            />
            <Card
              title="Reposos vigentes"
              value={stats.reposos_vigentes}
              accent="warn"
              href="/salud/reposos"
            />
            <Card title="Vacaciones en curso" value={stats.vacaciones_en_curso} href="/ops/vacaciones" />
            <Card title="Permisos hoy" value={stats.permisos_hoy} href="/ops/permisos" />
            <Card title="Pre-jubilados" value={stats.personal_pre_jubilado} href="/funcionarios?estatus=PRE_JUBILADO" />
            <Card
              title="Ayudas pendientes"
              value={stats.ayudas_pendientes}
              accent={stats.ayudas_pendientes > 0 ? "warn" : "ok"}
              href="/beneficios?estatus=SOLICITADO"
            />
          </div>
        </>
      )}

      {dist.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="font-semibold">Distribución por zona y jerarquía</h2>
            <Link href="/funcionarios" className="text-xs text-primary hover:underline">
              Ver personal completo →
            </Link>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Zona</th>
                  <th className="text-left p-3">Jerarquía</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-right p-3">Activos</th>
                  <th className="text-right p-3">Reposo</th>
                  <th className="text-right p-3">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {dist.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3 font-medium">{row.zona ?? "—"}</td>
                    <td className="p-3">{row.jerarquia ?? "—"}</td>
                    <td className="p-3 text-right">{row.total}</td>
                    <td className="p-3 text-right">{row.activos}</td>
                    <td className="p-3 text-right text-yellow-700">{row.en_reposo}</td>
                    <td className="p-3 text-right">{row.en_comision}</td>
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
