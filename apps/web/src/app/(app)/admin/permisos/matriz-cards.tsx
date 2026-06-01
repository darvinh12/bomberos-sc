"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users as UsersIcon,
  ShieldCheck,
  Award,
  HandCoins,
  History,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  guardarMatrizRecursos,
  type NivelAccesoMatriz,
  type PermisoRecursoMatriz,
} from "./actions";

const STORAGE_KEY = "bomberos-permisos-recursos";

/**
 * Modelo de 3 niveles independientes por (módulo, rol):
 *   1. Acceso al módulo: sí / no (binario)
 *   2. Sub-secciones del módulo: editar / ver / sin acceso (3 niveles)
 *   3. Acciones del módulo: puede / no puede (binario)
 *
 * Los módulos son los items del sidebar global izquierdo.
 */

interface RecursoBin {
  /** Identificador único en el sistema de permisos (sin tipo, se asume). */
  codigo: string;
  label: string;
  esSubseccion?: boolean;
}

interface ModuloDef {
  /** Código del item del sidebar global. */
  codigo: string;
  label: string;
  descripcion: string;
  Icon: LucideIcon;
  /** Sub-secciones (control 3 niveles: edit/view/none). */
  subsecciones: RecursoBin[];
  /** Acciones del módulo (control binario: edit=puede / none=no puede). */
  acciones: RecursoBin[];
}

/** Los 8 módulos = items del sidebar global. */
const MODULOS: ModuloDef[] = [
  {
    codigo: "dashboard",
    label: "Dashboard",
    descripcion: "Estadísticas y KPIs generales del sistema",
    Icon: LayoutDashboard,
    subsecciones: [],
    acciones: [],
  },
  {
    codigo: "personal",
    label: "Personal",
    descripcion: "Listado y ficha de funcionarios con todas sus secciones",
    Icon: UsersIcon,
    subsecciones: [
      { codigo: "resumen", label: "Resumen" },
      { codigo: "datos", label: "Datos personales" },
      { codigo: "carrera", label: "Carrera (ascensos, cursos, evaluaciones, méritos)" },
      { codigo: "operativo", label: "Operativo (entrada)" },
      { codigo: "operativo:guardias", label: "Guardias", esSubseccion: true },
      { codigo: "operativo:vacaciones", label: "Vacaciones", esSubseccion: true },
      { codigo: "operativo:permisos", label: "Permisos", esSubseccion: true },
      { codigo: "operativo:comisiones", label: "Comisiones", esSubseccion: true },
      { codigo: "operativo:faltas", label: "Faltas", esSubseccion: true },
      { codigo: "salud", label: "Salud (reposos, lesiones, evaluaciones físicas)" },
      { codigo: "beneficios", label: "Beneficios" },
      { codigo: "familia", label: "Familia" },
      { codigo: "habilidades", label: "Habilidades" },
      { codigo: "documentos", label: "Documentos" },
      { codigo: "auditoria", label: "Auditoría" },
    ],
    acciones: [
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
    ],
  },
  {
    codigo: "operativo",
    label: "Operativo",
    descripcion: "Módulos operativos: guardias, vacaciones, permisos, comisiones, faltas, reposos",
    Icon: ShieldCheck,
    subsecciones: [],
    acciones: [],
  },
  {
    codigo: "carrera",
    label: "Carrera",
    descripcion: "Ascensos, cursos y evaluaciones a nivel global",
    Icon: Award,
    subsecciones: [],
    acciones: [],
  },
  {
    codigo: "beneficios",
    label: "Beneficios",
    descripcion: "Ayudas económicas y entregas a nivel global",
    Icon: HandCoins,
    subsecciones: [],
    acciones: [],
  },
  {
    codigo: "egresos",
    label: "Egresos",
    descripcion: "Jubilaciones, fallecimientos, baja administrativa",
    Icon: History,
    subsecciones: [],
    acciones: [],
  },
  {
    codigo: "catalogos",
    label: "Catálogos",
    descripcion: "Catálogos del sistema (consulta de jerarquías, cargos, condiciones, etc)",
    Icon: BookOpen,
    subsecciones: [],
    acciones: [],
  },
];

/** Tipo de recurso según naturaleza. */
function tipoDeSubseccion(): "seccion_ficha" {
  return "seccion_ficha";
}
function tipoDeAccion(): "accion_panel" {
  return "accion_panel";
}
function tipoDeModulo(): "sidebar" {
  return "sidebar";
}

interface Props {
  roles: { codigo: string; nombre: string }[];
  permisosIniciales: PermisoRecursoMatriz[];
}

