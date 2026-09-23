"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

/**
 * Payload de actualización: cualquier subset de los campos del schema
 * FuncionarioUpdate. Las strings vacías se interpretan como "borrar"
 * (null) para campos opcionales; los IDs vacíos también van como null.
 *
 * El domicilio NO va aquí: se edita aparte vía /funcionarios/{id}/direcciones.
 */
export interface EditarFuncionarioPayload {
  // Identidad
  nacionalidad?: string;
  cedula?: string | number;
  rif?: string | null;
  apellidos?: string;
  nombres?: string;
  fecha_nacimiento?: string | null;
  sexo?: string | null;
  estado_civil_id?: string | number | null;
  grupo_sanguineo_id?: string | number | null;
  factor_sanguineo?: string | null;
  lugar_nacimiento?: string | null;
  pais_nacimiento?: string | null;

  // Identidad - nacionalización
  tipo_nacionalizacion?: string | null;
  tipo_nacionalizacion_id?: string | number | null;
  fecha_nacionalizacion?: string | null;
  numero_gaceta_nacionalizacion?: string | null;
  pais_origen?: string | null;
  pais_origen_id?: string | number | null;
  pais_nacimiento_id?: string | number | null;
  idiomas?: string | null;
  idiomas_ids?: number[];

  // Empleo
  tipo_personal?: string | null;
  numero_empleado?: string | null;
  numero_equipo?: string | null;
  fecha_primer_ingreso?: string | null;
  promocion?: string | null;
  estatus?: string | null;
  condicion_id?: string | number | null;
  jerarquia_id?: string | number | null;
  cargo_id?: string | number | null;
  pre_jubilado?: boolean;
  es_voluntario?: boolean;
  institucion_formadora_id?: string | number | null;
  licencia_conducir?: string | null;
  licencia_conducir_id?: string | number | null;
  fecha_egreso?: string | null;
  fecha_reintegro?: string | null;
  fecha_este?: string | null;
  fecha_ingreso_gdf?: string | null;

  // Ubicación
  zona_id?: string | number | null;
  estacion_id?: string | number | null;
  area_id?: string | number | null;
  dependencia_id?: string | number | null;
  division_id?: string | number | null;
  seccion?: string | null;
  seccion_id?: string | number | null;
  horario?: string | null;

  // Contacto
  telefono_habitacion?: string | null;
  telefono_movil?: string | null;
  telefono_otros?: string | null;
  correo?: string | null;
  persona_contacto?: string | null;
  telefono_contacto?: string | null;
  parentesco_contacto?: string | null;
  parentesco_contacto_id?: string | number | null;

  // Educación
  nivel_educativo_id?: string | number | null;
  profesion?: string | null;
  especialidad_id?: string | number | null;

  // Observaciones
  observaciones?: string | null;

  // Campos personalizados (metadata.*)
  metadata?: Record<string, unknown>;
}

export type EditarFuncionarioResult =
  | { ok: true }
  | { ok: false; error: string };

const CAMPOS_ID = new Set([
  "estado_civil_id",
  "grupo_sanguineo_id",
  "condicion_id",
  "jerarquia_id",
  "cargo_id",
  "zona_id",
  "estacion_id",
  "area_id",
  "dependencia_id",
  "division_id",
  "nivel_educativo_id",
  "especialidad_id",
  "institucion_formadora_id",
  // Mini-sprint
  "parentesco_contacto_id",
  "licencia_conducir_id",
  "tipo_nacionalizacion_id",
  "pais_origen_id",
  "pais_nacimiento_id",
  "seccion_id",
]);

const CAMPOS_ARRAY_IGNORADOS = new Set(["idiomas_ids"]);

const CAMPOS_BOOL = new Set([
  "pre_jubilado",
  "es_voluntario",
  "iutb",
  "egresado_unes",
]);

const CAMPOS_TEXTO_REQUERIDOS = new Set(["apellidos", "nombres", "nacionalidad"]);

// Campos que no se pueden editar después de creado (identidad inmutable).
const CAMPOS_INMUTABLES = new Set(["nacionalidad", "cedula"]);

function normalizar(payload: EditarFuncionarioPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(payload)) {
    if (k === "metadata") {
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0) {
        out.metadata = v;
      }
      continue;
    }
    if (CAMPOS_ARRAY_IGNORADOS.has(k)) continue; // se manda por endpoint aparte
    if (CAMPOS_INMUTABLES.has(k)) continue;
    if (v === undefined) continue;

    if (CAMPOS_BOOL.has(k)) {
      out[k] = Boolean(v);
      continue;
    }

    const s = typeof v === "string" ? v.trim() : v;

    if (CAMPOS_ID.has(k)) {
      if (s === "" || s === null) {
        out[k] = null;
      } else {
        const n = Number(s);
        out[k] = Number.isFinite(n) ? n : null;
      }
      continue;
    }

    if (k === "cedula") {
      if (s === "" || s === null) continue; // no permitimos limpiar cédula
      const n = typeof s === "number" ? s : Number(s);
      if (Number.isFinite(n)) out.cedula = n;
      continue;
    }

    // Strings normales: "" → null (excepto campos requeridos)
    if (s === "" || s === null) {
      if (CAMPOS_TEXTO_REQUERIDOS.has(k)) continue;
      out[k] = null;
    } else {
      out[k] = s;
    }
  }

  return out;
}

export async function actualizarFuncionario(
  id: number,
  payload: EditarFuncionarioPayload,
  foto: FormData | null,
): Promise<EditarFuncionarioResult> {
  const token = await requireAuth();
  const body = normalizar(payload);
  const idiomasIds: number[] | undefined = Array.isArray(payload.idiomas_ids)
    ? payload.idiomas_ids
    : undefined;

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${id}`);
    revalidatePath("/funcionarios");
    return { ok: true };
  }

  try {
    await api.patch(`/funcionarios/${id}`, body, token);
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al actualizar",
    };
  }

  // Idiomas (N:M): solo si vinieron en el payload (undefined ≠ borrar)
  if (idiomasIds !== undefined) {
    try {
      await api.put(`/funcionarios/${id}/idiomas`, idiomasIds, token);
    } catch (e) {
      console.warn(`[actualizarFuncionario] idiomas falló id=${id}:`, e);
    }
  }

  // Foto: best-effort
  if (foto) {
    const file = foto.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        const BASE = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await fetch(`${BASE}/funcionarios/${id}/foto`, {
          method: "POST",
          body: fd,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.warn(
            `[actualizarFuncionario] foto upload falló id=${id}: HTTP ${res.status}`,
          );
        }
      } catch (e) {
        console.warn(`[actualizarFuncionario] foto upload error:`, e);
      }
    }
  }

  revalidatePath(`/funcionarios/${id}`);
  revalidatePath("/funcionarios");
  return { ok: true };
}
