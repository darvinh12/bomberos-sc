"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export async function devolverAsignacion(
  asignacionId: number,
  estadoDevolucion: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    revalidatePath("/equipo/proteccion/asignaciones");
    return { ok: true };
  }
  const token = await requireAuth();
  const params = new URLSearchParams();
  if (estadoDevolucion) params.set("estado_devolucion", estadoDevolucion);
  try {
    await api.post(
      `/equipo/proteccion/asignaciones/${asignacionId}/devolver?${params}`,
      {},
      token,
    );
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/equipo/proteccion/asignaciones");
  return { ok: true };
}