export default function MatrizCards({ roles, permisosIniciales }: Props) {
  const [moduloActivo, setModuloActivo] = useState<ModuloDef | null>(null);
  const [permisos, setPermisos] = useState<PermisoRecursoMatriz[]>(permisosIniciales);

  /** Cuántos roles (sin ADMIN) tienen acceso al módulo. */
  function rolesConAcceso(modulo: ModuloDef): number {
    let count = 0;
    for (const rol of roles) {
      if (rol.codigo === "ADMIN") continue;
      const tieneAcceso = permisos.some(
        (p) =>
          p.rol_codigo === rol.codigo &&
          p.recurso_tipo === "sidebar" &&
          p.recurso_codigo === modulo.codigo &&
          p.nivel !== "none",
      );
      if (tieneAcceso) count++;
    }
    return count;
  }

  if (moduloActivo === null) {
    return (
      <NivelModulos
        modulos={MODULOS}
        rolesEditables={roles.filter((r) => r.codigo !== "ADMIN").length}
        rolesConAccesoFn={rolesConAcceso}
        onSeleccionar={setModuloActivo}
      />
    );
  }

  return (
    <NivelModuloDetalle
      modulo={moduloActivo}
      roles={roles}
      permisos={permisos}
      onVolver={() => setModuloActivo(null)}
      onPermisosActualizados={setPermisos}
    />
  );
}

// ============================================================
// Nivel 1: Grid de módulos
// ============================================================

