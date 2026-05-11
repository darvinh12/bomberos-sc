import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
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
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeCrear = hasAnyRole(me.roles, ["ADMIN", "OPERADOR"]);

  let data: Page<Row> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Row>>("/ops/guardias?page_size=50", token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Guardias</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} guardias programadas` : "Cargando…"}
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/ops/guardias/nuevo"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            + Nueva guardia
          </Link>
        )}
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
                  <th className="text-right p-3"></th>
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
                    <td className="p-3 text-right">
                      <Link
                        href={`/ops/guardias/${g.id}`}
                        className="text-primary hover:underline text-xs"
                      >
                        Ver / Asignar →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
