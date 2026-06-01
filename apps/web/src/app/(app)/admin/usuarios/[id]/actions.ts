"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type UsuarioDetalle = {
  id: number;
  usuario: string;
  nombre_completo: string;
  correo: string | null;
  funcionario_id: number | null;
  activo: boolean;
  bloqueado: boolean;
  motivo_bloqueo: string | null;
  intentos_fallidos: number;
  debe_cambiar_password: boolean;
  mfa_activo: boolean;
  ultimo_acceso: string | null;
  roles: string[];
};

const ROLES_COOKIE = "bcd_demo_user_roles";

function readDemoRoles(): Record<number, string[]> {
  const raw = cookies().get(ROLES_COOKIE)?.value;
  if (!raw) {
    return { 1: ["ADMIN"], 2: ["RRHH"], 3: ["SUPERVISOR"] };
  }
  try {
    return JSON.parse(raw) as Record<number, string[]>;
  } catch {
    return {};
  }
}

function writeDemoRoles(map: Record<number, string[]>) {
  cookies().set(ROLES_COOKIE, JSON.stringify(map), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function cargarUsuarioConRoles(id: number): Promise<UsuarioDetalle> {
  const token = await requireAuth();
  const page = await api.get<{ items: UsuarioDetalle[] }>(
    `/admin/usuarios?page=1&page_size=200`,
    token,
  );
  const u = page.items.find((x) => x.id === id);
  if (!u) throw Object.assign(new Error("not found"), { status: 404 });

  if (isDemoMode()) {
    const roles = readDemoRoles();
    return { ...u, roles: roles[id] ?? [] };
  }
  // Real backend: cuando agreguemos endpoint /admin/usuarios/{id} con roles incluidos
  // por ahora: hacer un fetch separado a /admin/usuarios/{id}/roles
  try {
    const rolesData = await api.get<{ codigo: string }[]>(
      `/admin/usuarios/${id}/roles`,
      token,
    );
    return { ...u, roles: rolesData.map((r) => r.codigo) };
  } catch {
    return { ...u, roles: [] };
  }
}

export async function toggleRol(
  usuarioId: number,
  rolCodigo: string,
  asignar: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const map = readDemoRoles();
    const actuales = new Set(map[usuarioId] ?? []);
    if (asignar) actuales.add(rolCodigo);
    else actuales.delete(rolCodigo);
    map[usuarioId] = Array.from(actuales);
    writeDemoRoles(map);
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    revalidatePath("/admin/usuarios");
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    if (asignar) {
      await api.post(`/admin/usuarios/${usuarioId}/roles/${rolCodigo}`, undefined, token);
    } else {
      await api.del(`/admin/usuarios/${usuarioId}/roles/${rolCodigo}`, token);
    }
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export type EstadoUsuarioState = { error?: string; ok?: boolean };

export async function actualizarEstadoUsuario(
  usuarioId: number,
  _prev: EstadoUsuarioState,
  formData: FormData,
): Promise<EstadoUsuarioState> {
  const payload = {
    activo: formData.get("activo") === "on",
    bloqueado: formData.get("bloqueado") === "on",
  };
  if (isDemoMode()) {
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/usuarios/${usuarioId}`, payload, token);
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" };
  }
}

// ─────────────────────────────────────────────────────────────
// Acciones inline del admin sobre una cuenta de usuario
// ─────────────────────────────────────────────────────────────

export type ResultadoAccion = { ok: boolean; error?: string };

export async function actualizarCorreo(
  usuarioId: number,
  correo: string | null,
): Promise<ResultadoAccion> {
  const valor = (correo ?? "").trim() || null;
  if (valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
    return { ok: false, error: "Correo inválido" };
  }
  if (isDemoMode()) {
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/usuarios/${usuarioId}`, { correo: valor }, token);
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function resetearPassword(
  usuarioId: number,
  nuevoPassword: string,
  forzarCambio: boolean,
): Promise<ResultadoAccion> {
  if (!nuevoPassword || nuevoPassword.length < 10) {
    return { ok: false, error: "Mínimo 10 caracteres" };
  }
  const checks: Array<[RegExp, string]> = [
    [/[A-Z]/, "Falta mayúscula"],
    [/[a-z]/, "Falta minúscula"],
    [/\d/, "Falta dígito"],
    [/[^A-Za-z0-9]/, "Falta carácter especial"],
  ];
  for (const [regex, msg] of checks) {
    if (!regex.test(nuevoPassword)) return { ok: false, error: msg };
  }
  if (isDemoMode()) {
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.post(
      `/admin/usuarios/${usuarioId}/password`,
      { password: nuevoPassword, debe_cambiar_password: forzarCambio },
      token,
    );
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function toggleActivo(
  usuarioId: number,
  activo: boolean,
): Promise<ResultadoAccion> {
  if (isDemoMode()) {
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/usuarios/${usuarioId}`, { activo }, token);
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function toggleBloqueado(
  usuarioId: number,
  bloqueado: boolean,
  motivo: string | null,
): Promise<ResultadoAccion> {
  if (bloqueado && !(motivo ?? "").trim()) {
    return { ok: false, error: "El motivo es obligatorio al bloquear" };
  }
  const payload: Record<string, unknown> = {
    bloqueado,
    motivo_bloqueo: bloqueado ? motivo : null,
  };
  if (!bloqueado) payload.intentos_fallidos = 0;
  if (isDemoMode()) {
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  }
  const token = await requireAuth();
  try {
    await api.patch(`/admin/usuarios/${usuarioId}`, payload, token);
    revalidatePath(`/admin/usuarios/${usuarioId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
