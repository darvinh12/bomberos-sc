"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type EditState = { error?: string; ok?: boolean };

export async function actualizarReposo(
  id: number,
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const token = await requireAuth();
  const payload: Record<string, unknown> = {};
  for (const k of ["fecha_fin", "diagnostico_libre", "folio", "documento_url", "observaciones"]) {
    const v = formData.get(k);
    if (v !== null) {
      const s = String(v).trim();
      payload[k] = s === "" ? null : s;
    }
  }
  if (formData.get("anulado") === "on") {
    payload.anulado = true;
    payload.motivo_anulacion = String(formData.get("motivo_anulacion") || "").trim();
  }
  const metadata: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("metadata.")) {
      const code = k.replace("metadata.", "");
      const s = String(v).trim();
      if (s) metadata[code] = s;
    }
  }
  if (Object.keys(metadata).length > 0) payload.metadata = metadata;

  if (isDemoMode()) {
    revalidatePath("/salud/reposos");
    redirect("/salud/reposos");
  }

  try {
    await api.patch(`/salud/reposos/${id}`, payload, token);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/salud/reposos");
  redirect("/salud/reposos");
}
