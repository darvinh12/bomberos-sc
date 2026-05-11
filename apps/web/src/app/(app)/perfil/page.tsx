import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import PerfilForm from "./form";

interface Me {
  id: number;
  usuario: string;
  nombre_completo: string;
  correo?: string | null;
  roles: string[];
  debe_cambiar_password: boolean;
}

interface SearchProps {
  searchParams: { ok?: string };
}

export default async function PerfilPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  let me: Me | null = null;
  try {
    me = await api.get<Me>("/auth/me", token);
  } catch {
    me = null;
  }
  const okFlag = searchParams.ok === "1";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">Información de cuenta y seguridad.</p>
      </div>

      {me && (
        <div className="rounded-xl border bg-card p-6 space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Nombre: </span>
            <span className="font-medium">{me.nombre_completo}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Usuario: </span>
            <span className="font-mono">@{me.usuario}</span>
          </div>
          {me.correo && (
            <div>
              <span className="text-muted-foreground">Correo: </span>
              <span>{me.correo}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Roles: </span>
            <span className="font-medium">{me.roles.join(", ") || "—"}</span>
          </div>
        </div>
      )}

      {me?.debe_cambiar_password && (
        <div className="rounded-md bg-yellow-50 border border-yellow-300 p-4 text-sm text-yellow-900">
          Tu contraseña requiere cambio. Por favor actualízala antes de continuar usando el sistema.
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Cambiar contraseña</h2>
        <PerfilForm okFlag={okFlag} />
      </div>
    </div>
  );
}
