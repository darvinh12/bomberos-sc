import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarCamposCustom } from "@/app/(app)/admin/campos-custom/actions";
import {
  cargarCatalogosFuncionario,
  type CatalogosFuncionario,
} from "@/lib/catalogos";
import EditarForm from "./form";

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

  let catalogos: CatalogosFuncionario = {
    jerarquias: [],
    cargos: [],
    condiciones: [],
    zonas: [],
    estaciones: [],
    areas: [],
    dependencias: [],
    divisiones: [],
    estadosCiviles: [],
    gruposSanguineos: [],
    nivelesEducativos: [],
    especialidades: [],
    tiposPersonal: [],
    estatusFuncionario: [],
    institucionesFormadoras: [],
    estados: [],
    municipios: [],
    parroquias: [],
    tiposVivienda: [],
    tenenciasVivienda: [],
  };
  let camposCustom: Awaited<ReturnType<typeof listarCamposCustom>> = [];
  try {
    [catalogos, camposCustom] = await Promise.all([
      cargarCatalogosFuncionario(token),
      listarCamposCustom().then((cs) =>
        cs.filter((c) => c.entidad === "funcionario" && c.activo),
      ),
    ]);
  } catch {
    // si la API no responde, los selects quedan vacíos
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar funcionario</h1>
        <p className="text-sm text-muted-foreground font-mono">
          ID #{id} ·{" "}
          {String(funcionario.nombre_completo ?? `${funcionario.apellidos}, ${funcionario.nombres}`)}
        </p>
      </div>
      <EditarForm
        funcionario={funcionario}
        catalogos={catalogos}
        camposCustom={camposCustom}
        esAdmin={me.roles.includes("ADMIN")}
        userRoles={me.roles}
      />
    </div>
  );
}
