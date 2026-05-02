"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type AccionState = { error?: string; ok?: boolean };

function num(formData: FormData, k: string): number | null {
  const v = formData.get(k);
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(formData: FormData, k: string): string | null {
  const v = formData.get(k);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function callApi<T>(
  path: string,
  body: unknown,
  successPath: string,
): Promise<AccionState> {
  if (isDemoMode()) {
    revalidatePath(successPath);
    redirect(successPath);
  }
  const token = await requireAuth();
  try {
    await api.post<T>(path, body, token);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
  revalidatePath(successPath);
  redirect(successPath);
}

export async function iniciarReposo(
  funcionarioId: number,
  _prev: AccionState,
  formData: FormData,
): Promise<AccionState> {
  const tipo_reposo_id = num(formData, "tipo_reposo_id");
  const fecha_inicio = str(formData, "fecha_inicio");
  const fecha_fin = str(formData, "fecha_fin");
  const diagnostico_libre = str(formData, "diagnostico_libre");
  if (!tipo_reposo_id || !fecha_inicio || !fecha_fin) {
    return { error: "Tipo de reposo, fecha inicio y fin son obligatorios" };
  }
  return callApi(
    "/salud/reposos",
    {
      funcionario_id: funcionarioId,
      tipo_reposo_id,
      fecha_inicio,
      fecha_fin,
      diagnostico_libre,
      folio: str(formData, "folio"),
      observaciones: str(formData, "observaciones"),
    },
    `/funcionarios/${funcionarioId}`,
  );
}

export async function asignarComision(
  funcionarioId: number,
  _prev: AccionState,
  formData: FormData,
): Promise<AccionState> {
  const fecha_inicio = str(formData, "fecha_inicio");
  const institucion_libre = str(formData, "institucion_libre");
  const cargo_comision = str(formData, "cargo_comision");
  if (!fecha_inicio || !institucion_libre) {
    return { error: "Fecha inicio e institución son obligatorios" };
  }
  return callApi(
    "/ops/comisiones",
    {
      funcionario_id: funcionarioId,
      institucion_libre,
      cargo_comision,
      fecha_inicio,
      fecha_fin: str(formData, "fecha_fin"),
      resolucion: str(formData, "resolucion"),
    },
    `/funcionarios/${funcionarioId}`,
  );
}

export async function sancionar(
  funcionarioId: number,
  _prev: AccionState,
  formData: FormData,
): Promise<AccionState> {
  const tipo_falta = str(formData, "tipo_falta");
  const fecha = str(formData, "fecha");
  const descripcion = str(formData, "descripcion");
  if (!tipo_falta || !fecha || !descripcion) {
    return { error: "Tipo, fecha y descripción son obligatorios" };
  }
  return callApi(
    "/ops/faltas",
    {
      funcionario_id: funcionarioId,
      tipo_falta,
      fecha,
      descripcion,
      sancion: str(formData, "sancion"),
      dias_suspension: num(formData, "dias_suspension"),
      resolucion: str(formData, "resolucion"),
    },
    `/funcionarios/${funcionarioId}`,
  );
}

export async function preJubilar(
  funcionarioId: number,
  _prev: AccionState,
  formData: FormData,
): Promise<AccionState> {
  const fecha_solicitud = str(formData, "fecha_solicitud");
  const fecha_efectiva_propuesta = str(formData, "fecha_efectiva_propuesta");
  if (!fecha_solicitud) {
    return { error: "Fecha de solicitud es obligatoria" };
  }
  return callApi(
    "/egresos/solicitudes-jubilacion",
    {
      funcionario_id: funcionarioId,
      fecha_solicitud,
      fecha_efectiva_propuesta,
      años_servicio: num(formData, "años_servicio"),
      motivo: str(formData, "motivo"),
    },
    `/funcionarios/${funcionarioId}`,
  );
}

export async function jubilar(
  funcionarioId: number,
  _prev: AccionState,
  formData: FormData,
): Promise<AccionState> {
  const fecha_jubilacion = str(formData, "fecha_jubilacion");
  if (!fecha_jubilacion) return { error: "Fecha de jubilación obligatoria" };
  if (str(formData, "confirm_text") !== "JUBILAR") {
    return { error: 'Escribe "JUBILAR" para confirmar la acción.' };
  }
  return callApi(
    "/egresos/jubilados",
    {
      funcionario_id: funcionarioId,
      fecha_jubilacion,
      años_servicio: num(formData, "años_servicio"),
      tipo_jubilacion: str(formData, "tipo_jubilacion") ?? "ORDINARIA",
      pension_mensual: num(formData, "pension_mensual"),
      moneda: str(formData, "moneda") ?? "VES",
      resolucion: str(formData, "resolucion"),
    },
    `/funcionarios/${funcionarioId}`,
  );
}

export async function registrarFallecimiento(
  funcionarioId: number,
  _prev: AccionState,
  formData: FormData,
): Promise<AccionState> {
  const fecha_fallecimiento = str(formData, "fecha_fallecimiento");
  if (!fecha_fallecimiento) {
    return { error: "Fecha de fallecimiento obligatoria" };
  }
  if (str(formData, "confirm_text") !== "CONFIRMO") {
    return { error: 'Escribe "CONFIRMO" para registrar el fallecimiento.' };
  }
  return callApi(
    "/egresos/fallecimientos",
    {
      funcionario_id: funcionarioId,
      fecha_fallecimiento,
      en_servicio: formData.get("en_servicio") === "on",
      causa: str(formData, "causa"),
      lugar: str(formData, "lugar"),
      acta_defuncion: str(formData, "acta_defuncion"),
    },
    `/funcionarios/${funcionarioId}`,
  );
}
