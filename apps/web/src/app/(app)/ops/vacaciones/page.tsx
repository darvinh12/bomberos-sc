import Link from "next/link";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import { formatDate } from "@/lib/utils";

interface RowGlobal {
  id: number;
  funcionario_id: number;
  nombre_completo: string;
  cedula: string;
  periodo_anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_calendario: number | null;
  dias_habiles: number | null;
  bono_pagado: boolean;
  monto_bono: number | null;
  autorizado: boolean;
  zona: string | null;
  estacion: string | null;
  estado: string;
}

interface RowFiltered {
  id: number;
  funcionario_id: number;
  periodo_anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_calendario: number | null;
  dias_habiles: number | null;
  bono_pagado: boolean;
  autorizado: boolean;
}

interface PageResp<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface SearchProps {
  searchParams: { funcionario_id?: string };
}

export default async function VacacionesPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  await requireModuloOrRedirect("operativo", me.roles, token);
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  const funcionarioId = searchParams.funcionario_id;

  let rowsGlobal: RowGlobal[] = [];
  let rowsFiltered: RowFiltered[] = [];
  let funcionario: { id: number; nombre_completo: string | null } | null = null;
  let err: string | null = null;

  try {
    if (funcionarioId) {
      const [page, funcionarioData] = await Promise.all([
        api
          .get<PageResp<RowFiltered>>(
            `/ops/vacaciones?funcionario_id=${funcionarioId}&page_size=200`,
            token,
          )
          .catch(() => null),
        api
          .get<{ id: number; nombre_completo: string | null }>(
            `/funcionarios/${funcionarioId}`,
            token,
          )
          .catch(() => null),
      ]);
      rowsFiltered = page?.items ?? [];
      funcionario = funcionarioData;
    } else {
      rowsGlobal = await api.get<RowGlobal[]>("/dashboard/vacaciones-actuales", token);
    }
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  const totalCount = funcionarioId ? rowsFiltered.length : rowsGlobal.length;

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
            <span className="text-foreground">Vacaciones de este funcionario</span>
          </div>
          <Link
            href="/ops/vacaciones"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vacaciones</h1>
          <p className="text-sm text-muted-foreground">
            {funcionarioId
              ? `${totalCount} períodos registrados`
              : `${totalCount} períodos de vacaciones (año actual y anterior)`}
          </p>
        </div>
        {puedeEditar && (
          <Link
            href="/ops/vacaciones/nuevo"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            + Nuevas vacaciones
          </Link>
        )}
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-auto">
          {funcionarioId ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Período</th>
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-left p-3">Fin</th>
                  <th className="text-right p-3">Días cal.</th>
                  <th className="text-right p-3">Días háb.</th>
                  <th className="text-left p-3">Autorizado</th>
                  <th className="text-left p-3">Bono</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{r.periodo_anio}</td>
                    <td className="p-3">{formatDate(r.fecha_inicio)}</td>
                    <td className="p-3">{formatDate(r.fecha_fin)}</td>
                    <td className="p-3 text-right">{r.dias_calendario ?? "—"}</td>
                    <td className="p-3 text-right">{r.dias_habiles ?? "—"}</td>
                    <td className="p-3">
                      {r.autorizado ? (
                        <span className="badge badge-success">Sí</span>
                      ) : (
                        <span className="badge badge-warning">Pendiente</span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.bono_pagado ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          pagado
                        </span>
                      ) : (
                        <span className="text-muted-foreground">pendiente</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/ops/vacaciones/${r.id}/editar`}
                          className="text-primary hover:underline text-xs"
                        >
                          Editar →
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rowsFiltered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Sin vacaciones registradas para este funcionario.
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
                  <th className="text-left p-3">Cédula</th>
                  <th className="text-left p-3">Período</th>
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-left p-3">Fin</th>
                  <th className="text-right p-3">Días</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-left p-3">Bono</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rowsGlobal.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.nombre_completo}</td>
                    <td className="p-3 font-mono text-xs">{r.cedula}</td>
                    <td className="p-3">{r.periodo_anio}</td>
                    <td className="p-3">{formatDate(r.fecha_inicio)}</td>
                    <td className="p-3">{formatDate(r.fecha_fin)}</td>
                    <td className="p-3 text-right">{r.dias_calendario ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className={
                          r.estado === "EN_CURSO"
                            ? "badge badge-info"
                            : r.estado === "PROGRAMADA"
                            ? "badge badge-warning"
                            : "badge badge-neutral"
                        }
                      >
                        {r.estado}
                      </span>
                    </td>
                    <td className="p-3">
                      {r.bono_pagado ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          pagado
                        </span>
                      ) : (
                        <span className="text-muted-foreground">pendiente</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/ops/vacaciones/${r.id}/editar`}
                          className="text-primary hover:underline text-xs"
                        >
                          Editar →
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rowsGlobal.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Sin vacaciones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
