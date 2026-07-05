import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/layout/Pagination";

interface Comision {
  id: number;
  funcionario_id: number;
  institucion_libre: string | null;
  cargo_comision: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  resolucion: string | null;
  activo: boolean;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface SearchProps {
  searchParams: { activo?: string; page?: string; funcionario_id?: string };
}

export default async function ComisionesPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  await requireModuloOrRedirect("operativo", me.roles, token);
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);
  const page = Number(searchParams.page ?? 1);
  const funcionarioId = searchParams.funcionario_id;
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.activo) params.set("activo", searchParams.activo);
  if (funcionarioId) params.set("funcionario_id", funcionarioId);

  let data: Page<Comision> | null = null;
  let funcionario: { id: number; nombre_completo: string | null } | null = null;
  let err: string | null = null;
  try {
    const [comisiones, funcionarioData] = await Promise.all([
      api.get<Page<Comision>>(`/ops/comisiones?${params}`, token),
      funcionarioId
        ? api
            .get<{ id: number; nombre_completo: string | null }>(
              `/funcionarios/${funcionarioId}`,
              token,
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    data = comisiones;
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
            <span className="text-foreground">Comisiones de este funcionario</span>
          </div>
          <Link
            href="/ops/comisiones"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Comisiones de servicio</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} comisiones` : "Cargando…"}
          </p>
        </div>
        {puedeEditar && (
          <Link
            href="/ops/comisiones/nuevo"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            + Nueva comisión
          </Link>
        )}
      </div>

      <form className="flex gap-3 items-end">
        {funcionarioId && (
          <input type="hidden" name="funcionario_id" value={funcionarioId} />
        )}
        <div>
          <label className="block text-xs font-medium mb-1">Activas</label>
          <select
            name="activo"
            defaultValue={searchParams.activo ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            <option value="true">Activas</option>
            <option value="false">Cerradas</option>
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
                  <th className="text-left p-3">Institución</th>
                  <th className="text-left p-3">Cargo</th>
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-left p-3">Fin</th>
                  <th className="text-left p-3">Resolución</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">#{c.funcionario_id}</td>
                    <td className="p-3 font-medium">
                      {c.institucion_libre ?? "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.cargo_comision ?? "—"}
                    </td>
                    <td className="p-3">{formatDate(c.fecha_inicio)}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.fecha_fin)}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {c.resolucion ?? "—"}
                    </td>
                    <td className="p-3">
                      {c.activo ? (
                        <span className="badge badge-info">Activa</span>
                      ) : (
                        <span className="badge badge-neutral">Cerrada</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/editar-pendiente/comisiones?id=${c.id}&desde=/ops/comisiones`}
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
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Sin comisiones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            basePath="/ops/comisiones"
            searchParams={{
              activo: searchParams.activo,
              funcionario_id: funcionarioId,
            }}
          />
        </div>
      )}
    </div>
  );
}
