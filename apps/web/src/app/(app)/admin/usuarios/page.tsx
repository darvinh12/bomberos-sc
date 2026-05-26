import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

interface Usuario {
  id: number;
  usuario: string;
  nombre_completo: string;
  correo: string | null;
  funcionario_id: number | null;
  activo: boolean;
  bloqueado: boolean;
  motivo_bloqueo: string | null;
  intentos_fallidos: number;
  debe_cambiar_password: boolean;
  mfa_activo: boolean;
  ultimo_acceso: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface SearchProps {
  searchParams: { activo?: string; page?: string };
}

export default async function UsuariosAdminPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const page = Number(searchParams.page ?? 1);
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (searchParams.activo) params.set("activo", searchParams.activo);

  let data: Page<Usuario> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<Usuario>>(`/admin/usuarios?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios del sistema</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.total.toLocaleString("es-VE")} cuentas`
              : "Cargando…"}
          </p>
        </div>
        <Link
          href="/admin/usuarios/nuevo"
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          + Nuevo usuario
        </Link>
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err === "403" || err.includes("403")
            ? "Solo administradores pueden ver esta sección."
            : err}
        </div>
      )}

      {data && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Usuario</th>
                  <th className="text-left p-3">Nombre</th>
                  <th className="text-left p-3">Correo</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-left p-3">MFA</th>
                  <th className="text-left p-3">Intentos</th>
                  <th className="text-left p-3">Último acceso</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-t hover:bg-muted/30 transition">
                    <td className="p-3 font-mono text-xs">@{u.usuario}</td>
                    <td className="p-3 font-medium">{u.nombre_completo}</td>
                    <td className="p-3 text-muted-foreground">{u.correo ?? "—"}</td>
                    <td className="p-3 space-x-1">
                      {u.bloqueado && (
                        <span className="badge badge-danger">Bloqueado</span>
                      )}
                      {!u.activo && (
                        <span className="badge badge-neutral">Inactivo</span>
                      )}
                      {u.activo && !u.bloqueado && (
                        <span className="badge badge-success">Activo</span>
                      )}
                      {u.debe_cambiar_password && (
                        <span className="badge badge-warning">Cambio pwd</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          u.mfa_activo
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {u.mfa_activo ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs tabular-nums">
                      {u.intentos_fallidos > 0 ? (
                        <span className="text-red-400">{u.intentos_fallidos}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {u.ultimo_acceso
                        ? formatDate(u.ultimo_acceso) +
                          " " +
                          new Date(u.ultimo_acceso).toLocaleTimeString("es-VE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Nunca"}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/usuarios/${u.id}`}
                        className="text-primary hover:underline text-xs font-medium"
                      >
                        Editar roles →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-8 text-center text-muted-foreground"
                    >
                      Sin usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p>
          Clic en <strong>Editar roles</strong> para asignar o revocar permisos
          a cada usuario. La creación de nuevos usuarios y reset de password se
          hace via API (<code className="font-mono">/admin/usuarios</code>) — la
          UI de creación llega pronto.
        </p>
      </div>
    </div>
  );
}
