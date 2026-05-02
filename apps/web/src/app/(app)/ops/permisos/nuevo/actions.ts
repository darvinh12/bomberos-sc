"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearPermiso(_p: State, fd: FormData): Promise<State> {
  const token = await requireAuth();
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    tipo: String(fd.get("tipo") || "PERSONAL"),
    fecha_inicio: String(fd.get("fecha_inicio") || ""),
    fecha_fin: String(fd.get("fecha_fin") || ""),
    horas: Number(fd.get("horas")) || null,
    motivo: String(fd.get("motivo") || "").trim(),
    autorizado: fd.get("autorizado") === "on",
  };
  if (!payload.funcionario_id || !payload.fecha_inicio || !payload.fecha_fin || !payload.motivo) {
    return { error: "Funcionario, fechas y motivo obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/ops/permisos"); redirect("/ops/permisos"); }
  try { await api.post("/ops/permisos", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/ops/permisos"); redirect("/ops/permisos");
}
