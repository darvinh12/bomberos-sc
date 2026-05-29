"use server";

/**
 * Acciones del Panel de Acciones del funcionario.
 *
 * Cada server-action valida los campos mínimos en el servidor (defensa en
 * profundidad), revalida la ficha del funcionario y devuelve un `Result`
 * uniforme `{ ok: true } | { ok: false; error }` para que el form cliente
 * pueda mostrar/cerrar el modal según corresponda.
 *
 * En modo demo (NEXT_PUBLIC_DEMO_MODE=1) las acciones NO llaman al backend:
 * solo validan, revalidan la ruta y simulan éxito. Esto es crítico porque
 * la demo está en producción y el backend real aún no expone todos los
 * endpoints (notablemente los "ficticios" suspender/reactivar/egresar).
 */

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { isDemoMode } from "@/lib/demo-fixtures";

export type AccionResult = { ok: true } | { ok: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────

function reqStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function reqNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function ejecutar(
  path: string,
  body: Record<string, unknown>,
  funcionarioId: number,
): Promise<AccionResult> {
  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  }
  try {
    const token = await requireAuth();
    await api.post(path, body, token);
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al procesar" };
  }
}

/**
 * Acciones "ficticias" (suspender / reactivar / egresar): no existen como
 * endpoints REST en el backend. En modo real haríamos PATCH a /funcionarios/{id}
 * cambiando estatus y dejando una entrada de auditoría.
 */
async function ejecutarPatchEstatus(
  funcionarioId: number,
  body: Record<string, unknown>,
): Promise<AccionResult> {
  if (isDemoMode()) {
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  }
  try {
    const token = await requireAuth();
    await api.patch(`/funcionarios/${funcionarioId}`, body, token);
    revalidatePath(`/funcionarios/${funcionarioId}`);
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Error al procesar" };
  }
}

// ─── 1. Iniciar reposo ────────────────────────────────────────────────────

export interface ReposoPayload {
  fecha_inicio: string;
  fecha_fin: string;
  tipo_reposo_id?: string | number;
  diagnostico_libre?: string;
  folio?: string;
  observaciones?: string;
}

export async function iniciarReposo(
  funcionarioId: number,
  raw: ReposoPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_inicio) || !reqStr(raw.fecha_fin)) {
    return { ok: false, error: "Fechas de inicio y fin son obligatorias" };
  }
  if (raw.fecha_fin < raw.fecha_inicio) {
    return { ok: false, error: "La fecha fin no puede ser anterior a la fecha inicio" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    fecha_inicio: raw.fecha_inicio,
    fecha_fin: raw.fecha_fin,
  };
  const tipoId = reqNum(raw.tipo_reposo_id);
  if (tipoId) payload.tipo_reposo_id = tipoId;
  if (reqStr(raw.diagnostico_libre)) payload.diagnostico_libre = raw.diagnostico_libre!.trim();
  if (reqStr(raw.folio)) payload.folio = raw.folio!.trim();
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/salud/reposos", payload, funcionarioId);
}

// ─── 2. Iniciar vacaciones ────────────────────────────────────────────────

export interface VacacionesPayload {
  periodo_anio: string | number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_calendario?: string | number;
  dias_habiles?: string | number;
  observaciones?: string;
}

