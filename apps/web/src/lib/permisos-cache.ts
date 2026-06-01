/**
 * Cache global de permisos de recursos. Se hidrata desde backend (o demo
 * localStorage) y es consultado por los helpers puedeVerSeccion /
 * puedeEditarSeccion / accesoSeccion en lib/permisos-funcionario.ts.
 *
 * En server components, se llama cargarPermisosServer(token) en el page
 * que lo necesite. La data hidratada queda en el cache del request.
 *
 * En client components, el ClientPermisosSync mantiene el cache
 * actualizado vía React Query (polling 30s + revalidación on focus).
 */

import type { NivelAcceso } from "./permisos-funcionario";

export type TipoRecurso = "seccion_ficha" | "sidebar" | "accion_panel";

export interface PermisoRecurso {
  rol_codigo: string;
  recurso_tipo: TipoRecurso;
  recurso_codigo: string;
  nivel: NivelAcceso;
}

let cache: Map<string, Map<string, NivelAcceso>> | null = null;

export function setPermisosCache(items: PermisoRecurso[]): void {
  const m = new Map<string, Map<string, NivelAcceso>>();
  for (const p of items) {
    if (!m.has(p.rol_codigo)) m.set(p.rol_codigo, new Map());
    const k = `${p.recurso_tipo}:${p.recurso_codigo}`;
    m.get(p.rol_codigo)!.set(k, p.nivel);
  }
  cache = m;
}

export function getNivelDesdeCache(
  tipo: TipoRecurso,
  codigo: string,
  roles: string[],
): NivelAcceso | null {
  if (cache === null) return null;
  let mejor: NivelAcceso = "none";
  let encontrado = false;
  for (const rol of roles) {
    const m = cache.get(rol);
    if (!m) continue;
    const n = m.get(`${tipo}:${codigo}`);
    if (n === undefined) continue;
    encontrado = true;
    if (n === "edit") return "edit";
    if (n === "view") mejor = "view";
  }
  return encontrado ? mejor : null;
}

export function tieneCache(): boolean {
  return cache !== null;
}

export function limpiarCache(): void {
  cache = null;
}
