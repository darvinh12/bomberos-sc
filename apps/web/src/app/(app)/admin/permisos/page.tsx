import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { cargarMatriz, cargarPermisosRecursos } from "./actions";
import PermisosTabs from "./permisos-tabs";

export default async function PermisosPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const [{ roles, modulos, permisos }, permisosRecursos] = await Promise.all([
    cargarMatriz(),
    cargarPermisosRecursos(),
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
        <h1 className="text-2xl font-bold mt-1">Matriz de permisos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurá qué puede hacer cada rol en cada recurso del sistema. Los
          cambios se aplican a todos los usuarios del rol sin necesidad de
          reabrir sesión.
        </p>
      </div>

      <PermisosTabs
        roles={roles}
        modulos={modulos}
        permisos={permisos}
        permisosRecursos={permisosRecursos}
      />
    </div>
  );
}
