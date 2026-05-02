import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { formatDate } from "@/lib/utils";

interface Row {
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

export default async function VacacionesPage() {
  const token = await requireAuth();
  let rows: Row[] = [];
  let err: string | null = null;
  try {
    rows = await api.get<Row[]>("/dashboard/vacaciones-actuales", token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vacaciones</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} períodos de vacaciones (año actual y anterior)
        </p>
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-auto">
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">{r.nombre_completo}</td>
                  <td className="p-3 font-mono text-xs">{r.cedula}</td>
                  <td className="p-3">{r.periodo_anio}</td>
                  <td className="p-3">{formatDate(r.fecha_inicio)}</td>
                  <td className="p-3">{formatDate(r.fecha_fin)}</td>
                  <td className="p-3 text-right">{r.dias_calendario ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                        r.estado === "EN_CURSO"
                          ? "bg-blue-100 text-blue-800"
                          : r.estado === "PROGRAMADA"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {r.estado}
                    </span>
                  </td>
                  <td className="p-3">
                    {r.bono_pagado ? (
                      <span className="text-green-700">✓ pagado</span>
                    ) : (
                      <span className="text-muted-foreground">pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Sin vacaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
