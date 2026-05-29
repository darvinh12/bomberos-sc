/**
 * Demo fixtures temporales — eliminar antes de producción.
 * Activado vía NEXT_PUBLIC_DEMO_MODE=1.
 */

/**
 * Modo demo. Hardcodeado a true mientras el backend FastAPI no esté
 * disponible públicamente. Para desactivar (cuando haya API real),
 * cambiar a false o leer process.env.NEXT_PUBLIC_DEMO_MODE.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export const DEMO_MODE = false;

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
  const numeric = (k: string) => {
    const v = params.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  return {
    base,
    page: Number(params.get("page") ?? 1),
    page_size: Number(params.get("page_size") ?? 25),
    estatus: params.get("estatus") ?? undefined,
    activo: params.get("activo"),
    autorizado: params.get("autorizado"),
    q: params.get("q") ?? undefined,
    zona_id: numeric("zona_id"),
    estacion_id: numeric("estacion_id"),
    jerarquia_id: numeric("jerarquia_id"),
    funcionario_id: numeric("funcionario_id"),
  };
}

/**
 * Generador pseudo-aleatorio determinístico por id. Mismo `id` produce
 * siempre la misma secuencia, así la ficha de cada funcionario es estable.
 */
function rngFor(id: number, salt = 0) {
  let h = (id * 2654435761 + salt * 7691) >>> 0;
  return () => {
    h = (h * 9301 + 49297) >>> 0;
    h = h % 233280;
    return h / 233280;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDateInYear(rng: () => number, year: number): string {
  const m = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---- Generadores por funcionario (datos pocos pero coherentes) ----

function generarRepososPara(fid: number) {
  const rng = rngFor(fid, 11);
  const n = Math.floor(rng() * 3); // 0..2
  const diag = ["Lumbalgia", "Fractura tibia", "Gripe H1N1", "Cirugía menor", "Dengue", "Conjuntivitis"];
  return Array.from({ length: n }, (_, i) => {
    const fecha_inicio = isoDateInYear(rng, 2025 + (i % 2));
    const dias = 3 + Math.floor(rng() * 25);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo_reposo_id: 1 + Math.floor(rng() * 4),
      diagnostico_libre: pick(rng, diag),
      fecha_inicio,
      fecha_fin: addDays(fecha_inicio, dias),
      dias,
      anulado: false,
    };
  });
}

function generarVacacionesPara(fid: number) {
  const rng = rngFor(fid, 22);
  const n = 1 + Math.floor(rng() * 2); // 1..2
  return Array.from({ length: n }, (_, i) => {
    const periodo_anio = 2024 + i;
    const fecha_inicio = isoDateInYear(rng, periodo_anio);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      periodo_anio,
      fecha_inicio,
      fecha_fin: addDays(fecha_inicio, 21),
      dias_calendario: 22,
      dias_habiles: 15,
      bono_pagado: rng() > 0.3,
      monto_bono: rng() > 0.3 ? 1500 : null,
      autorizado: true,
      estado: pick(rng, ["FINALIZADA", "EN_CURSO", "PROGRAMADA"]),
    };
  });
}

function generarPermisosPara(fid: number) {
  const rng = rngFor(fid, 33);
  const n = Math.floor(rng() * 3); // 0..2
  const tipos = ["MEDICO", "PERSONAL", "ESTUDIO", "MATRIMONIO"];
  return Array.from({ length: n }, (_, i) => {
    const fecha_inicio = isoDateInYear(rng, 2025);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo: pick(rng, tipos),
      fecha_inicio,
      fecha_fin: addDays(fecha_inicio, 1 + Math.floor(rng() * 3)),
      horas: 8 * (1 + Math.floor(rng() * 3)),
      motivo: "Trámite personal urgente",
      autorizado: rng() > 0.2,
    };
  });
}

function generarComisionesPara(fid: number) {
  const rng = rngFor(fid, 44);
  const n = Math.floor(rng() * 2); // 0..1
  const instituciones = ["Protección Civil", "Alcaldía Metropolitana", "Defensa Civil", "Hospital Militar"];
  return Array.from({ length: n }, (_, i) => {
    const fecha_inicio = isoDateInYear(rng, 2024);
    const activa = rng() > 0.5;
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      institucion_libre: pick(rng, instituciones),
      cargo_comision: "Coordinador de área",
      fecha_inicio,
      fecha_fin: activa ? null : addDays(fecha_inicio, 90 + Math.floor(rng() * 180)),
      resolucion: `RES-2024-${100 + fid}`,
      activo: activa,
    };
  });
}

function generarFaltasPara(fid: number) {
  const rng = rngFor(fid, 55);
  const n = rng() > 0.7 ? 1 : 0;
  const tipos: ("LEVE" | "MEDIA" | "GRAVE")[] = ["LEVE", "MEDIA", "GRAVE"];
  return Array.from({ length: n }, (_, i) => {
    const tipo = pick(rng, tipos);
    const sancionMap = { LEVE: "Amonestación", MEDIA: "Suspensión 3 días", GRAVE: "Suspensión 15 días" };
    const diasMap = { LEVE: 0, MEDIA: 3, GRAVE: 15 };
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo_falta: tipo,
      fecha: isoDateInYear(rng, 2025),
      descripcion: "Inasistencia injustificada al servicio asignado",
      sancion: sancionMap[tipo],
      dias_suspension: diasMap[tipo],
      fecha_inicio_susp: null,
      fecha_fin_susp: null,
      apelada: false,
    };
  });
}

