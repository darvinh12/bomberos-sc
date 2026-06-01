/**
 * Catálogo de recursos gestionables desde la matriz de permisos editable.
 * Cada tipo de recurso tiene su propia lista de items que ADMIN puede
 * configurar por rol con niveles edit/view/none.
 */

export type TipoRecurso = "seccion_ficha" | "sidebar" | "accion_panel";

export interface RecursoDef {
  codigo: string;
  label: string;
  descripcion?: string;
  esSubseccion?: boolean;
}

export const SECCIONES_FICHA: RecursoDef[] = [
  { codigo: "resumen", label: "Resumen", descripcion: "Vista general del funcionario" },
  { codigo: "datos", label: "Datos personales", descripcion: "Identidad, nacionalización, ubicación" },
  { codigo: "carrera", label: "Carrera", descripcion: "Ascensos, cursos, evaluaciones, méritos" },
  { codigo: "operativo", label: "Operativo (padre)", descripcion: "Controla aparición en sidebar" },
  { codigo: "operativo:guardias", label: "Guardias", esSubseccion: true },
  { codigo: "operativo:vacaciones", label: "Vacaciones", esSubseccion: true },
  { codigo: "operativo:permisos", label: "Permisos", esSubseccion: true },
  { codigo: "operativo:comisiones", label: "Comisiones", esSubseccion: true },
  { codigo: "operativo:faltas", label: "Faltas", esSubseccion: true },
  { codigo: "salud", label: "Salud", descripcion: "Reposos, lesiones, evaluaciones físicas" },
  { codigo: "beneficios", label: "Beneficios", descripcion: "Ayudas económicas, entregas" },
  { codigo: "familia", label: "Familia", descripcion: "Carga familiar, beneficiarios HCM" },
  { codigo: "habilidades", label: "Habilidades", descripcion: "Habilidades y actividades" },
  { codigo: "documentos", label: "Documentos", descripcion: "Foto, huella, firma, carnets" },
  { codigo: "auditoria", label: "Auditoría", descripcion: "Historial de cambios" },
];

export const SIDEBAR_ITEMS: RecursoDef[] = [
  { codigo: "dashboard", label: "Dashboard", descripcion: "Estadísticas y KPIs generales" },
  { codigo: "personal", label: "Personal", descripcion: "Listado de funcionarios" },
  { codigo: "carrera", label: "Carrera", descripcion: "Módulo de ascensos y cursos" },
  { codigo: "beneficios", label: "Beneficios", descripcion: "Ayudas económicas" },
  { codigo: "egresos", label: "Egresos", descripcion: "Jubilaciones y fallecimientos" },
  { codigo: "catalogos", label: "Catálogos", descripcion: "Lectura de catálogos del sistema" },
];

export const ACCIONES_PANEL: RecursoDef[] = [
  { codigo: "reposo", label: "Iniciar reposo" },
  { codigo: "vacaciones", label: "Iniciar vacaciones" },
  { codigo: "permiso", label: "Iniciar permiso" },
  { codigo: "comision", label: "Asignar comisión" },
  { codigo: "falta", label: "Registrar falta" },
  { codigo: "suspender", label: "Suspender" },
  { codigo: "reactivar", label: "Reactivar" },
  { codigo: "ascender", label: "Ascender" },
  { codigo: "trasladar", label: "Trasladar" },
  { codigo: "pre-jubilar", label: "Solicitar jubilación" },
  { codigo: "jubilar", label: "Jubilar" },
  { codigo: "fallecimiento", label: "Registrar fallecimiento" },
  { codigo: "egresar", label: "Egresar" },
];

export const RECURSOS_POR_TIPO: Record<TipoRecurso, RecursoDef[]> = {
  seccion_ficha: SECCIONES_FICHA,
  sidebar: SIDEBAR_ITEMS,
  accion_panel: ACCIONES_PANEL,
};

export const TIPOS_LABEL: Record<TipoRecurso, string> = {
  seccion_ficha: "Secciones de la ficha del funcionario",
  sidebar: "Items del sidebar global",
  accion_panel: "Acciones del panel del funcionario",
};
