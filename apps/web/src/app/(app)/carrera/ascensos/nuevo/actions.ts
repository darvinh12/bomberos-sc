"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearAscenso(_p: State, fd: FormData): Promise<State> {
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    jerarquia_anterior_id: Number(fd.get("jerarquia_anterior_id")) || null,
    jerarquia_nueva_id: Number(fd.get("jerarquia_nueva_id")),
    fecha_efectiva: String(fd.get("fecha_efectiva") || ""),
    resolucion: String(fd.get("resolucion") || "").trim() || null,
    nota_evaluacion: Number(fd.get("nota_evaluacion")) || null,
    posicion_lista: Number(fd.get("posicion_lista")) || null,
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.jerarquia_nueva_id || !payload.fecha_efectiva) {
    return { error: "Funcionario, jerarquía nueva y fecha efectiva son obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/carrera"); redirect("/carrera"); }
  const token = await requireAuth();
  try { await api.post("/carrera/ascensos", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/carrera"); redirect("/carrera");
}