function generarGuardiasPara(fid: number) {
  const rng = rngFor(fid, 66);
  const n = 2 + Math.floor(rng() * 3); // 2..4
  return Array.from({ length: n }, (_, i) => {
    const fecha = isoDateInYear(rng, 2026);
    const estacionId = 1 + Math.floor(rng() * 12);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      fecha,
      estacion_id: estacionId,
      estacion: ESTACIONES[estacionId - 1].nombre,
      seccion: pick(rng, ["A", "B", "C"]),
      turno: pick(rng, ["DIURNO", "NOCTURNO", "24H"]),
      hora_inicio: "07:00:00",
      hora_fin: "19:00:00",
      jefe_guardia_id: null,
      observaciones: null,
      cerrada: rng() > 0.4,
    };
  });
}

function generarCursosPara(fid: number) {
  const rng = rngFor(fid, 77);
  const n = 1 + Math.floor(rng() * 3); // 1..3
  const cursos = [
    "Rescate vertical",
    "Materiales peligrosos",
    "Primeros auxilios avanzados",
    "Bombero forestal",
    "Manejo de defensa de incendios estructurales",
  ];
  return Array.from({ length: n }, (_, i) => {
    const fecha_inicio = isoDateInYear(rng, 2023 + (i % 3));
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      nombre_libre: pick(rng, cursos),
      institucion: "Academia Nacional de Bomberos",
      fecha_inicio,
      fecha_fin: addDays(fecha_inicio, 20 + Math.floor(rng() * 30)),
      horas: 40 + Math.floor(rng() * 80),
      nota: 75 + Math.floor(rng() * 25),
      aprobado: rng() > 0.1,
    };
  });
}

function generarAscensosPara(fid: number) {
  const rng = rngFor(fid, 88);
  const n = Math.floor(rng() * 3); // 0..2
  return Array.from({ length: n }, (_, i) => ({
    id: fid * 100 + i + 1,
    funcionario_id: fid,
    jerarquia_anterior_id: 1 + i,
    jerarquia_nueva_id: 2 + i,
    fecha_efectiva: isoDateInYear(rng, 2018 + i * 3),
    resolucion: `RES-${2018 + i * 3}-${500 + fid}`,
  }));
}

function generarReconocimientosPara(fid: number) {
  const rng = rngFor(fid, 99);
  const n = Math.floor(rng() * 2); // 0..1
  const nombres = [
    "Medalla al mérito",
    "Reconocimiento por labor humanitaria",
    "Distinción 25 años de servicio",
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: fid * 100 + i + 1,
    funcionario_id: fid,
    nombre_libre: pick(rng, nombres),
    fecha_otorgamiento: isoDateInYear(rng, 2023 + i),
    motivo: "Servicio destacado en operativo",
  }));
}

function generarMeritosPara(fid: number) {
  const rng = rngFor(fid, 110);
  const ev = 70 + rng() * 30;
  const cu = 5 + rng() * 15;
  const ac = 2 + rng() * 8;
  const co = rng() > 0.7 ? 5 : 0;
  const fa = rng() > 0.85 ? -5 : 0;
  return [
    {
      id: fid,
      funcionario_id: fid,
      periodo_id: 1,
      puntaje_evaluacion: ev,
      puntaje_cursos: cu,
      puntaje_actividades: ac,
      puntaje_condecoraciones: co,
      puntaje_faltas: fa,
      puntaje_total: ev + cu + ac + co + fa,
      posicion: fid,
    },
  ];
}

function generarProteccionAsignacionesPara(fid: number) {
  const rng = rngFor(fid, 121);
  const n = 1 + Math.floor(rng() * 2); // 1..2
  const marcas = ["MSA", "Honeywell", "Drager", "3M"];
  return Array.from({ length: n }, (_, i) => {
    const devuelto = i === 0 ? false : rng() > 0.5;
    const fecha_entrega = isoDateInYear(rng, 2024 + i);
    return {
      id: fid * 100 + i + 1,
      inventario_id: fid * 10 + i + 1,
      funcionario_id: fid,
      fecha_entrega,
      estado_entrega: "Buen estado",
      documento_url: null,
      observaciones: null,
      fecha_devolucion: devuelto ? addDays(fecha_entrega, 180) : null,
      estado_devolucion: devuelto ? "Buen estado" : null,
      devuelto,
      marca: pick(rng, marcas),
      modelo: `Mod-${100 + i + fid}`,
      numero_serie: `SN${10000 + fid * 10 + i}`,
      tipo: pick(rng, ["Casco", "Chaqueta", "Pantalón", "Botas", "Guantes"]),
    };
  });
}

function generarRadiosAsignadasPara(fid: number) {
  const rng = rngFor(fid, 132);
  const n = rng() > 0.6 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => ({
    id: fid * 100 + i + 1,
    modelo_id: 1,
    serial: `RD${20000 + fid * 10 + i}`,
    placa_inv: `INV-${fid}-${i + 1}`,
    frecuencia: "VHF 154.250",
    canal: String(1 + Math.floor(rng() * 10)),
    fecha_adquisicion: isoDateInYear(rng, 2023),
    estatus: "ASIGNADO",
    estacion_id: 1 + Math.floor(rng() * 12),
    funcionario_id: fid,
    marca: pick(rng, ["Motorola", "Kenwood", "Icom"]),
    modelo: `Mod-R${100 + i}`,
    fecha_asignacion: isoDateInYear(rng, 2024),
  }));
}

