import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

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
  searchParams: { autorizado?: string; page?: string };
}

export default async function PermisosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);
  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.autorizado) params.set("autorizado", searchParams.autorizado);

  let data: Page<Permiso> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Permiso>>(`/ops/permisos?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Permisos</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("es-VE")} permisos` : "Cargando…"}
        </p>
      </div>

      <form className="flex gap-3 items-end">
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
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
                          Autorizado
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {puedeEditar ? (
                        <Link
                          href={`/editar-pendiente/permisos?id=${p.id}&desde=/ops/permisos`}
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
        </div>
      )}
    </div>
  );
}
