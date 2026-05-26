import { Check, X } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { api } from "@/lib/api";
import { listarCamposCustom } from "./actions";
import CamposForm from "./form";

interface Me {
  roles: string[];
}

export const metadata = { title: "Campos personalizados — Bomberos" };

export default async function CamposCustomPage() {
  const token = await requireAuth();
  const me = await api.get<Me>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const campos = await listarCamposCustom();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campos personalizados</h1>
        <p className="text-sm text-muted-foreground">
          Define campos extra que se agregarán a las fichas de cada entidad.
          Quedan disponibles inmediatamente en los formularios.
        </p>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-sm">Campos definidos ({campos.length})</h2>
        </div>
        {campos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aún no hay campos personalizados. Crea uno usando el formulario debajo.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-3">Entidad</th>
                  <th className="text-left p-3">Código</th>
                  <th className="text-left p-3">Etiqueta</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-center p-3">Requerido</th>
                  <th className="text-right p-3">Orden</th>
                  <th className="text-center p-3">Activo</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3">
                      <span className="badge badge-primary">{c.entidad}</span>
                    </td>
                    <td className="p-3 font-mono text-xs">{c.codigo}</td>
                    <td className="p-3 font-medium">{c.etiqueta}</td>
                    <td className="p-3 text-muted-foreground">{c.tipo}</td>
                    <td className="p-3 text-center">
                      {c.requerido ? (
                        <Check className="w-4 h-4 text-emerald-400 inline" aria-label="Requerido" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{c.orden}</td>
                    <td className="p-3 text-center">
                      {c.activo ? (
                        <Check className="w-4 h-4 text-emerald-400 inline" aria-label="Activo" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground inline" aria-label="Inactivo" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Agregar nuevo campo</h2>
        <CamposForm />
      </div>
    </div>
  );
}
