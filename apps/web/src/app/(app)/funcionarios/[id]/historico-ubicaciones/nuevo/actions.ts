"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export interface NuevoHistUbicacionPayload {
  fecha_desde: string;
  cod_zona: string;
  cod_estacion?: string;
  cod_division?: string;
  cod_area?: string;
  seccion?: string;
  horario?: string;
  agrupacion?: string;
  observaciones?: string;
}

export type CrearHistUbicacionResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearHistUbicacion(
  funcionarioId: number,
  raw: NuevoHistUbicacionPayload,
): Promise<CrearHistUbicacionResult> {
  const token = await requireAuth();

  if (!raw.fecha_desde) {
    return { ok: false, error: "La fecha es obligatoria" };
  }
  if (!raw.cod_zona?.trim()) {
    return { ok: false, error: "La zona es obligatoria" };
  }
  if (raw.seccion && !/^[A-Z]$/.test(raw.seccion)) {
    return { ok: false, error: "La sección debe ser una letra A-Z" };
  }

  const payload: Record<string, unknown> = {
    fecha_desde: raw.fecha_desde,
    cod_zona: raw.cod_zona.trim(),
  };
  if (raw.cod_estacion?.trim()) payload.cod_estacion = raw.cod_estacion.trim();
  if (raw.cod_division?.trim()) payload.cod_division = raw.cod_division.trim();
  if (raw.cod_area?.trim()) payload.cod_area = raw.cod_area.trim();
  if (raw.seccion?.trim()) payload.seccion = raw.seccion.trim().toUpperCase();
  if (raw.horario?.trim()) payload.horario = raw.horario.trim();
  if (raw.agrupacion?.trim()) payload.agrupacion = raw.agrupacion.trim();
  if (raw.observaciones?.trim()) payload.observaciones = raw.observaciones.trim();

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/historico-ubicaciones`,
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
