import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import EditarForm from "./form";

export default async function EditarVacacionesPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  await requireModuloOrRedirect("operativo", me.roles, token);

  const id = Number(params.id);
  const v = await api.get<{
    id: number; funcionario_id: number; periodo_anio: number;
    fecha_inicio: string; fecha_fin: string; dias_calendario: number | null;
    dias_habiles: number | null; fraccionada: boolean; autorizado: boolean;
    observaciones: string | null;
  }>(`/ops/vacaciones/${id}`, token).catch(() => null);

  if (!v) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/ops/vacaciones" className="text-xs text-muted-foreground hover:underline">← Vacaciones</Link>
        <p className="text-sm text-destructive">Vacaciones #{id} no encontradas.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/ops/vacaciones"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Vacaciones
        </Link>
        <h1 className="text-2xl font-bold mt-1">Editar vacaciones #{id}</h1>
        <p className="text-sm text-muted-foreground">
          Funcionario #{v.funcionario_id} · Período {v.periodo_anio}
        </p>
      </div>
      <EditarForm vacaciones={v} />
    </div>
  );
}
