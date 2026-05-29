"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export interface NuevoCarnetPayload {
  tipo: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento?: string;
  brigadista?: boolean;
  libro?: string;
  folio?: string;
  observaciones?: string;
}

export type CrearCarnetResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearCarnet(
  funcionarioId: number,
  raw: NuevoCarnetPayload,
): Promise<CrearCarnetResult> {
  const token = await requireAuth();

  if (!raw.tipo?.trim()) {
    return { ok: false, error: "El tipo de carnet es obligatorio" };
  }
  if (!raw.numero?.trim()) {
    return { ok: false, error: "El número de carnet es obligatorio" };
  }
  if (!raw.fecha_emision) {
    return { ok: false, error: "La fecha de emisión es obligatoria" };
  }
  if (
    raw.fecha_vencimiento &&
    raw.fecha_vencimiento < raw.fecha_emision
  ) {
    return {
      ok: false,
      error: "La fecha de vencimiento no puede ser anterior a la emisión",
    };
  }

  const payload: Record<string, unknown> = {
    tipo: raw.tipo.trim().toUpperCase(),
    numero: raw.numero.trim(),
    fecha_emision: raw.fecha_emision,
    brigadista: Boolean(raw.brigadista),
  };
  if (raw.fecha_vencimiento) payload.fecha_vencimiento = raw.fecha_vencimiento;
  if (raw.libro?.trim()) payload.libro = raw.libro.trim();
  if (raw.folio?.trim()) payload.folio = raw.folio.trim();
  if (raw.observaciones?.trim()) payload.observaciones = raw.observaciones.trim();

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/carnets`,
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
