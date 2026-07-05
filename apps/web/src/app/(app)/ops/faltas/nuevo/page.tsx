import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import Form from "./form";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }
interface Page<T> { items: T[]; total: number }

export default async function NuevaFaltaPage() {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  await requireModuloOrRedirect("operativo", me.roles, token);
  const funcs = await api.get<Page<Func>>("/funcionarios?page_size=200&estatus=ACTIVO", token).catch(() => ({ items: [] as Func[], total: 0 }));
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/ops/faltas" className="text-xs text-muted-foreground hover:underline">← Faltas</Link>
        <h1 className="text-2xl font-bold mt-1">Nueva falta / sanción</h1>
      </div>
      <Form funcionarios={funcs.items} />
    </div>
  );
}
