import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

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
}: {
  title: string;
  value: number | string;
  hint?: string;
  accent?: "primary" | "warn" | "ok";
}) {
  const cls =
    accent === "primary"
      ? "border-primary/30 bg-primary/5"
      : accent === "warn"
      ? "border-yellow-300 bg-yellow-50"
      : accent === "ok"
      ? "border-green-300 bg-green-50"
      : "border-border bg-card";
  return (
    <div className={`rounded-xl border ${cls} p-5 transition hover:shadow-md`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const token = await requireAuth();
  let stats: Dashboard | null = null;
  let dist: DistribucionZona[] = [];
  let error: string | null = null;
  try {
    stats = await api.get<Dashboard>("/dashboard", token);
    dist = await api.get<DistribucionZona[]>("/dashboard/distribucion-zona", token);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumen institucional en tiempo real</p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          No se pudo conectar con la API: {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card title="Personal activo" value={stats.personal_activo} accent="primary" />
            <Card title="En reposo" value={stats.personal_reposo} accent="warn" />
            <Card title="En comisión" value={stats.personal_comision} />
            <Card title="Jubilados" value={stats.personal_jubilado} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card
              title="Distribución por sexo"
              value={`${stats.hombres} ♂ / ${stats.mujeres} ♀`}
              hint="Personal activo"
            />
            <Card title="Reposos vigentes" value={stats.reposos_vigentes} accent="warn" />
            <Card title="Vacaciones en curso" value={stats.vacaciones_en_curso} />
            <Card title="Permisos hoy" value={stats.permisos_hoy} />
            <Card title="Postulados pendientes" value={stats.postulados_pendientes} />
            <Card
              title="Ayudas pendientes"
              value={stats.ayudas_pendientes}
              accent={stats.ayudas_pendientes > 0 ? "warn" : "ok"}
            />
          </div>
        </>
      )}

      {dist.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-5 border-b">
            <h2 className="font-semibold">Distribución por zona y jerarquía</h2>
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
