/**
 * Matriz granular de permisos para la ficha de funcionario.
 *
 * Niveles:
 *   - "edit" → puede ver + crear / editar / eliminar
 *   - "view" → solo lectura
 *   - "none" → la sección no aparece en el sidebar ni se renderiza
 *
 * ADMIN siempre tiene "edit" sobre cualquier sección, sin necesidad de listarlo
 * explícitamente en cada entrada de MATRIZ (lo aplica `accesoSeccion`).
 *
 * Sub-secciones de Operativo se modelan como claves anidadas
 * ("operativo:guardias", "operativo:faltas", etc.) porque la matriz aprobada
 * diferencia por sub-card (ej. INSPECTOR puede editar Faltas pero solo ver
 * Comisiones). La sección padre "operativo" decide si el ítem aparece en el
 * sidebar y el nivel mostrado en el indicador "Solo lectura"; cada sub-card
 * decide por separado si muestra botones de creación / edición.
 */
import type { Rol } from "./roles";
import {
  getNivelDesdeCache,
  setPermisosCache,
  tieneCache,
  type PermisoRecurso,
} from "./permisos-cache";

export type SeccionFuncionario =
  | "resumen"
  | "datos"
  | "carrera"
  | "operativo"
  | "operativo:guardias"
  | "operativo:vacaciones"
  | "operativo:permisos"
  | "operativo:comisiones"
  | "operativo:faltas"
  | "salud"
  | "equipos"
  | "beneficios"
  | "familia"
  | "habilidades"
  | "documentos"
  | "auditoria";

export type NivelAcceso = "edit" | "view" | "none";

/**
 * Matriz por defecto (fallback). Se usa cuando el cache global no está
 * hidratado (caso server component sin haber llamado cargarPermisosServer,
 * o cuando el backend está caído). Refleja la matriz aprobada inicialmente.
 *
 * Cuando la BD tiene permisos cargados (vía /admin/permisos), el cache se
 * llena y esta matriz se ignora — solo aplica como red de seguridad.
 */
const DEFAULT_MATRIZ: Record<SeccionFuncionario, Partial<Record<Rol, NivelAcceso>>> = {
  resumen: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LOGISTICA: "view",
    OPERADOR: "view",
    INSPECTOR: "view",
    CONSULTA: "view",
  },
  datos: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    CONSULTA: "view",
  },
  carrera: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    CONSULTA: "view",
  },
  operativo: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    OPERADOR: "edit",
    INSPECTOR: "view",
    CONSULTA: "view",
  },
  "operativo:guardias": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    OPERADOR: "edit",
    CONSULTA: "view",
  },
  "operativo:vacaciones": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    CONSULTA: "view",
  },
  "operativo:permisos": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    OPERADOR: "edit",
    CONSULTA: "view",
  },
  "operativo:comisiones": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    INSPECTOR: "view",
    CONSULTA: "view",
  },
  "operativo:faltas": {
    ADMIN: "edit",
    RRHH: "view",
    SUPERVISOR: "edit",
    INSPECTOR: "edit",
  },
  salud: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
  },
  equipos: {
    ADMIN: "edit",
    RRHH: "view",
    SUPERVISOR: "view",
    LOGISTICA: "edit",
    CONSULTA: "view",
  },
  beneficios: {
    ADMIN: "edit",
    RRHH: "edit",
  },
  familia: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    CONSULTA: "view",
  },
  habilidades: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    CONSULTA: "view",
  },
  documentos: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    CONSULTA: "view",
  },
  auditoria: {
    ADMIN: "view",
    RRHH: "view",
  },
};

/**
 * Devuelve el nivel de acceso más alto que el conjunto de roles tiene sobre
 * la sección dada.
 *
 * Reglas:
 *  - ADMIN siempre obtiene "edit" (no se puede revocar)
 *  - Cualquier otro rol: lee del cache global. Si NO tiene permiso
 *    explícito en el cache, devuelve "none" (sin acceso).
 *
 * No hay fallback a matriz hardcoded — los permisos los configura el ADMIN
 * desde /admin/permisos. Un rol sin configuración no ve nada.
 *
 * Solo cuando el cache no está hidratado (caso edge antes de la primera
 * carga server-side) cae al fallback DEFAULT_MATRIZ para evitar pantalla
 * en blanco al primer render.
 */
export function accesoSeccion(
  seccion: SeccionFuncionario,
  roles: string[],
): NivelAcceso {
  if (roles.includes("ADMIN")) return "edit";

  if (tieneCache()) {
    const nivel = getNivelDesdeCache("seccion_ficha", seccion, roles);
    // null en cache hidratado significa "no configurado" = sin acceso
    return nivel ?? "none";
  }

  // Cache no hidratado todavía: usar matriz por defecto como fallback de
  // emergencia. Esto solo aplica en el primer render antes de que el
  // server hidrate el cache. Una vez hidratado, el cache toma el control.
  let mejor: NivelAcceso = "none";
  for (const rol of roles) {
    const nivel = DEFAULT_MATRIZ[seccion]?.[rol as Rol];
    if (nivel === "edit") return "edit";
    if (nivel === "view") mejor = "view";
  }
  return mejor;
}

/**
 * Carga permisos desde backend en server-side. Llamar en server components
 * que dependen de permisos exactos (ej. funcionarios/[id]/page.tsx).
 *
 * En demo mode, no carga nada — el cliente hidratará desde localStorage tras
 * montar el componente PermisosSync.
 *
 * Si la llamada falla, no rompe nada: las consultas usan DEFAULT_MATRIZ
 * como fallback.
 */
export async function cargarPermisosServer(token: string): Promise<void> {
  const esDemo =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_DEMO_MODE === "1";

  if (esDemo) {
    // Leer cookie demo (escrita por guardarMatrizRecursos en actions.ts)
    try {
      const { cookies } = await import("next/headers");
      const raw = cookies().get("bcd_demo_permisos_recursos")?.value;
      if (raw) {
        const items = JSON.parse(raw) as PermisoRecurso[];
        setPermisosCache(items);
        return;
      }
    } catch {
      // ignorar (next/headers no disponible o JSON inválido)
    }
    // Sin cookie: dejar cache vacío para que se use DEFAULT_MATRIZ
    setPermisosCache([]);
    return;
  }

  try {
    const baseUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
    const res = await fetch(`${baseUrl}/admin/permisos-recursos`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!res.ok) {
      setPermisosCache([]);
      return;
    }
    const items = (await res.json()) as PermisoRecurso[];
    setPermisosCache(items);
  } catch {
    setPermisosCache([]);
  }
}

export function puedeVerSeccion(
  seccion: SeccionFuncionario,
  roles: string[],
): boolean {
  return accesoSeccion(seccion, roles) !== "none";
}

export function puedeEditarSeccion(
  seccion: SeccionFuncionario,
  roles: string[],
): boolean {
  return accesoSeccion(seccion, roles) === "edit";
}
