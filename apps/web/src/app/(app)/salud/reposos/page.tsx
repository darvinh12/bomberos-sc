import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

interface RowGlobal {
  id: number;
  funcionario_id: number;
  nombre_completo: string;
  cedula: string;
  jerarquia: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number | null;
  tipo_reposo: string | null;
  diagnostico: string | null;
  estado_vigencia: string;
}

interface RowFiltered {
  id: number;
  funcionario_id: number;
  tipo_reposo_id: number;
  diagnostico_libre: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number | null;
  anulado: boolean;
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

export default async function RepososPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);
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
            `/salud/reposos?funcionario_id=${funcionarioId}&page_size=200`,
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
      rowsGlobal = await api.get<RowGlobal[]>("/dashboard/reposos-activos", token);
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
            <span className="text-foreground">Reposos de este funcionario</span>
          </div>
          <Link
            href="/salud/reposos"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reposos {funcionarioId ? "del funcionario" : "vigentes"}</h1>
          <p className="text-sm text-muted-foreground">
            {funcionarioId
              ? `${totalCount} reposos registrados`
              : `${totalCount} reposos activos / vencidos en últimos 30 días`}
          </p>
        </div>
        {puedeEditar && (
          <Link
            href="/salud/reposos/nuevo"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            + Nuevo reposo
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
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-left p-3">Fin</th>
                  <th className="text-right p-3">Días</th>
                  <th className="text-left p-3">Diagnóstico</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{formatDate(r.fecha_inicio)}</td>
                    <td className="p-3">{formatDate(r.fecha_fin)}</td>
                    <td className="p-3 text-right">{r.dias ?? "—"}</td>
                    <td className="p-3 text-xs">{r.diagnostico_libre ?? "—"}</td>
                    <td className="p-3">
                      <span className={r.anulado ? "badge badge-danger" : "badge badge-neutral"}>
                        {r.anulado ? "ANULADO" : "VIGENTE"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/salud/reposos/${r.id}/editar`}
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
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin reposos para este funcionario.
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
                  <th className="text-left p-3">Jerarquía</th>
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-left p-3">Fin</th>
                  <th className="text-right p-3">Días</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Diagnóstico</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rowsGlobal.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.nombre_completo}</td>
                    <td className="p-3 font-mono text-xs">{r.cedula}</td>
                    <td className="p-3 text-muted-foreground">{r.jerarquia ?? "—"}</td>
                    <td className="p-3">{formatDate(r.fecha_inicio)}</td>
                    <td className="p-3">{formatDate(r.fecha_fin)}</td>
                    <td className="p-3 text-right">{r.dias ?? "—"}</td>
                    <td className="p-3">{r.tipo_reposo ?? "—"}</td>
                    <td className="p-3 text-xs">{r.diagnostico ?? "—"}</td>
                    <td className="p-3">
                      <span className={r.estado_vigencia === "VIGENTE" ? "badge badge-warning" : "badge badge-neutral"}>
                        {r.estado_vigencia}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/salud/reposos/${r.id}/editar`}
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
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      Sin reposos vigentes.
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