export async function iniciarVacaciones(
  funcionarioId: number,
  raw: VacacionesPayload,
): Promise<AccionResult> {
  const periodo = reqNum(raw.periodo_anio);
  if (!periodo || periodo < 2000 || periodo > 2100) {
    return { ok: false, error: "Período (año) inválido" };
  }
  if (!reqStr(raw.fecha_inicio) || !reqStr(raw.fecha_fin)) {
    return { ok: false, error: "Fechas de inicio y fin son obligatorias" };
  }
  if (raw.fecha_fin < raw.fecha_inicio) {
    return { ok: false, error: "La fecha fin no puede ser anterior a la fecha inicio" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    periodo_anio: periodo,
    fecha_inicio: raw.fecha_inicio,
    fecha_fin: raw.fecha_fin,
  };
  const dc = reqNum(raw.dias_calendario);
  if (dc !== null) payload.dias_calendario = dc;
  const dh = reqNum(raw.dias_habiles);
  if (dh !== null) payload.dias_habiles = dh;
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/ops/vacaciones", payload, funcionarioId);
}

// ─── 3. Iniciar permiso ───────────────────────────────────────────────────

const TIPOS_PERMISO = [
  "PATERNIDAD",
  "MATERNIDAD",
  "DUELO",
  "DEPORTIVO",
  "NO_REMUNERADO",
  "ESTUDIO",
  "OTRO",
];

export interface PermisoPayload {
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  horas?: string | number;
  motivo: string;
  observaciones?: string;
}

export async function iniciarPermiso(
  funcionarioId: number,
  raw: PermisoPayload,
): Promise<AccionResult> {
  if (!TIPOS_PERMISO.includes(raw.tipo)) {
    return { ok: false, error: "Tipo de permiso inválido" };
  }
  if (!reqStr(raw.fecha_inicio) || !reqStr(raw.fecha_fin)) {
    return { ok: false, error: "Fechas de inicio y fin son obligatorias" };
  }
  if (raw.fecha_fin < raw.fecha_inicio) {
    return { ok: false, error: "La fecha fin no puede ser anterior a la fecha inicio" };
  }
  if (!reqStr(raw.motivo)) {
    return { ok: false, error: "El motivo es obligatorio" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    tipo: raw.tipo,
    fecha_inicio: raw.fecha_inicio,
    fecha_fin: raw.fecha_fin,
    motivo: raw.motivo.trim(),
  };
  const horas = reqNum(raw.horas);
  if (horas !== null) payload.horas = horas;
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/ops/permisos", payload, funcionarioId);
}

// ─── 4. Asignar a comisión ────────────────────────────────────────────────

export interface ComisionPayload {
  institucion_libre: string;
  cargo_comision?: string;
  fecha_inicio: string;
  fecha_fin?: string;
  resolucion?: string;
  motivo?: string;
}

export async function asignarComision(
  funcionarioId: number,
  raw: ComisionPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.institucion_libre)) {
    return { ok: false, error: "La institución es obligatoria" };
  }
  if (!reqStr(raw.fecha_inicio)) {
    return { ok: false, error: "La fecha de inicio es obligatoria" };
  }
  if (raw.fecha_fin && raw.fecha_fin < raw.fecha_inicio) {
    return { ok: false, error: "La fecha fin no puede ser anterior a la fecha inicio" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    institucion_libre: raw.institucion_libre.trim(),
    fecha_inicio: raw.fecha_inicio,
  };
  if (reqStr(raw.cargo_comision)) payload.cargo_comision = raw.cargo_comision!.trim();
  if (raw.fecha_fin) payload.fecha_fin = raw.fecha_fin;
  if (reqStr(raw.resolucion)) payload.resolucion = raw.resolucion!.trim();
  if (reqStr(raw.motivo)) payload.motivo = raw.motivo!.trim();
  return ejecutar("/ops/comisiones", payload, funcionarioId);
}

// ─── 5. Registrar falta / Sancionar ───────────────────────────────────────

const TIPOS_FALTA = ["LEVE", "MEDIA", "GRAVE"];

export interface FaltaPayload {
  tipo_falta: string;
  fecha: string;
  descripcion: string;
  sancion?: string;
  dias_suspension?: string | number;
}

export async function registrarFalta(
  funcionarioId: number,
  raw: FaltaPayload,
): Promise<AccionResult> {
  if (!TIPOS_FALTA.includes(raw.tipo_falta)) {
    return { ok: false, error: "Tipo de falta inválido" };
  }
  if (!reqStr(raw.fecha)) {
    return { ok: false, error: "La fecha es obligatoria" };
  }
  if (!reqStr(raw.descripcion)) {
    return { ok: false, error: "La descripción es obligatoria" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    tipo_falta: raw.tipo_falta,
    fecha: raw.fecha,
    descripcion: raw.descripcion.trim(),
  };
  if (reqStr(raw.sancion)) payload.sancion = raw.sancion!.trim();
  const dias = reqNum(raw.dias_suspension);
  if (dias !== null && dias > 0) payload.dias_suspension = dias;
  return ejecutar("/ops/faltas", payload, funcionarioId);
}

// ─── 6. Suspender ─────────────────────────────────────────────────────────

export interface SuspenderPayload {
  fecha_inicio: string;
  fecha_fin?: string;
  motivo: string;
  resolucion?: string;
}

export async function suspender(
  funcionarioId: number,
  raw: SuspenderPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_inicio)) {
    return { ok: false, error: "La fecha de inicio es obligatoria" };
  }
  if (raw.fecha_fin && raw.fecha_fin < raw.fecha_inicio) {
    return { ok: false, error: "La fecha fin no puede ser anterior a la fecha inicio" };
  }
  if (!reqStr(raw.motivo)) {
    return { ok: false, error: "El motivo es obligatorio" };
  }
  const body: Record<string, unknown> = {
    estatus: "SUSPENDIDO",
    suspension_fecha_inicio: raw.fecha_inicio,
    suspension_motivo: raw.motivo.trim(),
  };
  if (raw.fecha_fin) body.suspension_fecha_fin = raw.fecha_fin;
  if (reqStr(raw.resolucion)) body.suspension_resolucion = raw.resolucion!.trim();
  return ejecutarPatchEstatus(funcionarioId, body);
}

