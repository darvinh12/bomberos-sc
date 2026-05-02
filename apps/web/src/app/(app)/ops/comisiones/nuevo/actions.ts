"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearComision(_p: State, fd: FormData): Promise<State> {
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    institucion_libre: String(fd.get("institucion_libre") || "").trim() || null,
    cargo_comision: String(fd.get("cargo_comision") || "").trim() || null,
    fecha_inicio: String(fd.get("fecha_inicio") || ""),
    fecha_fin: String(fd.get("fecha_fin") || "") || null,
    resolucion: String(fd.get("resolucion") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.fecha_inicio || !payload.institucion_libre) {
    return { error: "Funcionario, institución y fecha de inicio son obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/ops/comisiones"); redirect("/ops/comisiones"); }
  const token = await requireAuth();
  try { await api.post("/ops/comisiones", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/ops/comisiones"); redirect("/ops/comisiones");
}
