import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
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

interface Asignacion {
  id: number;
  inventario_id: number;
  funcionario_id: number;
  fecha_entrega: string;
  estado_entrega: string | null;
  fecha_devolucion: string | null;
  estado_devolucion: string | null;
  devuelto: boolean;
  observaciones: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const ESTATUS_COLORS: Record<string, string> = {
  DISPONIBLE:    "badge badge-success",
  ASIGNADO:      "badge badge-info",
  EN_REPARACION: "badge badge-warning",
  DADO_DE_BAJA:  "badge badge-neutral",
  PERDIDO:       "badge badge-danger",
};

interface SearchProps {
  searchParams: { estatus?: string; page?: string; funcionario_id?: string };
}

export default async function ProteccionPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "LOGISTICA"]);
  const puedeCrear = hasAnyRole(me.roles, ["ADMIN", "LOGISTICA"]);

  const funcionarioId = searchParams.funcionario_id;
  const page = Number(searchParams.page ?? 1);

  let dataInv: Page<Inv> | null = null;
  let dataAsig: Page<Asignacion> | null = null;
  let funcionario: { id: number; nombre_completo: string | null } | null = null;
  let err: string | null = null;

  try {
    if (funcionarioId) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "50",
        funcionario_id: funcionarioId,
      });
      const [asignaciones, funcionarioData] = await Promise.all([
        api.get<Page<Asignacion>>(`/equipo/proteccion/asignaciones?${params}`, token),
        api
          .get<{ id: number; nombre_completo: string | null }>(
            `/funcionarios/${funcionarioId}`,
            token,
          )
          .catch(() => null),
      ]);
      dataAsig = asignaciones;
      funcionario = funcionarioData;
    } else {
      const params = new URLSearchParams({ page: String(page), page_size: "50" });
      if (searchParams.estatus) params.set("estatus", searchParams.estatus);
      dataInv = await api.get<Page<Inv>>(`/equipo/proteccion/inventario?${params}`, token);
    }
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  const data = funcionarioId ? dataAsig : dataInv;

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
            <span className="text-foreground">Equipo de protección asignado</span>
          </div>
          <Link
            href="/equipo/proteccion"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Quitar filtro
          </Link>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {funcionarioId ? "Equipo asignado al funcionario" : "Equipo de protección"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? funcionarioId
                ? `${data.total.toLocaleString("es-VE")} asignaciones`
                : `${data.total.toLocaleString("es-VE")} ítems`
              : "Cargando…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/equipo/proteccion/asignaciones"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            Asignaciones activas
          </Link>
          {puedeCrear && !funcionarioId && (
            <Link
              href="/equipo/proteccion/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Nuevo ítem
            </Link>
          )}
        </div>
      </div>

      {!funcionarioId && (
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
      )}

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      {funcionarioId && dataAsig && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Inventario</th>
                  <th className="text-left p-3">Fecha entrega</th>
                  <th className="text-left p-3">Estado entrega</th>
                  <th className="text-left p-3">Fecha devolución</th>
                  <th className="text-left p-3">Estado devolución</th>
                  <th className="text-left p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {dataAsig.items.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">#{a.inventario_id}</td>
                    <td className="p-3">{formatDate(a.fecha_entrega)}</td>
                    <td className="p-3 text-muted-foreground">
                      {a.estado_entrega ?? "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(a.fecha_devolucion)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {a.estado_devolucion ?? "—"}
                    </td>
                    <td className="p-3">
                      {a.devuelto ? (
                        <span className="badge badge-neutral">DEVUELTO</span>
                      ) : (
                        <span className="badge badge-info">EN USO</span>
                      )}
                    </td>
                  </tr>
                ))}
                {dataAsig.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin asignaciones para este funcionario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={dataAsig.page}
            pages={dataAsig.pages}
            basePath="/equipo/proteccion"
            searchParams={{ funcionario_id: funcionarioId }}
          />
        </div>
      )}

      {!funcionarioId && dataInv && (
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
                {dataInv.items.map((i) => (
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
                      <span className={ESTATUS_COLORS[i.estatus] ?? "badge badge-neutral"}>
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
                {dataInv.items.length === 0 && (
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
            page={dataInv.page}
            pages={dataInv.pages}
            basePath="/equipo/proteccion"
            searchParams={{ estatus: searchParams.estatus }}
          />
        </div>
      )}
    </div>
  );
}
