import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { formatCedula, formatDate } from "@/lib/utils";

interface FuncionarioListItem {
  id: number;
  nacionalidad: string;
  cedula: number;
  apellidos: string;
  nombres: string;
  nombre_completo: string | null;
  estatus: string;
  jerarquia_id: number | null;
  cargo_id: number | null;
  zona_id: number | null;
  estacion_id: number | null;
  fecha_primer_ingreso: string | null;
  pre_jubilado: boolean;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface Catalogo {
  id: number;
  codigo: string;
  nombre: string;
}

const ESTATUS_COLORS: Record<string, string> = {
  ACTIVO: "bg-green-100 text-green-800",
  REPOSO: "bg-yellow-100 text-yellow-800",
  COMISION: "bg-blue-100 text-blue-800",
  PRE_JUBILADO: "bg-purple-100 text-purple-800",
  JUBILADO: "bg-gray-200 text-gray-700",
  EGRESADO: "bg-gray-100 text-gray-500",
  FALLECIDO: "bg-black text-white",
  SUSPENDIDO: "bg-red-100 text-red-800",
};

interface SearchProps {
  searchParams: { q?: string; estatus?: string; page?: string };
}

export default async function FuncionariosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const q = searchParams.q ?? "";
  const estatus = searchParams.estatus ?? "ACTIVO";
  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "25", estatus });
  if (q) params.set("q", q);

  let data: Page<FuncionarioListItem> | null = null;
  let jer: Catalogo[] = [];
  let err: string | null = null;
  try {
    data = await api.get<Page<FuncionarioListItem>>(`/funcionarios?${params}`, token);
    jer = await api.get<Catalogo[]>("/catalogos/jerarquias", token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }
  const jerMap = new Map(jer.map((j) => [j.id, j.nombre]));
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personal</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} funcionarios` : "Cargando…"}
          </p>
        </div>
        <Link
          href="/funcionarios/nuevo"
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          + Nuevo funcionario
        </Link>
      </div>

      <form className="flex gap-3 items-end">
        <div className="flex-1 max-w-md">
          <label className="block text-xs font-medium mb-1">Búsqueda</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Nombre, cédula o nº empleado"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Estatus</label>
          <select
            name="estatus"
            defaultValue={estatus}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {[
              "ACTIVO",
              "REPOSO",
              "COMISION",
              "PRE_JUBILADO",
              "JUBILADO",
              "EGRESADO",
              "FALLECIDO",
              "SUSPENDIDO",
            ].map((s) => (
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
                  <th className="text-left p-3">Cédula</th>
                  <th className="text-left p-3">Nombre</th>
                  <th className="text-left p-3">Jerarquía</th>
                  <th className="text-left p-3">Estatus</th>
                  <th className="text-left p-3">Ingreso</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id} className="border-t hover:bg-muted/30 transition">
                    <td className="p-3 font-mono text-xs">
                      {formatCedula(f.nacionalidad, f.cedula)}
                    </td>
                    <td className="p-3 font-medium">
                      {f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {f.jerarquia_id ? jerMap.get(f.jerarquia_id) ?? "—" : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          ESTATUS_COLORS[f.estatus] ?? "bg-gray-100"
                        }`}
                      >
                        {f.estatus}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(f.fecha_primer_ingreso)}
                    </td>
                    <td className="p-3 text-right space-x-3">
                      <Link
                        href={`/funcionarios/${f.id}`}
                        className="text-primary hover:underline text-xs"
                      >
                        Ver
                      </Link>
                      {puedeEditar && (
                        <Link
                          href={`/funcionarios/${f.id}/editar`}
                          className="text-primary hover:underline text-xs font-medium"
                        >
                          Editar →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="border-t p-3 flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                Página {data.page} de {data.pages}
              </span>
              <div className="flex gap-2">
                {data.page > 1 && (
                  <Link
                    href={`?${new URLSearchParams({ ...searchParams, page: String(data.page - 1) })}`}
                    className="px-3 py-1 rounded border hover:bg-accent"
                  >
                    ← Anterior
                  </Link>
                )}
                {data.page < data.pages && (
                  <Link
                    href={`?${new URLSearchParams({ ...searchParams, page: String(data.page + 1) })}`}
                    className="px-3 py-1 rounded border hover:bg-accent"
                  >
                    Siguiente →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
