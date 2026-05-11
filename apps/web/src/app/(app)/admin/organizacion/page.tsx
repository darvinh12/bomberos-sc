import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import {
  listarOrg,
  type Estacion,
  type Org,
  type Zona,
} from "./actions";
import OrgTabs from "./tabs";

export default async function OrganizacionPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const [zonas, estaciones, divisiones, areas, dependencias] = await Promise.all([
    listarOrg("zonas") as Promise<Zona[]>,
    listarOrg("estaciones") as Promise<Estacion[]>,
    listarOrg("divisiones") as Promise<Org[]>,
    listarOrg("areas") as Promise<Org[]>,
    listarOrg("dependencias") as Promise<Org[]>,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Administración
        </Link>
        <h1 className="text-2xl font-bold mt-1">Departamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estructura organizacional: zonas geográficas, estaciones, divisiones
          administrativas, áreas y dependencias. Cambios afectan los dropdowns
          de toda la app.
        </p>
      </div>

      <OrgTabs
        zonas={zonas}
        estaciones={estaciones}
        divisiones={divisiones}
        areas={areas}
        dependencias={dependencias}
      />
    </div>
  );
}
