"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import type { Rol } from "../permisos/actions";

const ROLES_EXTRA_COOKIE = "bcd_demo_roles_extra";

function readDemoExtraRoles(): Rol[] {
  const raw = cookies().get(ROLES_EXTRA_COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Rol[];
  } catch {
    return [];
  }
}

function writeDemoExtraRoles(items: Rol[]) {
  cookies().set(ROLES_EXTRA_COOKIE, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function listarRoles(): Promise<Rol[]> {
  if (isDemoMode()) {
    const base = await api.get<Rol[]>("/admin/roles", "");
    return [...base, ...readDemoExtraRoles()];
  }
  const token = await requireAuth();
  return api.get<Rol[]>("/admin/roles", token);
}

export type RolFormState = { error?: string; ok?: boolean };

export async function crearRol(
  _prev: RolFormState,
  formData: FormData,
): Promise<RolFormState> {
  const payload = {
    codigo: String(formData.get("codigo") ?? "").trim().toUpperCase(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    descripcion: String(formData.get("descripcion") ?? "").trim() || null,
    activo: formData.get("activo") !== "off",
  };
  if (!payload.codigo || !/^[A-Z][A-Z0-9_]{1,31}$/.test(payload.codigo)) {
    return { error: "Código inválido (mayúsculas, dígitos o '_'; empezar con letra)" };
  }
  if (!payload.nombre || payload.nombre.length < 2) {
    return { error: "Nombre obligatorio (mínimo 2 caracteres)" };
  }
  if (isDemoMode()) {
    const extras = readDemoExtraRoles();
    if (extras.some((r) => r.codigo === payload.codigo)) {
      return { error: "Ya existe un rol con ese código" };
    }
    const nextId = 100 + extras.length;
    extras.push({
      id: nextId,
      codigo: payload.codigo,
      nombre: payload.nombre,
      descripcion: payload.descripcion,
      es_sistema: false,
      activo: payload.activo,
    });
    writeDemoExtraRoles(extras);
    revalidatePath("/admin/roles");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post("/admin/roles", payload, token);
    revalidatePath("/admin/roles");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function actualizarRol(
  rol_id: number,
  data: { nombre?: string; descripcion?: string | null; activo?: boolean },
): Promise<RolFormState> {
  if (isDemoMode()) {
    const extras = readDemoExtraRoles();
    const idx = extras.findIndex((r) => r.id === rol_id);
    if (idx === -1) return { error: "Los roles de sistema solo se editan en backend real" };
    extras[idx] = { ...extras[idx], ...data, descripcion: data.descripcion ?? extras[idx].descripcion };
    writeDemoExtraRoles(extras);
    revalidatePath("/admin/roles");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/roles/${rol_id}`, data, token);
    revalidatePath("/admin/roles");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function borrarRol(rol_id: number): Promise<RolFormState> {
  if (isDemoMode()) {
    const extras = readDemoExtraRoles().filter((r) => r.id !== rol_id);
    writeDemoExtraRoles(extras);
    revalidatePath("/admin/roles");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.del(`/admin/roles/${rol_id}`, token);
    revalidatePath("/admin/roles");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
