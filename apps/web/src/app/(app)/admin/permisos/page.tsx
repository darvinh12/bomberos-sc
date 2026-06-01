import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { cargarMatriz, cargarPermisosRecursos } from "./actions";
import MatrizCards from "./matriz-cards";

export default async function PermisosPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const [{ roles }, permisosRecursos] = await Promise.all([
    cargarMatriz(),
    cargarPermisosRecursos(),
  ]);

  const rolesParaMatriz = roles.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
  }));

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
          Selecciona un módulo para configurar qué puede hacer cada rol. Los
          cambios se aplican a todos los usuarios sin reabrir sesión.
        </p>
      </div>

      <MatrizCards
        roles={rolesParaMatriz}
        permisosIniciales={permisosRecursos}
      />
    </div>
  );
}
