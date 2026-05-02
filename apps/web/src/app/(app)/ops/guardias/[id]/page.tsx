import Link from "next/link";
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
  // En demo, el detalle no existe → mock
  const guardia = {
    id,
    fecha: "2026-05-02",
    estacion: "Estación Central",
    estacion_id: 1,
    turno: "DIURNO",
    seccion: "A",
    hora_inicio: "07:00:00",
    hora_fin: "19:00:00",
    cerrada: false,
    funcionarios_asignados: [
      { id: 1, nombre_completo: "Pérez García, José Luis DEMO", rol_guardia: "JEFE_GUARDIA", asistio: true },
      { id: 2, nombre_completo: "Rodríguez López, María Ana DEMO", rol_guardia: "OPERADOR", asistio: null },
      { id: 3, nombre_completo: "Hernández Pérez, Carlos DEMO", rol_guardia: "BOMBERO", asistio: null },
    ],
  };

  // Funcionarios disponibles para asignar (activos de la estación)
  const funcs = await api
    .get<Page<Func>>(`/funcionarios?page_size=100&estatus=ACTIVO&estacion_id=${guardia.estacion_id}`, token)
    .catch(() => ({ items: [] as Func[], total: 0 }));

  const yaAsignados = new Set(guardia.funcionarios_asignados.map((f) => f.id));
  const disponibles = funcs.items.filter((f) => !yaAsignados.has(f.id));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/ops/guardias" className="text-xs text-muted-foreground hover:underline">← Guardias</Link>
        <h1 className="text-2xl font-bold mt-1">
          Guardia #{id} · {formatDate(guardia.fecha)}
        </h1>
        <div className="flex gap-2 items-center mt-1 text-sm">
          <span className="text-muted-foreground">{guardia.estacion}</span>
          <span className="text-muted-foreground">·</span>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
            {guardia.turno}
          </span>
          {guardia.seccion && (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100">
              Sección {guardia.seccion}
            </span>
          )}
          {guardia.cerrada ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">
              ✓ Cerrada
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
              En curso
            </span>
          )}
        </div>
      </div>

      <GuardiaPanel
        guardiaId={id}
        cerrada={guardia.cerrada}
        asignados={guardia.funcionarios_asignados}
        disponibles={disponibles}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
