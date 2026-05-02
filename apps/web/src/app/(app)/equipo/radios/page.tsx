import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/layout/Pagination";

interface Radio {
  id: number;
  modelo_id: number;
  serial: string;
  placa_inv: string | null;
  frecuencia: string | null;
  canal: string | null;
  fecha_adquisicion: string | null;
  estatus: string;
  estacion_id: number | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const ESTATUS_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-green-100 text-green-800",
  ASIGNADO: "bg-blue-100 text-blue-800",
  EN_REPARACION: "bg-yellow-100 text-yellow-800",
  DADO_DE_BAJA: "bg-gray-200 text-gray-700",
  PERDIDO: "bg-red-100 text-red-800",
};

interface SearchProps {
  searchParams: { estatus?: string; page?: string };
}

export default async function RadiosPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "LOGISTICA"]);
  const puedeCrear = hasAnyRole(me.roles, ["ADMIN", "LOGISTICA"]);

  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.estatus) params.set("estatus", searchParams.estatus);

  let data: Page<Radio> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Radio>>(`/equipo/radios?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Radios</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} radios` : "Cargando…"}
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/equipo/radios/nuevo"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            + Nuevo radio
          </Link>
        )}
      </div>

      <form className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Estatus</label>
          <select
            name="estatus"
            defaultValue={searchParams.estatus ?? ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {Object.keys(ESTATUS_COLORS).map((s) => (
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
                  <th className="text-left p-3">Serial</th>
                  <th className="text-left p-3">Placa Inv.</th>
                  <th className="text-left p-3">Frecuencia / Canal</th>
                  <th className="text-left p-3">Adquisición</th>
                  <th className="text-left p-3">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{r.serial}</td>
                    <td className="p-3 font-mono text-xs">{r.placa_inv ?? "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {r.frecuencia ?? "—"}
                      {r.canal ? ` / ch ${r.canal}` : ""}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(r.fecha_adquisicion)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          ESTATUS_COLORS[r.estatus] ?? "bg-gray-100"
                        }`}
                      >
                        {r.estatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Sin radios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            basePath="/equipo/radios"
            searchParams={{ estatus: searchParams.estatus }}
          />
        </div>
      )}
    </div>
  );
}
