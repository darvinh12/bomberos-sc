/**
 * Helpers de roles que necesitan runtime (cookies, BD) — server-only.
 *
 * Junta los roles "de sistema" definidos en demo-fixtures con los roles
 * extra que ADMIN ha creado desde /admin/roles (cookie en modo demo, BD
 * en modo real). Cualquier UI que muestre un selector de rol debería
 * consumir esta lista para que los roles nuevos aparezcan en todos lados:
 * RoleSwitcher, formularios de usuarios, matriz de permisos, etc.
 */
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { isDemoMode } from "@/lib/demo-fixtures";
import { requireAuth } from "@/lib/session";

export interface RolUI {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface RolApi {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  activo: boolean;
}

const ROLES_EXTRA_COOKIE = "bcd_demo_roles_extra";

function readDemoExtraRoles(): RolApi[] {
  const raw = cookies().get(ROLES_EXTRA_COOKIE)?.value;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RolApi[];
  } catch {
    return [];
  }
}

/**
 * Lista todos los roles disponibles en el sistema, incluyendo los creados
 * por ADMIN. Solo devuelve roles activos. Pensado para selectores de UI.
 */
export async function listarRolesUI(): Promise<RolUI[]> {
  if (isDemoMode()) {
    const base = await api.get<RolApi[]>("/admin/roles", "").catch(() => []);
    const extras = readDemoExtraRoles();
    return [...base, ...extras]
      .filter((r) => r.activo)
      .map((r) => ({
        codigo: r.codigo,
        nombre: r.nombre,
        descripcion: r.descripcion,
        activo: r.activo,
      }));
  }
  const token = await requireAuth();
  const roles = await api.get<RolApi[]>("/admin/roles", token).catch(() => []);
  return roles
    .filter((r) => r.activo)
    .map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion,
      activo: r.activo,
    }));
}

/**
 * Devuelve `true` si el código de rol existe (activo) en el sistema. Usado
 * por switchDemoRole para validar contra la lista dinámica en lugar del
 * enum hardcoded.
 */
export async function rolExiste(codigo: string): Promise<boolean> {
  const roles = await listarRolesUI();
  return roles.some((r) => r.codigo === codigo);
}
