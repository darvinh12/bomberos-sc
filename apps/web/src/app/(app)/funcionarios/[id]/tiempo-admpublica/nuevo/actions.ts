"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export interface NuevoTiempoAdmPubPayload {
  dependencia: string;
  fecha_ingreso: string;
  fecha_egreso?: string;
  observaciones?: string;
}

export type CrearTiempoAdmPubResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearTiempoAdmPublica(
  funcionarioId: number,
  raw: NuevoTiempoAdmPubPayload,
): Promise<CrearTiempoAdmPubResult> {
  const token = await requireAuth();

  if (!raw.dependencia?.trim()) {
    return { ok: false, error: "La dependencia es obligatoria" };
  }
  if (!raw.fecha_ingreso) {
    return { ok: false, error: "La fecha de ingreso es obligatoria" };
  }
  if (raw.fecha_egreso && raw.fecha_egreso < raw.fecha_ingreso) {
    return {
      ok: false,
      error: "La fecha de egreso no puede ser anterior al ingreso",
    };
  }

  const payload: Record<string, unknown> = {
    dependencia: raw.dependencia.trim(),
    fecha_ingreso: raw.fecha_ingreso,
  };
  if (raw.fecha_egreso) payload.fecha_egreso = raw.fecha_egreso;
  if (raw.observaciones?.trim()) payload.observaciones = raw.observaciones.trim();

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/tiempo-admpublica`,
      payload,
      token,
    );
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: created.id };
  } catch (e: unknown) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear" };
  }
}
