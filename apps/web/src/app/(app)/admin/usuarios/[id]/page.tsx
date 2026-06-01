import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import {
  cargarUsuarioConRoles,
  type UsuarioDetalle,
} from "./actions";
import RolesEditor from "./roles-editor";
import CuentaEditor from "./cuenta-editor";
import { listarScopes } from "./scope-actions";
import ScopeEditor from "./scope-editor";
import { listarRolScopes } from "./rol-scope-actions";
import RolScopeEditor from "./rol-scope-editor";
import { listarRoles } from "../../roles/actions";

export default async function UsuarioDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const id = Number(params.id);
  if (Number.isNaN(id)) notFound();

  let u: UsuarioDetalle;
  try {
    u = await cargarUsuarioConRoles(id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [scopes, rolScopes, rolesDB, zonas, estaciones, divisiones, areas] = await Promise.all([
    listarScopes(id),
    listarRolScopes(id),
    listarRoles(),
    api.get<{ id: number; nombre: string }[]>("/catalogos/zonas", token).catch(() => []),
    api
      .get<{ id: number; nombre: string; zona_id: number }[]>(
        "/catalogos/estaciones",
        token,
      )
      .catch(() => []),
    api.get<{ id: number; nombre: string }[]>("/catalogos/divisiones", token).catch(() => []),
    api.get<{ id: number; nombre: string }[]>("/catalogos/areas", token).catch(() => []),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/usuarios"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Usuarios
        </Link>
        <h1 className="text-2xl font-bold mt-1">{u.nombre_completo}</h1>
        <p className="text-sm text-muted-foreground font-mono">
          @{u.usuario} · ID #{u.id}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Estado de la cuenta</h2>
          <div className="space-y-2 text-sm mb-4">
            <Row label="MFA activo" value={u.mfa_activo ? "Sí" : "No"} />
            <Row
              label="Cambio password forzado"
              value={u.debe_cambiar_password ? "Sí" : "No"}
            />
            <Row label="Intentos fallidos" value={String(u.intentos_fallidos)} />
            <Row
              label="Último acceso"
              value={u.ultimo_acceso ? formatDate(u.ultimo_acceso) : "Nunca"}
            />
          </div>
          <CuentaEditor
            usuarioId={u.id}
            correoActual={u.correo}
            activo={u.activo}
            bloqueado={u.bloqueado}
            motivoBloqueo={u.motivo_bloqueo}
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Roles asignados</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Marca/desmarca para asignar o quitar un rol. El cambio aplica al
            instante.
          </p>
          <RolesEditor
            usuarioId={u.id}
            rolesDisponibles={rolesDB.filter((r) => r.activo).map((r) => ({
              codigo: r.codigo,
              nombre: r.nombre,
              descripcion: r.descripcion,
            }))}
            rolesAsignados={u.roles}
          />
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold mb-2">Departamentos asignados (scope)</h2>
        <ScopeEditor
          usuarioId={u.id}
          scopesIniciales={scopes}
          zonas={zonas}
          estaciones={estaciones}
          divisiones={divisiones}
          areas={areas}
        />
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold mb-2">Roles por departamento</h2>
        <RolScopeEditor
          usuarioId={u.id}
          scopesIniciales={rolScopes}
          roles={rolesDB}
          zonas={zonas}
          estaciones={estaciones}
          divisiones={divisiones}
          areas={areas}
        />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b last:border-0 pb-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
