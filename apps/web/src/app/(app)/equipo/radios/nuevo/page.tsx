import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import Form from "./form";

interface Cat { id: number; codigo: string; nombre: string }

export default async function NuevoRadioPage() {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "LOGISTICA"]);
  const estaciones = await api.get<Cat[]>("/catalogos/estaciones", token).catch(() => [] as Cat[]);
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/equipo/radios" className="text-xs text-muted-foreground hover:underline">← Radios</Link>
        <h1 className="text-2xl font-bold mt-1">Nuevo radio</h1>
      </div>
      <Form estaciones={estaciones} />
    </div>
  );
}
