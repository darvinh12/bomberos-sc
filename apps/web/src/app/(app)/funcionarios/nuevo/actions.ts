"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";

/**
 * Payload tal como lo emite el cliente. Las claves coinciden 1:1 con
 * el schema FuncionarioCreate de la API. Los campos numéricos pueden
 * venir como string ("12345") y los selects como "" para indicar null.
 *
 * El domicilio NO va aquí: se gestiona aparte en /funcionarios/{id}/direcciones.
 */
export interface NuevoFuncionarioPayload {
  // Identidad
  nacionalidad: string;
  cedula: string | number;
  rif?: string;
  apellidos: string;
  nombres: string;
  fecha_nacimiento?: string;
  sexo?: string;
  estado_civil_id?: string | number;
  grupo_sanguineo_id?: string | number;
  factor_sanguineo?: string;
  lugar_nacimiento?: string;
  pais_nacimiento?: string;

  // Identidad - nacionalización
  tipo_nacionalizacion?: string;
  tipo_nacionalizacion_id?: string | number;
  fecha_nacionalizacion?: string;
  numero_gaceta_nacionalizacion?: string;
  pais_origen?: string;
  pais_origen_id?: string | number;
  pais_nacimiento_id?: string | number;
  idiomas?: string;
  idiomas_ids?: number[];

  // Empleo
  tipo_personal?: string;
  numero_empleado?: string;
  numero_equipo?: string;
  fecha_primer_ingreso: string;
  promocion?: string;
  condicion_id?: string | number;
  jerarquia_id?: string | number;
  cargo_id?: string | number;
  pre_jubilado?: boolean;
  es_voluntario?: boolean;
  institucion_formadora_id?: string | number;
  licencia_conducir?: string;
  licencia_conducir_id?: string | number;
  fecha_egreso?: string;
  fecha_reintegro?: string;
  fecha_este?: string;
  fecha_ingreso_gdf?: string;

  // Ubicación
  zona_id?: string | number;
  estacion_id?: string | number;
  area_id?: string | number;
  dependencia_id?: string | number;
  division_id?: string | number;
  seccion?: string;
  seccion_id?: string | number;
  horario?: string;

  // Contacto
  telefono_habitacion?: string;
  telefono_movil?: string;
  telefono_otros?: string;
  correo?: string;
  persona_contacto?: string;
  telefono_contacto?: string;
  parentesco_contacto?: string;
  parentesco_contacto_id?: string | number;

  // Educación
  nivel_educativo_id?: string | number;
  profesion?: string;
  especialidad_id?: string | number;

  // Observaciones
  observaciones?: string;
}

export type CrearFuncionarioResult =
  | { ok: true; id: number }
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

const CAMPOS_ARRAY_ID = new Set(["idiomas_ids"]);

const CAMPOS_BOOL = new Set([
  "pre_jubilado",
  "es_voluntario",
  // Legacy (no llegan desde el form pero los toleramos por si vienen
  // de otro flujo o de un import histórico).
  "iutb",
  "egresado_unes",
]);

/**
 * Crea un funcionario y, si llega `foto`, sube la imagen al endpoint
 * `/funcionarios/{id}/foto`. La foto se intenta subir aún si falla;
 * un error en la foto NO revierte la creación pero se reporta.
 */
export async function crearFuncionario(
  raw: NuevoFuncionarioPayload,
  foto: FormData | null,
): Promise<CrearFuncionarioResult> {
  const token = await requireAuth();

  // Validaciones cliente-server simétricas (defensa en profundidad)
  const cedulaNum =
    typeof raw.cedula === "string" ? Number(raw.cedula) : raw.cedula;
  if (!cedulaNum || !Number.isFinite(cedulaNum) || cedulaNum < 1) {
    return { ok: false, error: "La cédula es obligatoria y debe ser un número válido" };
  }
  if (!raw.apellidos?.trim() || !raw.nombres?.trim()) {
    return { ok: false, error: "Apellidos y nombres son obligatorios" };
  }
  if (!raw.fecha_primer_ingreso) {
    return { ok: false, error: "La fecha de primer ingreso es obligatoria" };
  }
  if (!/^[VE]$/.test(raw.nacionalidad)) {
    return { ok: false, error: "Nacionalidad inválida (debe ser V o E)" };
  }

  // Normaliza payload: strings vacías → null, IDs → number, etc.
  const payload: Record<string, unknown> = {
    nacionalidad: raw.nacionalidad.toUpperCase(),
    cedula: cedulaNum,
    apellidos: raw.apellidos.trim(),
    nombres: raw.nombres.trim(),
    fecha_primer_ingreso: raw.fecha_primer_ingreso,
  };

  // Idiomas (multi-select) — se manda aparte vía /funcionarios/{id}/idiomas
  // tras crear, NO va en el payload de Create.
  let idiomasIds: number[] = Array.isArray(raw.idiomas_ids) ? raw.idiomas_ids : [];

  for (const [k, v] of Object.entries(raw)) {
    if (k in payload) continue; // ya seteado arriba
    if (k === "idiomas_ids") continue; // se procesa aparte
    if (v === undefined || v === null) continue;

    if (CAMPOS_BOOL.has(k)) {
      payload[k] = Boolean(v);
      continue;
    }

    if (CAMPOS_ARRAY_ID.has(k)) {
      // Manejo defensivo para arrays no esperados aquí
      continue;
    }

    const s = typeof v === "string" ? v.trim() : v;
    if (s === "" || s === null) continue;

    if (CAMPOS_ID.has(k)) {
      const n = Number(s);
      if (Number.isFinite(n)) payload[k] = n;
      continue;
    }

    payload[k] = s;
  }

  let created: { id: number };
  try {
    created = await api.post<{ id: number }>("/funcionarios", payload, token);
  } catch (e: unknown) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al crear" };
  }

  // Idiomas (multi-select N:M): best-effort tras crear.
  if (idiomasIds.length > 0) {
    try {
      await api.put(`/funcionarios/${created.id}/idiomas`, idiomasIds, token);
    } catch (e) {
      console.warn(`[crearFuncionario] idiomas falló id=${created.id}:`, e);
    }
  }

  // Subida opcional de foto (best-effort: no revertir si falla)
  if (foto) {
    const file = foto.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await fetch(`${BASE}/funcionarios/${created.id}/foto`, {
          method: "POST",
          body: fd,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // No bloqueamos el alta — devolvemos ok con id pero anotamos warning
          // en logs. El usuario puede reintentar desde la pantalla de edición.
          console.warn(
            `[crearFuncionario] foto upload falló para id=${created.id}: HTTP ${res.status}`,
          );
        }
      } catch (e) {
        console.warn(`[crearFuncionario] foto upload error:`, e);
      }
    }
  }

  revalidatePath("/funcionarios");
  revalidatePath(`/funcionarios/${created.id}`);
  return { ok: true, id: created.id };
}
