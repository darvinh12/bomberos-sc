import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import Form from "./form";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }
interface Page<T> { items: T[]; total: number }

export default async function NuevaAyudaPage() {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);
  const funcs = await api.get<Page<Func>>("/funcionarios?page_size=200&estatus=ACTIVO", token).catch(() => ({ items: [] as Func[], total: 0 }));
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/beneficios" className="text-xs text-muted-foreground hover:underline">← Beneficios</Link>
        <h1 className="text-2xl font-bold mt-1">Nueva solicitud de ayuda</h1>
      </div>
      <Form funcionarios={funcs.items} />
    </div>
  );
}
