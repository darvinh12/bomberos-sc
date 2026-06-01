"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type Rol = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  activo: boolean;
};

export type Modulo = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  orden: number;
  activo: boolean;
};

export type Permiso = {
  rol_id: number;
  modulo_id: number;
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
  puede_exportar: boolean;
  puede_aprobar: boolean;
};

export type PermisoKey =
  | "puede_ver"
  | "puede_crear"
  | "puede_editar"
  | "puede_eliminar"
  | "puede_exportar"
  | "puede_aprobar";

const PERMISOS_COOKIE = "bcd_demo_permisos";
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

function readDemoPermisos(): Permiso[] {
  const raw = cookies().get(PERMISOS_COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Permiso[];
  } catch {
    return [];
  }
}

function writeDemoPermisos(items: Permiso[]) {
  cookies().set(PERMISOS_COOKIE, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function cargarMatriz(): Promise<{
  roles: Rol[];
  modulos: Modulo[];
  permisos: Permiso[];
}> {
  if (isDemoMode()) {
    const base = await api.get<Rol[]>("/admin/roles", "");
    const extras = readDemoExtraRoles();
    const roles = [...base, ...extras];
    const modulos = await api.get<Modulo[]>("/admin/modulos", "");
    const permisos = readDemoPermisos();
    return { roles, modulos, permisos };
  }
  const token = await requireAuth();
  const [roles, modulos, permisos] = await Promise.all([
    api.get<Rol[]>("/admin/roles", token),
    api.get<Modulo[]>("/admin/modulos", token),
    api.get<Permiso[]>("/admin/permisos", token),
  ]);
  return { roles, modulos, permisos };
}

export async function togglePermiso(
  rol_id: number,
  modulo_id: number,
  key: PermisoKey,
  value: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const items = readDemoPermisos();
    let p = items.find((x) => x.rol_id === rol_id && x.modulo_id === modulo_id);
    if (!p) {
      p = {
        rol_id,
        modulo_id,
        puede_ver: false,
        puede_crear: false,
        puede_editar: false,
        puede_eliminar: false,
        puede_exportar: false,
        puede_aprobar: false,
      };
      items.push(p);
    }
    p[key] = value;
    writeDemoPermisos(items);
    revalidatePath("/admin/permisos");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.put(
      `/admin/permisos/${rol_id}/${modulo_id}`,
      { [key]: value },
      token,
    );
    revalidatePath("/admin/permisos");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ============================================================
// Permisos por recurso (sección ficha, sidebar, acciones panel)
// ============================================================

export type TipoRecurso = "seccion_ficha" | "sidebar" | "accion_panel";

export type NivelAccesoMatriz = "edit" | "view" | "none";

export interface PermisoRecursoMatriz {
  rol_codigo: string;
  recurso_tipo: TipoRecurso;
  recurso_codigo: string;
  nivel: NivelAccesoMatriz;
}

const PERMISOS_RECURSOS_COOKIE = "bcd_demo_permisos_recursos";

function readDemoPermisosRecursos(): PermisoRecursoMatriz[] {
  const raw = cookies().get(PERMISOS_RECURSOS_COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PermisoRecursoMatriz[];
  } catch {
    return [];
  }
}

function writeDemoPermisosRecursos(items: PermisoRecursoMatriz[]) {
  cookies().set(PERMISOS_RECURSOS_COOKIE, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function cargarPermisosRecursos(): Promise<PermisoRecursoMatriz[]> {
  if (isDemoMode()) {
    return readDemoPermisosRecursos();
  }
  const token = await requireAuth();
  try {
    return await api.get<PermisoRecursoMatriz[]>(
      "/admin/permisos-recursos",
      token,
    );
  } catch {
    return [];
  }
}

export async function guardarMatrizRecursos(
  cambios: PermisoRecursoMatriz[],
): Promise<{ ok: boolean; error?: string; aplicados?: number; estadoActual?: PermisoRecursoMatriz[] }> {
  if (isDemoMode()) {
    const actuales = readDemoPermisosRecursos();
    const mapa = new Map<string, PermisoRecursoMatriz>();
    for (const p of actuales) {
      mapa.set(`${p.rol_codigo}:${p.recurso_tipo}:${p.recurso_codigo}`, p);
    }
    // IMPORTANTE: guardamos TODOS los niveles, incluso "none". Si borráramos
    // las filas con none, el helper de permisos no las encontraría en el
    // cache y caería al fallback de DEFAULT_MATRIZ (que da acceso por
    // defecto), efectivamente IGNORANDO la decisión del admin de "sin
    // acceso". Guardar explícitamente "none" es la única forma de hacer
    // que se respete.
    for (const c of cambios) {
      const k = `${c.rol_codigo}:${c.recurso_tipo}:${c.recurso_codigo}`;
      mapa.set(k, c);
    }
    const final = Array.from(mapa.values());
    writeDemoPermisosRecursos(final);
    // Revalidar TODAS las rutas del app group para que sidebar y fichas
    // se re-rendericen con los permisos nuevos (no solo /admin/permisos)
    revalidatePath("/", "layout");
    return { ok: true, aplicados: cambios.length, estadoActual: final };
  }

  const token = await requireAuth();
  try {
    const res = await api.put<{ aplicados: number }>(
      "/admin/permisos-recursos",
      { cambios },
      token,
    );
    revalidatePath("/", "layout");
    return { ok: true, aplicados: res.aplicados };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
