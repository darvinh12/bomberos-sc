"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type NuevoFuncionarioState = { error?: string; ok?: boolean };

export async function crearFuncionario(
  _prev: NuevoFuncionarioState,
  formData: FormData,
): Promise<NuevoFuncionarioState> {
  const token = await requireAuth();
  const payload = {
    nacionalidad: String(formData.get("nacionalidad") || "V").toUpperCase(),
    cedula: Number(formData.get("cedula")),
    apellidos: String(formData.get("apellidos") || "").trim(),
    nombres: String(formData.get("nombres") || "").trim(),
    fecha_nacimiento: nullIfBlank(formData.get("fecha_nacimiento")),
    sexo: nullIfBlank(formData.get("sexo")) as "M" | "F" | null,
    fecha_primer_ingreso: String(formData.get("fecha_primer_ingreso") || ""),
    jerarquia_id: numberOrNull(formData.get("jerarquia_id")),
    cargo_id: numberOrNull(formData.get("cargo_id")),
    zona_id: numberOrNull(formData.get("zona_id")),
    estacion_id: numberOrNull(formData.get("estacion_id")),
    correo: nullIfBlank(formData.get("correo")),
    telefono_movil: nullIfBlank(formData.get("telefono_movil")),
  };

  if (!payload.cedula || !payload.apellidos || !payload.nombres || !payload.fecha_primer_ingreso) {
    return { error: "Cédula, apellidos, nombres y fecha de ingreso son obligatorios" };
  }

  try {
    const created = await api.post<{ id: number }>("/funcionarios", payload, token);
    revalidatePath("/funcionarios");
    redirect(`/funcionarios/${created.id}`);
  } catch (e: unknown) {
    if (e instanceof ApiError) return { error: e.message };
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return { error: e instanceof Error ? e.message : "Error al crear" };
  }
}

function nullIfBlank(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
