"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearReposo(_p: State, fd: FormData): Promise<State> {
  const token = await requireAuth();
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    tipo_reposo_id: Number(fd.get("tipo_reposo_id")),
    fecha_inicio: String(fd.get("fecha_inicio") || ""),
    fecha_fin: String(fd.get("fecha_fin") || ""),
    diagnostico_libre: String(fd.get("diagnostico_libre") || "").trim() || null,
    folio: String(fd.get("folio") || "").trim() || null,
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.tipo_reposo_id || !payload.fecha_inicio || !payload.fecha_fin) {
    return { error: "Funcionario, tipo, fecha inicio y fin son obligatorios" };
  }
  if (isDemoMode()) {
    revalidatePath("/salud/reposos");
    redirect("/salud/reposos");
  }
  try {
    await api.post("/salud/reposos", payload, token);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/salud/reposos");
  redirect("/salud/reposos");
}
