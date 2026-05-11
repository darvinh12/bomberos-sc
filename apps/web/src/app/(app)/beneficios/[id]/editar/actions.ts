"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type EditState = { error?: string; ok?: boolean };

export async function actualizarAyuda(
  id: number,
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const token = await requireAuth();
  const payload: Record<string, unknown> = {};
  const num = (k: string) => {
    const v = formData.get(k);
    if (v === null || String(v).trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const str = (k: string) => {
    const v = formData.get(k);
    if (v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  const monto_aprobado = num("monto_aprobado");
  const monto_pagado = num("monto_pagado");
  if (monto_aprobado !== undefined) payload.monto_aprobado = monto_aprobado;
  if (monto_pagado !== undefined) payload.monto_pagado = monto_pagado;
  const estatus = str("estatus");
  if (estatus !== undefined) payload.estatus = estatus;
  const fecha_aprobacion = str("fecha_aprobacion");
  if (fecha_aprobacion !== undefined) payload.fecha_aprobacion = fecha_aprobacion;
  const fecha_pago = str("fecha_pago");
  if (fecha_pago !== undefined) payload.fecha_pago = fecha_pago;
  const referencia_pago = str("referencia_pago");
  if (referencia_pago !== undefined) payload.referencia_pago = referencia_pago;
  const observaciones = str("observaciones");
  if (observaciones !== undefined) payload.observaciones = observaciones;

  if (isDemoMode()) {
    revalidatePath("/beneficios");
    redirect("/beneficios");
  }
  try {
    await api.patch(`/beneficios/ayudas/${id}`, payload, token);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/beneficios");
  redirect("/beneficios");
}
