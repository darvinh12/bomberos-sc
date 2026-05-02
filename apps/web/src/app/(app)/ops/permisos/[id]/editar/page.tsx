import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
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
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);

  const id = Number(params.id);
  const p = {
    id,
    funcionario_id: 1,
    tipo: "MEDICO",
    fecha_inicio: "2026-05-05",
    fecha_fin: "2026-05-07",
    horas: 24,
    motivo: "Trámite personal urgente",
    autorizado: false,
  };

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
