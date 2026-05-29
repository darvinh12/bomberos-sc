"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type EntidadCat =
  | "jerarquias"
  | "cargos"
  | "condiciones"
  | "niveles-educativos"
  | "especialidades"
  | "estados-civiles"
  | "grupos-sanguineos"
  | "bancos"
  | "tipos-personal"
  | "estatus-funcionario"
  | "instituciones-formadoras"
  | "tipos-vivienda"
  | "tenencias-vivienda"
  | "estados"
  | "municipios"
  | "parroquias";

export type CatItem = {
  id: number;
  codigo: string;
  nombre: string;
  activo?: boolean;
  // Extras según entidad
  nombre_corto?: string | null;
  orden?: number;
  es_oficial?: boolean;
  es_tropa?: boolean;
  es_estado_mayor?: boolean;
  descripcion?: string | null;
  es_jefatura?: boolean;
  swift?: string | null;
  // FK para municipios / parroquias
  estado_id?: number | null;
  municipio_id?: number | null;
  _deleted?: boolean;
};

const COOKIES: Record<EntidadCat, string> = {
  jerarquias: "bcd_demo_cat_jer",
  cargos: "bcd_demo_cat_car",
  condiciones: "bcd_demo_cat_cond",
  "niveles-educativos": "bcd_demo_cat_nivel",
  especialidades: "bcd_demo_cat_esp",
  "estados-civiles": "bcd_demo_cat_ec",
  "grupos-sanguineos": "bcd_demo_cat_gs",
  bancos: "bcd_demo_cat_bnc",
  "tipos-personal": "bcd_demo_cat_tp",
  "estatus-funcionario": "bcd_demo_cat_ef",
  "instituciones-formadoras": "bcd_demo_cat_if",
  "tipos-vivienda": "bcd_demo_cat_tv",
  "tenencias-vivienda": "bcd_demo_cat_tnv",
  estados: "bcd_demo_cat_est",
  municipios: "bcd_demo_cat_mun",
  parroquias: "bcd_demo_cat_par",
};

function readDemo(entidad: EntidadCat): CatItem[] {
  const raw = cookies().get(COOKIES[entidad])?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CatItem[];
  } catch {
    return [];
  }
}

function writeDemo(entidad: EntidadCat, items: CatItem[]) {
  cookies().set(COOKIES[entidad], JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function fusionar(base: CatItem[], extras: CatItem[]): CatItem[] {
  const out: CatItem[] = base.map((b) => {
    const ext = extras.find((e) => e.id === b.id);
    return ext ? { ...b, ...ext } : b;
  });
  for (const e of extras) {
    if (!base.some((b) => b.id === e.id)) out.push(e);
  }
  return out.filter((x) => !x._deleted);
}

export async function listarCat(entidad: EntidadCat): Promise<CatItem[]> {
  if (isDemoMode()) {
    const base = await api.get<CatItem[]>(`/catalogos/${entidad}`, "");
    const extras = readDemo(entidad);
    return fusionar(base, extras);
  }
  const token = await requireAuth();
  return api.get<CatItem[]>(`/admin/catalogos/${entidad}`, token);
}

export type CatFormState = { error?: string; ok?: boolean };

export async function crearCat(
  entidad: EntidadCat,
  _prev: CatFormState,
  fd: FormData,
): Promise<CatFormState> {
  const codigo = String(fd.get("codigo") ?? "").trim();
  const nombre = String(fd.get("nombre") ?? "").trim();
  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios" };

  const payload: Record<string, unknown> = { codigo, nombre };
  if (entidad === "grupos-sanguineos") {
    // sin activo
  } else if (entidad === "jerarquias") {
    payload.nombre_corto = String(fd.get("nombre_corto") ?? "").trim() || null;
    payload.orden = Number(fd.get("orden") ?? 0);
    payload.es_oficial = fd.get("es_oficial") === "on";
    payload.es_tropa = fd.get("es_tropa") === "on";
    payload.es_estado_mayor = fd.get("es_estado_mayor") === "on";
    payload.activo = fd.get("activo") !== "off";
  } else if (entidad === "cargos") {
    payload.descripcion = String(fd.get("descripcion") ?? "").trim() || null;
    payload.es_jefatura = fd.get("es_jefatura") === "on";
    payload.activo = fd.get("activo") !== "off";
  } else if (entidad === "niveles-educativos") {
    payload.orden = Number(fd.get("orden") ?? 0);
  } else if (entidad === "especialidades") {
    payload.descripcion = String(fd.get("descripcion") ?? "").trim() || null;
    payload.activo = fd.get("activo") !== "off";
  } else if (entidad === "bancos") {
    payload.swift = String(fd.get("swift") ?? "").trim() || null;
    payload.activo = fd.get("activo") !== "off";
  } else if (entidad === "municipios") {
    const estadoId = Number(fd.get("estado_id") ?? 0);
    if (!estadoId) return { error: "Debés seleccionar un estado" };
    payload.estado_id = estadoId;
    payload.activo = fd.get("activo") !== "off";
  } else if (entidad === "parroquias") {
    const municipioId = Number(fd.get("municipio_id") ?? 0);
    if (!municipioId) return { error: "Debés seleccionar un municipio" };
    payload.municipio_id = municipioId;
    payload.activo = fd.get("activo") !== "off";
  } else {
    payload.activo = fd.get("activo") !== "off";
  }

  if (isDemoMode()) {
    const extras = readDemo(entidad);
    if (extras.some((e) => e.codigo === codigo)) {
      return { error: "Ya existe un registro con ese código" };
    }
    const base = await api.get<CatItem[]>(`/catalogos/${entidad}`, "");
    const nextId =
      Math.max(0, ...base.map((b) => b.id), ...extras.map((e) => e.id)) + 1;
    extras.push({ ...(payload as CatItem), id: nextId });
    writeDemo(entidad, extras);
    revalidatePath("/admin/catalogos");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(`/admin/catalogos/${entidad}`, payload, token);
    revalidatePath("/admin/catalogos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function actualizarCat(
  entidad: EntidadCat,
  id: number,
  data: Record<string, unknown>,
): Promise<CatFormState> {
  if (isDemoMode()) {
    const extras = readDemo(entidad);
    const idx = extras.findIndex((e) => e.id === id);
    if (idx === -1) extras.push({ id, codigo: "", nombre: "", ...data } as CatItem);
    else extras[idx] = { ...extras[idx], ...data };
    writeDemo(entidad, extras);
    revalidatePath("/admin/catalogos");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/catalogos/${entidad}/${id}`, data, token);
    revalidatePath("/admin/catalogos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

export async function borrarCat(
  entidad: EntidadCat,
  id: number,
): Promise<CatFormState> {
  if (isDemoMode()) {
    const extras = readDemo(entidad);
    const idx = extras.findIndex((e) => e.id === id);
    if (idx === -1) extras.push({ id, codigo: "", nombre: "", _deleted: true });
    else extras[idx] = { ...extras[idx], _deleted: true };
    writeDemo(entidad, extras);
    revalidatePath("/admin/catalogos");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.del(`/admin/catalogos/${entidad}/${id}`, token);
    revalidatePath("/admin/catalogos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