function generarAyudasPara(fid: number) {
  const rng = rngFor(fid, 143);
  const n = Math.floor(rng() * 3); // 0..2
  const estatusList = ["SOLICITADO", "EN_REVISION", "APROBADO", "PAGADO", "RECHAZADO"];
  return Array.from({ length: n }, (_, i) => {
    const estatus = pick(rng, estatusList);
    const aprobado = ["APROBADO", "PAGADO"].includes(estatus);
    const pagado = estatus === "PAGADO";
    const fecha_solicitud = isoDateInYear(rng, 2025);
    const monto_solicitado = 1500 + Math.floor(rng() * 4000);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo_solicitud_id: 1 + Math.floor(rng() * 4),
      monto_solicitado,
      monto_aprobado: aprobado ? monto_solicitado - Math.floor(rng() * 500) : null,
      monto_pagado: pagado ? monto_solicitado - Math.floor(rng() * 500) : null,
      fecha_solicitud,
      fecha_aprobacion: aprobado ? addDays(fecha_solicitud, 5) : null,
      fecha_pago: pagado ? addDays(fecha_solicitud, 12) : null,
      motivo: "Apoyo económico por gastos médicos imprevistos.",
      estatus,
    };
  });
}

function generarLesionesPara(fid: number) {
  const rng = rngFor(fid, 154);
  const n = Math.floor(rng() * 2); // 0..1
  const desc = [
    "Esguince de tobillo durante operativo",
    "Quemadura de primer grado en antebrazo",
    "Contusión costal por caída",
  ];
  const gravedad = ["LEVE", "MODERADA", "GRAVE"];
  return Array.from({ length: n }, (_, i) => ({
    id: fid * 100 + i + 1,
    funcionario_id: fid,
    fecha: isoDateInYear(rng, 2025),
    descripcion: pick(rng, desc),
    gravedad: pick(rng, gravedad),
    requirio_hospitalizacion: rng() > 0.7,
  }));
}

function generarEvalFisicaPara(fid: number) {
  const rng = rngFor(fid, 165);
  const n = 1 + Math.floor(rng() * 2); // 1..2
  return Array.from({ length: n }, (_, i) => {
    const peso = 65 + Math.floor(rng() * 30);
    const tallaM = 1.6 + rng() * 0.25;
    const imc = peso / (tallaM * tallaM);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      fecha: isoDateInYear(rng, 2024 + i),
      resultado: imc < 25 ? "APTO" : imc < 30 ? "APTO_CON_OBSERVACIONES" : "NO_APTO",
      peso_kg: peso,
      talla_m: Number(tallaM.toFixed(2)),
      imc: Number(imc.toFixed(1)),
      observaciones: imc < 25 ? "Excelente condición" : "Recomendado plan de acondicionamiento",
    };
  });
}

function generarEvalDesempenoPara(fid: number) {
  const rng = rngFor(fid, 176);
  const n = 1 + Math.floor(rng() * 2); // 1..2
  return Array.from({ length: n }, (_, i) => {
    const nota = 70 + Math.floor(rng() * 30);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      periodo: `${2023 + i}-${2024 + i}`,
      fecha_evaluacion: isoDateInYear(rng, 2024 + i),
      nota,
      observaciones:
        nota >= 85 ? "Desempeño sobresaliente" : nota >= 75 ? "Desempeño satisfactorio" : "Requiere mejora",
    };
  });
}

// ---- Generadores para módulos nuevos de ficha (lista plana por funcionario) ----

function generarCargaFamiliarPara(fid: number) {
  const rng = rngFor(fid, 901);
  const cantidad = 1 + Math.floor(rng() * 4); // 1..4 familiares
  const PARENTESCOS = ["CONYUGE", "HIJO", "HIJA", "PADRE", "MADRE", "HERMANO"] as const;
  const CONDICIONES = ["TITULAR", "BENEFICIARIO_HCM", null] as const;
  const baseYear = 1960 + Math.floor(rng() * 50);
  return Array.from({ length: cantidad }, (_, i) => {
    const parentesco = pick(rng, PARENTESCOS);
    const sexo =
      parentesco === "HIJA" || parentesco === "MADRE"
        ? "F"
        : parentesco === "HIJO" || parentesco === "PADRE" || parentesco === "HERMANO"
        ? "M"
        : rng() > 0.5
        ? "F"
        : "M";
    const yearNac =
      parentesco === "HIJO" || parentesco === "HIJA"
        ? 2000 + Math.floor(rng() * 24)
        : parentesco === "PADRE" || parentesco === "MADRE"
        ? 1940 + Math.floor(rng() * 25)
        : baseYear + Math.floor(rng() * 10);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      parentesco,
      nacionalidad: rng() > 0.05 ? "V" : "E",
      cedula: 5_000_000 + Math.floor(rng() * 25_000_000),
      apellidos: pick(rng, APELLIDOS),
      nombres: `${pick(rng, NOMBRES)} ${pick(rng, NOMBRES)}`,
      fecha_nacimiento: isoDateInYear(rng, yearNac),
      sexo,
      condicion: pick(rng, CONDICIONES),
      observaciones: null,
    };
  });
}

