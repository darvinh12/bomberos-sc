"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type State = { error?: string };

export async function crearGuardia(_p: State, fd: FormData): Promise<State> {
  const token = await requireAuth();
  const payload = {
    fecha: String(fd.get("fecha") || ""),
    estacion_id: Number(fd.get("estacion_id")),
    seccion: String(fd.get("seccion") || "").trim() || null,
    turno: String(fd.get("turno") || "DIURNO"),
    hora_inicio: String(fd.get("hora_inicio") || "07:00:00"),
    hora_fin: String(fd.get("hora_fin") || "19:00:00"),
    observaciones: String(fd.get("observaciones") || "").trim() || null,
  };
  if (!payload.fecha || !payload.estacion_id) {
    return { error: "Fecha y estación obligatorias" };
  }
  if (isDemoMode()) { revalidatePath("/ops/guardias"); redirect("/ops/guardias"); }
  try { await api.post("/ops/guardias", payload, token); }
  catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath("/ops/guardias"); redirect("/ops/guardias");
}

export async function asignarFuncionarioAGuardia(
  guardiaId: number,
  funcionarioId: number,
  rol: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    revalidatePath(`/ops/guardias/${guardiaId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(
      `/ops/guardias/${guardiaId}/funcionarios`,
      { funcionario_id: funcionarioId, rol_guardia: rol },
      token,
    );
    revalidatePath(`/ops/guardias/${guardiaId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function marcarAsistencia(
  guardiaId: number,
  gfId: number,
  asistio: boolean,
  motivoInasistencia: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    revalidatePath(`/ops/guardias/${guardiaId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  const params = new URLSearchParams({ asistio: String(asistio) });
  if (motivoInasistencia) params.set("motivo_inasistencia", motivoInasistencia);
  try {
    await api.patch(
      `/ops/guardias/${guardiaId}/funcionarios/${gfId}/asistencia?${params}`,
      undefined,
      token,
    );
    revalidatePath(`/ops/guardias/${guardiaId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function cerrarGuardia(
  guardiaId: number,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    revalidatePath(`/ops/guardias/${guardiaId}`);
    revalidatePath("/ops/guardias");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(`/ops/guardias/${guardiaId}/cerrar`, undefined, token);
    revalidatePath(`/ops/guardias/${guardiaId}`);
    revalidatePath("/ops/guardias");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
