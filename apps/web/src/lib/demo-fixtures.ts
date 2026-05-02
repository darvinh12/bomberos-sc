/**
 * Demo fixtures temporales — eliminar antes de producción.
 * Activado vía NEXT_PUBLIC_DEMO_MODE=1.
 */

/**
 * Función en lugar de constante: garantiza que se evalúe en runtime
 * (Next.js sólo inlina constantes top-level en client bundles).
 */
export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") return true;
  if (process.env.DEMO_MODE === "1") return true;
  // Fallback: si NO hay API URL configurada, asumimos modo demo.
  if (!process.env.NEXT_PUBLIC_API_URL && !process.env.API_INTERNAL_URL) return true;
  return false;
}

/** @deprecated usar isDemoMode() para evaluación runtime correcta */
export const DEMO_MODE = isDemoMode();

const NOMBRES = [
  "José",
  "María",
  "Carlos",
  "Ana",
  "Luis",
  "Carmen",
  "Pedro",
  "Rosa",
  "Miguel",
  "Andrea",
];
const APELLIDOS = [
  "González",
  "Rodríguez",
  "Pérez",
  "Hernández",
  "Martínez",
  "López",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Flores",
];

const ESTATUS = [
  "ACTIVO",
  "ACTIVO",
  "ACTIVO",
  "ACTIVO",
  "ACTIVO",
  "REPOSO",
  "COMISION",
  "PRE_JUBILADO",
  "JUBILADO",
  "EGRESADO",
];

const seed = (i: number) => {
  let h = i;
  return () => {
    h = (h * 9301 + 49297) % 233280;
    return h / 233280;
  };
};

const gen = seed(42);

const FUNCIONARIOS = Array.from({ length: 50 }, (_, i) => {
  const id = i + 1;
  const nombres = `${NOMBRES[Math.floor(gen() * NOMBRES.length)]} ${
    NOMBRES[Math.floor(gen() * NOMBRES.length)]
  }`;
  const apellidos = `${APELLIDOS[Math.floor(gen() * APELLIDOS.length)]} ${
    APELLIDOS[Math.floor(gen() * APELLIDOS.length)]
  } DEMO`;
  const estatus = ESTATUS[Math.floor(gen() * ESTATUS.length)];
  const cedula = 10_000_000 + Math.floor(gen() * 20_000_000);
  const fecha_primer_ingreso = `${
    1990 + Math.floor(gen() * 30)
  }-${String(1 + Math.floor(gen() * 12)).padStart(2, "0")}-${String(
    1 + Math.floor(gen() * 28),
  ).padStart(2, "0")}`;
  return {
    id,
    nacionalidad: gen() > 0.1 ? "V" : "E",
    cedula,
    apellidos,
    nombres,
    nombre_completo: `${apellidos}, ${nombres}`,
    estatus,
    jerarquia_id: 1 + Math.floor(gen() * 12),
    cargo_id: null,
    zona_id: 1 + Math.floor(gen() * 4),
    estacion_id: 1 + Math.floor(gen() * 12),
    fecha_primer_ingreso,
    pre_jubilado: estatus === "PRE_JUBILADO",
  };
});

