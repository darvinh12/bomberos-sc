import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { cargarMatriz } from "./actions";
import MatrizPermisos from "./matriz";

export default async function PermisosPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const { roles, modulos, permisos } = await cargarMatriz();

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
          Elegí un rol y marcá qué puede hacer en cada módulo. Cada cambio se
          guarda al instante.
        </p>
      </div>

      <MatrizPermisos roles={roles} modulos={modulos} permisos={permisos} />
    </div>
  );
}
