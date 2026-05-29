"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export interface NuevaHabilidadPayload {
  nombre: string;
  descripcion?: string;
  grupo?: string;
  nivel?: string;
  fecha_registro?: string;
}

export type CrearHabilidadResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearHabilidad(
  funcionarioId: number,
  raw: NuevaHabilidadPayload,
): Promise<CrearHabilidadResult> {
  const token = await requireAuth();

  if (!raw.nombre?.trim()) {
    return { ok: false, error: "El nombre de la habilidad es obligatorio" };
  }

  const payload: Record<string, unknown> = {
    nombre: raw.nombre.trim(),
  };
  if (raw.descripcion?.trim()) payload.descripcion = raw.descripcion.trim();
  if (raw.grupo) payload.grupo = raw.grupo;
  if (raw.nivel) payload.nivel = raw.nivel;
  if (raw.fecha_registro) payload.fecha_registro = raw.fecha_registro;

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/habilidades`,
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