const JERARQUIAS = [
  { id: 1, codigo: "BOMB", nombre: "Bombero", nombre_corto: "BOMB", orden: 1, activo: true, es_oficial: false, es_tropa: true, es_estado_mayor: false },
  { id: 2, codigo: "DIST", nombre: "Distinguido", nombre_corto: "DIST", orden: 2, activo: true, es_oficial: false, es_tropa: true, es_estado_mayor: false },
  { id: 3, codigo: "CABO", nombre: "Cabo Segundo", nombre_corto: "C2DO", orden: 3, activo: true, es_oficial: false, es_tropa: true, es_estado_mayor: false },
  { id: 4, codigo: "CABP", nombre: "Cabo Primero", nombre_corto: "C1RO", orden: 4, activo: true, es_oficial: false, es_tropa: true, es_estado_mayor: false },
  { id: 5, codigo: "SARG", nombre: "Sargento Segundo", nombre_corto: "S2DO", orden: 5, activo: true, es_oficial: false, es_tropa: true, es_estado_mayor: false },
  { id: 6, codigo: "SARP", nombre: "Sargento Primero", nombre_corto: "S1RO", orden: 6, activo: true, es_oficial: false, es_tropa: true, es_estado_mayor: false },
  { id: 7, codigo: "SUBT", nombre: "Subteniente", nombre_corto: "SUBT", orden: 7, activo: true, es_oficial: true, es_tropa: false, es_estado_mayor: false },
  { id: 8, codigo: "TENIE", nombre: "Teniente", nombre_corto: "TTE", orden: 8, activo: true, es_oficial: true, es_tropa: false, es_estado_mayor: false },
  { id: 9, codigo: "CAPT", nombre: "Capitán", nombre_corto: "CAP", orden: 9, activo: true, es_oficial: true, es_tropa: false, es_estado_mayor: false },
  { id: 10, codigo: "MAYO", nombre: "Mayor", nombre_corto: "MAY", orden: 10, activo: true, es_oficial: true, es_tropa: false, es_estado_mayor: true },
  { id: 11, codigo: "TENC", nombre: "Teniente Coronel", nombre_corto: "TCNL", orden: 11, activo: true, es_oficial: true, es_tropa: false, es_estado_mayor: true },
  { id: 12, codigo: "CORO", nombre: "Coronel", nombre_corto: "CNL", orden: 12, activo: true, es_oficial: true, es_tropa: false, es_estado_mayor: true },
];

const ZONAS = [
  { id: 1, codigo: "Z1", nombre: "Zona 1 — Centro", activo: true },
  { id: 2, codigo: "Z2", nombre: "Zona 2 — Este", activo: true },
  { id: 3, codigo: "Z3", nombre: "Zona 3 — Oeste", activo: true },
  { id: 4, codigo: "Z4", nombre: "Zona 4 — Sur", activo: true },
];

const ESTACIONES = [
  { id: 1, codigo: "E1", nombre: "Estación Central", activo: true, zona_id: 1 },
  { id: 2, codigo: "E2", nombre: "Estación La Candelaria", activo: true, zona_id: 1 },
  { id: 3, codigo: "E3", nombre: "Estación El Recreo", activo: true, zona_id: 1 },
  { id: 4, codigo: "E4", nombre: "Estación Chacao", activo: true, zona_id: 2 },
  { id: 5, codigo: "E5", nombre: "Estación Petare", activo: true, zona_id: 2 },
  { id: 6, codigo: "E6", nombre: "Estación El Hatillo", activo: true, zona_id: 2 },
  { id: 7, codigo: "E7", nombre: "Estación Catia", activo: true, zona_id: 3 },
  { id: 8, codigo: "E8", nombre: "Estación La Vega", activo: true, zona_id: 3 },
  { id: 9, codigo: "E9", nombre: "Estación Antímano", activo: true, zona_id: 3 },
  { id: 10, codigo: "E10", nombre: "Estación El Valle", activo: true, zona_id: 4 },
  { id: 11, codigo: "E11", nombre: "Estación Coche", activo: true, zona_id: 4 },
  { id: 12, codigo: "E12", nombre: "Estación Macarao", activo: true, zona_id: 4 },
];

const cat = (n: number, prefix: string, label: string) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    codigo: `${prefix}${i + 1}`,
    nombre: `${label} ${i + 1}`,
    activo: true,
  }));

function paginate<T>(items: T[], page: number, page_size: number) {
  const start = (page - 1) * page_size;
  return {
    items: items.slice(start, start + page_size),
    total: items.length,
    page,
    page_size,
    pages: Math.max(1, Math.ceil(items.length / page_size)),
  };
}

function parseQuery(path: string) {
  const [base, qs] = path.split("?");
  const params = new URLSearchParams(qs ?? "");
  return {
    base,
    page: Number(params.get("page") ?? 1),
    page_size: Number(params.get("page_size") ?? 25),
    estatus: params.get("estatus") ?? undefined,
    activo: params.get("activo"),
    autorizado: params.get("autorizado"),
    q: params.get("q") ?? undefined,
  };
}