function NivelModulos({
  modulos,
  rolesEditables,
  rolesConAccesoFn,
  onSeleccionar,
}: {
  modulos: ModuloDef[];
  rolesEditables: number;
  rolesConAccesoFn: (m: ModuloDef) => number;
  onSeleccionar: (m: ModuloDef) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-semibold text-foreground">
          Selecciona un módulo
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Click en un módulo para configurar qué roles pueden acceder, qué
          sub-secciones pueden editar/ver, y qué acciones pueden ejecutar.
          ADMIN siempre tiene acceso total.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {modulos.map((m) => {
          const Icon = m.Icon;
          const conAcceso = rolesConAccesoFn(m);
          return (
            <button
              key={m.codigo}
              type="button"
              onClick={() => onSeleccionar(m)}
              className="text-left bg-card border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-primary/10 text-primary">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground">{m.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {m.descripcion}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {conAcceso === 0 ? (
                    <span className="text-muted-foreground/70">
                      Sin roles con acceso
                    </span>
                  ) : (
                    <span>
                      <span className="text-foreground font-medium">
                        {conAcceso}/{rolesEditables}
                      </span>{" "}
                      roles con acceso
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors"
                  aria-hidden="true"
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Nivel 2: Detalle de un módulo (selector rol + 3 niveles)
// ============================================================

function NivelModuloDetalle({
  modulo,
  roles,
  permisos,
  onVolver,
  onPermisosActualizados,
}: {
  modulo: ModuloDef;
  roles: { codigo: string; nombre: string }[];
  permisos: PermisoRecursoMatriz[];
  onVolver: () => void;
  onPermisosActualizados: (p: PermisoRecursoMatriz[]) => void;
}) {
  const rolesEditables = roles.filter((r) => r.codigo !== "ADMIN");
  const [rolActual, setRolActual] = useState<string>(
    rolesEditables[0]?.codigo ?? "",
  );

  return (
    <FormularioRolModulo
      key={`${modulo.codigo}:${rolActual}`}
      modulo={modulo}
      rolActual={rolActual}
      rolesEditables={rolesEditables}
      setRolActual={setRolActual}
      permisos={permisos}
      onVolver={onVolver}
      onPermisosActualizados={onPermisosActualizados}
    />
  );
}

function FormularioRolModulo({
  modulo,
  rolActual,
  rolesEditables,
  setRolActual,
  permisos,
  onVolver,
  onPermisosActualizados,
}: {
  modulo: ModuloDef;
  rolActual: string;
  rolesEditables: { codigo: string; nombre: string }[];
  setRolActual: (r: string) => void;
  permisos: PermisoRecursoMatriz[];
  onVolver: () => void;
  onPermisosActualizados: (p: PermisoRecursoMatriz[]) => void;
}) {
  const router = useRouter();
  const Icon = modulo.Icon;

  // Estado inicial leído de los permisos actuales del rol seleccionado.
  // Esto se RESETEA al cambiar de rol porque el componente tiene `key={rol}`
  const inicialModulo = useMemo(() => {
    const p = permisos.find(
      (x) =>
        x.rol_codigo === rolActual &&
        x.recurso_tipo === "sidebar" &&
        x.recurso_codigo === modulo.codigo,
    );
    return p?.nivel !== "none" && p !== undefined;
  }, [permisos, rolActual, modulo.codigo]);

  const inicialSubsecciones = useMemo(() => {
    const m = new Map<string, NivelAccesoMatriz>();
    for (const s of modulo.subsecciones) {
      const p = permisos.find(
        (x) =>
          x.rol_codigo === rolActual &&
          x.recurso_tipo === "seccion_ficha" &&
          x.recurso_codigo === s.codigo,
      );
      m.set(s.codigo, (p?.nivel ?? "none") as NivelAccesoMatriz);
    }
    return m;
  }, [permisos, rolActual, modulo.subsecciones]);

  const inicialAcciones = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of modulo.acciones) {
      const p = permisos.find(
        (x) =>
          x.rol_codigo === rolActual &&
          x.recurso_tipo === "accion_panel" &&
          x.recurso_codigo === a.codigo,
      );
      m.set(a.codigo, p?.nivel === "edit");
    }
    return m;
  }, [permisos, rolActual, modulo.acciones]);

  const [accesoModulo, setAccesoModulo] = useState<boolean>(inicialModulo);
  const [subsecciones, setSubsecciones] = useState<Map<string, NivelAccesoMatriz>>(
    () => new Map(inicialSubsecciones),
  );
  const [acciones, setAcciones] = useState<Map<string, boolean>>(
    () => new Map(inicialAcciones),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const rolActualInfo = rolesEditables.find((r) => r.codigo === rolActual)!;

  function setSub(codigo: string, nivel: NivelAccesoMatriz) {
    setSubsecciones((prev) => {
      const next = new Map(prev);
      next.set(codigo, nivel);
      return next;
    });
    setExito(null);
  }

  function toggleAccion(codigo: string) {
    setAcciones((prev) => {
      const next = new Map(prev);
      next.set(codigo, !next.get(codigo));
      return next;
    });
    setExito(null);
  }

  // Cambios pendientes
  const cambios: PermisoRecursoMatriz[] = [];

  // 1. Acceso al módulo
  if (accesoModulo !== inicialModulo) {
    cambios.push({
      rol_codigo: rolActual,
      recurso_tipo: "sidebar",
      recurso_codigo: modulo.codigo,
      nivel: accesoModulo ? "edit" : "none",
    });
  }

  // 2. Sub-secciones
  for (const [codigo, nivelActual] of subsecciones) {
    const nivelInicial = inicialSubsecciones.get(codigo) ?? "none";
    if (nivelActual !== nivelInicial) {
      cambios.push({
        rol_codigo: rolActual,
        recurso_tipo: "seccion_ficha",
        recurso_codigo: codigo,
        nivel: nivelActual,
      });
    }
  }

  // 3. Acciones
  for (const [codigo, puedeActual] of acciones) {
    const puedeInicial = inicialAcciones.get(codigo) ?? false;
    if (puedeActual !== puedeInicial) {
      cambios.push({
        rol_codigo: rolActual,
        recurso_tipo: "accion_panel",
        recurso_codigo: codigo,
        nivel: puedeActual ? "edit" : "none",
      });
    }
  }

  const hayCambios = cambios.length > 0;

  async function onGuardar() {
    setGuardando(true);
    setError(null);
    setExito(null);

    try {
      const res = await guardarMatrizRecursos(cambios);
      if (!res.ok) {
        setError(res.error ?? "Error al guardar");
        return;
      }

      const mapa = new Map<string, PermisoRecursoMatriz>();
      for (const p of permisos) {
        mapa.set(`${p.rol_codigo}:${p.recurso_tipo}:${p.recurso_codigo}`, p);
      }
      // Guardar TODOS los niveles incluido "none" — ver explicación en
      // actions.ts. Borrarlos equivaldría a no respetar la decisión de
      // "sin acceso" (caería al fallback DEFAULT_MATRIZ).
      for (const c of cambios) {
        const k = `${c.rol_codigo}:${c.recurso_tipo}:${c.recurso_codigo}`;
        mapa.set(k, c);
      }
      const nuevos = Array.from(mapa.values());

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevos));
      } catch {
        // ignorar
      }

      onPermisosActualizados(nuevos);
      setExito(
        `${cambios.length} cambio${cambios.length !== 1 ? "s" : ""} guardado${
          cambios.length !== 1 ? "s" : ""
        }. Sidebar y ficha se actualizan…`,
      );
      // Forzar re-render de server components (sidebar, fichas abiertas)
      // para que respeten los nuevos permisos inmediatamente.
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header con breadcrumb y selector de rol */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Volver a módulos
        </button>

        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary/10 text-primary shrink-0">
              <Icon className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">{modulo.label}</h2>
              <p className="text-xs text-muted-foreground">{modulo.descripcion}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="rol-selector" className="text-sm font-medium">
              Configurar para el rol:
            </label>
            <select
              id="rol-selector"
              value={rolActual}
              onChange={(e) => setRolActual(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[180px]"
            >
              {rolesEditables.map((r) => (
                <option key={r.codigo} value={r.codigo}>
                  {r.nombre} ({r.codigo})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Notificaciones */}
      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {exito && !hayCambios && (
        <div
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-300 p-3 text-sm"
        >
          {exito}
        </div>
      )}

      {/* Nivel 1: Acceso al módulo */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          1. Acceso al módulo
        </h3>
        <p className="text-sm text-muted-foreground">
          ¿Puede <strong className="text-foreground">{rolActualInfo.nombre}</strong>{" "}
          acceder al módulo <strong className="text-foreground">{modulo.label}</strong>?
        </p>
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <BotonBinario
            seleccionado={accesoModulo === true}
            onClick={() => setAccesoModulo(true)}
            label="Sí, tiene acceso"
            variante="positivo"
          />
          <BotonBinario
            seleccionado={accesoModulo === false}
            onClick={() => setAccesoModulo(false)}
            label="No tiene acceso"
            variante="negativo"
          />
        </div>
        {!accesoModulo && (
          <p className="text-xs text-muted-foreground italic">
            Sin acceso al módulo: las sub-secciones y acciones de abajo se
            ignoran. El módulo no aparecerá en el sidebar para este rol.
          </p>
        )}
      </div>

      {/* Nivel 2: Sub-secciones (solo si acceso al módulo) */}
      {accesoModulo && modulo.subsecciones.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              2. Sub-secciones
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Define qué puede ver o editar este rol dentro del módulo.
            </p>
          </div>
          <div className="divide-y divide-border border border-border rounded-md">
            {modulo.subsecciones.map((s) => {
              const nivel = subsecciones.get(s.codigo) ?? "none";
              return (
                <div
                  key={s.codigo}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors ${
                    s.esSubseccion ? "pl-10" : ""
                  }`}
                >
                  <span className="text-sm text-foreground">
                    {s.esSubseccion && (
                      <span className="text-muted-foreground">└ </span>
                    )}
                    {s.label}
                  </span>
                  <select
                    aria-label={`Nivel de ${s.label}`}
                    value={nivel}
                    onChange={(e) => setSub(s.codigo, e.target.value as NivelAccesoMatriz)}
                    className={`rounded border border-input text-xs px-2 py-1 min-w-[120px] ${
                      nivel === "edit"
                        ? "bg-emerald-50 dark:bg-emerald-900/40"
                        : nivel === "view"
                          ? "bg-sky-50 dark:bg-sky-900/40"
                          : "bg-background"
                    }`}
                  >
                    <option value="edit">Editar</option>
                    <option value="view">Ver</option>
                    <option value="none">Sin acceso</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nivel 3: Acciones (solo si acceso al módulo) */}
      {accesoModulo && modulo.acciones.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              3. Acciones que puede ejecutar
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Marca las acciones que este rol podrá realizar desde el panel.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 border border-border rounded-md p-2">
            {modulo.acciones.map((a) => {
              const puede = acciones.get(a.codigo) ?? false;
              return (
                <label
                  key={a.codigo}
                  className="flex items-center gap-2 px-3 py-2 rounded hover:bg-accent/30 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={puede}
                    onChange={() => toggleAccion(a.codigo)}
                    className="w-4 h-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="text-sm text-foreground select-none">{a.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer con guardar */}
      <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-end gap-3 sticky bottom-4 shadow-md">
        {hayCambios && (
          <span className="text-xs text-amber-800 dark:text-amber-300 mr-auto">
            {cambios.length} cambio{cambios.length !== 1 ? "s" : ""} sin guardar
          </span>
        )}
        <button
          type="button"
          onClick={onVolver}
          disabled={guardando}
          className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onGuardar}
          disabled={!hayCambios || guardando}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Componentes auxiliares
// ============================================================

function BotonBinario({
  seleccionado,
  onClick,
  label,
  variante,
}: {
  seleccionado: boolean;
  onClick: () => void;
  label: string;
  variante: "positivo" | "negativo";
}) {
  const baseClases =
    "flex items-center justify-center gap-2 px-4 py-3 rounded border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!seleccionado) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClases} border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground`}
      >
        {label}
      </button>
    );
  }

  const colores =
    variante === "positivo"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "border-red-300 bg-red-50 text-red-800 dark:border-red-700/50 dark:bg-red-900/40 dark:text-red-300";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClases} ${colores} font-semibold`}
    >
      {label}
    </button>
  );
}
