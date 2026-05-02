import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, ROLES_DISPONIBLES } from "@/lib/roles";
import NuevoForm from "./form";

export default async function NuevoUsuarioPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/usuarios"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Usuarios
        </Link>
        <h1 className="text-2xl font-bold mt-1">Nuevo usuario</h1>
        <p className="text-sm text-muted-foreground">
          El usuario será forzado a cambiar el password al primer login.
        </p>
      </div>
      <NuevoForm rolesDisponibles={ROLES_DISPONIBLES} />
    </div>
  );
}
