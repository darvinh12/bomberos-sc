import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/layout/Pagination";

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
  SOLICITADO:  "badge badge-warning",
  EN_REVISION: "badge badge-info",
  APROBADO:    "badge badge-success",
  PAGADO:      "badge badge-success",
  RECHAZADO:   "badge badge-danger",
  CANCELADO:   "badge badge-neutral",
};

interface SearchProps {
  searchParams: { estatus?: string; page?: string; funcionario_id?: string };
}

export default async function BeneficiosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  const page = Number(searchParams.page ?? 1);
  const funcionarioId = searchParams.funcionario_id;
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.estatus) params.set("estatus", searchParams.estatus);
  if (funcionarioId) params.set("funcionario_id", funcionarioId);

  let data: Page<Ayuda> | null = null;
  let funcionario: { id: number; nombre_completo: string | null } | null = null;
  let err: string | null = null;
  try {
    const [ayudas, funcionarioData] = await Promise.all([
      api.get<Page<Ayuda>>(`/beneficios/ayudas?${params}`, token),
      funcionarioId
        ? api
            .get<{ id: number; nombre_completo: string | null }>(
              `/funcionarios/${funcionarioId}`,
              token,
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    data = ayudas;
    funcionario = funcionarioData;
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
      {funcionario && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={`/funcionarios/${funcionario.id}`}
              className="text-muted-foreground hover:text-foreground"
            >
              ← {funcionario.nombre_completo ?? `Funcionario #${funcionario.id}`}
            </Link>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground">Beneficios de este funcionario</span>
          </div>
          <Link
            href="/beneficios"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Beneficios — Ayudas económicas</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} solicitudes` : "Cargando…"}
          </p>
        </div>
        {puedeEditar && (
          <Link href="/beneficios/nuevo" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
            + Nueva ayuda
          </Link>
        )}
      </div>

      <form className="flex gap-3 items-end">
        {funcionarioId && (
          <input type="hidden" name="funcionario_id" value={funcionarioId} />
        )}
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
                      <span className={ESTATUS_COLORS[a.estatus] ?? "badge badge-neutral"}>
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
          <Pagination
            page={data.page}
            pages={data.pages}
            basePath="/beneficios"
            searchParams={{
              estatus: searchParams.estatus,
              funcionario_id: funcionarioId,
            }}
          />
        </div>
      )}
    </div>
  );
}
