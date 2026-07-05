import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import EditarForm from "./form";

export default async function EditarPermisoPage({
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
  const p = await api.get<{
    id: number; funcionario_id: number; tipo: string;
    fecha_inicio: string; fecha_fin: string; horas: number | null;
    motivo: string; autorizado: boolean;
  }>(`/ops/permisos/${id}`, token).catch(() => null);

  if (!p) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/ops/permisos" className="text-xs text-muted-foreground hover:underline">← Permisos</Link>
        <p className="text-sm text-destructive">Permiso #{id} no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/ops/permisos"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Permisos
        </Link>
        <h1 className="text-2xl font-bold mt-1">
          {p.autorizado ? "Permiso autorizado" : "Autorizar permiso"} #{id}
        </h1>
        <p className="text-sm text-muted-foreground">
          Funcionario #{p.funcionario_id}
        </p>
      </div>
      <EditarForm permiso={p} />
    </div>
  );
}
