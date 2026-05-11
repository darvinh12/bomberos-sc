"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import type { Modulo } from "../permisos/actions";

const MODULOS_EXTRA_COOKIE = "bcd_demo_modulos_extra";

function readDemoExtra(): Modulo[] {
  const raw = cookies().get(MODULOS_EXTRA_COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Modulo[];
  } catch {
    return [];
  }
}

function writeDemoExtra(items: Modulo[]) {
  cookies().set(MODULOS_EXTRA_COOKIE, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function listarModulos(): Promise<Modulo[]> {
  if (isDemoMode()) {
    const base = await api.get<Modulo[]>("/admin/modulos", "");
    return [...base, ...readDemoExtra()];
  }
  const token = await requireAuth();
  return api.get<Modulo[]>("/admin/modulos", token);
}

export type ModuloFormState = { error?: string; ok?: boolean };

export async function crearModulo(
  _prev: ModuloFormState,
  formData: FormData,
): Promise<ModuloFormState> {
  const payload = {
    codigo: String(formData.get("codigo") ?? "").trim().toLowerCase(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    descripcion: String(formData.get("descripcion") ?? "").trim() || null,
    icono: String(formData.get("icono") ?? "").trim() || null,
    orden: Number(formData.get("orden") ?? 0) || 0,
    activo: formData.get("activo") !== "off",
  };
  if (!payload.codigo || !/^[a-z][a-z0-9_]{1,31}$/.test(payload.codigo)) {
    return { error: "Código inválido (minúsculas, dígitos o '_'; empezar con letra)" };
  }
  if (!payload.nombre || payload.nombre.length < 2) {
    return { error: "Nombre obligatorio" };
  }
  if (isDemoMode()) {
    const extras = readDemoExtra();
    if (extras.some((m) => m.codigo === payload.codigo)) {
      return { error: "Ya existe un módulo con ese código" };
    }
    extras.push({ id: 1000 + extras.length, ...payload });
    writeDemoExtra(extras);
    revalidatePath("/admin/modulos");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post("/admin/modulos", payload, token);
    revalidatePath("/admin/modulos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function actualizarModulo(
  modulo_id: number,
  data: Partial<Omit<Modulo, "id" | "codigo">>,
): Promise<ModuloFormState> {
  if (isDemoMode()) {
    const extras = readDemoExtra();
    const idx = extras.findIndex((m) => m.id === modulo_id);
    if (idx === -1) {
      return { error: "Los módulos del catálogo base solo se editan en backend real" };
    }
    extras[idx] = { ...extras[idx], ...data };
    writeDemoExtra(extras);
    revalidatePath("/admin/modulos");
    return { ok: true };
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
    writeDemoExtra(readDemoExtra().filter((m) => m.id !== modulo_id));
    revalidatePath("/admin/modulos");
    return { ok: true };
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
