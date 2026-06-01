/**
 * Definiciones de roles y matriz de acceso a módulos.
 * Cambiarlas aquí actualiza tanto la sidebar como los gates de páginas.
 */

import { redirect } from "next/navigation";

export type Rol =
  | "ADMIN"
  | "RRHH"
  | "SUPERVISOR"
  | "LOGISTICA"
  | "OPERADOR"
  | "INSPECTOR"
  | "CONSULTA";

export const ROLES_DISPONIBLES: { codigo: Rol; nombre: string; descripcion: string }[] = [
  { codigo: "ADMIN", nombre: "Administrador", descripcion: "Acceso total al sistema" },
  { codigo: "RRHH", nombre: "RRHH", descripcion: "Personal, salud, beneficios, egresos, carrera" },
  { codigo: "SUPERVISOR", nombre: "Supervisor", descripcion: "Operativo + lectura general" },
  { codigo: "LOGISTICA", nombre: "Logística", descripcion: "Equipo de protección y radios" },
  { codigo: "OPERADOR", nombre: "Operador", descripcion: "Guardias y permisos" },
  { codigo: "INSPECTOR", nombre: "Inspector", descripcion: "Faltas y comisiones" },
  { codigo: "CONSULTA", nombre: "Solo lectura", descripcion: "Visualización general" },
];

/**
 * Matriz de acceso (lectura). Si el módulo no aparece, todos pueden verlo.
 * Para escritura, los gates están en el backend con require_role(...).
 */
export const ACCESO_MODULOS: Record<string, Rol[]> = {
  "/dashboard":          ["ADMIN", "RRHH", "SUPERVISOR", "LOGISTICA", "OPERADOR", "INSPECTOR", "CONSULTA"],
  "/funcionarios":       ["ADMIN", "RRHH", "SUPERVISOR", "LOGISTICA", "OPERADOR", "INSPECTOR", "CONSULTA"],
  "/funcionarios/nuevo": ["ADMIN", "RRHH"],
  "/salud":              ["ADMIN", "RRHH", "SUPERVISOR"],
  "/ops/guardias":       ["ADMIN", "RRHH", "SUPERVISOR", "OPERADOR"],
  "/ops/vacaciones":     ["ADMIN", "RRHH", "SUPERVISOR"],
  "/ops/permisos":       ["ADMIN", "RRHH", "SUPERVISOR", "OPERADOR"],
  "/ops/comisiones":     ["ADMIN", "RRHH", "SUPERVISOR", "INSPECTOR"],
  "/ops/faltas":         ["ADMIN", "SUPERVISOR", "INSPECTOR"],
  "/carrera":            ["ADMIN", "RRHH", "SUPERVISOR"],
  "/equipo":             ["ADMIN", "LOGISTICA"],
  "/beneficios":         ["ADMIN", "RRHH"],
  "/egresos":            ["ADMIN", "RRHH"],
  "/catalogos":          ["ADMIN", "RRHH", "SUPERVISOR", "LOGISTICA", "OPERADOR", "INSPECTOR", "CONSULTA"],
  "/admin":              ["ADMIN"],
};

export function puedeVer(path: string, roles: string[]): boolean {
  // Superusuario: ADMIN siempre puede.
  if (roles.includes("ADMIN")) return true;
  // Buscar el match más largo de prefijo en ACCESO_MODULOS
  const claves = Object.keys(ACCESO_MODULOS).sort((a, b) => b.length - a.length);
  for (const k of claves) {
    if (path === k || path.startsWith(k + "/")) {
      return ACCESO_MODULOS[k].some((r) => roles.includes(r));
    }
  }
  return true;
}

/** Lanza redirect si el usuario no tiene NINGUNO de los roles requeridos. */
export function requireRoleOrRedirect(
  userRoles: string[],
  required: Rol[],
  redirectTo = "/dashboard",
): void {
  if (userRoles.includes("ADMIN")) return;
  if (required.some((r) => userRoles.includes(r))) return;
  redirect(redirectTo);
}

/** Helper booleano: tiene al menos uno. */
export function hasAnyRole(userRoles: string[], required: Rol[]): boolean {
  if (userRoles.includes("ADMIN")) return true;
  return required.some((r) => userRoles.includes(r));
}
