"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type Scope = {
  id: number;
  usuario_id: number;
  zona_id: number | null;
  estacion_id: number | null;
  division_id: number | null;
  area_id: number | null;
};

const SCOPES_COOKIE = "bcd_demo_scopes";

function readDemoScopes(): Scope[] {
  const raw = cookies().get(SCOPES_COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Scope[];
  } catch {
    return [];
  }
}

function writeDemoScopes(items: Scope[]) {
  cookies().set(SCOPES_COOKIE, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function listarScopes(usuario_id: number): Promise<Scope[]> {
  if (isDemoMode()) {
    return readDemoScopes().filter((s) => s.usuario_id === usuario_id);
  }
  const token = await requireAuth();
  return api.get<Scope[]>(`/admin/usuarios/${usuario_id}/scopes`, token);
}

export type ScopePayload = {
  zona_id?: number | null;
  estacion_id?: number | null;
  division_id?: number | null;
  area_id?: number | null;
};

export async function asignarScope(
  usuario_id: number,
  payload: ScopePayload,
): Promise<{ ok: boolean; error?: string }> {
  const algunoPresente =
    payload.zona_id != null ||
    payload.estacion_id != null ||
    payload.division_id != null ||
    payload.area_id != null;
  if (!algunoPresente) {
    return { ok: false, error: "Elegí una zona, estación, división o área" };
  }
  if (isDemoMode()) {
    const items = readDemoScopes();
    const nextId = (items.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    items.push({
      id: nextId,
      usuario_id,
      zona_id: payload.zona_id ?? null,
      estacion_id: payload.estacion_id ?? null,
      division_id: payload.division_id ?? null,
      area_id: payload.area_id ?? null,
    });
    writeDemoScopes(items);
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(`/admin/usuarios/${usuario_id}/scopes`, payload, token);
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function quitarScope(
  usuario_id: number,
  scope_id: number,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    writeDemoScopes(readDemoScopes().filter((s) => s.id !== scope_id));
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.del(`/admin/usuarios/${usuario_id}/scopes/${scope_id}`, token);
    revalidatePath(`/admin/usuarios/${usuario_id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
