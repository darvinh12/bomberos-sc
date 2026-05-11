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

  // En demo no hay endpoint /salud/reposos/{id} todavía, simulamos uno básico
  const id = Number(params.id);
  const reposoMock: Reposo = {
    id,
    funcionario_id: 1,
    fecha_inicio: "2026-04-15",
    fecha_fin: "2026-05-15",
    diagnostico_libre: "Lumbalgia aguda",
    folio: "REP-2026-001",
    documento_url: null,
    observaciones: null,
    anulado: false,
    metadata: {},
  };

  const camposCustom = await listarCamposCustom().then((cs) =>
    cs.filter((c) => c.entidad === "reposo" && c.activo),
  );

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
          Funcionario #{reposoMock.funcionario_id}
        </p>
      </div>
      <EditarForm reposo={reposoMock} camposCustom={camposCustom} />
    </div>
  );
}
