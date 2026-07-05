import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireModuloOrRedirect } from "@/lib/permisos-modulo";
import Form from "./form";

interface Func { id: number; nombre_completo: string | null; apellidos: string; nombres: string; cedula: number; nacionalidad: string }
interface Page<T> { items: T[]; total: number }

export default async function NuevoCursoPage() {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  await requireModuloOrRedirect("carrera", me.roles, token);
  const funcs = await api.get<Page<Func>>("/funcionarios?page_size=200&estatus=ACTIVO", token).catch(() => ({ items: [] as Func[], total: 0 }));
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/carrera" className="text-xs text-muted-foreground hover:underline">← Carrera</Link>
        <h1 className="text-2xl font-bold mt-1">Nuevo curso</h1>
      </div>
      <Form funcionarios={funcs.items} />
    </div>
  );
}
