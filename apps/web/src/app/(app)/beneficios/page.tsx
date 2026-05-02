import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

interface Ayuda {
  id: number;
  funcionario_id: number;
  tipo_solicitud_id: number;
  monto_solicitado: number | null;
  monto_aprobado: number | null;
  monto_pagado: number | null;
  fecha_solicitud: string;
  fecha_aprobacion: string | null;
  fecha_pago: string | null;
  motivo: string;
  estatus: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const ESTATUS_COLORS: Record<string, string> = {
  SOLICITADO: "bg-yellow-100 text-yellow-800",
  EN_REVISION: "bg-blue-100 text-blue-800",
  APROBADO: "bg-green-100 text-green-800",
  PAGADO: "bg-emerald-100 text-emerald-800",
  RECHAZADO: "bg-red-100 text-red-800",
  CANCELADO: "bg-gray-200 text-gray-700",
};

interface SearchProps {
  searchParams: { estatus?: string; page?: string };
}

export default async function BeneficiosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.estatus) params.set("estatus", searchParams.estatus);

  let data: Page<Ayuda> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Ayuda>>(`/beneficios/ayudas?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  const fmtMoney = (v: number | null) =>
    v === null
      ? "—"
      : new Intl.NumberFormat("es-VE", {
          style: "currency",
          currency: "VES",
          maximumFractionDigits: 2,
        }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Beneficios — Ayudas económicas</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("es-VE")} solicitudes` : "Cargando…"}
        </p>
      </div>

      <form className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Estatus</label>
          <select
            name="estatus"
            defaultValue={searchParams.estatus ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {Object.keys(ESTATUS_COLORS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
          Filtrar
        </button>
      </form>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      {data && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Funcionario</th>
                  <th className="text-left p-3">Motivo</th>
                  <th className="text-right p-3">Solicitado</th>
                  <th className="text-right p-3">Aprobado</th>
                  <th className="text-right p-3">Pagado</th>
                  <th className="text-left p-3">Solicitud</th>
                  <th className="text-left p-3">Estatus</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">#{a.funcionario_id}</td>
                    <td className="p-3 max-w-xs truncate" title={a.motivo}>
                      {a.motivo}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      {fmtMoney(a.monto_solicitado)}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      {fmtMoney(a.monto_aprobado)}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      {fmtMoney(a.monto_pagado)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(a.fecha_solicitud)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          ESTATUS_COLORS[a.estatus] ?? "bg-gray-100"
                        }`}
                      >
                        {a.estatus}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/beneficios/${a.id}/editar`}
                          className="text-primary hover:underline text-xs"
                        >
                          Procesar →
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Sin solicitudes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
