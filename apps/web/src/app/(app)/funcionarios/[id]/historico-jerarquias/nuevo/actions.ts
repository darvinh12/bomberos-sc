"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

const TIPOS_DOC_VALIDOS = ["DECRETO", "RESOLUCION", "OFICIO", "ORDEN_GENERAL"];

export interface NuevoHistJerarquiaPayload {
  fecha: string;
  jerarquia_id: string | number;
  tipo_documento?: string;
  numero_documento?: string;
  fecha_efectiva_nomina?: string;
  observaciones?: string;
}

export type CrearHistJerarquiaResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearHistJerarquia(
  funcionarioId: number,
  raw: NuevoHistJerarquiaPayload,
): Promise<CrearHistJerarquiaResult> {
  const token = await requireAuth();

  if (!raw.fecha) {
    return { ok: false, error: "La fecha es obligatoria" };
  }
  const jerNum = Number(raw.jerarquia_id);
  if (!Number.isFinite(jerNum) || jerNum <= 0) {
    return { ok: false, error: "Debe seleccionar una jerarquía" };
  }
  if (raw.tipo_documento && !TIPOS_DOC_VALIDOS.includes(raw.tipo_documento)) {
    return { ok: false, error: "Tipo de documento inválido" };
  }

  const payload: Record<string, unknown> = {
    fecha: raw.fecha,
    jerarquia_id: jerNum,
  };
  if (raw.tipo_documento) payload.tipo_documento = raw.tipo_documento;
  if (raw.numero_documento?.trim())
    payload.numero_documento = raw.numero_documento.trim();
  if (raw.fecha_efectiva_nomina)
    payload.fecha_efectiva_nomina = raw.fecha_efectiva_nomina;
  if (raw.observaciones?.trim()) payload.observaciones = raw.observaciones.trim();

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true, id: Math.floor(Math.random() * 100000) + 1 };
  }

  try {
    const created = await api.post<{ id: number }>(
      `/funcionarios/${funcionarioId}/historico-jerarquias`,
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
