"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

const TIPOS_VALIDOS = [
  "DEPORTIVA",
  "CULTURAL",
  "MUSICAL",
  "CIENTIFICA",
  "LABORAL",
  "ACADEMICA",
];

export interface NuevaActividadPayload {
  tipo: string;
  actividad: string;
  observaciones?: string;
}

export type CrearActividadResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearActividad(
  funcionarioId: number,
  raw: NuevaActividadPayload,
): Promise<CrearActividadResult> {
  const token = await requireAuth();

  if (!raw.tipo || !TIPOS_VALIDOS.includes(raw.tipo)) {
    return { ok: false, error: "El tipo de actividad es obligatorio" };
  }
  if (!raw.actividad?.trim()) {
    return { ok: false, error: "El nombre de la actividad es obligatorio" };
  }

  const payload: Record<string, unknown> = {
    tipo: raw.tipo,
    actividad: raw.actividad.trim(),
  };
  if (raw.observaciones?.trim()) payload.observaciones = raw.observaciones.trim();

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/actividades`,
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
