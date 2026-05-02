"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearItem(_p: State, fd: FormData): Promise<State> {
  const payload = {
    tipo_id: Number(fd.get("tipo_id")) || 1,
    marca: String(fd.get("marca") || "").trim() || null,
    modelo: String(fd.get("modelo") || "").trim() || null,
    color: String(fd.get("color") || "").trim() || null,
    numero_serie: String(fd.get("numero_serie") || "").trim() || null,
    lote: String(fd.get("lote") || "").trim() || null,
    talla_id: Number(fd.get("talla_id")) || null,
    fecha_adquisicion: String(fd.get("fecha_adquisicion") || "") || null,
    fecha_vence: String(fd.get("fecha_vence") || "") || null,
    costo: Number(fd.get("costo")) || null,
    estatus: String(fd.get("estatus") || "DISPONIBLE"),
    estacion_id: Number(fd.get("estacion_id")) || null,
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.tipo_id) return { error: "Tipo es obligatorio" };
  if (isDemoMode()) { revalidatePath("/equipo/proteccion"); redirect("/equipo/proteccion"); }
  const token = await requireAuth();
  try { await api.post("/equipo/proteccion/inventario", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/equipo/proteccion"); redirect("/equipo/proteccion");
}
