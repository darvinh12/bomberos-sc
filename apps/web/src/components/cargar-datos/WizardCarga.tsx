"use client";

/**
 * Asistente de puesta en marcha: guía a RRHH/Admin para cargar la data real
 * del cuerpo de bomberos EN EL ORDEN CORRECTO (respetando dependencias de
 * llaves foráneas) para que ningún formulario falle.
 *
 * El progreso se guarda por usuario en localStorage. Cada fase se desbloquea
 * cuando la anterior se marca como completada; así se fuerza el orden.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen, Building2, UserCog, Users, FolderOpen, CalendarDays,
  Award, CheckCircle2, Circle, Lock, ChevronRight, ArrowUpRight,
  Info, type LucideIcon,
} from "lucide-react";

interface Subpaso {
  id: string;
  label: string;
  href?: string;
  hint?: string;
}

interface Fase {
  id: string;
  titulo: string;
  Icon: LucideIcon;
  objetivo: string;
  porque: string;
  subpasos: Subpaso[];
}

const FASES: Fase[] = [
  {
    id: "catalogos",
    titulo: "1 · Revisar catálogos base",
    Icon: BookOpen,
    objetivo:
      "Revisar y ajustar las listas maestras (jerarquías, cargos, condiciones, especialidades, bancos, tipos de licencia, tipos de carnet, etc.).",
    porque:
      "Los formularios de personal ELIGEN de estas listas. Si una jerarquía o un cargo no existe aquí, no podrás seleccionarlo al cargar un funcionario. Vienen precargados; ajústalos a la realidad del cuerpo ANTES de seguir.",
    subpasos: [
      { id: "cat-revisar", label: "Revisar y ajustar los catálogos del sistema", href: "/admin/catalogos", hint: "Agrega/edita/desactiva lo que no aplique" },
    ],
  },
  {
    id: "organizacion",
    titulo: "2 · Estructura organizativa",
    Icon: Building2,
    objetivo:
      "Cargar la estructura en este orden: Zonas → Estaciones → Áreas → Divisiones → Dependencias.",
    porque:
      "Cada funcionario se ubica en una zona y una estación. Esas unidades deben existir ANTES de cargar al personal, o el formulario no te dejará ubicarlo.",
    subpasos: [
      { id: "org-cargar", label: "Cargar zonas, estaciones, áreas, divisiones y dependencias", href: "/admin/organizacion", hint: "Respeta el orden: primero zonas, luego estaciones dentro de cada zona" },
    ],
  },
  {
    id: "usuarios",
    titulo: "3 · Usuarios que cargarán (opcional)",
    Icon: UserCog,
    objetivo:
      "Crear cuentas para el personal de RRHH que va a cargar la data, con su rol.",
    porque:
      "Recomendado si más de una persona va a cargar. Si solo carga el administrador, puedes saltar esta fase.",
    subpasos: [
      { id: "usr-roles", label: "Revisar roles disponibles", href: "/admin/roles" },
      { id: "usr-crear", label: "Crear usuarios de RRHH/carga", href: "/admin/usuarios" },
    ],
  },
  {
    id: "personal",
    titulo: "4 · Personal (funcionarios)",
    Icon: Users,
    objetivo:
      "Cargar la ficha básica de cada funcionario: identidad, empleo, ubicación y contacto.",
    porque:
      "Es el NÚCLEO del sistema. Todo el expediente (historial, familia, guardias, reposos, ascensos…) cuelga de un funcionario ya creado.",
    subpasos: [
      { id: "per-nuevo", label: "Cargar funcionarios uno por uno", href: "/funcionarios/nuevo", hint: "Fecha en formato AAAA-MM-DD. Nacionalidad: V o E." },
      { id: "per-lista", label: "Verificar el listado cargado", href: "/funcionarios" },
    ],
  },
  {
    id: "expediente",
    titulo: "5 · Expediente por funcionario",
    Icon: FolderOpen,
    objetivo:
      "Desde la ficha de cada funcionario, completar: histórico de jerarquías, histórico de ubicaciones, tiempo en administración pública, carga familiar, habilidades, actividades y carnets.",
    porque:
      "Estos datos cuelgan del funcionario: necesita existir primero (Fase 4). Entra a cada persona desde el listado y usa sus pestañas.",
    subpasos: [
      { id: "exp-abrir", label: "Abrir cada funcionario y completar sus pestañas", href: "/funcionarios", hint: "Dentro de la ficha: Histórico, Carga familiar, Habilidades, Actividades, Carnets" },
    ],
  },
  {
    id: "operaciones",
    titulo: "6 · Operaciones del día a día",
    Icon: CalendarDays,
    objetivo:
      "Registrar guardias, vacaciones, permisos, comisiones, faltas y reposos.",
    porque:
      "Todo esto asocia a un funcionario (y las guardias a una estación). Requiere que las Fases 2 y 4 estén completas.",
    subpasos: [
      { id: "ops-guardias", label: "Guardias", href: "/ops/guardias/nuevo" },
      { id: "ops-vacaciones", label: "Vacaciones", href: "/ops/vacaciones/nuevo" },
      { id: "ops-permisos", label: "Permisos", href: "/ops/permisos/nuevo" },
      { id: "ops-comisiones", label: "Comisiones", href: "/ops/comisiones/nuevo" },
      { id: "ops-faltas", label: "Faltas", href: "/ops/faltas/nuevo" },
      { id: "ops-reposos", label: "Reposos", href: "/salud/reposos/nuevo" },
    ],
  },
  {
    id: "gestion",
    titulo: "7 · Carrera, beneficios y equipo",
    Icon: Award,
    objetivo:
      "Cargar ascensos y cursos, beneficios/ayudas, egresos y asignación de equipo (protección y radios).",
    porque:
      "Es la capa de gestión: todo depende de que el personal ya exista. Cárgalo al final.",
    subpasos: [
      { id: "ges-ascensos", label: "Ascensos", href: "/carrera/ascensos/nuevo" },
      { id: "ges-cursos", label: "Cursos", href: "/carrera/cursos/nuevo" },
      { id: "ges-beneficios", label: "Beneficios / Ayudas", href: "/beneficios/nuevo" },
      { id: "ges-egresos", label: "Egresos (jubilación / fallecimiento)", href: "/egresos" },
      { id: "ges-proteccion", label: "Equipo de protección", href: "/equipo/proteccion/nuevo" },
      { id: "ges-radios", label: "Radios", href: "/equipo/radios/nuevo" },
    ],
  },
];

const TODOS_SUBPASOS = FASES.flatMap((f) => f.subpasos.map((s) => s.id));

interface Estado {
  subpasos: Record<string, boolean>;
  fases: Record<string, boolean>;
}

const VACIO: Estado = { subpasos: {}, fases: {} };

const VALORES_VALIDOS: { campo: string; valores: string }[] = [
  { campo: "Nacionalidad", valores: "V · E" },
  { campo: "Sexo", valores: "M · F" },
  { campo: "Tipo de personal", valores: "BOMBERO · BOMBERO_VOLUNTARIO · OBRERO · EMPLEADO · CONTRATADO · PASANTE" },
  { campo: "Estatus", valores: "ACTIVO · REPOSO · COMISION · PRE_JUBILADO · JUBILADO · EGRESADO · FALLECIDO · SUSPENDIDO · BAJA_DESHONROSA · PERMISO_LARGO" },
  { campo: "Tipo de actividad", valores: "CULTURAL · DEPORTIVA · MUSICAL · CIENTIFICA · LABORAL · ACADEMICA" },
  { campo: "Fechas", valores: "Formato AAAA-MM-DD (ej. 1990-05-21)" },
];

export default function WizardCarga({
  usuario,
  personalCargado,
}: {
  usuario: string;
  personalCargado: number | null;
}) {
  const storageKey = `bcd_wizard_${usuario || "anon"}`;
  const [estado, setEstado] = useState<Estado>(VACIO);
  const [cargado, setCargado] = useState(false);
  const [refValores, setRefValores] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setEstado({ ...VACIO, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
    setCargado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persistir(next: Estado) {
    setEstado(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }

  function toggleSub(id: string) {
    persistir({ ...estado, subpasos: { ...estado.subpasos, [id]: !estado.subpasos[id] } });
  }
  function toggleFase(id: string) {
    persistir({ ...estado, fases: { ...estado.fases, [id]: !estado.fases[id] } });
  }

  const totalHechos = useMemo(
    () => TODOS_SUBPASOS.filter((id) => estado.subpasos[id]).length,
    [estado],
  );
  const pct = Math.round((totalHechos / TODOS_SUBPASOS.length) * 100);

  function faseDesbloqueada(idx: number): boolean {
    if (idx === 0) return true;
    const prev = FASES[idx - 1];
    return !!estado.fases[prev.id];
  }

  if (!cargado) {
    return <div className="text-sm text-muted-foreground">Cargando asistente…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Barra de progreso */}
      <div className="bg-card border border-border rounded p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-foreground">Progreso general</div>
          <div className="text-sm font-semibold text-primary tabular-nums">{pct}%</div>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {totalHechos} de {TODOS_SUBPASOS.length} pasos marcados.
          {personalCargado !== null && (
            <> {" · "}<span className="font-medium text-foreground">{personalCargado}</span> funcionarios ya en el sistema.</>
          )}
        </div>
      </div>

      {/* Aviso de método */}
      <div className="bg-primary/5 border border-primary/20 rounded p-4 flex gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-[13px] text-foreground/90 leading-relaxed">
          Carga en <strong>orden de arriba hacia abajo</strong>. Cada fase se
          desbloquea cuando marcas la anterior como completada — así garantizas
          que nunca falte un dato del que dependa el siguiente.{" "}
          <button
            onClick={() => setRefValores((v) => !v)}
            className="text-primary underline underline-offset-2 font-medium"
          >
            {refValores ? "Ocultar" : "Ver"} valores válidos
          </button>
        </div>
      </div>

      {refValores && (
        <div className="bg-card border border-border rounded p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Valores válidos (para no equivocar la carga)
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {VALORES_VALIDOS.map((v) => (
              <div key={v.campo} className="text-[13px]">
                <span className="font-medium text-foreground">{v.campo}: </span>
                <span className="text-muted-foreground">{v.valores}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            En la mayoría de campos el formulario te muestra una lista desplegable,
            así que no tienes que escribir estos valores a mano.
          </p>
        </div>
      )}

      {/* Fases */}
      <ol className="space-y-4">
        {FASES.map((fase, idx) => {
          const abierta = faseDesbloqueada(idx);
          const completa = !!estado.fases[fase.id];
          const hechosFase = fase.subpasos.filter((s) => estado.subpasos[s.id]).length;
          const Icon = fase.Icon;
          return (
            <li
              key={fase.id}
              className={`border rounded overflow-hidden transition-colors ${
                completa
                  ? "border-emerald-500/40 bg-emerald-500/[0.03]"
                  : abierta
                    ? "border-border bg-card"
                    : "border-border/60 bg-muted/30"
              }`}
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${
                      abierta ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {abierta ? <Icon className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-foreground">{fase.titulo}</h3>
                      {completa && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> Completa
                        </span>
                      )}
                      {!abierta && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Lock className="w-3 h-3" /> Completa la fase anterior
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-foreground/80 leading-relaxed">{fase.objetivo}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      <span className="font-medium">¿Por qué en este orden? </span>{fase.porque}
                    </p>
                  </div>
                </div>

                {abierta && (
                  <div className="mt-4 pl-12 space-y-2">
                    {fase.subpasos.map((s) => {
                      const hecho = !!estado.subpasos[s.id];
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0"
                        >
                          <button
                            onClick={() => toggleSub(s.id)}
                            className="shrink-0"
                            aria-label={hecho ? "Marcar pendiente" : "Marcar hecho"}
                          >
                            {hecho ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground/50" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[13px] ${hecho ? "text-muted-foreground line-through" : "text-foreground"}`}>
                              {s.label}
                            </div>
                            {s.hint && (
                              <div className="text-[11px] text-muted-foreground">{s.hint}</div>
                            )}
                          </div>
                          {s.href && (
                            <Link
                              href={s.href}
                              className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                            >
                              Ir <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      );
                    })}

                    <div className="pt-3 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {hechosFase}/{fase.subpasos.length} pasos de esta fase
                      </span>
                      <button
                        onClick={() => toggleFase(fase.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
                          completa
                            ? "bg-muted text-muted-foreground hover:bg-muted/70"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {completa ? (
                          <>Reabrir fase</>
                        ) : (
                          <>Marcar fase completa <ChevronRight className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {pct === 100 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-5 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            ¡Carga inicial completada!
          </p>
          <p className="text-xs text-muted-foreground">
            Todos los pasos marcados. El sistema quedó poblado con la data real del cuerpo.
          </p>
        </div>
      )}
    </div>
  );
}
