"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export interface NuevoFamiliarPayload {
  parentesco: string;
  nacionalidad?: string;
  cedula?: string;
  apellidos: string;
  nombres: string;
  fecha_nacimiento?: string;
  sexo?: string;
  condicion?: string;
  observaciones?: string;
}

export type CrearFamiliarResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearFamiliar(
  funcionarioId: number,
  raw: NuevoFamiliarPayload,
): Promise<CrearFamiliarResult> {
  const token = await requireAuth();

  if (!raw.parentesco?.trim()) {
    return { ok: false, error: "El parentesco es obligatorio" };
  }
  if (!raw.apellidos?.trim() || !raw.nombres?.trim()) {
    return { ok: false, error: "Apellidos y nombres son obligatorios" };
  }
  if (raw.nacionalidad && !/^[VE]$/.test(raw.nacionalidad)) {
    return { ok: false, error: "Nacionalidad inválida (debe ser V o E)" };
  }
  if (raw.sexo && !/^[MF]$/.test(raw.sexo)) {
    return { ok: false, error: "Sexo inválido (debe ser M o F)" };
  }

  const payload: Record<string, unknown> = {
    parentesco: raw.parentesco.trim().toUpperCase(),
    apellidos: raw.apellidos.trim(),
    nombres: raw.nombres.trim(),
  };

  if (raw.nacionalidad) payload.nacionalidad = raw.nacionalidad.toUpperCase();
  if (raw.cedula && raw.cedula.trim()) {
    const n = Number(raw.cedula);
    if (Number.isFinite(n) && n > 0) payload.cedula = n;
  }
  if (raw.fecha_nacimiento) payload.fecha_nacimiento = raw.fecha_nacimiento;
  if (raw.sexo) payload.sexo = raw.sexo;
  if (raw.condicion) payload.condicion = raw.condicion;
  if (raw.observaciones?.trim()) payload.observaciones = raw.observaciones.trim();

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/carga-familiar`,
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
