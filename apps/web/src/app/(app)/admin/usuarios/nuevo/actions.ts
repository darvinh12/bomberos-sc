"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type NuevoUsuarioState = { error?: string; ok?: boolean };

export async function crearUsuario(
  _prev: NuevoUsuarioState,
  formData: FormData,
): Promise<NuevoUsuarioState> {
  const usuario = String(formData.get("usuario") || "").trim();
  const nombre_completo = String(formData.get("nombre_completo") || "").trim();
  const correo = String(formData.get("correo") || "").trim() || null;
  const password = String(formData.get("password") || "");
  const rolesRaw = formData.getAll("roles").map(String);

  if (!usuario || !nombre_completo || !password) {
    return { error: "Usuario, nombre completo y password son obligatorios" };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(usuario)) {
    return { error: "Usuario solo puede contener letras, números, _, . y -" };
  }
  if (password.length < 10) {
    return { error: "Password debe tener al menos 10 caracteres" };
  }
  const checks = [
    [/[A-Z]/, "Falta mayúscula"],
    [/[a-z]/, "Falta minúscula"],
    [/\d/, "Falta dígito"],
    [/[^A-Za-z0-9]/, "Falta carácter especial"],
  ] as const;
  for (const [regex, msg] of checks) {
    if (!regex.test(password)) return { error: msg };
  }

  if (isDemoMode()) {
    revalidatePath("/admin/usuarios");
    redirect("/admin/usuarios");
  }

  const token = await requireAuth();
  try {
    const created = await api.post<{ id: number }>(
      "/admin/usuarios",
      {
        usuario,
        nombre_completo,
        correo,
        password,
        roles: rolesRaw,
      },
      token,
    );
    revalidatePath("/admin/usuarios");
    redirect(`/admin/usuarios/${created.id}`);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error al crear usuario" };
  }
}