const REPOSOS = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  nombre_completo: FUNCIONARIOS[Math.floor(gen() * 50)].nombre_completo,
  cedula: String(10_000_000 + Math.floor(gen() * 20_000_000)),
  fecha_inicio: "2026-04-01",
  fecha_fin: "2026-05-15",
  dias: 15 + Math.floor(gen() * 30),
  diagnostico: ["Lumbalgia", "Fractura tibia", "Gripe H1N1", "Cirugía menor"][
    Math.floor(gen() * 4)
  ],
  certificado: gen() > 0.3,
  zona: ZONAS[Math.floor(gen() * 4)].nombre,
  estacion: ESTACIONES[Math.floor(gen() * 12)].nombre,
}));

const VACACIONES = Array.from({ length: 22 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  nombre_completo: FUNCIONARIOS[Math.floor(gen() * 50)].nombre_completo,
  cedula: String(10_000_000 + Math.floor(gen() * 20_000_000)),
  periodo_anio: 2025 + Math.floor(gen() * 2),
  fecha_inicio: "2026-05-10",
  fecha_fin: "2026-05-31",
  dias_calendario: 22,
  dias_habiles: 15,
  bono_pagado: gen() > 0.4,
  monto_bono: gen() > 0.4 ? 1500 : null,
  autorizado: true,
  zona: ZONAS[Math.floor(gen() * 4)].nombre,
  estacion: ESTACIONES[Math.floor(gen() * 12)].nombre,
  estado: ["EN_CURSO", "PROGRAMADA", "FINALIZADA"][Math.floor(gen() * 3)],
}));

const GUARDIAS = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  fecha: `2026-05-${String(1 + (i % 30)).padStart(2, "0")}`,
  estacion_id: 1 + (i % 12),
  estacion: ESTACIONES[i % 12].nombre,
  seccion: ["A", "B", "C"][i % 3],
  turno: ["DIURNO", "NOCTURNO", "24H"][i % 3],
  hora_inicio: "07:00:00",
  hora_fin: "19:00:00",
  jefe_guardia_id: null,
  observaciones: null,
  cerrada: i > 7,
  funcionarios_count: 8 + Math.floor(gen() * 6),
}));

const PERMISOS = Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  tipo: ["MEDICO", "PERSONAL", "ESTUDIO", "MATRIMONIO"][i % 4],
  fecha_inicio: "2026-05-05",
  fecha_fin: "2026-05-07",
  horas: 8 * (1 + (i % 3)),
  motivo: "Trámite personal urgente",
  autorizado: i > 4,
}));

const COMISIONES = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  institucion_libre: [
    "Protección Civil",
    "Alcaldía Metropolitana",
    "Defensa Civil",
    "Hospital Militar",
  ][i % 4],
  cargo_comision: "Coordinador de área",
  fecha_inicio: "2026-01-15",
  fecha_fin: i > 3 ? "2026-04-30" : null,
  resolucion: `RES-2026-${100 + i}`,
  activo: i <= 3,
}));

const FALTAS = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  tipo_falta: ["LEVE", "MEDIA", "GRAVE"][i % 3],
  fecha: "2026-04-15",
  descripcion: "Inasistencia injustificada al servicio asignado",
  sancion: ["Amonestación", "Suspensión 3 días", "Suspensión 15 días"][i % 3],
  dias_suspension: [0, 3, 15][i % 3],
  fecha_inicio_susp: null,
  fecha_fin_susp: null,
  apelada: false,
}));

const CURSOS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  nombre_libre: [
    "Rescate vertical",
    "Materiales peligrosos",
    "Primeros auxilios avanzados",
    "Bombero forestal",
  ][i % 4],
  institucion: "Academia Nacional de Bomberos",
  fecha_inicio: "2026-02-01",
  fecha_fin: "2026-02-28",
  horas: 40 + (i % 4) * 20,
  nota: 80 + Math.floor(gen() * 20),
  aprobado: gen() > 0.15,
}));

