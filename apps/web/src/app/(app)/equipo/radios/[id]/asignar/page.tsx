import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import Form from "./form";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }
interface Cat { id: number; codigo: string; nombre: string }
interface Page<T> { items: T[]; total: number }

export default async function AsignarRadioPage({ params }: { params: { id: string } }) {
  const radioId = Number(params.id);
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "LOGISTICA"]);
  const [funcs, estaciones] = await Promise.all([
    api.get<Page<Func>>("/funcionarios?page_size=200&estatus=ACTIVO", token).catch(() => ({ items: [] as Func[], total: 0 })),
    api.get<Cat[]>("/catalogos/estaciones", token).catch(() => [] as Cat[]),
  ]);
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/equipo/radios" className="text-xs text-muted-foreground hover:underline">← Radios</Link>
        <h1 className="text-2xl font-bold mt-1">Asignar radio #{radioId}</h1>
      </div>
      <Form radioId={radioId} funcionarios={funcs.items} estaciones={estaciones} />
    </div>
  );
}
