"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type EditState = { error?: string; ok?: boolean };

export async function actualizarVacaciones(
  id: number,
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const token = await requireAuth();
  const payload: Record<string, unknown> = {};
  for (const k of ["fecha_inicio", "fecha_fin", "observaciones"]) {
    const v = formData.get(k);
    if (v !== null) {
      const s = String(v).trim();
      payload[k] = s === "" ? null : s;
    }
  }
  const dh = formData.get("dias_habiles");
  if (dh !== null && String(dh).trim() !== "") payload.dias_habiles = Number(dh);
  payload.fraccionada = formData.get("fraccionada") === "on";
  payload.autorizado = formData.get("autorizado") === "on";

  if (isDemoMode()) {
    revalidatePath("/ops/vacaciones");
    redirect("/ops/vacaciones");
  }
  try {
    await api.patch(`/ops/vacaciones/${id}`, payload, token);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/ops/vacaciones");
  redirect("/ops/vacaciones");
}
