import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import Pagination from "@/components/layout/Pagination";

interface Inv {
  id: number;
  tipo_id: number;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  talla_id: number | null;
  fecha_adquisicion: string | null;
  fecha_vence: string | null;
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

export default async function ProteccionPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "LOGISTICA"]);
  const puedeCrear = hasAnyRole(me.roles, ["ADMIN", "LOGISTICA"]);

  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.estatus) params.set("estatus", searchParams.estatus);

  let data: Page<Inv> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Inv>>(`/equipo/proteccion/inventario?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipo de protección</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} ítems` : "Cargando…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/equipo/proteccion/asignaciones"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            📋 Asignaciones activas
          </Link>
          {puedeCrear && (
            <Link
              href="/equipo/proteccion/nuevo"
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              + Nuevo ítem
            </Link>
          )}
        </div>
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
                  <th className="text-left p-3">Marca / Modelo</th>
                  <th className="text-left p-3">Serie</th>
                  <th className="text-left p-3">Adquisición</th>
                  <th className="text-left p-3">Vence</th>
                  <th className="text-left p-3">Estatus</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{i.marca ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{i.modelo ?? ""}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">{i.numero_serie ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(i.fecha_adquisicion)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(i.fecha_vence)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          ESTATUS_COLORS[i.estatus] ?? "bg-gray-100"
                        }`}
                      >
                        {i.estatus}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {puedeCrear && i.estatus === "DISPONIBLE" && (
                        <Link
                          href={`/equipo/proteccion/${i.id}/asignar`}
                          className="text-primary hover:underline text-xs font-medium"
                        >
                          Asignar →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin inventario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            pages={data.pages}
            basePath="/equipo/proteccion"
            searchParams={{ estatus: searchParams.estatus }}
          />
        </div>
      )}
    </div>
  );
}
