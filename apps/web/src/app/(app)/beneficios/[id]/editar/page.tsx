import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { isDemoMode, demoAyuda } from "@/lib/demo-fixtures";
import EditarForm from "./form";

interface Ayuda {
  id: number;
  funcionario_id: number;
  monto_solicitado: number | null;
  monto_aprobado: number | null;
  monto_pagado: number | null;
  fecha_solicitud: string;
  fecha_aprobacion: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
  motivo: string;
  estatus: string;
  observaciones: string | null;
}

export default async function EditarAyudaPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);

  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  let ayuda: Ayuda;
  if (isDemoMode()) {
    ayuda = demoAyuda(id);
  } else {
    try {
      ayuda = await api.get<Ayuda>(`/beneficios/ayudas/${id}`, token);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/beneficios"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Beneficios
        </Link>
        <h1 className="text-2xl font-bold mt-1">Procesar ayuda económica #{id}</h1>
        <p className="text-sm text-muted-foreground">
          Funcionario #{ayuda.funcionario_id}
        </p>
      </div>
      <EditarForm ayuda={ayuda} />
    </div>
  );
}
