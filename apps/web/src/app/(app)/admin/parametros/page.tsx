import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarParametros } from "./actions";
import ParametrosList from "./list";

export default async function ParametrosPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const parametros = await listarParametros();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-bold mt-1">Parámetros del sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuración global del sistema. Solo el valor es editable — el
          resto son metadatos definidos por scripts SQL. Cambios quedan
          auditados.
        </p>
      </div>
      <ParametrosList parametros={parametros} />
    </div>
  );
}
