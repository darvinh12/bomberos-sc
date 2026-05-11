"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearVacaciones(_p: State, fd: FormData): Promise<State> {
  const token = await requireAuth();
  const fecha_inicio = String(fd.get("fecha_inicio") || "");
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    periodo_anio: Number(fd.get("periodo_anio")) || new Date(fecha_inicio).getFullYear(),
    fecha_inicio,
    fecha_fin: String(fd.get("fecha_fin") || ""),
    dias_habiles: Number(fd.get("dias_habiles")) || null,
    fraccionada: fd.get("fraccionada") === "on",
    autorizado: fd.get("autorizado") === "on",
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.fecha_inicio || !payload.fecha_fin) {
    return { error: "Funcionario, inicio y fin obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/ops/vacaciones"); redirect("/ops/vacaciones"); }
  try { await api.post("/ops/vacaciones", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/ops/vacaciones"); redirect("/ops/vacaciones");
}
