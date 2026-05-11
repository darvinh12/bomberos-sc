import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarRoles } from "./actions";
import RolesAdmin from "./admin-client";

export default async function RolesAdminPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const roles = await listarRoles();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Administración
        </Link>
        <h1 className="text-2xl font-bold mt-1">Roles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Definí qué roles existen. Los roles de <em>sistema</em> no se pueden
          borrar — pero su nombre, descripción y permisos sí se editan.
        </p>
      </div>

      <RolesAdmin roles={roles} />

      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        Después de crear un rol, asignale permisos en{" "}
        <Link href="/admin/permisos" className="underline">
          /admin/permisos
        </Link>{" "}
        y luego asignáselo a usuarios desde su perfil.
      </div>
    </div>
  );
}
