import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { formatDate } from "@/lib/utils";

interface Falta {
  id: number;
  funcionario_id: number;
  tipo_falta: string;
  fecha: string;
  descripcion: string;
  sancion: string | null;
  dias_suspension: number | null;
  fecha_inicio_susp: string | null;
  fecha_fin_susp: string | null;
  apelada: boolean;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const TIPO_COLORS: Record<string, string> = {
  LEVE: "bg-yellow-100 text-yellow-800",
  MEDIA: "bg-orange-100 text-orange-800",
  GRAVE: "bg-red-100 text-red-800",
};

interface SearchProps {
  searchParams: { page?: string };
}

export default async function FaltasPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });

  let data: Page<Falta> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Falta>>(`/ops/faltas?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Faltas y sanciones</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("es-VE")} faltas registradas` : "Cargando…"}
        </p>
      </div>

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
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Descripción</th>
                  <th className="text-left p-3">Sanción</th>
                  <th className="text-right p-3">Días susp.</th>
                  <th className="text-left p-3">Apelada</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">#{f.funcionario_id}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          TIPO_COLORS[f.tipo_falta] ?? "bg-gray-100"
                        }`}
                      >
                        {f.tipo_falta}
                      </span>
                    </td>
                    <td className="p-3">{formatDate(f.fecha)}</td>
                    <td className="p-3 max-w-md truncate" title={f.descripcion}>
                      {f.descripcion}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {f.sancion ?? "—"}
                    </td>
                    <td className="p-3 text-right">{f.dias_suspension ?? "—"}</td>
                    <td className="p-3">
                      {f.apelada ? (
                        <span className="text-blue-700">Sí</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Sin faltas registradas.
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
