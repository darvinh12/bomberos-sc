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

const MATRIZ: Record<SeccionFuncionario, Partial<Record<Rol, NivelAcceso>>> = {
  resumen: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LOGISTICA: "view",
    OPERADOR: "view",
    INSPECTOR: "view",
    LECTURA: "view",
  },
  datos: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LECTURA: "view",
  },
  carrera: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LECTURA: "view",
  },
  operativo: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    OPERADOR: "edit",
    INSPECTOR: "view",
    LECTURA: "view",
  },
  "operativo:guardias": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    OPERADOR: "edit",
    LECTURA: "view",
  },
  "operativo:vacaciones": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    LECTURA: "view",
  },
  "operativo:permisos": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    OPERADOR: "edit",
    LECTURA: "view",
  },
  "operativo:comisiones": {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "edit",
    INSPECTOR: "view",
    LECTURA: "view",
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
    LECTURA: "view",
  },
  beneficios: {
    ADMIN: "edit",
    RRHH: "edit",
  },
  familia: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LECTURA: "view",
  },
  habilidades: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LECTURA: "view",
  },
  documentos: {
    ADMIN: "edit",
    RRHH: "edit",
    SUPERVISOR: "view",
    LECTURA: "view",
  },
  auditoria: {
    ADMIN: "view",
    RRHH: "view",
  },
};

/**
 * Devuelve el nivel de acceso más alto que el conjunto de roles tiene sobre
 * la sección dada. ADMIN siempre obtiene "edit".
 */
export function accesoSeccion(
  seccion: SeccionFuncionario,
  roles: string[],
): NivelAcceso {
  if (roles.includes("ADMIN")) return "edit";
  let mejor: NivelAcceso = "none";
  for (const rol of roles) {
    const nivel = MATRIZ[seccion]?.[rol as Rol];
    if (nivel === "edit") return "edit";
    if (nivel === "view") mejor = "view";
  }
  return mejor;
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
