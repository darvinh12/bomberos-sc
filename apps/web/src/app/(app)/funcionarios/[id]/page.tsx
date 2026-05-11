import Link from "next/link";
import { notFound } from "next/navigation";
import {
  User, Pencil, ArrowLeft, MapPin, Building2, Phone, Mail,
  CalendarDays, BadgeCheck, ShieldCheck, Briefcase, BookOpen,
  HeartPulse, CalendarOff, FileCheck2, Award, HardHat, HandCoins,
  Users, ChevronRight, Printer,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { formatCedula, formatDate } from "@/lib/utils";
import PanelAcciones from "./acciones/panel";

interface FuncionarioDetail {
  id: number;
  nacionalidad: string;
  cedula: number;
  apellidos: string;
  nombres: string;
  nombre_completo: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  estado_civil_id: number | null;
  grupo_sanguineo_id: number | null;
  tipo_personal: string;
  numero_empleado: string | null;
  numero_equipo: string | null;
  fecha_primer_ingreso: string | null;
  estatus: string;
  jerarquia_id: number | null;
  cargo_id: number | null;
  zona_id: number | null;
  estacion_id: number | null;
  telefono_movil: string | null;
  correo: string | null;
  persona_contacto: string | null;
  telefono_contacto: string | null;
  profesion: string | null;
  iutb: boolean;
  egresado_unes: boolean;
  pre_jubilado: boolean;
  foto_url: string | null;
  observaciones: string | null;
  seccion: string | null;
  horario: string | null;
  jerarquia_nombre: string | null;
  jerarquia_nombre_corto: string | null;
  cargo_nombre: string | null;
  condicion_nombre: string | null;
  zona_nombre: string | null;
  estacion_nombre: string | null;
}

const ESTATUS_STYLE: Record<string, string> = {
  ACTIVO:       "bg-emerald-900/40 text-emerald-400 border-emerald-700/50",
  REPOSO:       "bg-amber-900/40 text-amber-400 border-amber-700/50",
  COMISION:     "bg-blue-900/40 text-blue-400 border-blue-700/50",
  PRE_JUBILADO: "bg-violet-900/40 text-violet-400 border-violet-700/50",
  JUBILADO:     "bg-slate-700/60 text-slate-300 border-slate-600",
  EGRESADO:     "bg-slate-700/40 text-slate-400 border-slate-600/70",
  FALLECIDO:    "bg-slate-600/60 text-slate-200 border-slate-500",
  SUSPENDIDO:   "bg-red-900/40 text-red-400 border-red-700/50",
};

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
        {label}
      </div>
      <div className={`text-sm text-slate-200 ${mono ? "font-mono" : "font-medium"}`}>
        {value ?? <span className="text-slate-600">—</span>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded overflow-hidden ${className}`}>
      <div className="px-4 py-2.5 bg-slate-700/40 border-b border-slate-700">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded border border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-600 transition-colors group"
    >
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-slate-300">{label}</span>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
    </Link>
  );
}

export default async function FuncionarioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  let f: FuncionarioDetail;
  try {
    f = await api.get<FuncionarioDetail>(`/funcionarios/${params.id}`, token);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar  = me.roles.includes("ADMIN") || me.roles.includes("RRHH");
  const puedeAcciones = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  const sexoLabel =
    f.sexo === "M" ? "Masculino" : f.sexo === "F" ? "Femenino" : f.sexo ?? null;

  return (
    <div className="space-y-4 max-w-screen-xl">

      {/* ── Breadcrumb + actions ── */}
      <div className="flex items-center justify-between">
        <Link
          href="/funcionarios"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Personal
        </Link>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-700 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
            <Printer className="w-3.5 h-3.5" />
            Imprimir ficha
          </button>
          {puedeEditar && (
            <Link
              href={`/funcionarios/${f.id}/editar`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-primary text-white hover:opacity-90 transition-opacity"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </Link>
          )}
        </div>
      </div>

      {/* ── Identity header ── */}
      <div className="bg-slate-800 border border-slate-700 rounded p-5">
        <div className="flex items-start gap-5">

          {/* Photo */}
          <div className="w-24 h-28 shrink-0 bg-slate-700 border border-slate-600 rounded flex items-center justify-center overflow-hidden">
            {f.foto_url ? (
              <img src={f.foto_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-slate-500" />
            )}
          </div>

          {/* Core info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              {f.jerarquia_nombre_corto && (
                <span className="inline-block px-2 py-0.5 bg-primary/15 text-primary text-xs font-mono font-semibold rounded border border-primary/30 mt-0.5">
                  {f.jerarquia_nombre_corto}
                </span>
              )}
              <h1 className="text-xl font-bold text-slate-100">
                {f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`}
              </h1>
              <span
                className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded border ${ESTATUS_STYLE[f.estatus] ?? "bg-slate-700/40 text-slate-400"}`}
              >
                {f.estatus}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-1.5">
              <div className="text-sm">
                <span className="text-slate-500">Cédula: </span>
                <span className="font-mono font-semibold text-slate-200">
                  {formatCedula(f.nacionalidad, f.cedula)}
                </span>
              </div>
              {f.jerarquia_nombre && (
                <div className="text-sm">
                  <span className="text-slate-500">Jerarquía: </span>
                  <span className="font-semibold text-slate-200">{f.jerarquia_nombre}</span>
                </div>
              )}
              {f.cargo_nombre && (
                <div className="text-sm">
                  <span className="text-slate-500">Cargo: </span>
                  <span className="font-semibold text-slate-200">{f.cargo_nombre}</span>
                </div>
              )}
              {f.condicion_nombre && (
                <div className="text-sm">
                  <span className="text-slate-500">Condición: </span>
                  <span className="font-semibold text-slate-200">{f.condicion_nombre}</span>
                </div>
              )}
              {f.numero_empleado && (
                <div className="text-sm">
                  <span className="text-slate-500">N° Empleado: </span>
                  <span className="font-mono font-semibold text-slate-200">{f.numero_empleado}</span>
                </div>
              )}
              {f.numero_equipo && (
                <div className="text-sm">
                  <span className="text-slate-500">N° Equipo: </span>
                  <span className="font-mono font-semibold text-slate-200">{f.numero_equipo}</span>
                </div>
              )}
              <div className="text-sm">
                <span className="text-slate-500">Tipo: </span>
                <span className="font-semibold text-slate-200">{f.tipo_personal}</span>
              </div>
              {f.fecha_primer_ingreso && (
                <div className="text-sm">
                  <span className="text-slate-500">Ingreso: </span>
                  <span className="font-semibold text-slate-200">
                    {formatDate(f.fecha_primer_ingreso)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main 3-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left 2 columns: data sections ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Datos Personales */}
          <SectionCard title="Datos Personales">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Cédula" value={formatCedula(f.nacionalidad, f.cedula)} mono />
              <Field label="Apellidos" value={f.apellidos} />
              <Field label="Nombres" value={f.nombres} />
              <Field label="Fecha de nacimiento" value={formatDate(f.fecha_nacimiento)} />
              <Field label="Sexo" value={sexoLabel} />
              <Field label="Profesión" value={f.profesion} />
              {f.correo && <Field label="Correo electrónico" value={f.correo} />}
              {f.telefono_movil && <Field label="Teléfono móvil" value={f.telefono_movil} />}
            </div>
          </SectionCard>

          {/* Datos Institucionales */}
          <SectionCard title="Datos Institucionales">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Jerarquía" value={f.jerarquia_nombre} />
              <Field label="Cargo" value={f.cargo_nombre} />
              <Field label="Condición" value={f.condicion_nombre} />
              <Field label="Estatus" value={f.estatus} />
              <Field label="N° Empleado" value={f.numero_empleado} mono />
              <Field label="N° Equipo" value={f.numero_equipo} mono />
              <Field label="Fecha 1er Ingreso" value={formatDate(f.fecha_primer_ingreso)} />
              <Field label="Pre-jubilado" value={f.pre_jubilado ? "Sí" : "No"} />
              <Field label="Egresado UNES" value={f.egresado_unes ? "Sí" : "No"} />
              <Field label="IUTB" value={f.iutb ? "Sí" : "No"} />
              {f.tipo_personal && <Field label="Tipo de personal" value={f.tipo_personal} />}
            </div>
          </SectionCard>

          {/* Ubicación Administrativa */}
          <SectionCard title="Ubicación Administrativa">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Zona" value={f.zona_nombre} />
              <Field label="Estación" value={f.estacion_nombre} />
              <Field label="Sección" value={f.seccion} />
              <Field label="Horario" value={f.horario} />
            </div>
          </SectionCard>

          {/* Contacto de emergencia */}
          {(f.persona_contacto || f.telefono_contacto) && (
            <SectionCard title="Contacto de Emergencia">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Persona de contacto" value={f.persona_contacto} />
                <Field label="Teléfono de contacto" value={f.telefono_contacto} />
              </div>
            </SectionCard>
          )}

          {/* Observaciones */}
          {f.observaciones && (
            <SectionCard title="Observaciones">
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {f.observaciones}
              </p>
            </SectionCard>
          )}

          {/* Acciones operativas */}
          {puedeAcciones && <PanelAcciones funcionarioId={f.id} estatus={f.estatus} />}
        </div>

        {/* ── Right column: quick access ── */}
        <div className="space-y-4">

          {/* Status indicators */}
          <SectionCard title="Estado actual">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Estatus</span>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded border ${ESTATUS_STYLE[f.estatus] ?? ""}`}
                >
                  {f.estatus}
                </span>
              </div>
              {f.condicion_nombre && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Condición</span>
                  <span className="font-medium text-slate-300">{f.condicion_nombre}</span>
                </div>
              )}
              {f.tipo_personal && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Tipo</span>
                  <span className="font-medium text-slate-300">{f.tipo_personal}</span>
                </div>
              )}
              {f.pre_jubilado && (
                <div className="flex items-center gap-2 text-sm text-violet-400 mt-1">
                  <BadgeCheck className="w-4 h-4" />
                  Pre-jubilado
                </div>
              )}
            </div>
          </SectionCard>

          {/* Quick nav to related modules */}
          <SectionCard title="Información relacionada">
            <div className="space-y-1.5">
              <QuickLink href={`/salud/reposos?funcionario_id=${f.id}`}        label="Reposos"           Icon={HeartPulse} />
              <QuickLink href={`/ops/vacaciones?funcionario_id=${f.id}`}       label="Vacaciones"        Icon={CalendarOff} />
              <QuickLink href={`/ops/permisos?funcionario_id=${f.id}`}         label="Permisos"          Icon={FileCheck2} />
              <QuickLink href={`/ops/comisiones?funcionario_id=${f.id}`}       label="Comisiones"        Icon={Briefcase} />
              <QuickLink href={`/ops/faltas?funcionario_id=${f.id}`}           label="Faltas"            Icon={ShieldCheck} />
              <QuickLink href={`/carrera?funcionario_id=${f.id}`}              label="Carrera"           Icon={Award} />
              <QuickLink href={`/beneficios?funcionario_id=${f.id}`}           label="Beneficios"        Icon={HandCoins} />
              <QuickLink href={`/equipo/proteccion?funcionario_id=${f.id}`}    label="Equipos asignados" Icon={HardHat} />
            </div>
          </SectionCard>

          {/* Contact quick view */}
          {(f.correo || f.telefono_movil) && (
            <SectionCard title="Contacto">
              <div className="space-y-2">
                {f.telefono_movil && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    {f.telefono_movil}
                  </div>
                )}
                {f.correo && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{f.correo}</span>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Location quick view */}
          {(f.zona_nombre || f.estacion_nombre) && (
            <SectionCard title="Ubicación">
              <div className="space-y-2">
                {f.zona_nombre && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    Zona {f.zona_nombre}
                  </div>
                )}
                {f.estacion_nombre && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    {f.estacion_nombre}
                  </div>
                )}
                {f.seccion && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    Sección {f.seccion}
                  </div>
                )}
                {f.horario && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    {f.horario}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Colegas */}
          <Link
            href={`/funcionarios?estacion_id=${f.estacion_id ?? ""}`}
            className="flex items-center justify-between gap-2 px-4 py-3 rounded border border-dashed border-slate-700 hover:border-primary hover:bg-primary/5 transition-colors group"
          >
            <div className="flex items-center gap-2 text-sm text-slate-500 group-hover:text-primary">
              <Users className="w-4 h-4" />
              Ver personal de esta estación
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-primary" />
          </Link>
        </div>
      </div>
    </div>
  );
}
