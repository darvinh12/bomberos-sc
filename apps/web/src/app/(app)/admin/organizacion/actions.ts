"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type EntidadOrg =
  | "zonas"
  | "estaciones"
  | "divisiones"
  | "areas"
  | "dependencias";

export type Zona = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

export type Estacion = {
  id: number;
  zona_id: number;
  codigo: string;
  nombre: string;
  nombre_corto: string | null;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
};

export type Org = {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  parent_id: number | null;
};

const COOKIES: Record<EntidadOrg, string> = {
  zonas: "bcd_demo_org_zonas",
  estaciones: "bcd_demo_org_estaciones",
  divisiones: "bcd_demo_org_divisiones",
  areas: "bcd_demo_org_areas",
  dependencias: "bcd_demo_org_dependencias",
};

function readDemo<T>(entidad: EntidadOrg): T[] {
  const raw = cookies().get(COOKIES[entidad])?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeDemo<T>(entidad: EntidadOrg, items: T[]) {
  cookies().set(COOKIES[entidad], JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// El demo base viene de demo-fixtures (/catalogos/*) — para mantener consistencia.
// Los CRUD demo agregan/modifican items en cookies y los fusionamos al leer.

type AnyItem = { id: number; [k: string]: unknown };

function fusionar<T extends AnyItem>(base: T[], extras: T[]): T[] {
  const out: T[] = base.map((b) => {
    const ext = extras.find((e) => e.id === b.id);
    return ext ? ({ ...b, ...ext } as T) : b;
  });
  for (const e of extras) {
    if (!base.some((b) => b.id === e.id)) out.push(e);
  }
  return out.filter((x) => !(x as { _deleted?: boolean })._deleted);
}

async function fetchBase<T>(entidad: EntidadOrg): Promise<T[]> {
  // En demo el endpoint público /catalogos/{entidad} devuelve los items.
  const path =
    entidad === "areas"
      ? "/catalogos/areas"
      : entidad === "divisiones"
        ? "/catalogos/divisiones"
        : entidad === "dependencias"
          ? "/catalogos/dependencias"
          : `/catalogos/${entidad}`;
  return api.get<T[]>(path, "");
}

export async function listarOrg(entidad: EntidadOrg): Promise<unknown[]> {
  if (isDemoMode()) {
    const base = await fetchBase<AnyItem>(entidad);
    const extras = readDemo<AnyItem>(entidad);
    return fusionar(base, extras);
  }
  const token = await requireAuth();
  return api.get<unknown[]>(`/admin/organizacion/${entidad}`, token);
}

export type OrgFormState = { error?: string; ok?: boolean };

function parseBool(v: FormDataEntryValue | null): boolean {
  if (v === null) return false;
  if (v === "off") return false;
  return true;
}

function parsePayload(entidad: EntidadOrg, fd: FormData): Record<string, unknown> {
  const base: Record<string, unknown> = {
    codigo: String(fd.get("codigo") ?? "").trim(),
    nombre: String(fd.get("nombre") ?? "").trim(),
  };
  if (entidad === "zonas") {
    base.descripcion = String(fd.get("descripcion") ?? "").trim() || null;
    base.activo = parseBool(fd.get("activo"));
  } else if (entidad === "estaciones") {
    base.zona_id = Number(fd.get("zona_id") ?? 0);
    base.nombre_corto = String(fd.get("nombre_corto") ?? "").trim() || null;
    base.direccion = String(fd.get("direccion") ?? "").trim() || null;
    base.telefono = String(fd.get("telefono") ?? "").trim() || null;
    base.activa = parseBool(fd.get("activa"));
  } else {
    const parentRaw = fd.get("parent_id");
    base.parent_id =
      parentRaw == null || parentRaw === "" ? null : Number(parentRaw);
    base.activo = parseBool(fd.get("activo"));
  }
  return base;
}

export async function crearOrg(
  entidad: EntidadOrg,
  _prev: OrgFormState,
  fd: FormData,
): Promise<OrgFormState> {
  const payload = parsePayload(entidad, fd);
  if (!payload.codigo || !payload.nombre) {
    return { error: "Código y nombre son obligatorios" };
  }
  if (isDemoMode()) {
    const extras = readDemo<AnyItem>(entidad);
    if (extras.some((e) => e.codigo === payload.codigo)) {
      return { error: "Ya existe un registro con ese código" };
    }
    const base = await fetchBase<AnyItem>(entidad);
    const nextId = Math.max(0, ...base.map((b) => b.id), ...extras.map((e) => e.id)) + 1;
    extras.push({ id: nextId, ...payload } as AnyItem);
    writeDemo(entidad, extras);
    revalidatePath("/admin/organizacion");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(`/admin/organizacion/${entidad}`, payload, token);
    revalidatePath("/admin/organizacion");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function actualizarOrg(
  entidad: EntidadOrg,
  id: number,
  data: Record<string, unknown>,
): Promise<OrgFormState> {
  if (isDemoMode()) {
    const extras = readDemo<AnyItem>(entidad);
    const idx = extras.findIndex((e) => e.id === id);
    if (idx === -1) {
      // No existe en extras → agregamos un override.
      extras.push({ id, ...data } as AnyItem);
    } else {
      extras[idx] = { ...extras[idx], ...data };
    }
    writeDemo(entidad, extras);
    revalidatePath("/admin/organizacion");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/organizacion/${entidad}/${id}`, data, token);
    revalidatePath("/admin/organizacion");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function borrarOrg(
  entidad: EntidadOrg,
  id: number,
): Promise<OrgFormState> {
  if (isDemoMode()) {
    const extras = readDemo<AnyItem>(entidad);
    const idx = extras.findIndex((e) => e.id === id);
    if (idx === -1) {
      extras.push({ id, _deleted: true } as AnyItem);
    } else {
      extras[idx] = { ...extras[idx], _deleted: true };
    }
    writeDemo(entidad, extras);
    revalidatePath("/admin/organizacion");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.del(`/admin/organizacion/${entidad}/${id}`, token);
    revalidatePath("/admin/organizacion");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