// ─── 7. Reactivar ─────────────────────────────────────────────────────────

export interface ReactivarPayload {
  fecha_efectiva: string;
  motivo?: string;
  observaciones?: string;
}

export async function reactivar(
  funcionarioId: number,
  raw: ReactivarPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_efectiva)) {
    return { ok: false, error: "La fecha efectiva es obligatoria" };
  }
  const body: Record<string, unknown> = {
    estatus: "ACTIVO",
    reactivacion_fecha: raw.fecha_efectiva,
  };
  if (reqStr(raw.motivo)) body.reactivacion_motivo = raw.motivo!.trim();
  if (reqStr(raw.observaciones)) body.reactivacion_observaciones = raw.observaciones!.trim();
  return ejecutarPatchEstatus(funcionarioId, body);
}

// ─── 8. Ascender (histórico jerarquías) ───────────────────────────────────

const TIPOS_DOC = ["DECRETO", "RESOLUCION", "OFICIO", "ORDEN_GENERAL"];

export interface AscenderPayload {
  fecha: string;
  jerarquia_id: string | number;
  tipo_documento?: string;
  numero_documento?: string;
  fecha_efectiva_nomina?: string;
  observaciones?: string;
}

export async function ascender(
  funcionarioId: number,
  raw: AscenderPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha)) {
    return { ok: false, error: "La fecha es obligatoria" };
  }
  const jer = reqNum(raw.jerarquia_id);
  if (!jer) return { ok: false, error: "Seleccione una jerarquía" };
  if (raw.tipo_documento && !TIPOS_DOC.includes(raw.tipo_documento)) {
    return { ok: false, error: "Tipo de documento inválido" };
  }
  const payload: Record<string, unknown> = {
    fecha: raw.fecha,
    jerarquia_id: jer,
  };
  if (raw.tipo_documento) payload.tipo_documento = raw.tipo_documento;
  if (reqStr(raw.numero_documento)) payload.numero_documento = raw.numero_documento!.trim();
  if (raw.fecha_efectiva_nomina) payload.fecha_efectiva_nomina = raw.fecha_efectiva_nomina;
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar(`/funcionarios/${funcionarioId}/historico-jerarquias`, payload, funcionarioId);
}

// ─── 9. Trasladar (histórico ubicaciones) ─────────────────────────────────

export interface TrasladarPayload {
  fecha_desde: string;
  cod_zona: string | number;
  cod_estacion: string | number;
  cod_division?: string | number;
  cod_area?: string | number;
  seccion?: string;
  horario?: string;
  agrupacion?: string;
}

