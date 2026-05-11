"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type Parametro = {
  id: number;
  codigo: string;
  nombre: string;
  valor: string;
  tipo_dato: "string" | "int" | "decimal" | "boolean" | "date" | "json";
  descripcion: string | null;
  editable: boolean;
  sensible: boolean;
  grupo: string;
};

export async function listarParametros(): Promise<Parametro[]> {
  if (isDemoMode()) {
    // demo: lista de ejemplo realista
    return [
      { id: 1, codigo: "nombre_organizacion", nombre: "Nombre de la organización", valor: "Cuerpo de Bomberos del Distrito Capital", tipo_dato: "string", descripcion: "Aparece en encabezados y reportes", editable: true, sensible: false, grupo: "general" },
      { id: 2, codigo: "vacaciones_dias_continuos", nombre: "Días de vacaciones continuos", valor: "15", tipo_dato: "int", descripcion: "Días hábiles del primer bloque", editable: true, sensible: false, grupo: "vacaciones" },
      { id: 3, codigo: "reposo_dias_maximos", nombre: "Máximo días reposo IVSS", valor: "21", tipo_dato: "int", descripcion: "Antes de requerir comisión médica", editable: true, sensible: false, grupo: "salud" },
      { id: 4, codigo: "guardia_horas", nombre: "Horas por guardia", valor: "24", tipo_dato: "int", descripcion: "Duración estándar de una guardia operativa", editable: true, sensible: false, grupo: "operativo" },
      { id: 5, codigo: "sesion_timeout_min", nombre: "Timeout de sesión (min)", valor: "60", tipo_dato: "int", descripcion: "Tras inactividad se cierra sesión", editable: true, sensible: false, grupo: "seguridad" },
      { id: 6, codigo: "smtp_password", nombre: "SMTP password", valor: "secret", tipo_dato: "string", descripcion: "Para envío de correos", editable: true, sensible: true, grupo: "seguridad" },
      { id: 7, codigo: "version_schema", nombre: "Versión del schema", valor: "2.0.0", tipo_dato: "string", descripcion: "Read-only — se actualiza desde scripts SQL", editable: false, sensible: false, grupo: "sistema" },
    ];
  }
  const token = await requireAuth();
  return api.get<Parametro[]>("/admin/parametros", token);
}

export async function actualizarParametro(
  id: number,
  valor: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    // En demo el cambio es solo visual — no persistimos parámetros.
    revalidatePath("/admin/parametros");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/parametros/${id}`, { valor }, token);
    revalidatePath("/admin/parametros");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
