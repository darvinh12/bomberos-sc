import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarCamposCustom } from "@/app/(app)/admin/campos-custom/actions";
import EditarForm from "./form";

interface Cat {
  id: number;
  codigo: string;
  nombre: string;
}

interface Me {
  roles: string[];
}

export default async function EditarFuncionarioPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api.get<Me>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);

  const id = Number(params.id);
  if (Number.isNaN(id)) notFound();

  let funcionario;
  try {
    funcionario = await api.get<Record<string, unknown>>(`/funcionarios/${id}`, token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [jerarquias, cargos, zonas, estaciones, camposCustom] = await Promise.all([
    api.get<Cat[]>("/catalogos/jerarquias", token).catch(() => []),
    api.get<Cat[]>("/catalogos/cargos", token).catch(() => []),
    api.get<Cat[]>("/catalogos/zonas", token).catch(() => []),
    api.get<Cat[]>("/catalogos/estaciones", token).catch(() => []),
    listarCamposCustom().then((cs) => cs.filter((c) => c.entidad === "funcionario" && c.activo)),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar funcionario</h1>
        <p className="text-sm text-muted-foreground font-mono">
          ID #{id} ·{" "}
          {String(funcionario.nombre_completo ?? `${funcionario.apellidos}, ${funcionario.nombres}`)}
        </p>
      </div>
      <EditarForm
        funcionario={funcionario}
        jerarquias={jerarquias}
        cargos={cargos}
        zonas={zonas}
        estaciones={estaciones}
        camposCustom={camposCustom}
        esAdmin={me.roles.includes("ADMIN")}
      />
    </div>
  );
}
