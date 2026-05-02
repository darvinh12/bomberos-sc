import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import DevolverPanel from "./panel";

interface Asignacion {
  id: number;
  inventario_id: number;
  funcionario_id: number;
  fecha_entrega: string;
  estado_entrega: string | null;
  observaciones: string | null;
  fecha_devolucion: string | null;
  estado_devolucion: string | null;
  devuelto: boolean;
}

interface Page<T> {
  items: T[];
  total: number;
}

export default async function AsignacionesProteccionPage() {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "LOGISTICA"]);

  let data: Page<Asignacion> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Asignacion>>(
      "/equipo/proteccion/asignaciones?devuelto=false&page_size=100",
      token,
    );
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/equipo/proteccion" className="text-xs text-muted-foreground hover:underline">
            ← Equipo de protección
          </Link>
          <h1 className="text-2xl font-bold mt-1">Asignaciones activas</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString("es-VE")} ítems en uso` : "Cargando…"}
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      {data && <DevolverPanel asignaciones={data.items} />}
    </div>
  );
}
