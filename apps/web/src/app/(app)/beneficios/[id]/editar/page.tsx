import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import EditarForm from "./form";

export default async function EditarAyudaPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);

  const id = Number(params.id);

  // Mock para demo
  const ayuda = {
    id,
    funcionario_id: 1,
    monto_solicitado: 2500,
    monto_aprobado: null as number | null,
    monto_pagado: null as number | null,
    fecha_solicitud: "2026-04-10",
    fecha_aprobacion: null as string | null,
    fecha_pago: null as string | null,
    referencia_pago: null as string | null,
    motivo: "Apoyo económico por gastos médicos imprevistos del funcionario.",
    estatus: "SOLICITADO",
    observaciones: null as string | null,
  };

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
