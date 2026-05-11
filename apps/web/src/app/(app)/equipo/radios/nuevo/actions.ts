"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearRadio(_p: State, fd: FormData): Promise<State> {
  const payload = {
    modelo_id: Number(fd.get("modelo_id")) || 1,
    serial: String(fd.get("serial") || "").trim(),
    placa_inv: String(fd.get("placa_inv") || "").trim() || null,
    frecuencia: String(fd.get("frecuencia") || "").trim() || null,
    canal: String(fd.get("canal") || "").trim() || null,
    fecha_adquisicion: String(fd.get("fecha_adquisicion") || "") || null,
    costo: Number(fd.get("costo")) || null,
    estacion_id: Number(fd.get("estacion_id")) || null,
    estatus: String(fd.get("estatus") || "DISPONIBLE"),
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.serial || payload.serial.length < 3) return { error: "Serial obligatorio (mínimo 3 caracteres)" };
  if (isDemoMode()) { revalidatePath("/equipo/radios"); redirect("/equipo/radios"); }
  const token = await requireAuth();
  try { await api.post("/equipo/radios", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/equipo/radios"); redirect("/equipo/radios");
}
