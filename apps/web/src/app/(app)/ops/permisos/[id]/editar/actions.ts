"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type EditState = { error?: string; ok?: boolean };

export async function autorizarPermiso(id: number): Promise<EditState> {
  const token = await requireAuth();
  if (isDemoMode()) {
    revalidatePath("/ops/permisos");
    return { ok: true };
  }
  try {
    await api.post(`/ops/permisos/${id}/autorizar`, undefined, token);
    revalidatePath("/ops/permisos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function actualizarPermiso(
  id: number,
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const token = await requireAuth();
  const accion = formData.get("accion");
  if (accion === "autorizar") {
    if (isDemoMode()) {
      revalidatePath("/ops/permisos");
      redirect("/ops/permisos");
    }
    try {
      await api.post(`/ops/permisos/${id}/autorizar`, undefined, token);
    } catch (e) {
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
      if (e instanceof ApiError) return { error: e.message };
      return { error: e instanceof Error ? e.message : "Error" };
    }
    revalidatePath("/ops/permisos");
    redirect("/ops/permisos");
  }
  // accion === "editar" → PATCH (cuando el endpoint exista)
  if (isDemoMode()) {
    revalidatePath("/ops/permisos");
    redirect("/ops/permisos");
  }
  return { error: "Edición de campos pendiente — usa el botón Autorizar." };
}
