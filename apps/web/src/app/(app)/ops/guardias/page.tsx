import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { formatDate } from "@/lib/utils";

interface Row {
  id: number;
  fecha: string;
  estacion_id: number;
  seccion: string | null;
  turno: string;
  hora_inicio: string;
  hora_fin: string;
  jefe_guardia_id: number | null;
  cerrada: boolean;
}
interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export default async function GuardiasPage() {
  const token = await requireAuth();
  let data: Page<Row> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Row>>("/ops/guardias?page_size=50", token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Guardias</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} guardias programadas` : "Cargando…"}
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
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Estación</th>
                  <th className="text-left p-3">Sección</th>
                  <th className="text-left p-3">Turno</th>
                  <th className="text-left p-3">Hora</th>
                  <th className="text-left p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr key={g.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{formatDate(g.fecha)}</td>
                    <td className="p-3">#{g.estacion_id}</td>
                    <td className="p-3">{g.seccion ?? "—"}</td>
                    <td className="p-3">{g.turno}</td>
                    <td className="p-3 font-mono text-xs">
                      {g.hora_inicio}–{g.hora_fin}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          g.cerrada
                            ? "bg-gray-100 text-gray-600"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {g.cerrada ? "CERRADA" : "ABIERTA"}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin guardias registradas.
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
