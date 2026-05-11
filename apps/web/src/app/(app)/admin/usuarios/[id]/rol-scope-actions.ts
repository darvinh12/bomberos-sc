"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type RolScope = {
  id: number;
  usuario_id: number;
  rol_id: number;
  zona_id: number | null;
  estacion_id: number | null;
  division_id: number | null;
  area_id: number | null;
};

const COOKIE = "bcd_demo_rol_scopes";

function readDemo(): RolScope[] {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RolScope[];
  } catch {
    return [];
  }
}

function writeDemo(items: RolScope[]) {
  cookies().set(COOKIE, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function listarRolScopes(usuario_id: number): Promise<RolScope[]> {
  if (isDemoMode()) {
    return readDemo().filter((s) => s.usuario_id === usuario_id);
  }
  const token = await requireAuth();
  return api.get<RolScope[]>(`/admin/usuarios/${usuario_id}/rol-scopes`, token);
}

export type RolScopePayload = {
  rol_id: number;
  zona_id?: number | null;
  estacion_id?: number | null;
  division_id?: number | null;
  area_id?: number | null;
};

export async function asignarRolScope(
  usuario_id: number,
  payload: RolScopePayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!payload.rol_id) {
    return { ok: false, error: "Elegí un rol" };
  }
  const algunoPresente =
    payload.zona_id != null ||
    payload.estacion_id != null ||
    payload.division_id != null ||
    payload.area_id != null;
  if (!algunoPresente) {
    return { ok: false, error: "Elegí una zona, estación, división o área" };
  }
  if (isDemoMode()) {
    const items = readDemo();
    const nextId = (items.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    items.push({
      id: nextId,
      usuario_id,
      rol_id: payload.rol_id,
      zona_id: payload.zona_id ?? null,
      estacion_id: payload.estacion_id ?? null,
      division_id: payload.division_id ?? null,
      area_id: payload.area_id ?? null,
    });
    writeDemo(items);
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(`/admin/usuarios/${usuario_id}/rol-scopes`, payload, token);
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function quitarRolScope(
  usuario_id: number,
  rs_id: number,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    writeDemo(readDemo().filter((s) => s.id !== rs_id));
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.del(`/admin/usuarios/${usuario_id}/rol-scopes/${rs_id}`, token);
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
