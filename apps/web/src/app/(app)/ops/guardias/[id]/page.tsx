import Link from "next/link";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import GuardiaPanel from "./panel";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string; estatus: string }
interface Page<T> { items: T[]; total: number }

export default async function GuardiaDetallePage({ params }: { params: { id: string } }) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "OPERADOR", "RRHH", "SUPERVISOR"]);
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "OPERADOR"]);

  const id = Number(params.id);
  const guardia = await api.get<{
    id: number; fecha: string; estacion_id: number; turno: string;
    seccion: string | null; hora_inicio: string; hora_fin: string; cerrada: boolean;
    funcionarios_asignados: { id: number; funcionario_id: number; rol_guardia: string | null; asistio: boolean | null }[];
  }>(`/ops/guardias/${id}`, token).catch(() => null);

  if (!guardia) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/ops/guardias" className="text-xs text-muted-foreground hover:underline">← Guardias</Link>
        <p className="text-sm text-destructive">Guardia #{id} no encontrada.</p>
      </div>
    );
  }

  const funcs = await api
    .get<Page<Func>>(`/funcionarios?page_size=200&estatus=ACTIVO`, token)
    .catch(() => ({ items: [] as Func[], total: 0 }));

  const funcMap = new Map(funcs.items.map((f) => [f.id, f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`]));

  const asignadosIds = new Set(guardia.funcionarios_asignados.map((a) => a.funcionario_id));
  const disponibles = funcs.items.filter((f) => !asignadosIds.has(f.id));

  const asignados = guardia.funcionarios_asignados.map((a) => ({
    id: a.id,
    nombre_completo: funcMap.get(a.funcionario_id) ?? `Funcionario #${a.funcionario_id}`,
    rol_guardia: a.rol_guardia,
    asistio: a.asistio,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/ops/guardias" className="text-xs text-muted-foreground hover:underline">← Guardias</Link>
        <h1 className="text-2xl font-bold mt-1">
          Guardia #{id} · {formatDate(guardia.fecha)}
        </h1>
        <div className="flex gap-2 items-center mt-1 text-sm">
          <span className="text-muted-foreground">Estación #{guardia.estacion_id}</span>
          <span className="text-muted-foreground">·</span>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-900/40 text-blue-400 border border-blue-700/50">
            {guardia.turno}
          </span>
          {guardia.seccion && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
              Sección {guardia.seccion}
            </span>
          )}
          {guardia.cerrada ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground border border-border">
              <Check className="w-3 h-3" aria-hidden="true" />
              Cerrada
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
              En curso
            </span>
          )}
        </div>
      </div>

      <GuardiaPanel
        guardiaId={id}
        cerrada={guardia.cerrada}
        asignados={asignados}
        disponibles={disponibles}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
