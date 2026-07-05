/**
 * Gate de acceso a páginas por módulo del sidebar, respetando la matriz
 * editable de /admin/permisos (tipo "sidebar", mismo contrato que usa el
 * layout para filtrar la navegación).
 *
 * Sustituye a los requireRoleOrRedirect con listas de roles hardcoded que
 * contradecían la matriz: el sidebar mostraba u ocultaba el enlace según la
 * configuración del ADMIN, pero la página decidía con su propia lista.
 *
 * Server-only: usa redirect() y el cache de permisos hidratado por cookie
 * (demo) o por el backend (modo real).
 */
import { redirect } from "next/navigation";
import { getNivelDesdeCache, tieneCache } from "./permisos-cache";
import { cargarPermisosServer } from "./permisos-funcionario";
import { puedeVer } from "./roles";

export type ModuloSidebar =
  | "dashboard"
  | "personal"
  | "operativo"
  | "carrera"
  | "beneficios"
  | "egresos"
  | "catalogos";

/** Ruta representativa por módulo para el fallback al sistema viejo
 *  (solo aplica si el cache de permisos no se pudo hidratar). */
const RUTA_FALLBACK: Record<ModuloSidebar, string> = {
  dashboard: "/dashboard",
  personal: "/funcionarios",
  operativo: "/ops/guardias",
  carrera: "/carrera",
  beneficios: "/beneficios",
  egresos: "/egresos",
  catalogos: "/catalogos",
};

/**
 * Redirige a /dashboard si el usuario no tiene acceso al módulo según la
 * matriz editable. ADMIN pasa siempre.
 */
export async function requireModuloOrRedirect(
  modulo: ModuloSidebar,
  roles: string[],
  token: string,
  redirectTo = "/dashboard",
): Promise<void> {
  if (roles.includes("ADMIN")) return;

  await cargarPermisosServer(token);

  if (tieneCache()) {
    const nivel = getNivelDesdeCache("sidebar", modulo, roles);
    if (nivel !== null && nivel !== "none") return;
    redirect(redirectTo);
  }

  // Cache no hidratado (backend caído en el primer render): sistema viejo.
  if (!puedeVer(RUTA_FALLBACK[modulo], roles)) {
    redirect(redirectTo);
  }
}
