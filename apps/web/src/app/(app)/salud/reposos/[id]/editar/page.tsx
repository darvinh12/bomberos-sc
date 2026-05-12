import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarCamposCustom } from "@/app/(app)/admin/campos-custom/actions";
import EditarForm from "./form";

interface Reposo {
  id: number;
  funcionario_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  diagnostico_libre: string | null;
  folio: string | null;
  documento_url: string | null;
  observaciones: string | null;
  anulado: boolean;
  metadata?: Record<string, unknown>;
}

export default async function EditarReposoPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);

  const id = Number(params.id);
  const reposo = await api.get<Reposo>(`/salud/reposos/${id}`, token).catch(() => null);

  const camposCustom = await listarCamposCustom().then((cs) =>
    cs.filter((c) => c.entidad === "reposo" && c.activo),
  );

  if (!reposo) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/salud/reposos" className="text-xs text-muted-foreground hover:underline">← Reposos</Link>
        <p className="text-sm text-destructive">Reposo #{id} no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/salud/reposos"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Reposos
        </Link>
        <h1 className="text-2xl font-bold mt-1">Editar reposo #{id}</h1>
        <p className="text-sm text-muted-foreground">
          Funcionario #{reposo.funcionario_id}
        </p>
      </div>
      <EditarForm reposo={reposo} camposCustom={camposCustom} />
    </div>
  );
}
