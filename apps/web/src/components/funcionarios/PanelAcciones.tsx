"use client";

import { useState } from "react";
import {
  HeartPulse,
  Briefcase,
  CalendarDays,
  ClipboardList,
  AlertTriangle,
  Ban,
  PlayCircle,
  TrendingUp,
  ArrowRightLeft,
  Shield,
  Radio,
  FileClock,
  LogOut,
  Minus,
  UserMinus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { hasAnyRole, type Rol } from "@/lib/roles";
import type { Catalogo, CatalogoEstacion } from "@/lib/catalogos";
import ModalAccion from "./acciones/ModalAccion";
import FormReposo from "./acciones/FormReposo";
import FormVacaciones from "./acciones/FormVacaciones";
import FormPermiso from "./acciones/FormPermiso";
import FormComision from "./acciones/FormComision";
import FormFalta from "./acciones/FormFalta";
import FormSuspender from "./acciones/FormSuspender";
import FormReactivar from "./acciones/FormReactivar";
import FormAscender from "./acciones/FormAscender";
import FormTrasladar from "./acciones/FormTrasladar";
import FormAsignarProteccion, {
  type ItemProteccion,
} from "./acciones/FormAsignarProteccion";
import FormAsignarRadio, { type ItemRadio } from "./acciones/FormAsignarRadio";
import FormPreJubilar from "./acciones/FormPreJubilar";
import FormJubilar from "./acciones/FormJubilar";
import FormFallecimiento from "./acciones/FormFallecimiento";
import FormEgresar from "./acciones/FormEgresar";

export type AccionKey =
  | "reposo"
  | "vacaciones"
  | "permiso"
  | "comision"
  | "falta"
  | "suspender"
  | "reactivar"
  | "ascender"
  | "trasladar"
  | "proteccion"
  | "radio"
  | "pre-jubilar"
  | "jubilar"
  | "fallecimiento"
  | "egresar";

interface AccionDef {
  key: AccionKey;
  label: string;
  short: string;
  Icon: LucideIcon;
  /** Estatus en los que la acción es relevante (ANTES de aplicarla). */
  visible: (estatus: string) => boolean;
  /** Roles que pueden ejecutar la acción (ADMIN siempre puede vía hasAnyRole). */
  roles: Rol[];
  /** Tonalidad de la acción (visual). */
  tone?: "default" | "warning" | "danger";
}

const NO_TERMINAL = (s: string) => !["JUBILADO", "FALLECIDO", "EGRESADO"].includes(s);

export const ACCIONES_DEF: AccionDef[] = [
  // RR.HH. / Operativo cotidiano
  {
    key: "reposo",
    label: "Iniciar reposo",
    short: "Reposo",
    Icon: HeartPulse,
    visible: (s) => s === "ACTIVO",
    roles: ["RRHH", "SUPERVISOR", "OPERADOR"],
  },
  {
    key: "vacaciones",
    label: "Iniciar vacaciones",
    short: "Vacaciones",
    Icon: CalendarDays,
    visible: (s) => s === "ACTIVO",
    roles: ["RRHH", "SUPERVISOR", "OPERADOR"],
  },
  {
    key: "permiso",
    label: "Iniciar permiso",
    short: "Permiso",
    Icon: ClipboardList,
    visible: (s) => s === "ACTIVO",
    roles: ["RRHH", "SUPERVISOR", "OPERADOR"],
  },
  {
    key: "comision",
    label: "Asignar a comisión",
    short: "Comisión",
    Icon: Briefcase,
    visible: (s) => ["ACTIVO", "REPOSO"].includes(s),
    roles: ["RRHH", "SUPERVISOR", "INSPECTOR"],
  },
  {
    key: "falta",
    label: "Registrar falta",
    short: "Falta",
    Icon: AlertTriangle,
    visible: NO_TERMINAL,
    roles: ["SUPERVISOR", "INSPECTOR"],
    tone: "warning",
  },
  {
    key: "suspender",
    label: "Suspender",
    short: "Suspender",
    Icon: Ban,
    visible: (s) => s === "ACTIVO",
    roles: ["SUPERVISOR", "INSPECTOR"],
    tone: "danger",
  },
  {
    key: "reactivar",
    label: "Reactivar",
    short: "Reactivar",
    Icon: PlayCircle,
    visible: (s) => ["REPOSO", "COMISION", "SUSPENDIDO"].includes(s),
    roles: ["RRHH", "SUPERVISOR"],
  },
  // Carrera
  {
    key: "ascender",
    label: "Ascender",
    short: "Ascender",
    Icon: TrendingUp,
    visible: (s) => ["ACTIVO", "REPOSO", "COMISION"].includes(s),
    roles: ["RRHH"],
  },
  {
    key: "trasladar",
    label: "Trasladar",
    short: "Trasladar",
    Icon: ArrowRightLeft,
    visible: (s) => ["ACTIVO", "REPOSO", "COMISION"].includes(s),
    roles: ["RRHH"],
  },
  // Equipo
  {
    key: "proteccion",
    label: "Asignar protección",
    short: "Protección",
    Icon: Shield,
    visible: (s) => ["ACTIVO", "REPOSO", "COMISION"].includes(s),
    roles: ["LOGISTICA"],
  },
  {
    key: "radio",
    label: "Asignar radio",
    short: "Radio",
    Icon: Radio,
    visible: (s) => ["ACTIVO", "REPOSO", "COMISION"].includes(s),
    roles: ["LOGISTICA"],
  },
  // Egresos
  {
    key: "pre-jubilar",
    label: "Solicitar jubilación",
    short: "Pre-jubilar",
    Icon: FileClock,
    visible: (s) => ["ACTIVO", "REPOSO", "COMISION"].includes(s),
    roles: ["RRHH"],
  },
  {
    key: "jubilar",
    label: "Jubilar",
    short: "Jubilar",
    Icon: LogOut,
    visible: (s) => ["PRE_JUBILADO", "ACTIVO"].includes(s),
    roles: ["RRHH"],
    tone: "danger",
  },
  {
    key: "fallecimiento",
    label: "Registrar fallecimiento",
    short: "Fallecimiento",
    Icon: Minus,
    visible: (s) => !["FALLECIDO", "EGRESADO"].includes(s),
    roles: ["RRHH"],
    tone: "danger",
  },
  {
    key: "egresar",
    label: "Egresar",
    short: "Egresar",
    Icon: UserMinus,
    visible: (s) => ["ACTIVO", "REPOSO", "COMISION", "SUSPENDIDO"].includes(s),
    roles: ["RRHH"],
    tone: "danger",
  },
];

export interface CatalogosAcciones {
  jerarquias: Catalogo[];
  zonas: Catalogo[];
  estaciones: CatalogoEstacion[];
  divisiones: Catalogo[];
  areas: Catalogo[];
  tiposReposo: Catalogo[];
  inventarioProteccion: ItemProteccion[];
  radios: ItemRadio[];
}

interface Props {
  funcionarioId: number;
  estatus: string;
  userRoles: string[];
  catalogos: CatalogosAcciones;
}

const TONE_CLASSES: Record<NonNullable<AccionDef["tone"]>, string> = {
  default: "hover:border-primary/50 hover:bg-primary/5 text-foreground/85",
  warning:
    "hover:border-amber-700/60 hover:bg-amber-950/30 text-amber-200/90 hover:text-amber-200",
  danger:
    "hover:border-destructive/60 hover:bg-destructive/10 text-foreground/80 hover:text-destructive",
};

export default function PanelAcciones({
  funcionarioId,
  estatus,
  userRoles,
  catalogos,
}: Props) {
  const [abierta, setAbierta] = useState<AccionKey | null>(null);

  const disponibles = ACCIONES_DEF.filter(
    (a) => a.visible(estatus) && hasAnyRole(userRoles, a.roles),
  );

  if (disponibles.length === 0) return null;

  const accion = abierta ? ACCIONES_DEF.find((a) => a.key === abierta) ?? null : null;
  const cerrar = () => setAbierta(null);

  return (
    <section
      aria-labelledby="acciones-titulo"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2
            id="acciones-titulo"
            className="text-sm font-bold uppercase tracking-wider text-foreground/90"
          >
            Acciones
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {disponibles.length} disponibles
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {disponibles.map((a) => {
          const tone = a.tone ?? "default";
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setAbierta(a.key)}
              className={`group flex flex-col items-center justify-center gap-1.5 p-3 rounded-md border border-border bg-background/50 text-[11px] font-medium leading-tight text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TONE_CLASSES[tone]}`}
            >
              <a.Icon className="w-5 h-5 shrink-0" aria-hidden="true" strokeWidth={1.5} />
              <span className="line-clamp-2">{a.short}</span>
            </button>
          );
        })}
      </div>

      {accion && (
        <ModalAccion title={accion.label} onClose={cerrar}>
          {renderForm(accion.key, {
            funcionarioId,
            estatus,
            onClose: cerrar,
            catalogos,
          })}
        </ModalAccion>
      )}
    </section>
  );
}

