"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type EditState = { error?: string; ok?: boolean };

const CAMPOS = [
  "apellidos",
  "nombres",
  "fecha_nacimiento",
  "sexo",
  "jerarquia_id",
  "cargo_id",
  "zona_id",
  "estacion_id",
  "telefono_movil",
  "correo",
  "profesion",
  "observaciones",
];

export async function actualizarFuncionario(
  id: number,
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const token = await requireAuth();
  const payload: Record<string, unknown> = {};
  for (const c of CAMPOS) {
    const v = formData.get(c);
    if (v === null) continue;
    const s = String(v).trim();
    if (s === "") {
      payload[c] = null;
      continue;
    }
    if (c.endsWith("_id")) {
      const n = Number(s);
      payload[c] = Number.isFinite(n) ? n : null;
    } else {
      payload[c] = s;
    }
  }

  // metadata (campos custom): cualquier campo con prefijo metadata.
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
    revalidatePath(`/funcionarios/${id}`);
    redirect(`/funcionarios/${id}`);
  }

  try {
    await api.patch(`/funcionarios/${id}`, payload, token);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error al actualizar" };
  }
  revalidatePath(`/funcionarios/${id}`);
  redirect(`/funcionarios/${id}`);
}
