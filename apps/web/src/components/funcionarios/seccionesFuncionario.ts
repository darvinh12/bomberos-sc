/**
 * Definición compartida de las 6 secciones del formulario de funcionario.
 * Se utiliza tanto en el alta (NuevoForm) como en la edición (EditarForm)
 * para mantener un único orden, etiquetas e iconografía.
 *
 * El domicilio NO está en este form: vive en `personal.direcciones` (1:N)
 * y se gestiona desde la ficha de detalle del funcionario, no desde el alta
 * ni el edit del registro principal.
 */
import {
  IdCard,
  Briefcase,
  MapPin,
  Phone,
  GraduationCap,
  FileText,
  type LucideIcon,
} from "lucide-react";

export type SeccionId =
  | "identidad"
  | "empleo"
  | "ubicacion"
  | "contacto"
  | "educacion"
  | "observaciones";

export interface SeccionDef {
  id: SeccionId;
  label: string;
  icon: LucideIcon;
}

export const SECCIONES: SeccionDef[] = [
  { id: "identidad", label: "Identidad", icon: IdCard },
  { id: "empleo", label: "Empleo", icon: Briefcase },
  { id: "ubicacion", label: "Ubicación", icon: MapPin },
  { id: "contacto", label: "Contacto", icon: Phone },
  { id: "educacion", label: "Educación", icon: GraduationCap },
  { id: "observaciones", label: "Observaciones", icon: FileText },
];

/**
 * Forma completa del formulario. Las claves coinciden 1:1 con el
 * schema de Pydantic (FuncionarioCreate / FuncionarioUpdate).
 *
 * Para los selects e inputs todos los campos son string en la UI;
 * la conversión a number/bool/null la hace el server action al
 * construir el payload JSON.
 */
export interface FuncionarioFormData {
  // Identidad
  nacionalidad: string;
  cedula: string;
  rif: string;
  apellidos: string;
  nombres: string;
  fecha_nacimiento: string;
  sexo: string;
  estado_civil_id: string;
  grupo_sanguineo_id: string;
  factor_sanguineo: string;
  lugar_nacimiento: string;
  pais_nacimiento: string;

  // Identidad - nacionalización (si aplica)
  tipo_nacionalizacion: string;
  fecha_nacionalizacion: string;
  numero_gaceta_nacionalizacion: string;
  pais_origen: string;
  idiomas: string;

  // Empleo
  tipo_personal: string;
  numero_empleado: string;
  numero_equipo: string;
  fecha_primer_ingreso: string;
  promocion: string;
  estatus: string;
  condicion_id: string;
  jerarquia_id: string;
  cargo_id: string;
  pre_jubilado: boolean;
  es_voluntario: boolean;
  institucion_formadora_id: string;
  licencia_conducir: string;
  fecha_egreso: string;
  fecha_reintegro: string;
  fecha_este: string;
  fecha_ingreso_gdf: string;
  // Legacy: mantenidos solo para compatibilidad con datos existentes,
  // no se muestran en el form (reemplazados por institucion_formadora_id).
  iutb: boolean;
  egresado_unes: boolean;

  // Ubicación
  zona_id: string;
  estacion_id: string;
  area_id: string;
  dependencia_id: string;
  division_id: string;
  seccion: string;
  horario: string;

  // Contacto
  telefono_habitacion: string;
  telefono_movil: string;
  telefono_otros: string;
  correo: string;
  persona_contacto: string;
  telefono_contacto: string;
  parentesco_contacto: string;

  // Educación
  nivel_educativo_id: string;
  profesion: string;
  especialidad_id: string;

  // Observaciones
  observaciones: string;
}

export const VALORES_INICIALES: FuncionarioFormData = {
  nacionalidad: "V",
  cedula: "",
  rif: "",
  apellidos: "",
  nombres: "",
  fecha_nacimiento: "",
  sexo: "",
  estado_civil_id: "",
  grupo_sanguineo_id: "",
  factor_sanguineo: "",
  lugar_nacimiento: "",
  pais_nacimiento: "",

  tipo_nacionalizacion: "",
  fecha_nacionalizacion: "",
  numero_gaceta_nacionalizacion: "",
  pais_origen: "",
  idiomas: "",

  tipo_personal: "",
  numero_empleado: "",
  numero_equipo: "",
  fecha_primer_ingreso: "",
  promocion: "",
  estatus: "",
  condicion_id: "",
  jerarquia_id: "",
  cargo_id: "",
  pre_jubilado: false,
  es_voluntario: false,
  institucion_formadora_id: "",
  licencia_conducir: "",
  fecha_egreso: "",
  fecha_reintegro: "",
  fecha_este: "",
  fecha_ingreso_gdf: "",
  iutb: false,
  egresado_unes: false,

  zona_id: "",
  estacion_id: "",
  area_id: "",
  dependencia_id: "",
  division_id: "",
  seccion: "",
  horario: "",

  telefono_habitacion: "",
  telefono_movil: "",
  telefono_otros: "",
  correo: "",
  persona_contacto: "",
  telefono_contacto: "",
  parentesco_contacto: "",

  nivel_educativo_id: "",
  profesion: "",
  especialidad_id: "",

  observaciones: "",
};

