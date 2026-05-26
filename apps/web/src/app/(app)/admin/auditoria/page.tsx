import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import Pagination from "@/components/layout/Pagination";

interface Evento {
  id: number;
  schema_name: string;
  table_name: string;
  registro_id: string | null;
  operacion: string;
  usuario_id: number | null;
  usuario_nombre: string | null;
  ip: string | null;
  fecha: string;
  campos_cambiados: Record<string, unknown> | unknown[] | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const OP_COLORS: Record<string, string> = {
  INSERT: "badge badge-success",
  UPDATE: "badge badge-info",
  DELETE: "badge badge-danger",
};

interface SearchProps {
  searchParams: {
    schema_name?: string;
    table_name?: string;
    operacion?: string;
    page?: string;
  };
}

export default async function AuditoriaPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.schema_name) params.set("schema_name", searchParams.schema_name);
  if (searchParams.table_name) params.set("table_name", searchParams.table_name);
  if (searchParams.operacion) params.set("operacion", searchParams.operacion);

  let data: Page<Evento> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Evento>>(`/admin/auditoria?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  const fmtFecha = (s: string) =>
    new Date(s).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("es-VE")} eventos registrados` : "Cargando…"}
        </p>
      </div>

      <form className="rounded-xl border bg-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Schema</label>
          <input
            name="schema_name"
            defaultValue={searchParams.schema_name ?? ""}
            placeholder="ops, salud, personal…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Tabla</label>
          <input
            name="table_name"
            defaultValue={searchParams.table_name ?? ""}
            placeholder="funcionarios, reposos…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Operación</label>
          <select
            name="operacion"
            defaultValue={searchParams.operacion ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
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
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Usuario</th>
                  <th className="text-left p-3">Op.</th>
                  <th className="text-left p-3">Tabla</th>
                  <th className="text-left p-3">Registro</th>
                  <th className="text-left p-3">IP</th>
                  <th className="text-left p-3">Campos</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs whitespace-nowrap">
                      {fmtFecha(e.fecha)}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{e.usuario_nombre ?? "—"}</div>
                      {e.usuario_id != null && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          #{e.usuario_id}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={OP_COLORS[e.operacion] ?? "badge badge-neutral"}>
                        {e.operacion}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      <div>{e.schema_name}.{e.table_name}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">#{e.registro_id ?? "—"}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                      {e.campos_cambiados
                        ? Object.keys(e.campos_cambiados).join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Sin eventos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            basePath="/admin/auditoria"
            searchParams={{
              schema_name: searchParams.schema_name,
              table_name: searchParams.table_name,
              operacion: searchParams.operacion,
            }}
          />
        </div>
      )}
    </div>
  );
}
