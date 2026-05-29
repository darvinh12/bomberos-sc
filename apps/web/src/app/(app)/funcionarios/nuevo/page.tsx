import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import {
  cargarCatalogosFuncionario,
  type CatalogosFuncionario,
} from "@/lib/catalogos";
import NuevoForm from "./form";

interface Me {
  roles: string[];
}

export default async function NuevoFuncionarioPage() {
  const token = await requireAuth();
  const me = await api
    .get<Me>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);

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
    parentescos: [],
    tiposLicencia: [],
    tiposNacionalizacion: [],
    idiomas: [],
    paises: [],
    seccionesFuncionario: [],
  };
  try {
    catalogos = await cargarCatalogosFuncionario(token);
  } catch {
    // si la API no responde, los selects quedan vacíos
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo funcionario</h1>
        <p className="text-sm text-muted-foreground">
          La fecha de primer ingreso genera automáticamente el período de servicio inicial.
        </p>
      </div>
      <NuevoForm catalogos={catalogos} userRoles={me.roles} />
    </div>
  );
}