function renderForm(
  key: AccionKey,
  ctx: {
    funcionarioId: number;
    estatus: string;
    onClose: () => void;
    catalogos: CatalogosAcciones;
  },
) {
  const base = {
    funcionarioId: ctx.funcionarioId,
    onSuccess: ctx.onClose,
    onCancel: ctx.onClose,
  };
  switch (key) {
    case "reposo":
      return <FormReposo {...base} tiposReposo={ctx.catalogos.tiposReposo} />;
    case "vacaciones":
      return <FormVacaciones {...base} />;
    case "permiso":
      return <FormPermiso {...base} />;
    case "comision":
      return <FormComision {...base} />;
    case "falta":
      return <FormFalta {...base} />;
    case "suspender":
      return <FormSuspender {...base} />;
    case "reactivar":
      return <FormReactivar {...base} estatusActual={ctx.estatus} />;
    case "ascender":
      return <FormAscender {...base} jerarquias={ctx.catalogos.jerarquias} />;
    case "trasladar":
      return (
        <FormTrasladar
          {...base}
          zonas={ctx.catalogos.zonas}
          estaciones={ctx.catalogos.estaciones}
          divisiones={ctx.catalogos.divisiones}
          areas={ctx.catalogos.areas}
        />
      );
    case "proteccion":
      return (
        <FormAsignarProteccion
          {...base}
          inventario={ctx.catalogos.inventarioProteccion}
        />
      );
    case "radio":
      return <FormAsignarRadio {...base} radios={ctx.catalogos.radios} />;
    case "pre-jubilar":
      return <FormPreJubilar {...base} />;
    case "jubilar":
      return <FormJubilar {...base} />;
    case "fallecimiento":
      return <FormFallecimiento {...base} />;
    case "egresar":
      return <FormEgresar {...base} />;
  }
}