const ASCENSOS = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  jerarquia_anterior_id: 1 + (i % 11),
  jerarquia_nueva_id: 2 + (i % 11),
  fecha_efectiva: "2025-12-15",
  resolucion: `RES-2025-${500 + i}`,
}));

const RECONOCIMIENTOS = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  nombre_libre: [
    "Medalla al mérito",
    "Reconocimiento por labor humanitaria",
    "Distinción 25 años de servicio",
  ][i % 3],
  fecha_otorgamiento: "2026-03-20",
  motivo: "Servicio destacado en operativo",
}));

const MERITOS = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  funcionario_id: i + 1,
  periodo_id: 1,
  puntaje_evaluacion: 70 + gen() * 30,
  puntaje_cursos: 5 + gen() * 15,
  puntaje_actividades: 2 + gen() * 8,
  puntaje_condecoraciones: gen() > 0.7 ? 5 : 0,
  puntaje_faltas: gen() > 0.85 ? -5 : 0,
  puntaje_total: 0,
  posicion: i + 1,
})).map((m) => ({
  ...m,
  puntaje_total:
    (m.puntaje_evaluacion ?? 0) +
    (m.puntaje_cursos ?? 0) +
    (m.puntaje_actividades ?? 0) +
    (m.puntaje_condecoraciones ?? 0) +
    (m.puntaje_faltas ?? 0),
}));

const PROTECCION = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  tipo_id: 1 + (i % 5),
  marca: ["MSA", "Honeywell", "Drager", "3M"][i % 4],
  modelo: `Mod-${100 + i}`,
  numero_serie: `SN${10000 + i}`,
  talla_id: null,
  fecha_adquisicion: "2024-06-15",
  fecha_vence: "2029-06-15",
  estatus: ["DISPONIBLE", "ASIGNADO", "EN_REPARACION", "DADO_DE_BAJA"][i % 4],
  estacion_id: 1 + (i % 12),
}));

const RADIOS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  modelo_id: 1,
  serial: `RD${20000 + i}`,
  placa_inv: `INV-${i + 1}`,
  frecuencia: "VHF 154.250",
  canal: String(i + 1),
  fecha_adquisicion: "2024-09-01",
  estatus: ["DISPONIBLE", "ASIGNADO"][i % 2],
  estacion_id: 1 + (i % 12),
}));

const AYUDAS = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  tipo_solicitud_id: 1 + (i % 4),
  monto_solicitado: 1500 + Math.floor(gen() * 4000),
  monto_aprobado: i > 2 ? 1500 + Math.floor(gen() * 3000) : null,
  monto_pagado: i > 5 ? 1500 + Math.floor(gen() * 2500) : null,
  fecha_solicitud: "2026-04-10",
  fecha_aprobacion: i > 2 ? "2026-04-15" : null,
  fecha_pago: i > 5 ? "2026-04-22" : null,
  motivo:
    "Apoyo económico por gastos médicos imprevistos del funcionario o familiar directo.",
  estatus: ["SOLICITADO", "EN_REVISION", "APROBADO", "PAGADO", "RECHAZADO"][
    i % 5
  ],
}));

const JUBILADOS = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  fecha_jubilacion: `${2020 + (i % 6)}-12-31`,
  años_servicio: 25 + (i % 10),
  tipo_jubilacion: ["ORDINARIA", "INVALIDEZ", "ESPECIAL"][i % 3],
  pension_mensual: 4000 + Math.floor(gen() * 3000),
  moneda: "VES",
  resolucion: `JUB-${2020 + i}`,
  activo: true,
}));

const SOL_JUBILACION = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  funcionario_id: 1 + Math.floor(gen() * 50),
  fecha_solicitud: "2026-03-01",
  fecha_efectiva_propuesta: "2026-12-31",
  años_servicio: 25 + (i % 8),
  motivo: "Cumple requisitos de antigüedad",
  estatus: ["SOLICITADA", "EN_TRAMITE", "APROBADA"][i % 3],
  resolucion: null,
}));

