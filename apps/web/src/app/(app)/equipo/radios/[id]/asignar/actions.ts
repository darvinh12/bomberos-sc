"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function asignarRadio(
  radioId: number,
  _p: State,
  fd: FormData,
): Promise<State> {
  const funcId = Number(fd.get("funcionario_id"));
  const estId = Number(fd.get("estacion_id"));
  const payload = {
    radio_id: radioId,
    funcionario_id: funcId || null,
    estacion_id: estId || null,
    fecha_asignacion: String(fd.get("fecha_asignacion") || ""),
    documento_url: String(fd.get("documento_url") || "").trim() || null,
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.fecha_asignacion) return { error: "Fecha de asignación obligatoria" };
  if (!payload.funcionario_id && !payload.estacion_id) {
    return { error: "Debes seleccionar funcionario o estación" };
  }
  if (isDemoMode()) {
    revalidatePath("/equipo/radios");
    redirect("/equipo/radios");
  }
  const token = await requireAuth();
  try { await api.post("/equipo/radios/asignaciones", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/equipo/radios");
  redirect("/equipo/radios");
}