export async function trasladar(
  funcionarioId: number,
  raw: TrasladarPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_desde)) {
    return { ok: false, error: "La fecha desde es obligatoria" };
  }
  const zona = reqNum(raw.cod_zona);
  const estacion = reqNum(raw.cod_estacion);
  if (!zona) return { ok: false, error: "Seleccione la zona" };
  if (!estacion) return { ok: false, error: "Seleccione la estación" };
  const payload: Record<string, unknown> = {
    fecha_desde: raw.fecha_desde,
    cod_zona: zona,
    cod_estacion: estacion,
  };
  const div = reqNum(raw.cod_division);
  if (div) payload.cod_division = div;
  const area = reqNum(raw.cod_area);
  if (area) payload.cod_area = area;
  if (reqStr(raw.seccion)) payload.seccion = raw.seccion!.trim();
  if (reqStr(raw.horario)) payload.horario = raw.horario!.trim();
  if (reqStr(raw.agrupacion)) payload.agrupacion = raw.agrupacion!.trim();
  return ejecutar(`/funcionarios/${funcionarioId}/historico-ubicaciones`, payload, funcionarioId);
}

// ─── 10. Asignar protección ───────────────────────────────────────────────

const ESTADOS_ENTREGA = ["NUEVO", "USADO", "REPARADO"];

export interface ProteccionPayload {
  inventario_id: string | number;
  fecha_entrega: string;
  estado_entrega?: string;
  observaciones?: string;
}

export async function asignarProteccion(
  funcionarioId: number,
  raw: ProteccionPayload,
): Promise<AccionResult> {
  const inv = reqNum(raw.inventario_id);
  if (!inv) return { ok: false, error: "Seleccione el ítem de inventario" };
  if (!reqStr(raw.fecha_entrega)) {
    return { ok: false, error: "La fecha de entrega es obligatoria" };
  }
  if (raw.estado_entrega && !ESTADOS_ENTREGA.includes(raw.estado_entrega)) {
    return { ok: false, error: "Estado de entrega inválido" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    inventario_id: inv,
    fecha_entrega: raw.fecha_entrega,
  };
  if (raw.estado_entrega) payload.estado_entrega = raw.estado_entrega;
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/equipo/proteccion/asignaciones", payload, funcionarioId);
}

// ─── 11. Asignar radio ────────────────────────────────────────────────────

export interface RadioPayload {
  radio_id: string | number;
  fecha_asignacion: string;
  observaciones?: string;
}

export async function asignarRadioFuncionario(
  funcionarioId: number,
  raw: RadioPayload,
): Promise<AccionResult> {
  const rid = reqNum(raw.radio_id);
  if (!rid) return { ok: false, error: "Seleccione el radio" };
  if (!reqStr(raw.fecha_asignacion)) {
    return { ok: false, error: "La fecha de asignación es obligatoria" };
  }
  const payload: Record<string, unknown> = {
    radio_id: rid,
    funcionario_id: funcionarioId,
    fecha_asignacion: raw.fecha_asignacion,
  };
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/equipo/radios/asignaciones", payload, funcionarioId);
}

// ─── 12. Solicitar jubilación (pre-jubilar) ───────────────────────────────

const TIPOS_JUB = ["ORDINARIA", "ESPECIAL", "INVALIDEZ"];

export interface PreJubilarPayload {
  fecha_solicitud: string;
  tipo_jubilacion?: string;
  anios_servicio?: string | number;
  base_legal?: string;
  observaciones?: string;
}

export async function solicitarJubilacion(
  funcionarioId: number,
  raw: PreJubilarPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_solicitud)) {
    return { ok: false, error: "La fecha de solicitud es obligatoria" };
  }
  if (raw.tipo_jubilacion && !TIPOS_JUB.includes(raw.tipo_jubilacion)) {
    return { ok: false, error: "Tipo de jubilación inválido" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    fecha_solicitud: raw.fecha_solicitud,
  };
  if (raw.tipo_jubilacion) payload.tipo_jubilacion = raw.tipo_jubilacion;
  const anios = reqNum(raw.anios_servicio);
  if (anios !== null && anios >= 0) payload.anios_servicio = anios;
  if (reqStr(raw.base_legal)) payload.base_legal = raw.base_legal!.trim();
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/egresos/solicitudes-jubilacion", payload, funcionarioId);
}

