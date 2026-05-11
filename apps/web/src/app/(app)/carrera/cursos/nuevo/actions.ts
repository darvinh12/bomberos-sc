"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearCurso(_p: State, fd: FormData): Promise<State> {
  const aprobadoRaw = String(fd.get("aprobado") || "");
  const payload = {
    funcionario_id: Number(fd.get("funcionario_id")),
    nombre_libre: String(fd.get("nombre_libre") || "").trim() || null,
    institucion: String(fd.get("institucion") || "").trim() || null,
    fecha_inicio: String(fd.get("fecha_inicio") || "") || null,
    fecha_fin: String(fd.get("fecha_fin") || "") || null,
    horas: Number(fd.get("horas")) || null,
    nota: Number(fd.get("nota")) || null,
    aprobado: aprobadoRaw === "" ? null : aprobadoRaw === "true",
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.funcionario_id || !payload.nombre_libre) {
    return { error: "Funcionario y nombre del curso son obligatorios" };
  }
  if (isDemoMode()) { revalidatePath("/carrera"); redirect("/carrera"); }
  const token = await requireAuth();
  try { await api.post("/carrera/cursos-realizados", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/carrera"); redirect("/carrera");
}