function generarHistJerarquiasPara(fid: number) {
  const rng = rngFor(fid, 902);
  const cantidad = 1 + Math.floor(rng() * 5); // 1..5
  const ingreso = 1990 + Math.floor(rng() * 20);
  const ahora = new Date().getFullYear();
  const TIPOS_DOC = ["DECRETO", "RESOLUCION", "OFICIO"] as const;
  return Array.from({ length: cantidad }, (_, i) => {
    const year = ingreso + i * (3 + Math.floor(rng() * 5));
    if (year > ahora) return null;
    const jerarquia_id = Math.min(12, 1 + i + Math.floor(rng() * 2));
    const jer = JERARQUIAS.find((j) => j.id === jerarquia_id) ?? JERARQUIAS[0];
    const fecha = isoDateInYear(rng, year);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      fecha,
      jerarquia_id,
      jerarquia_nombre: jer.nombre,
      tipo_documento: pick(rng, TIPOS_DOC),
      numero_documento: `${100 + Math.floor(rng() * 900)}-${year}`,
      fecha_efectiva_nomina: addDays(fecha, Math.floor(rng() * 30)),
      observaciones: null,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

function generarHistUbicacionesPara(fid: number) {
  const rng = rngFor(fid, 903);
  const cantidad = 1 + Math.floor(rng() * 4); // 1..4
  const ingreso = 1995 + Math.floor(rng() * 18);
  const ahora = new Date().getFullYear();
  const HORARIOS = ["Diurno", "Nocturno", "24x48", "8 hrs administrativo"];
  const SECCIONES = ["A", "B", "C", "D"];
  const AGRUPACIONES = ["Operativa", "Administrativa", "Soporte", "Comando"];
  return Array.from({ length: cantidad }, (_, i) => {
    const year = ingreso + i * (3 + Math.floor(rng() * 4));
    if (year > ahora) return null;
    const estacion = pick(rng, ESTACIONES);
    const zona = ZONAS.find((z) => z.id === estacion.zona_id) ?? ZONAS[0];
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      fecha_desde: isoDateInYear(rng, year),
      cod_estacion: estacion.codigo,
      estacion_nombre: estacion.nombre,
      cod_zona: zona.codigo,
      zona_nombre: zona.nombre,
      cod_area: `AR${1 + Math.floor(rng() * 10)}`,
      cod_division: `DIV${1 + Math.floor(rng() * 6)}`,
      agrupacion: pick(rng, AGRUPACIONES),
      seccion: pick(rng, SECCIONES),
      horario: pick(rng, HORARIOS),
      observaciones: null,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

function generarTiempoAdmPublicaPara(fid: number) {
  const rng = rngFor(fid, 904);
  const cantidad = Math.floor(rng() * 3); // 0..2
  const DEPENDENCIAS = [
    "Ministerio de Salud",
    "Alcaldía de Caracas",
    "Gobernación de Miranda",
    "Ministerio del Interior y Justicia",
    "Protección Civil Nacional",
    "Defensoría del Pueblo",
    "Cuerpo de Bomberos de Vargas",
    "INAC",
  ];
  return Array.from({ length: cantidad }, (_, i) => {
    const yearIn = 1985 + Math.floor(rng() * 15) + i * 4;
    const fecha_ingreso = isoDateInYear(rng, yearIn);
    const dias = 365 * (1 + Math.floor(rng() * 6));
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      dependencia: pick(rng, DEPENDENCIAS),
      fecha_ingreso,
      fecha_egreso: addDays(fecha_ingreso, dias),
      observaciones: null,
    };
  });
}

function generarHabilidadesPara(fid: number) {
  const rng = rngFor(fid, 905);
  const cantidad = Math.floor(rng() * 4); // 0..3
  const HABILIDADES = [
    { nombre: "Rescate vertical", descripcion: "Técnicas de rescate con cuerdas en alturas" },
    { nombre: "Primeros auxilios avanzados", descripcion: "Soporte vital prehospitalario" },
    { nombre: "Buceo de rescate", descripcion: "Inmersión en operativos acuáticos" },
    { nombre: "Manejo de materiales peligrosos", descripcion: "Identificación y contención HAZMAT" },
    { nombre: "Conducción de vehículos pesados", descripcion: "Operación de cisternas y autobombas" },
    { nombre: "Operador de drones", descripcion: "Pilotaje de UAV para reconocimiento" },
    { nombre: "Combate de incendios forestales", descripcion: "Técnicas en terreno abierto" },
  ];
  return Array.from({ length: cantidad }, (_, i) => {
    const h = pick(rng, HABILIDADES);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      nombre: h.nombre,
      descripcion: h.descripcion,
      fecha_registro: isoDateInYear(rng, 2020 + Math.floor(rng() * 6)),
    };
  });
}

function generarActividadesPara(fid: number) {
  const rng = rngFor(fid, 906);
  const cantidad = Math.floor(rng() * 5); // 0..4
  const TIPOS = ["DEPORTIVA", "CULTURAL", "MUSICAL", "CIENTIFICA", "LABORAL", "ACADEMICA"] as const;
  const POR_TIPO: Record<typeof TIPOS[number], string[]> = {
    DEPORTIVA: ["Maratón institucional", "Torneo de fútbol interno", "Triatlón anual"],
    CULTURAL: ["Festival de tradiciones", "Exposición fotográfica", "Día del patrimonio"],
    MUSICAL: ["Banda institucional", "Coro de bomberos", "Concierto aniversario"],
    CIENTIFICA: ["Ponencia en congreso", "Publicación de investigación", "Jornada técnica"],
    LABORAL: ["Comité de seguridad", "Mesa de trabajo gremial", "Brigada de apoyo"],
    ACADEMICA: ["Charla en universidad", "Tutoría a cadetes", "Seminario externo"],
  };
  return Array.from({ length: cantidad }, (_, i) => {
    const tipo = pick(rng, TIPOS);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo,
      actividad: pick(rng, POR_TIPO[tipo]),
      observaciones: rng() > 0.6 ? "Participación destacada" : null,
    };
  });
}

function generarCarnetsPara(fid: number) {
  const rng = rngFor(fid, 907);
  const cantidad = 1 + Math.floor(rng() * 2); // 1..2
  const TIPOS = ["BRIGADISTA", "INSTITUCIONAL", "OPERATIVO"];
  const hoy = new Date();
  return Array.from({ length: cantidad }, (_, i) => {
    const tipo = pick(rng, TIPOS);
    const yearEm = hoy.getFullYear() - 1 - Math.floor(rng() * 3);
    const fecha_emision = isoDateInYear(rng, yearEm);
    // Mezcla de estados: ~30% vencidos, ~30% por vencer, ~40% vigentes con holgura
    const bucket = rng();
    let dias_vigencia: number;
    if (bucket < 0.3) {
      // vencido (vencimiento en el pasado, dentro de los últimos 6 meses)
      const diasDesdeEmision =
        Math.floor((hoy.getTime() - new Date(fecha_emision).getTime()) / (86400 * 1000));
      dias_vigencia = Math.max(30, diasDesdeEmision - 30 - Math.floor(rng() * 150));
    } else if (bucket < 0.6) {
      // próximo a vencer (vencimiento en próximos 60 días)
      const diasDesdeEmision =
        Math.floor((hoy.getTime() - new Date(fecha_emision).getTime()) / (86400 * 1000));
      dias_vigencia = diasDesdeEmision + 15 + Math.floor(rng() * 45);
    } else {
      // vigente con holgura
      dias_vigencia = 365 * (2 + Math.floor(rng() * 3));
    }
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo,
      numero: `CN-${yearEm}-${String(1000 + fid * 10 + i).padStart(5, "0")}`,
      fecha_emision,
      fecha_vencimiento: addDays(fecha_emision, dias_vigencia),
      brigadista: tipo === "BRIGADISTA",
      libro: String(1 + Math.floor(rng() * 30)),
      folio: String(1 + Math.floor(rng() * 200)),
      observaciones: null,
    };
  });
}

function generarHistCarnetsPara(fid: number) {
  const rng = rngFor(fid, 908);
  const cantidad = Math.floor(rng() * 4); // 0..3
  const TIPOS = ["BRIGADISTA", "INSTITUCIONAL", "OPERATIVO"];
  const MOTIVOS = [
    "Renovación por vencimiento",
    "Pérdida del carnet anterior",
    "Cambio de jerarquía",
    "Deterioro del documento",
    "Actualización de datos",
  ];
  return Array.from({ length: cantidad }, (_, i) => {
    const yearEm = 2005 + Math.floor(rng() * 15) + i * 2;
    const fecha_emision = isoDateInYear(rng, yearEm);
    const tipo = pick(rng, TIPOS);
    return {
      id: fid * 100 + i + 1,
      funcionario_id: fid,
      tipo,
      numero: `CN-${yearEm}-${String(500 + fid * 10 + i).padStart(5, "0")}`,
      fecha_emision,
      fecha_vencimiento: addDays(fecha_emision, 365 * (2 + Math.floor(rng() * 3))),
      brigadista: tipo === "BRIGADISTA",
      libro: String(1 + Math.floor(rng() * 30)),
      folio: String(1 + Math.floor(rng() * 200)),
      motivo_cambio: pick(rng, MOTIVOS),
      observaciones: null,
    };
  });
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

const PROTECCION_ASIGNACIONES = PROTECCION
  .filter((p) => p.estatus === "ASIGNADO")
  .map((p, i) => ({
    id: i + 1,
    inventario_id: p.id,
    funcionario_id: 1 + (i % 50),
    fecha_entrega: "2026-03-15",
    estado_entrega: "Buen estado",
    documento_url: null,
    observaciones: null,
    fecha_devolucion: null as string | null,
    estado_devolucion: null as string | null,
    devuelto: false,
  }));

const AUDITORIA = Array.from({ length: 35 }, (_, i) => {
  const tablas = [
    ["personal", "funcionarios"],
    ["salud", "reposos"],
    ["ops", "guardias"],
    ["ops", "permisos"],
    ["beneficios", "ayudas"],
    ["seguridad", "usuarios"],
    ["equipo", "proteccion_asignaciones"],
  ];
  const ops = ["INSERT", "UPDATE", "DELETE"];
  const usuarios = [
    [1, "admin"],
    [2, "rrhh"],
    [3, "supervisor"],
    [4, "operador"],
  ];
  const t = tablas[i % tablas.length];
  const u = usuarios[i % usuarios.length];
  const dias = i;
  const fecha = new Date(Date.now() - dias * 3600000 * 4).toISOString();
  return {
    id: 1000 - i,
    schema_name: t[0],
    table_name: t[1],
    registro_id: String(1 + (i % 50)),
    operacion: ops[i % ops.length],
    usuario_id: u[0] as number,
    usuario_nombre: u[1] as string,
    ip: "192.168.1." + (10 + (i % 50)),
    fecha,
    campos_cambiados: ops[i % ops.length] === "UPDATE" ? { estatus: ["ACTIVO", "REPOSO"] } : null,
  };
});

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

export function demoMe(rol: string = "ADMIN") {
  const ROLE_NAMES: Record<string, string> = {
    ADMIN: "Administrador DEMO",
    RRHH: "Ana Pérez (RRHH DEMO)",
    SUPERVISOR: "Luis González (Supervisor DEMO)",
    LOGISTICA: "Carmen Torres (Logística DEMO)",
    OPERADOR: "José Martínez (Operador DEMO)",
    INSPECTOR: "Pedro López (Inspector DEMO)",
    LECTURA: "Visitante DEMO",
  };
  return {
    id: 1,
    usuario: rol.toLowerCase(),
    nombre_completo: ROLE_NAMES[rol] ?? "Usuario DEMO",
    correo: `${rol.toLowerCase()}@bomberos.gob.ve`,
    roles: [rol],
    debe_cambiar_password: false,
  };
}

/** Devuelve una ayuda económica por id para la página de edición. */
export function demoAyuda(id: number) {
  const base = AYUDAS.find((a) => a.id === id) ?? AYUDAS[0];
  return {
    ...base,
    id,
    referencia_pago: base.monto_pagado ? `TRX-${10000 + id}` : null,
    observaciones: null,
  };
}

/** @deprecated usar demoMe(rol) para soportar rol dinámico */
export const DEMO_ME = demoMe("ADMIN");

export function demoResolve(path: string, rolActivo: string = "ADMIN"): unknown {
  const {
    base,
    page,
    page_size,
    estatus,
    q,
    zona_id,
    estacion_id,
    jerarquia_id,
    funcionario_id,
  } = parseQuery(path);

  switch (true) {
    case base === "/auth/me":
      return demoMe(rolActivo);

    case base === "/funcionarios": {
      let items = FUNCIONARIOS;
      if (estatus) items = items.filter((f) => f.estatus === estatus);
      if (zona_id !== undefined) items = items.filter((f) => f.zona_id === zona_id);
      if (estacion_id !== undefined)
        items = items.filter((f) => f.estacion_id === estacion_id);
      if (jerarquia_id !== undefined)
        items = items.filter((f) => f.jerarquia_id === jerarquia_id);
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

    case /^\/funcionarios\/\d+\/carga-familiar$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarCargaFamiliarPara(fid);
    }

    case /^\/funcionarios\/\d+\/historico-jerarquias$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarHistJerarquiasPara(fid);
    }

    case /^\/funcionarios\/\d+\/historico-ubicaciones$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarHistUbicacionesPara(fid);
    }

    case /^\/funcionarios\/\d+\/tiempo-admpublica$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarTiempoAdmPublicaPara(fid);
    }

    case /^\/funcionarios\/\d+\/habilidades$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarHabilidadesPara(fid);
    }

    case /^\/funcionarios\/\d+\/actividades$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarActividadesPara(fid);
    }

    case /^\/funcionarios\/\d+\/carnets$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarCarnetsPara(fid);
    }

    case /^\/funcionarios\/\d+\/historico-carnets$/.test(base): {
      const fid = Number(base.split("/")[2]);
      return generarHistCarnetsPara(fid);
    }

    case base.startsWith("/funcionarios/"): {
      const id = Number(base.split("/")[2]);
      const f = FUNCIONARIOS.find((x) => x.id === id) ?? FUNCIONARIOS[0];
      const jerarquia = JERARQUIAS.find((j) => j.id === f.jerarquia_id);
      const zona = ZONAS.find((z) => z.id === f.zona_id);
      const estacion = ESTACIONES.find((e) => e.id === f.estacion_id);
      const cargoIdx = (f.id % 20) + 1;
      const condicionIdx = (f.id % 8) + 1;
      return {
        ...f,
        fecha_nacimiento: "1985-06-12",
        sexo: id % 3 === 0 ? "F" : "M",
        estado_civil_id: 1,
        grupo_sanguineo_id: 3,
        tipo_personal: jerarquia?.es_oficial ? "OFICIAL" : "UNIFORMADO",
        numero_empleado: `EMP-${1000 + f.id}`,
        numero_equipo: String(2000 + f.id),
        cargo_id: cargoIdx,
        condicion_id: condicionIdx,
        seccion: ["A", "B", "C", "D"][f.id % 4],
        horario: ["Diurno", "Nocturno", "24x48", "8 hrs administrativo"][f.id % 4],
        telefono_movil: "+58 414 555-0100",
        correo: `funcionario${f.id}@bomberos.gob.ve`,
        persona_contacto: "Familiar autorizado",
        telefono_contacto: "+58 212 555-0100",
        profesion: "Bombero profesional",
        iutb: true,
        egresado_unes: false,
        foto_url: null,
        observaciones: null,
        jerarquia_nombre: jerarquia?.nombre ?? null,
        jerarquia_nombre_corto: jerarquia?.nombre_corto ?? null,
        cargo_nombre: `Cargo ${cargoIdx}`,
        condicion_nombre: `Condición ${condicionIdx}`,
        zona_nombre: zona?.nombre ?? null,
        estacion_nombre: estacion?.nombre ?? null,
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
      return [
        { id: 1, codigo: "SOLTERO", nombre: "Soltero(a)", activo: true },
        { id: 2, codigo: "CASADO", nombre: "Casado(a)", activo: true },
        { id: 3, codigo: "DIVORCIADO", nombre: "Divorciado(a)", activo: true },
        { id: 4, codigo: "VIUDO", nombre: "Viudo(a)", activo: true },
        { id: 5, codigo: "CONCUBINATO", nombre: "Unión estable de hecho", activo: true },
      ];
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

    case base === "/catalogos/tipos-personal":
      return [
        { id: 1, codigo: "UNIFORMADO", nombre: "Uniformado", activo: true },
        { id: 2, codigo: "ADMINISTRATIVO", nombre: "Administrativo", activo: true },
        { id: 3, codigo: "OBRERO", nombre: "Obrero", activo: true },
      ];
    case base === "/catalogos/estatus-funcionario":
      return [
        { id: 1, codigo: "ACTIVO", nombre: "Activo", activo: true },
        { id: 2, codigo: "REPOSO", nombre: "En reposo", activo: true },
        { id: 3, codigo: "COMISION", nombre: "En comisión", activo: true },
        { id: 4, codigo: "PRE_JUBILADO", nombre: "Pre-jubilado", activo: true },
        { id: 5, codigo: "JUBILADO", nombre: "Jubilado", activo: true },
        { id: 6, codigo: "EGRESADO", nombre: "Egresado", activo: true },
        { id: 7, codigo: "FALLECIDO", nombre: "Fallecido", activo: true },
        { id: 8, codigo: "SUSPENDIDO", nombre: "Suspendido", activo: true },
      ];
    case base === "/catalogos/instituciones-formadoras":
      return [
        { id: 1, codigo: "IUTB", nombre: "Instituto Universitario Tecnológico de Bomberos", activo: true },
        { id: 2, codigo: "UNES", nombre: "Universidad Nacional Experimental de la Seguridad", activo: true },
      ];
    case base === "/catalogos/tipos-vivienda":
      return [
        { id: 1, codigo: "CASA", nombre: "Casa", activo: true },
        { id: 2, codigo: "APARTAMENTO", nombre: "Apartamento", activo: true },
        { id: 3, codigo: "QUINTA", nombre: "Quinta", activo: true },
        { id: 4, codigo: "ANEXO", nombre: "Anexo", activo: true },
        { id: 5, codigo: "RANCHO", nombre: "Rancho", activo: true },
        { id: 6, codigo: "HABITACION", nombre: "Habitación", activo: true },
      ];
    case base === "/catalogos/tenencias-vivienda":
      return [
        { id: 1, codigo: "PROPIA", nombre: "Propia", activo: true },
        { id: 2, codigo: "ALQUILADA", nombre: "Alquilada", activo: true },
        { id: 3, codigo: "FAMILIAR", nombre: "Familiar", activo: true },
        { id: 4, codigo: "CEDIDA", nombre: "Cedida", activo: true },
        { id: 5, codigo: "OTRA", nombre: "Otra", activo: true },
      ];
    case base === "/catalogos/estados":
      return [
        { id: 1, codigo: "DC", nombre: "Distrito Capital", activo: true },
        { id: 2, codigo: "MI", nombre: "Miranda", activo: true },
        { id: 3, codigo: "VA", nombre: "La Guaira", activo: true },
        { id: 4, codigo: "AR", nombre: "Aragua", activo: true },
        { id: 5, codigo: "CA", nombre: "Carabobo", activo: true },
      ];
    case base === "/catalogos/municipios":
      return [
        { id: 1, estado_id: 1, codigo: "LIBERTADOR", nombre: "Libertador", activo: true },
        { id: 2, estado_id: 2, codigo: "BARUTA", nombre: "Baruta", activo: true },
        { id: 3, estado_id: 2, codigo: "CHACAO", nombre: "Chacao", activo: true },
        { id: 4, estado_id: 2, codigo: "EL_HATILLO", nombre: "El Hatillo", activo: true },
        { id: 5, estado_id: 2, codigo: "SUCRE", nombre: "Sucre", activo: true },
        { id: 6, estado_id: 3, codigo: "VARGAS", nombre: "Vargas", activo: true },
      ];
    case base === "/catalogos/parroquias":
      return [
        { id: 1, municipio_id: 1, codigo: "ALTAGRACIA", nombre: "Altagracia", activo: true },
        { id: 2, municipio_id: 1, codigo: "CANDELARIA", nombre: "La Candelaria", activo: true },
        { id: 3, municipio_id: 1, codigo: "CATEDRAL", nombre: "Catedral", activo: true },
        { id: 4, municipio_id: 1, codigo: "SAN_AGUSTIN", nombre: "San Agustín", activo: true },
        { id: 5, municipio_id: 1, codigo: "SAN_JOSE", nombre: "San José", activo: true },
        { id: 6, municipio_id: 1, codigo: "EL_RECREO", nombre: "El Recreo", activo: true },
        { id: 7, municipio_id: 2, codigo: "EL_CAFETAL", nombre: "El Cafetal", activo: true },
        { id: 8, municipio_id: 2, codigo: "LAS_MINAS", nombre: "Las Minas", activo: true },
        { id: 9, municipio_id: 3, codigo: "CHACAO", nombre: "Chacao", activo: true },
      ];

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
      if (funcionario_id !== undefined)
        return paginate(generarGuardiasPara(funcionario_id), page, page_size);
      return paginate(GUARDIAS, page, page_size);
    case base === "/ops/permisos":
      if (funcionario_id !== undefined)
        return paginate(generarPermisosPara(funcionario_id), page, page_size);
      return paginate(PERMISOS, page, page_size);
    case base === "/ops/vacaciones":
      if (funcionario_id !== undefined)
        return paginate(generarVacacionesPara(funcionario_id), page, page_size);
      return paginate(VACACIONES, page, page_size);
    case base === "/ops/comisiones":
      if (funcionario_id !== undefined)
        return paginate(generarComisionesPara(funcionario_id), page, page_size);
      return paginate(COMISIONES, page, page_size);
    case base === "/ops/faltas":
      if (funcionario_id !== undefined)
        return paginate(generarFaltasPara(funcionario_id), page, page_size);
      return paginate(FALTAS, page, page_size);

    case base === "/salud/reposos":
      if (funcionario_id !== undefined)
        return paginate(generarRepososPara(funcionario_id), page, page_size);
      return paginate(REPOSOS, page, page_size);
    case base === "/salud/lesiones":
      if (funcionario_id !== undefined)
        return paginate(generarLesionesPara(funcionario_id), page, page_size);
      return paginate([], page, page_size);
    case base === "/salud/evaluacion-fisica":
      if (funcionario_id !== undefined)
        return paginate(generarEvalFisicaPara(funcionario_id), page, page_size);
      return paginate([], page, page_size);

    case base === "/carrera/cursos-realizados":
      if (funcionario_id !== undefined)
        return paginate(generarCursosPara(funcionario_id), page, page_size);
      return paginate(CURSOS, page, page_size);
    case base === "/carrera/ascensos":
      if (funcionario_id !== undefined)
        return paginate(generarAscensosPara(funcionario_id), page, page_size);
      return paginate(ASCENSOS, page, page_size);
    case base === "/carrera/reconocimientos":
      if (funcionario_id !== undefined)
        return paginate(generarReconocimientosPara(funcionario_id), page, page_size);
      return paginate(RECONOCIMIENTOS, page, page_size);
    case base === "/carrera/meritos":
      if (funcionario_id !== undefined)
        return paginate(generarMeritosPara(funcionario_id), page, page_size);
      return paginate(MERITOS, page, page_size);
    case base === "/carrera/evaluaciones":
      if (funcionario_id !== undefined)
        return paginate(generarEvalDesempenoPara(funcionario_id), page, page_size);
      return paginate([], page, page_size);

    case base === "/equipo/proteccion/inventario":
      return paginate(PROTECCION, page, page_size);
    case base === "/equipo/proteccion/asignaciones":
      if (funcionario_id !== undefined)
        return paginate(generarProteccionAsignacionesPara(funcionario_id), page, page_size);
      return paginate(PROTECCION_ASIGNACIONES, page, page_size);
    case base === "/admin/auditoria":
      return paginate(AUDITORIA, page, page_size);
    case base === "/equipo/radios":
      if (funcionario_id !== undefined)
        return paginate(generarRadiosAsignadasPara(funcionario_id), page, page_size);
      return paginate(RADIOS, page, page_size);

    case base === "/beneficios/ayudas":
      if (funcionario_id !== undefined)
        return paginate(generarAyudasPara(funcionario_id), page, page_size);
      return paginate(AYUDAS, page, page_size);
    case base === "/beneficios/entregas":
      if (funcionario_id !== undefined)
        return paginate(generarProteccionAsignacionesPara(funcionario_id), page, page_size);
      return paginate([], page, page_size);

    case base === "/egresos/jubilados":
      return paginate(JUBILADOS, page, page_size);
    case base === "/egresos/solicitudes-jubilacion":
      return paginate(SOL_JUBILACION, page, page_size);

    case base === "/admin/usuarios":
      return paginate(USUARIOS, page, page_size);

    case base === "/admin/roles":
      return ROLES_DEMO;
    case base === "/admin/modulos":
      return MODULOS_DEMO;
    case base === "/admin/permisos":
      // En demo los permisos los maneja la cookie en server actions —
      // este fallback solo aplica si nadie escribió todavía.
      return [];

    default:
      return paginate([], page, page_size);
  }
}

