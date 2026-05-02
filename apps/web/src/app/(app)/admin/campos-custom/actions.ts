"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo-fixtures";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

export type CampoCustom = {
  id: number;
  entidad: string;
  codigo: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "fecha" | "booleano" | "seleccion" | "texto_largo";
  opciones: string[] | null;
  requerido: boolean;
  orden: number;
  activo: boolean;
  ayuda: string | null;
};

export type CrearCampoState = { error?: string; ok?: boolean };

const COOKIE_KEY = "bcd_demo_campos_custom";

function loadDemo(): CampoCustom[] {
  const raw = cookies().get(COOKIE_KEY)?.value;
  if (!raw) {
    // Semilla de ejemplo
    return [
      {
        id: 1,
        entidad: "funcionario",
        codigo: "talla_uniforme",
        etiqueta: "Talla de uniforme",
        tipo: "seleccion",
        opciones: ["XS", "S", "M", "L", "XL", "XXL"],
        requerido: false,
        orden: 1,
        activo: true,
        ayuda: "Talla del uniforme operativo asignado",
      },
      {
        id: 2,
        entidad: "funcionario",
        codigo: "alergias",
        etiqueta: "Alergias conocidas",
        tipo: "texto_largo",
        opciones: null,
        requerido: false,
        orden: 2,
        activo: true,
        ayuda: "Alergias o restricciones médicas relevantes",
      },
      {
        id: 3,
        entidad: "reposo",
        codigo: "reincidente",
        etiqueta: "Reincidente",
        tipo: "booleano",
        opciones: null,
        requerido: false,
        orden: 1,
        activo: true,
        ayuda: "Marca si es 3er reposo del año por la misma causa",
      },
    ];
  }
  try {
    return JSON.parse(raw) as CampoCustom[];
  } catch {
    return [];
  }
}

function saveDemo(items: CampoCustom[]) {
  cookies().set(COOKIE_KEY, JSON.stringify(items), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function listarCamposCustom(): Promise<CampoCustom[]> {
  if (isDemoMode()) return loadDemo();
  const token = await requireAuth();
  return api.get<CampoCustom[]>("/admin/campos-custom", token).catch(() => []);
}

export async function crearCampoCustom(
  _prev: CrearCampoState,
  formData: FormData,
): Promise<CrearCampoState> {
  const entidad = String(formData.get("entidad") || "").trim();
  const codigo = String(formData.get("codigo") || "").trim();
  const etiqueta = String(formData.get("etiqueta") || "").trim();
  const tipo = String(formData.get("tipo") || "texto") as CampoCustom["tipo"];
  const requerido = formData.get("requerido") === "on";
  const orden = Number(formData.get("orden") || "0");
  const opcionesRaw = String(formData.get("opciones") || "").trim();
  const ayuda = String(formData.get("ayuda") || "").trim() || null;

  if (!entidad || !codigo || !etiqueta) {
    return { error: "Entidad, código y etiqueta son obligatorios" };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(codigo)) {
    return { error: "Código solo puede contener minúsculas, números y _ (debe empezar con letra)" };
  }

  const opciones = tipo === "seleccion"
    ? opcionesRaw.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean)
    : null;

  if (tipo === "seleccion" && (!opciones || opciones.length === 0)) {
    return { error: "Para tipo selección debes ingresar al menos una opción" };
  }

  if (isDemoMode()) {
    const items = loadDemo();
    if (items.some((i) => i.entidad === entidad && i.codigo === codigo)) {
      return { error: `Ya existe un campo "${codigo}" para ${entidad}` };
    }
    const nuevo: CampoCustom = {
      id: (items.at(-1)?.id ?? 0) + 1,
      entidad,
      codigo,
      etiqueta,
      tipo,
      opciones,
      requerido,
      orden,
      activo: true,
      ayuda,
    };
    saveDemo([...items, nuevo]);
    revalidatePath("/admin/campos-custom");
    return { ok: true };
  }

  const token = await requireAuth();
  try {
    await api.post("/admin/campos-custom", {
      entidad,
      codigo,
      etiqueta,
      tipo,
      opciones,
      requerido,
      orden,
      ayuda_descripcion: ayuda,
    }, token);
    revalidatePath("/admin/campos-custom");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al crear campo" };
  }
}
