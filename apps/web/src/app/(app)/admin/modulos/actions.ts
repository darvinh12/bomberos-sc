"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import type { Modulo } from "../permisos/actions";

export async function listarModulos(): Promise<Modulo[]> {
  if (isDemoMode()) {
    return api.get<Modulo[]>("/admin/modulos", "");
  }
  const token = await requireAuth();
  return api.get<Modulo[]>("/admin/modulos", token);
}

export type ModuloFormState = { error?: string; ok?: boolean };

export async function actualizarModulo(
  modulo_id: number,
  data: Partial<Omit<Modulo, "id" | "codigo">>,
): Promise<ModuloFormState> {
  if (isDemoMode()) {
    return { error: "No disponible en modo demo" };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/modulos/${modulo_id}`, data, token);
    revalidatePath("/admin/modulos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function borrarModulo(modulo_id: number): Promise<ModuloFormState> {
  if (isDemoMode()) {
    return { error: "No disponible en modo demo" };
  }
  const token = await requireAuth();
  try {
    await api.del(`/admin/modulos/${modulo_id}`, token);
    revalidatePath("/admin/modulos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
