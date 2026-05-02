"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearAyuda(_p: State, fd: FormData): Promise<State> {
  const token = await requireAuth();
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    tipo_solicitud_id: Number(fd.get("tipo_solicitud_id")) || 1,
    monto_solicitado: Number(fd.get("monto_solicitado")) || null,
    motivo: String(fd.get("motivo") || "").trim(),
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.motivo || payload.motivo.length < 3) {
    return { error: "Funcionario y motivo (mín 3 caracteres) son obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/beneficios"); redirect("/beneficios"); }
  try { await api.post("/beneficios/ayudas", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/beneficios"); redirect("/beneficios");
}
