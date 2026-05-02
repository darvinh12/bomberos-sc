"use server";

import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string; ok?: boolean };

function validar(nueva: string): string | null {
  if (nueva.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (!/[A-Z]/.test(nueva)) return "Debe incluir al menos una mayúscula.";
  if (!/[a-z]/.test(nueva)) return "Debe incluir al menos una minúscula.";
  if (!/\d/.test(nueva)) return "Debe incluir al menos un dígito.";
  if (!/[^A-Za-z0-9]/.test(nueva)) return "Debe incluir al menos un carácter especial.";
  return null;
}

export async function cambiarPassword(_prev: State, fd: FormData): Promise<State> {
  const actual = String(fd.get("password_actual") ?? "");
  const nueva = String(fd.get("password_nuevo") ?? "");
  const confirm = String(fd.get("password_confirm") ?? "");

  if (!actual || !nueva) return { error: "Completa todos los campos." };
  if (nueva !== confirm) return { error: "La nueva contraseña y su confirmación no coinciden." };
  const v = validar(nueva);
  if (v) return { error: v };

  if (isDemoMode()) {
    return { ok: true };
  }

  const token = await requireAuth();
  try {
    await api.post("/auth/change-password", { password_actual: actual, password_nuevo: nueva }, token);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: "No se pudo cambiar la contraseña." };
  }
  redirect("/perfil?ok=1");
}