/** Convierte un valor desconocido proveniente del API a string para el form. */
export function aValorForm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Convierte un valor a boolean (acepta string "true"/"false", boolean, null). */
export function aValorBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return false;
}

/**
 * Mapeo de qué campos pertenecen a qué sección.
 * Sirve para calcular el estado (completo / en_proceso / vacío) de cada una.
 */
const CAMPOS_POR_SECCION: Record<SeccionId, (keyof FuncionarioFormData)[]> = {
  identidad: [
    "nacionalidad",
    "cedula",
    "rif",
    "apellidos",
    "nombres",
    "fecha_nacimiento",
    "sexo",
    "estado_civil_id",
    "grupo_sanguineo_id",
    "factor_sanguineo",
    "lugar_nacimiento",
    "pais_nacimiento",
    "tipo_nacionalizacion",
    "fecha_nacionalizacion",
    "numero_gaceta_nacionalizacion",
    "pais_origen",
    "idiomas",
  ],
  empleo: [
    "tipo_personal",
    "numero_empleado",
    "numero_equipo",
    "fecha_primer_ingreso",
    "promocion",
    "estatus",
    "condicion_id",
    "jerarquia_id",
    "cargo_id",
    "pre_jubilado",
    "es_voluntario",
    "institucion_formadora_id",
    "licencia_conducir",
    "fecha_egreso",
    "fecha_reintegro",
    "fecha_este",
    "fecha_ingreso_gdf",
  ],
  ubicacion: [
    "zona_id",
    "estacion_id",
    "area_id",
    "dependencia_id",
    "division_id",
    "seccion",
    "horario",
  ],
  contacto: [
    "telefono_habitacion",
    "telefono_movil",
    "telefono_otros",
    "correo",
    "persona_contacto",
    "telefono_contacto",
    "parentesco_contacto",
  ],
  educacion: [
    "nivel_educativo_id",
    "profesion",
    "especialidad_id",
  ],
  observaciones: ["observaciones"],
};

const REQUERIDOS_POR_SECCION: Record<SeccionId, (keyof FuncionarioFormData)[]> = {
  identidad: ["nacionalidad", "cedula", "apellidos", "nombres"],
  empleo: [],
  ubicacion: [],
  contacto: [],
  educacion: [],
  observaciones: [],
};

function tieneValor(data: FuncionarioFormData, k: keyof FuncionarioFormData): boolean {
  const v = data[k];
  if (typeof v === "boolean") return v === true;
  return typeof v === "string" && v.trim().length > 0;
}

export type SeccionEstado = "completo" | "en_proceso" | "vacio";

/**
 * Calcula el estado de una sección a partir del estado del form.
 *
 * - Si todos los requeridos están llenos Y al menos un campo lleno → "completo"
 * - Si hay al menos un campo lleno pero faltan requeridos → "en_proceso"
 * - Si no hay ningún campo lleno → "vacio"
 *
 * Para secciones sin requeridos:
 * - Vacía → "vacio"
 * - Con al menos un campo → "completo"
 *
 * En modo edición, el campo `fecha_primer_ingreso` es opcional, pero
 * en alta es obligatorio. Por eso este cálculo recibe el flag `esAlta`.
 */
export function estadoSeccion(
  id: SeccionId,
  data: FuncionarioFormData,
  esAlta: boolean,
): SeccionEstado {
  const campos = CAMPOS_POR_SECCION[id];
  const requeridos = [...REQUERIDOS_POR_SECCION[id]];
  if (esAlta && id === "empleo") requeridos.push("fecha_primer_ingreso");

  const algunoLleno = campos.some((k) => tieneValor(data, k));
  if (!algunoLleno) return "vacio";

  const todosRequeridosLlenos = requeridos.every((k) => tieneValor(data, k));
  return todosRequeridosLlenos ? "completo" : "en_proceso";
}
