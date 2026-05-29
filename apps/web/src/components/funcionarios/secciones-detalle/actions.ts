"use server";

/**
 * Server-actions para soft-delete + restaurar de las 8 entidades del
 * expediente personal del funcionario.
 *
 * Cada par (`borrar*`, `restaurar*`) habla con un endpoint de la API:
 *   DELETE   /funcionarios/{id}/<entidad>/{rid}?motivo=...
 *   POST     /funcionarios/{id}/<entidad>/{rid}/restaurar
 *
 * En modo demo simulamos éxito y solo revalidamos la ruta — el backend real
 * aún no está conectado en producción y queremos que el usuario vea el
 * registro desaparecer sin tocar nada en el servidor.
 */

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type Result = { ok: true } | { ok: false; error: string };

function validarMotivo(motivo: string): string | null {
  const t = motivo.trim();
  if (t.length < 3) return "Motivo inválido (mínimo 3 caracteres)";
  return null;
}

async function ejecutarBorrado(
  path: string,
  motivo: string,
  funcionarioId: number,
): Promise<Result> {
  const err = validarMotivo(motivo);
  if (err) return { ok: false, error: err };

  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  }
  try {
    const token = await requireAuth();
    const url = `${path}?motivo=${encodeURIComponent(motivo.trim())}`;
    await api.del(url, token);
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al eliminar",
    };
  }
}

async function ejecutarRestauracion(
  path: string,
  funcionarioId: number,
): Promise<Result> {
  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  }
  try {
    const token = await requireAuth();
    await api.post(path, undefined, token);
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al restaurar",
    };
  }
}

// ─── Carga familiar ───────────────────────────────────────────────────────

export async function borrarFamiliar(
  funcionarioId: number,
  cfId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/carga-familiar/${cfId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarFamiliar(
  funcionarioId: number,
  cfId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/carga-familiar/${cfId}/restaurar`,
    funcionarioId,
  );
}

// ─── Habilidades ──────────────────────────────────────────────────────────

export async function borrarHabilidad(
  funcionarioId: number,
  habId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/habilidades/${habId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarHabilidad(
  funcionarioId: number,
  habId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/habilidades/${habId}/restaurar`,
    funcionarioId,
  );
}

// ─── Actividades ──────────────────────────────────────────────────────────

export async function borrarActividad(
  funcionarioId: number,
  actId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/actividades/${actId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarActividad(
  funcionarioId: number,
  actId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/actividades/${actId}/restaurar`,
    funcionarioId,
  );
}

// ─── Carnets ──────────────────────────────────────────────────────────────

export async function borrarCarnet(
  funcionarioId: number,
  cnId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/carnets/${cnId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarCarnet(
  funcionarioId: number,
  cnId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/carnets/${cnId}/restaurar`,
    funcionarioId,
  );
}

// ─── Histórico jerarquías ─────────────────────────────────────────────────

export async function borrarHistoricoJerarquia(
  funcionarioId: number,
  histId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/historico-jerarquias/${histId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarHistoricoJerarquia(
  funcionarioId: number,
  histId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/historico-jerarquias/${histId}/restaurar`,
    funcionarioId,
  );
}

// ─── Histórico ubicaciones ────────────────────────────────────────────────

export async function borrarHistoricoUbicacion(
  funcionarioId: number,
  histId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/historico-ubicaciones/${histId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarHistoricoUbicacion(
  funcionarioId: number,
  histId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/historico-ubicaciones/${histId}/restaurar`,
    funcionarioId,
  );
}

// ─── Tiempo en administración pública ─────────────────────────────────────

export async function borrarTiempoAdmPublica(
  funcionarioId: number,
  tapId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/tiempo-admpublica/${tapId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarTiempoAdmPublica(
  funcionarioId: number,
  tapId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/tiempo-admpublica/${tapId}/restaurar`,
    funcionarioId,
  );
}

// ─── Direcciones ──────────────────────────────────────────────────────────

export async function borrarDireccion(
  funcionarioId: number,
  direccionId: number,
  motivo: string,
): Promise<Result> {
  return ejecutarBorrado(
    `/funcionarios/${funcionarioId}/direcciones/${direccionId}`,
    motivo,
    funcionarioId,
  );
}

export async function restaurarDireccion(
  funcionarioId: number,
  direccionId: number,
): Promise<Result> {
  return ejecutarRestauracion(
    `/funcionarios/${funcionarioId}/direcciones/${direccionId}/restaurar`,
    funcionarioId,
  );
}
