"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function asignarProteccion(
  inventarioId: number,
  _p: State,
  fd: FormData,
): Promise<State> {
  const payload = {
    inventario_id: inventarioId,
    funcionario_id: Number(fd.get("funcionario_id")),
    fecha_entrega: String(fd.get("fecha_entrega") || ""),
    estado_entrega: String(fd.get("estado_entrega") || "").trim() || null,
    documento_url: String(fd.get("documento_url") || "").trim() || null,
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.fecha_entrega) {
    return { error: "Funcionario y fecha de entrega son obligatorios" };
  }
  if (isDemoMode()) {
    revalidatePath("/equipo/proteccion");
    redirect("/equipo/proteccion");
  }
  const token = await requireAuth();
  try { await api.post("/equipo/proteccion/asignaciones", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/equipo/proteccion");
  redirect("/equipo/proteccion");
}
