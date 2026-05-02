import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import Form from "./form";

interface Cat { id: number; codigo: string; nombre: string }

export default async function NuevaGuardiaPage() {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "OPERADOR"]);
  const estaciones = await api.get<Cat[]>("/catalogos/estaciones", token).catch(() => []);
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/ops/guardias" className="text-xs text-muted-foreground hover:underline">← Guardias</Link>
        <h1 className="text-2xl font-bold mt-1">Programar guardia</h1>
        <p className="text-sm text-muted-foreground">Crea la guardia primero, luego asigna funcionarios desde su detalle.</p>
      </div>
      <Form estaciones={estaciones} />
    </div>
  );
}