// ─── 13. Jubilar ──────────────────────────────────────────────────────────

const MONEDAS = ["VES", "USD"];

export interface JubilarPayload {
  fecha_jubilacion: string;
  tipo_jubilacion?: string;
  numero_resolucion: string;
  pension_mensual?: string | number;
  moneda?: string;
  numero_gaceta?: string;
  observaciones?: string;
}

export async function jubilar(
  funcionarioId: number,
  raw: JubilarPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_jubilacion)) {
    return { ok: false, error: "La fecha de jubilación es obligatoria" };
  }
  if (!reqStr(raw.numero_resolucion)) {
    return { ok: false, error: "El número de resolución es obligatorio" };
  }
  if (raw.tipo_jubilacion && !TIPOS_JUB.includes(raw.tipo_jubilacion)) {
    return { ok: false, error: "Tipo de jubilación inválido" };
  }
  if (raw.moneda && !MONEDAS.includes(raw.moneda)) {
    return { ok: false, error: "Moneda inválida" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    fecha_jubilacion: raw.fecha_jubilacion,
    numero_resolucion: raw.numero_resolucion.trim(),
  };
  if (raw.tipo_jubilacion) payload.tipo_jubilacion = raw.tipo_jubilacion;
  const pension = reqNum(raw.pension_mensual);
  if (pension !== null && pension >= 0) payload.pension_mensual = pension;
  payload.moneda = raw.moneda || "VES";
  if (reqStr(raw.numero_gaceta)) payload.numero_gaceta = raw.numero_gaceta!.trim();
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/egresos/jubilados", payload, funcionarioId);
}

// ─── 14. Registrar fallecimiento ──────────────────────────────────────────

export interface FallecimientoPayload {
  fecha_fallecimiento: string;
  causa?: string;
  lugar?: string;
  numero_certificado_defuncion?: string;
  observaciones?: string;
}

export async function registrarFallecimiento(
  funcionarioId: number,
  raw: FallecimientoPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_fallecimiento)) {
    return { ok: false, error: "La fecha de fallecimiento es obligatoria" };
  }
  const payload: Record<string, unknown> = {
    funcionario_id: funcionarioId,
    fecha_fallecimiento: raw.fecha_fallecimiento,
  };
  if (reqStr(raw.causa)) payload.causa = raw.causa!.trim();
  if (reqStr(raw.lugar)) payload.lugar = raw.lugar!.trim();
  if (reqStr(raw.numero_certificado_defuncion)) {
    payload.numero_certificado_defuncion = raw.numero_certificado_defuncion!.trim();
  }
  if (reqStr(raw.observaciones)) payload.observaciones = raw.observaciones!.trim();
  return ejecutar("/egresos/fallecimientos", payload, funcionarioId);
}

// ─── 15. Egresar (baja administrativa) ────────────────────────────────────

const MOTIVOS_EGRESO = ["RENUNCIA", "DESTITUCION", "ABANDONO_TRABAJO", "OTRO"];

export interface EgresarPayload {
  fecha_egreso: string;
  motivo: string;
  base_legal?: string;
  observaciones?: string;
}

export async function egresar(
  funcionarioId: number,
  raw: EgresarPayload,
): Promise<AccionResult> {
  if (!reqStr(raw.fecha_egreso)) {
    return { ok: false, error: "La fecha de egreso es obligatoria" };
  }
  if (!MOTIVOS_EGRESO.includes(raw.motivo)) {
    return { ok: false, error: "Motivo de egreso inválido" };
  }
  const body: Record<string, unknown> = {
    estatus: "EGRESADO",
    egreso_fecha: raw.fecha_egreso,
    egreso_motivo: raw.motivo,
  };
  if (reqStr(raw.base_legal)) body.egreso_base_legal = raw.base_legal!.trim();
  if (reqStr(raw.observaciones)) body.egreso_observaciones = raw.observaciones!.trim();
  return ejecutarPatchEstatus(funcionarioId, body);
}
