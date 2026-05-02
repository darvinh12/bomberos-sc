"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearFalta(_p: State, fd: FormData): Promise<State> {
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    tipo_falta: String(fd.get("tipo_falta") || "LEVE"),
    fecha: String(fd.get("fecha") || ""),
    descripcion: String(fd.get("descripcion") || "").trim(),
    sancion: String(fd.get("sancion") || "").trim() || null,
    dias_suspension: Number(fd.get("dias_suspension")) || null,
    fecha_inicio_susp: String(fd.get("fecha_inicio_susp") || "") || null,
    fecha_fin_susp: String(fd.get("fecha_fin_susp") || "") || null,
    resolucion: String(fd.get("resolucion") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.fecha || !payload.descripcion) {
    return { error: "Funcionario, fecha y descripción son obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/ops/faltas"); redirect("/ops/faltas"); }
  const token = await requireAuth();
  try { await api.post("/ops/faltas", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/ops/faltas"); redirect("/ops/faltas");
}