const USUARIOS = [
  {
    id: 1,
    usuario: "admin",
    nombre_completo: "Administrador DEMO",
    correo: "admin@bomberos.gob.ve",
    funcionario_id: null,
    activo: true,
    bloqueado: false,
    motivo_bloqueo: null,
    intentos_fallidos: 0,
    debe_cambiar_password: false,
    mfa_activo: false,
    ultimo_acceso: new Date().toISOString(),
  },
  {
    id: 2,
    usuario: "rrhh.ana",
    nombre_completo: "Ana Pérez RRHH DEMO",
    correo: "rrhh@bomberos.gob.ve",
    funcionario_id: 5,
    activo: true,
    bloqueado: false,
    motivo_bloqueo: null,
    intentos_fallidos: 0,
    debe_cambiar_password: false,
    mfa_activo: true,
    ultimo_acceso: "2026-05-01T22:30:00Z",
  },
  {
    id: 3,
    usuario: "supervisor.luis",
    nombre_completo: "Luis González Supervisor DEMO",
    correo: null,
    funcionario_id: 12,
    activo: true,
    bloqueado: true,
    motivo_bloqueo: "Demasiados intentos fallidos",
    intentos_fallidos: 5,
    debe_cambiar_password: true,
    mfa_activo: false,
    ultimo_acceso: "2026-04-28T08:15:00Z",
  },
];

export const DEMO_LOGIN_RESPONSE = {
  access_token: "demo.access.token.not-real",
  refresh_token: "demo.refresh.token.not-real",
  token_type: "bearer",
  expires_in: 60 * 30,
};

export const DEMO_ME = {
  id: 1,
  usuario: "admin",
  nombre_completo: "Administrador DEMO",
  correo: "admin@bomberos.gob.ve",
  roles: ["ADMIN"],
  debe_cambiar_password: false,
};

