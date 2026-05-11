import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarModulos } from "./actions";
import ModulosAdmin from "./admin-client";

export default async function ModulosAdminPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const modulos = await listarModulos();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Administración
        </Link>
        <h1 className="text-2xl font-bold mt-1">Módulos del sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cada módulo agrupa una sección del sistema (funcionarios, salud, etc.).
          Después de crear o desactivar uno, ajustá los permisos en{" "}
          <Link href="/admin/permisos" className="underline">
            /admin/permisos
          </Link>
          .
        </p>
      </div>

      <ModulosAdmin modulos={modulos} />
    </div>
  );
}
