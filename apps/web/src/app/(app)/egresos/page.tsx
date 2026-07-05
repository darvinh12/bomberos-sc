import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import { formatDate } from "@/lib/utils";

type Tab = "jubilados" | "solicitudes";

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface Jubilado {
  id: number;
  funcionario_id: number;
  fecha_jubilacion: string;
  años_servicio: number | null;
  tipo_jubilacion: string | null;
  pension_mensual: number | null;
  moneda: string | null;
  resolucion: string | null;
  activo: boolean;
}

interface Solicitud {
  id: number;
  funcionario_id: number;
  fecha_solicitud: string;
  fecha_efectiva_propuesta: string | null;
  años_servicio: number | null;
  motivo: string | null;
  estatus: string;
  resolucion: string | null;
}

const TABS: { key: Tab; label: string; path: string }[] = [
  { key: "jubilados", label: "Jubilados", path: "/egresos/jubilados" },
  { key: "solicitudes", label: "Solicitudes", path: "/egresos/solicitudes-jubilacion" },
];

const ESTATUS_SOL: Record<string, string> = {
  SOLICITADA: "badge badge-warning",
  EN_TRAMITE: "badge badge-info",
  APROBADA:   "badge badge-success",
  RECHAZADA:  "badge badge-danger",
  EJECUTADA:  "badge badge-success",
};

interface SearchProps {
  searchParams: { tab?: string; page?: string };
}

export default async function EgresosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  await requireModuloOrRedirect("egresos", me.roles, token);

  const tab: Tab =
    (TABS.find((t) => t.key === searchParams.tab)?.key as Tab) ?? "jubilados";
  const page = Number(searchParams.page ?? 1);
  const path = TABS.find((t) => t.key === tab)!.path;
  const params = new URLSearchParams({ page: String(page), page_size: "50" });

  let data: Page<unknown> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<unknown>>(`${path}?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  const fmtPension = (v: number | null, m: string | null) =>
    v === null
      ? "—"
      : new Intl.NumberFormat("es-VE", {
          style: "currency",
          currency: m ?? "VES",
          maximumFractionDigits: 2,
        }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Egresos</h1>
        <p className="text-sm text-muted-foreground">
          Jubilados y solicitudes de jubilación
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/egresos?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              t.key === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      {data && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-auto">
            {tab === "jubilados" ? (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Funcionario</th>
                    <th className="text-left p-3">Fecha jubilación</th>
                    <th className="text-right p-3">Años</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-right p-3">Pensión</th>
                    <th className="text-left p-3">Resolución</th>
                    <th className="text-left p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as Jubilado[]).map((j) => (
                    <tr key={j.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">#{j.funcionario_id}</td>
                      <td className="p-3">{formatDate(j.fecha_jubilacion)}</td>
                      <td className="p-3 text-right">
                        {j.años_servicio?.toFixed(1) ?? "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {j.tipo_jubilacion ?? "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {fmtPension(j.pension_mensual, j.moneda)}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {j.resolucion ?? "—"}
                      </td>
                      <td className="p-3">
                        {j.activo ? (
                          <span className="badge badge-success">Activo</span>
                        ) : (
                          <span className="badge badge-neutral">Cerrado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        Sin jubilados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Funcionario</th>
                    <th className="text-left p-3">Fecha solicitud</th>
                    <th className="text-left p-3">Efectiva propuesta</th>
                    <th className="text-right p-3">Años</th>
                    <th className="text-left p-3">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as Solicitud[]).map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">#{s.funcionario_id}</td>
                      <td className="p-3">{formatDate(s.fecha_solicitud)}</td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(s.fecha_efectiva_propuesta)}
                      </td>
                      <td className="p-3 text-right">
                        {s.años_servicio?.toFixed(1) ?? "—"}
                      </td>
                      <td className="p-3">
                        <span className={ESTATUS_SOL[s.estatus] ?? "badge badge-neutral"}>
                          {s.estatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        Sin solicitudes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {data.total.toLocaleString("es-VE")} registros
          </div>
        </div>
      )}
    </div>
  );
}