export function demoResolve(path: string): unknown {
  const { base, page, page_size, estatus, q } = parseQuery(path);

  switch (true) {
    case base === "/auth/me":
      return DEMO_ME;

    case base === "/funcionarios": {
      let items = FUNCIONARIOS;
      if (estatus) items = items.filter((f) => f.estatus === estatus);
      if (q) {
        const needle = q.toLowerCase();
        items = items.filter(
          (f) =>
            f.nombre_completo.toLowerCase().includes(needle) ||
            String(f.cedula).includes(needle),
        );
      }
      return paginate(items, page, page_size);
    }

    case base.startsWith("/funcionarios/"): {
      const id = Number(base.split("/")[2]);
      const f = FUNCIONARIOS.find((x) => x.id === id) ?? FUNCIONARIOS[0];
      return {
        ...f,
        fecha_nacimiento: "1985-06-12",
        sexo: id % 3 === 0 ? "F" : "M",
        estado_civil_id: 1,
        grupo_sanguineo_id: 3,
        tipo_personal: "UNIFORMADO",
        numero_empleado: `EMP-${1000 + f.id}`,
        numero_equipo: String(2000 + f.id),
        telefono_movil: "+58 414 555-0100",
        correo: `funcionario${f.id}@bomberos.gob.ve`,
        persona_contacto: "Familiar autorizado",
        telefono_contacto: "+58 212 555-0100",
        profesion: "Bombero profesional",
        iutb: true,
        egresado_unes: false,
        foto_url: null,
        observaciones: null,
      };
    }

    case base === "/catalogos/jerarquias":
      return JERARQUIAS;
    case base === "/catalogos/zonas":
      return ZONAS;
    case base === "/catalogos/estaciones":
      return ESTACIONES;
    case base === "/catalogos/cargos":
      return cat(20, "C", "Cargo");
    case base === "/catalogos/condiciones":
      return cat(8, "CD", "Condición");
    case base === "/catalogos/niveles-educativos":
      return cat(7, "N", "Nivel educativo");
    case base === "/catalogos/especialidades":
      return cat(15, "ESP", "Especialidad");
    case base === "/catalogos/estados-civiles":
      return cat(5, "EC", "Estado civil");
    case base === "/catalogos/grupos-sanguineos":
      return [
        "O+",
        "O-",
        "A+",
        "A-",
        "B+",
        "B-",
        "AB+",
        "AB-",
      ].map((c, i) => ({ id: i + 1, codigo: c, nombre: c, activo: true }));
    case base === "/catalogos/bancos":
      return cat(12, "BNC", "Banco");
    case base === "/catalogos/divisiones":
      return cat(6, "DIV", "División");
    case base === "/catalogos/areas":
      return cat(10, "AR", "Área");
    case base === "/catalogos/dependencias":
      return cat(8, "DEP", "Dependencia");

    case base === "/dashboard":
      return {
        personal_activo: FUNCIONARIOS.filter((f) => f.estatus === "ACTIVO").length,
        personal_jubilado: FUNCIONARIOS.filter((f) => f.estatus === "JUBILADO").length,
        personal_reposo: FUNCIONARIOS.filter((f) => f.estatus === "REPOSO").length,
        personal_comision: FUNCIONARIOS.filter((f) => f.estatus === "COMISION").length,
        personal_pre_jubilado: FUNCIONARIOS.filter((f) => f.estatus === "PRE_JUBILADO").length,
        personal_fallecido: 0,
        hombres: 35,
        mujeres: 15,
        reposos_vigentes: REPOSOS.length,
        vacaciones_en_curso: VACACIONES.filter((v) => v.estado === "EN_CURSO").length,
        permisos_hoy: 3,
        postulados_pendientes: 5,
        ayudas_pendientes: AYUDAS.filter((a) =>
          ["SOLICITADO", "EN_REVISION"].includes(a.estatus),
        ).length,
      };
    case base === "/dashboard/distribucion-zona":
      return ZONAS.flatMap((z) =>
        JERARQUIAS.slice(0, 6).map((j) => ({
          zona_id: z.id,
          zona: z.nombre,
          jerarquia_id: j.id,
          jerarquia: j.nombre,
          total: 2 + Math.floor(gen() * 6),
          hombres: 1 + Math.floor(gen() * 4),
          mujeres: Math.floor(gen() * 3),
          activos: 2 + Math.floor(gen() * 4),
          en_reposo: Math.floor(gen() * 2),
          en_comision: Math.floor(gen() * 2),
        })),
      );
    case base === "/dashboard/reposos-activos":
    case base === "/dashboard/reposos-actuales":
      return REPOSOS;
    case base === "/dashboard/vacaciones-actuales":
      return VACACIONES;

    case base === "/ops/guardias":
      return paginate(GUARDIAS, page, page_size);
    case base === "/ops/permisos":
      return paginate(PERMISOS, page, page_size);
    case base === "/ops/vacaciones":
      return paginate(VACACIONES, page, page_size);
    case base === "/ops/comisiones":
      return paginate(COMISIONES, page, page_size);
    case base === "/ops/faltas":
      return paginate(FALTAS, page, page_size);

    case base === "/carrera/cursos-realizados":
      return paginate(CURSOS, page, page_size);
    case base === "/carrera/ascensos":
      return paginate(ASCENSOS, page, page_size);
    case base === "/carrera/reconocimientos":
      return paginate(RECONOCIMIENTOS, page, page_size);
    case base === "/carrera/meritos":
      return paginate(MERITOS, page, page_size);

    case base === "/equipo/proteccion/inventario":
      return paginate(PROTECCION, page, page_size);
    case base === "/equipo/radios":
      return paginate(RADIOS, page, page_size);

    case base === "/beneficios/ayudas":
      return paginate(AYUDAS, page, page_size);

    case base === "/egresos/jubilados":
      return paginate(JUBILADOS, page, page_size);
    case base === "/egresos/solicitudes-jubilacion":
      return paginate(SOL_JUBILACION, page, page_size);

    case base === "/admin/usuarios":
      return paginate(USUARIOS, page, page_size);

    default:
      return paginate([], page, page_size);
  }
}
