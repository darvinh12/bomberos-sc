import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/layout/Pagination";

interface Permiso {
  id: number;
  funcionario_id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  horas: number | null;
  motivo: string;
  autorizado: boolean;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface SearchProps {
  searchParams: { autorizado?: string; page?: string; funcionario_id?: string };
}

export default async function PermisosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);
  const page = Number(searchParams.page ?? 1);
  const funcionarioId = searchParams.funcionario_id;
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.autorizado) params.set("autorizado", searchParams.autorizado);
  if (funcionarioId) params.set("funcionario_id", funcionarioId);

  let data: Page<Permiso> | null = null;
  let funcionario: { id: number; nombre_completo: string | null } | null = null;
  let err: string | null = null;
  try {
    const [permisos, funcionarioData] = await Promise.all([
      api.get<Page<Permiso>>(`/ops/permisos?${params}`, token),
      funcionarioId
        ? api
            .get<{ id: number; nombre_completo: string | null }>(
              `/funcionarios/${funcionarioId}`,
              token,
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    data = permisos;
    funcionario = funcionarioData;
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

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
            <span className="text-foreground">Permisos de este funcionario</span>
          </div>
          <Link
            href="/ops/permisos"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Permisos</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} permisos` : "Cargando…"}
          </p>
        </div>
        {puedeEditar && (
          <Link href="/ops/permisos/nuevo" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
            + Nuevo permiso
          </Link>
        )}
      </div>

      <form className="flex gap-3 items-end">
        {funcionarioId && (
          <input type="hidden" name="funcionario_id" value={funcionarioId} />
        )}
        <div>
          <label className="block text-xs font-medium mb-1">Autorizado</label>
          <select
            name="autorizado"
            defaultValue={searchParams.autorizado ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="true">Autorizados</option>
            <option value="false">Pendientes</option>
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
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-left p-3">Fin</th>
                  <th className="text-right p-3">Horas</th>
                  <th className="text-left p-3">Motivo</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">#{p.funcionario_id}</td>
                    <td className="p-3 font-medium">{p.tipo}</td>
                    <td className="p-3">{formatDate(p.fecha_inicio)}</td>
                    <td className="p-3">{formatDate(p.fecha_fin)}</td>
                    <td className="p-3 text-right">{p.horas ?? "—"}</td>
                    <td className="p-3 max-w-xs truncate" title={p.motivo}>
                      {p.motivo}
                    </td>
                    <td className="p-3">
                      {p.autorizado ? (
                        <span className="badge badge-success">Autorizado</span>
                      ) : (
                        <span className="badge badge-warning">Pendiente</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/ops/permisos/${p.id}/editar`}
                          className="text-primary hover:underline text-xs"
                        >
                          {p.autorizado ? "Editar" : "Autorizar"} →
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
                      Sin permisos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            basePath="/ops/permisos"
            searchParams={{
              autorizado: searchParams.autorizado,
              funcionario_id: funcionarioId,
            }}
          />
        </div>
      )}
    </div>
  );
}