// ----- Roles y módulos demo (matriz de permisos) -----

const ROLES_DEMO = [
  { id: 1, codigo: "ADMIN",      nombre: "Administrador",  descripcion: "Acceso completo al sistema",  es_sistema: true,  activo: true },
  { id: 2, codigo: "RRHH",       nombre: "RRHH",           descripcion: "Personal, salud, beneficios", es_sistema: true,  activo: true },
  { id: 3, codigo: "SUPERVISOR", nombre: "Supervisor",     descripcion: "Supervisión y aprobaciones",  es_sistema: true,  activo: true },
  { id: 4, codigo: "LOGISTICA",  nombre: "Logística",      descripcion: "Equipo y radios",             es_sistema: true,  activo: true },
  { id: 5, codigo: "OPERADOR",   nombre: "Operador",       descripcion: "Operaciones día a día",       es_sistema: true,  activo: true },
  { id: 6, codigo: "INSPECTOR",  nombre: "Inspector",      descripcion: "Faltas y comisiones",         es_sistema: true,  activo: true },
  { id: 7, codigo: "LECTURA",    nombre: "Solo lectura",   descripcion: "Visualización general",       es_sistema: true,  activo: true },
];

const MODULOS_DEMO = [
  { id: 1,  codigo: "dashboard",     nombre: "Dashboard",        descripcion: "Resumen general",                  icono: "chart",     orden: 1,  activo: true },
  { id: 2,  codigo: "funcionarios",  nombre: "Funcionarios",     descripcion: "Personal activo y egresado",        icono: "users",     orden: 2,  activo: true },
  { id: 3,  codigo: "salud",         nombre: "Salud",            descripcion: "Reposos y diagnósticos",            icono: "heart",     orden: 3,  activo: true },
  { id: 4,  codigo: "ops_guardias",  nombre: "Guardias",         descripcion: "Operaciones — guardias",            icono: "shield",    orden: 4,  activo: true },
  { id: 5,  codigo: "ops_vacaciones",nombre: "Vacaciones",       descripcion: "Operaciones — vacaciones",          icono: "sun",       orden: 5,  activo: true },
  { id: 6,  codigo: "ops_permisos",  nombre: "Permisos",         descripcion: "Operaciones — permisos",            icono: "calendar",  orden: 6,  activo: true },
  { id: 7,  codigo: "ops_comisiones",nombre: "Comisiones",       descripcion: "Comisiones de servicio",            icono: "briefcase", orden: 7,  activo: true },
  { id: 8,  codigo: "ops_faltas",    nombre: "Faltas",           descripcion: "Faltas y reincidencias",            icono: "alert",     orden: 8,  activo: true },
  { id: 9,  codigo: "carrera",       nombre: "Carrera",          descripcion: "Ascensos, cursos, evaluaciones",    icono: "trophy",    orden: 9,  activo: true },
  { id: 10, codigo: "equipo",        nombre: "Equipo",           descripcion: "Protección y radios",               icono: "tools",     orden: 10, activo: true },
  { id: 11, codigo: "beneficios",    nombre: "Beneficios",       descripcion: "Ayudas y solicitudes",              icono: "gift",      orden: 11, activo: true },
  { id: 12, codigo: "egresos",       nombre: "Egresos",          descripcion: "Jubilados y solicitudes",           icono: "logout",    orden: 12, activo: true },
  { id: 13, codigo: "catalogos",     nombre: "Catálogos",        descripcion: "Lectura de catálogos",              icono: "book",      orden: 13, activo: true },
  { id: 14, codigo: "admin",         nombre: "Administración",   descripcion: "Usuarios, roles, módulos",          icono: "settings",  orden: 14, activo: true },
];
