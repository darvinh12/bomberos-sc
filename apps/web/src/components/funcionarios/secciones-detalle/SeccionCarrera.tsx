"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import ConfirmarBorrado from "../ConfirmarBorrado";
import {
  borrarHistoricoJerarquia,
  borrarHistoricoUbicacion,
  borrarTiempoAdmPublica,
  restaurarHistoricoJerarquia,
  restaurarHistoricoUbicacion,
  restaurarTiempoAdmPublica,
} from "./actions";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

type ObjetivoBorrado =
  | { tipo: "hjerarquia"; id: number; etiqueta: string }
  | { tipo: "hubicacion"; id: number; etiqueta: string }
  | { tipo: "tap"; id: number; etiqueta: string };

interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface Ascenso {
  id: number;
  funcionario_id: number;
  jerarquia_anterior_id: number | null;
  jerarquia_nueva_id: number;
  fecha_efectiva: string;
  resolucion: string | null;
}

interface Curso {
  id: number;
  funcionario_id: number;
  nombre_libre: string | null;
  institucion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  horas: number | null;
  nota: number | null;
  aprobado: boolean | null;
}

interface Evaluacion {
  id: number;
  funcionario_id: number;
  periodo: string;
  fecha_evaluacion: string;
  nota: number;
  observaciones: string | null;
}

interface Reconocimiento {
  id: number;
  funcionario_id: number;
  nombre_libre: string | null;
  fecha_otorgamiento: string;
  motivo: string | null;
}

interface Merito {
  id: number;
  funcionario_id: number;
  periodo_id: number | null;
  puntaje_evaluacion: number | null;
  puntaje_cursos: number | null;
  puntaje_actividades: number | null;
  puntaje_condecoraciones: number | null;
  puntaje_faltas: number | null;
  puntaje_total: number | null;
  posicion: number | null;
}

interface Jerarquia {
  id: number;
  nombre: string;
  nombre_corto: string;
}

interface HistoricoJerarquia {
  id: number;
  funcionario_id: number;
  fecha: string;
  jerarquia_nueva_id: number | null;
  jerarquia_nueva_nombre: string | null;
  decreto: string | null;
  fecha_efectiva_nomina: string | null;
  observaciones: string | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  delete_reason?: string | null;
}

interface HistoricoUbicacion {
  id: number;
  funcionario_id: number;
  fecha_desde: string;
  estacion: string | null;
  zona: string | null;
  division: string | null;
  area: string | null;
  agrupacion: string | null;
  seccion: string | null;
  horario: string | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  delete_reason?: string | null;
}

interface TiempoAdmPublica {
  id: number;
  funcionario_id: number;
  dependencia: string;
  fecha_ingreso: string | null;
  fecha_egreso: string | null;
  anios_aprox: number | null;
  observaciones: string | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  delete_reason?: string | null;
}

interface DatosBase {
  ascensos: Ascenso[];
  cursos: Curso[];
  evaluaciones: Evaluacion[];
  reconocimientos: Reconocimiento[];
  meritos: Merito[];
  jerarquias: Record<number, Jerarquia>;
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
  nivelAcceso: NivelAcceso;
}

export default function SeccionCarrera({
  funcionarioId,
  userRoles,
  nivelAcceso,
}: Props) {
  const [base, setBase] = useState<DatosBase | null>(null);
  const [historicoJerarquias, setHistoricoJerarquias] = useState<
    HistoricoJerarquia[] | null
  >(null);
  const [historicoUbicaciones, setHistoricoUbicaciones] = useState<
    HistoricoUbicacion[] | null
  >(null);
  const [tiempoAdmPublica, setTiempoAdmPublica] = useState<
    TiempoAdmPublica[] | null
  >(null);

  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<ObjetivoBorrado | null>(null);

  const [mostrarBorradosHjer, setMostrarBorradosHjer] = useState(false);
  const [mostrarBorradosHub, setMostrarBorradosHub] = useState(false);
  const [mostrarBorradosTap, setMostrarBorradosTap] = useState(false);

  const [restaurandoHjer, setRestaurandoHjer] = useState<number | null>(null);
  const [restaurandoHub, setRestaurandoHub] = useState<number | null>(null);
  const [restaurandoTap, setRestaurandoTap] = useState<number | null>(null);

  const puedeEditar = nivelAcceso === "edit";
  const soloLectura = nivelAcceso === "view";
  const esAdmin = userRoles.includes("ADMIN");

  // Carga "base" — datos sin soft-delete (cargan una sola vez)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [asc, cur, ev, rec, mer, jer] = await Promise.all([
          api
            .get<Page<Ascenso>>(
              `/carrera/ascensos?funcionario_id=${funcionarioId}&page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Ascenso>),
          api
            .get<Page<Curso>>(
              `/carrera/cursos-realizados?funcionario_id=${funcionarioId}&page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Curso>),
          api
            .get<Page<Evaluacion>>(
              `/carrera/evaluaciones?funcionario_id=${funcionarioId}&page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Evaluacion>),
          api
            .get<Page<Reconocimiento>>(
              `/carrera/reconocimientos?funcionario_id=${funcionarioId}&page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Reconocimiento>),
          api
            .get<Page<Merito>>(
              `/carrera/meritos?funcionario_id=${funcionarioId}&page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<Merito>),
          api
            .get<Jerarquia[]>("/catalogos/jerarquias")
            .catch(() => [] as Jerarquia[]),
        ]);
        if (!alive) return;
        const jerarquias: Record<number, Jerarquia> = {};
        for (const j of jer) jerarquias[j.id] = j;
        setBase({
          ascensos: asc.items ?? [],
          cursos: cur.items ?? [],
          evaluaciones: ev.items ?? [],
          reconocimientos: rec.items ?? [],
          meritos: mer.items ?? [],
          jerarquias,
        });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId]);

  // Histórico jerarquías (soft-delete)
  useEffect(() => {
    let alive = true;
    (async () => {
      const qs = mostrarBorradosHjer ? "&incluir_borrados=true" : "";
      const res = await api
        .get<Page<HistoricoJerarquia>>(
          `/funcionarios/${funcionarioId}/historico-jerarquias?page_size=100${qs}`,
        )
        .catch(() => ({ items: [] }) as Page<HistoricoJerarquia>);
      if (!alive) return;
      setHistoricoJerarquias(res.items ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId, mostrarBorradosHjer]);

  // Histórico ubicaciones (soft-delete)
  useEffect(() => {
    let alive = true;
    (async () => {
      const qs = mostrarBorradosHub ? "&incluir_borrados=true" : "";
      const res = await api
        .get<Page<HistoricoUbicacion>>(
          `/funcionarios/${funcionarioId}/historico-ubicaciones?page_size=100${qs}`,
        )
        .catch(() => ({ items: [] }) as Page<HistoricoUbicacion>);
      if (!alive) return;
      setHistoricoUbicaciones(res.items ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId, mostrarBorradosHub]);

  // Tiempo en adm pública (soft-delete)
  useEffect(() => {
    let alive = true;
    (async () => {
      const qs = mostrarBorradosTap ? "&incluir_borrados=true" : "";
      const res = await api
        .get<Page<TiempoAdmPublica>>(
          `/funcionarios/${funcionarioId}/tiempo-admpublica?page_size=100${qs}`,
        )
        .catch(() => ({ items: [] }) as Page<TiempoAdmPublica>);
      if (!alive) return;
      setTiempoAdmPublica(res.items ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [funcionarioId, mostrarBorradosTap]);

  async function ejecutarBorrado(
    objetivo: ObjetivoBorrado,
    motivo: string,
  ): Promise<void> {
    let res;
    if (objetivo.tipo === "hjerarquia") {
      res = await borrarHistoricoJerarquia(funcionarioId, objetivo.id, motivo);
    } else if (objetivo.tipo === "hubicacion") {
      res = await borrarHistoricoUbicacion(funcionarioId, objetivo.id, motivo);
    } else {
      res = await borrarTiempoAdmPublica(funcionarioId, objetivo.id, motivo);
    }
    if (!res.ok) throw new Error(res.error);

    if (objetivo.tipo === "hjerarquia") {
      setHistoricoJerarquias((prev) => {
        if (prev === null) return prev;
        if (mostrarBorradosHjer) {
          return prev.map((h) =>
            h.id === objetivo.id
              ? {
                  ...h,
                  deleted_at: new Date().toISOString(),
                  delete_reason: motivo,
                }
              : h,
          );
        }
        return prev.filter((h) => h.id !== objetivo.id);
      });
    } else if (objetivo.tipo === "hubicacion") {
      setHistoricoUbicaciones((prev) => {
        if (prev === null) return prev;
        if (mostrarBorradosHub) {
          return prev.map((u) =>
            u.id === objetivo.id
              ? {
                  ...u,
                  deleted_at: new Date().toISOString(),
                  delete_reason: motivo,
                }
              : u,
          );
        }
        return prev.filter((u) => u.id !== objetivo.id);
      });
    } else {
      setTiempoAdmPublica((prev) => {
        if (prev === null) return prev;
        if (mostrarBorradosTap) {
          return prev.map((t) =>
            t.id === objetivo.id
              ? {
                  ...t,
                  deleted_at: new Date().toISOString(),
                  delete_reason: motivo,
                }
              : t,
          );
        }
        return prev.filter((t) => t.id !== objetivo.id);
      });
    }
  }

  async function restaurarHjer(id: number) {
    setRestaurandoHjer(id);
    try {
      const res = await restaurarHistoricoJerarquia(funcionarioId, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHistoricoJerarquias((prev) =>
        prev === null
          ? prev
          : prev.map((h) =>
              h.id === id
                ? {
                    ...h,
                    deleted_at: null,
                    deleted_by: null,
                    delete_reason: null,
                  }
                : h,
            ),
      );
    } finally {
      setRestaurandoHjer(null);
    }
  }

  async function restaurarHub(id: number) {
    setRestaurandoHub(id);
    try {
      const res = await restaurarHistoricoUbicacion(funcionarioId, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHistoricoUbicaciones((prev) =>
        prev === null
          ? prev
          : prev.map((u) =>
              u.id === id
                ? {
                    ...u,
                    deleted_at: null,
                    deleted_by: null,
                    delete_reason: null,
                  }
                : u,
            ),
      );
    } finally {
      setRestaurandoHub(null);
    }
  }

  async function restaurarTap(id: number) {
    setRestaurandoTap(id);
    try {
      const res = await restaurarTiempoAdmPublica(funcionarioId, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTiempoAdmPublica((prev) =>
        prev === null
          ? prev
          : prev.map((t) =>
              t.id === id
                ? {
                    ...t,
                    deleted_at: null,
                    deleted_by: null,
                    delete_reason: null,
                  }
                : t,
            ),
      );
    } finally {
      setRestaurandoTap(null);
    }
  }

  if (error) {
    return (
      <SectionShell title="Carrera" soloLectura={soloLectura}>
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      </SectionShell>
    );
  }

  if (
    base === null ||
    historicoJerarquias === null ||
    historicoUbicaciones === null ||
    tiempoAdmPublica === null
  ) {
    return (
      <SectionShell title="Carrera" soloLectura={soloLectura}>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  const jerName = (id: number | null) =>
    id === null ? "—" : (base.jerarquias[id]?.nombre ?? `Jerarquía ${id}`);

  return (
    <SectionShell
      title="Carrera"
      description="Ascensos, cursos, evaluaciones, reconocimientos y méritos del funcionario."
      soloLectura={soloLectura}
    >
      <Card title="Ascensos">
        {base.ascensos.length === 0 ? (
          <EmptyState title="Sin ascensos registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Jerarquía anterior</th>
                  <th scope="col" className="text-left p-2 font-medium">Jerarquía nueva</th>
                  <th scope="col" className="text-left p-2 font-medium">Resolución</th>
                </tr>
              </thead>
              <tbody>
                {base.ascensos.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-2">{formatDate(a.fecha_efectiva)}</td>
                    <td className="p-2 text-muted-foreground">{jerName(a.jerarquia_anterior_id)}</td>
                    <td className="p-2 font-medium">{jerName(a.jerarquia_nueva_id)}</td>
                    <td className="p-2 font-mono text-xs">{a.resolucion ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && base.ascensos.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href={`/carrera/ascensos/nuevo?funcionario_id=${funcionarioId}`}
              className="text-xs text-primary hover:underline"
            >
              + Nuevo ascenso
            </Link>
          </div>
        )}
      </Card>

      <Card title="Cursos realizados">
        {base.cursos.length === 0 ? (
          <EmptyState title="Sin cursos registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Curso</th>
                  <th scope="col" className="text-left p-2 font-medium">Institución</th>
                  <th scope="col" className="text-left p-2 font-medium">Fechas</th>
                  <th scope="col" className="text-right p-2 font-medium">Horas</th>
                  <th scope="col" className="text-right p-2 font-medium">Nota</th>
                  <th scope="col" className="text-left p-2 font-medium">Aprobado</th>
                </tr>
              </thead>
              <tbody>
                {base.cursos.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-2 font-medium">{c.nombre_libre ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{c.institucion ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {formatDate(c.fecha_inicio)} → {formatDate(c.fecha_fin)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{c.horas ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{c.nota?.toFixed(1) ?? "—"}</td>
                    <td className="p-2">
                      {c.aprobado === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : c.aprobado ? (
                        <Check className="w-4 h-4 text-emerald-400" aria-label="Aprobado" />
                      ) : (
                        <X className="w-4 h-4 text-red-400" aria-label="No aprobado" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && base.cursos.length > 0 && (
          <div className="mt-3 text-right">
            <Link
              href={`/carrera/cursos/nuevo?funcionario_id=${funcionarioId}`}
              className="text-xs text-primary hover:underline"
            >
              + Nuevo curso
            </Link>
          </div>
        )}
      </Card>

      <Card title="Evaluaciones de desempeño">
        {base.evaluaciones.length === 0 ? (
          <EmptyState title="Sin evaluaciones registradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Período</th>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-right p-2 font-medium">Nota</th>
                  <th scope="col" className="text-left p-2 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {base.evaluaciones.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-2 font-medium">{e.periodo}</td>
                    <td className="p-2 text-muted-foreground">{formatDate(e.fecha_evaluacion)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">
                      {e.nota.toFixed(1)}
                    </td>
                    <td className="p-2 text-muted-foreground">{e.observaciones ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Condecoraciones y reconocimientos">
        {base.reconocimientos.length === 0 ? (
          <EmptyState title="Sin reconocimientos registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Reconocimiento</th>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {base.reconocimientos.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 font-medium">{r.nombre_libre ?? "—"}</td>
                    <td className="p-2">{formatDate(r.fecha_otorgamiento)}</td>
                    <td className="p-2 text-muted-foreground">{r.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Méritos">
        {base.meritos.length === 0 ? (
          <EmptyState title="Sin méritos calculados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-right p-2 font-medium">Posición</th>
                  <th scope="col" className="text-right p-2 font-medium">Eval.</th>
                  <th scope="col" className="text-right p-2 font-medium">Cursos</th>
                  <th scope="col" className="text-right p-2 font-medium">Activ.</th>
                  <th scope="col" className="text-right p-2 font-medium">Condec.</th>
                  <th scope="col" className="text-right p-2 font-medium">Faltas</th>
                  <th scope="col" className="text-right p-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {base.meritos.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-2 text-right tabular-nums">{m.posicion ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">
                      {m.puntaje_evaluacion?.toFixed(1) ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {m.puntaje_cursos?.toFixed(1) ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {m.puntaje_actividades?.toFixed(1) ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {m.puntaje_condecoraciones?.toFixed(1) ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {m.puntaje_faltas !== null && m.puntaje_faltas !== undefined ? (
                        <span className={m.puntaje_faltas < 0 ? "text-red-400" : ""}>
                          {m.puntaje_faltas.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums font-bold">
                      {m.puntaje_total?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Histórico de jerarquías">
        {esAdmin && (
          <div className="mb-3 flex justify-end">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarBorradosHjer}
                onChange={(e) => setMostrarBorradosHjer(e.target.checked)}
                className="rounded border-input"
              />
              Mostrar borrados
            </label>
          </div>
        )}
        {historicoJerarquias.length === 0 ? (
          <EmptyState
            title={
              mostrarBorradosHjer
                ? "Sin cambios de jerarquía borrados"
                : "Sin cambios de jerarquía registrados"
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Fecha</th>
                  <th scope="col" className="text-left p-2 font-medium">Jerarquía nueva</th>
                  <th scope="col" className="text-left p-2 font-medium">Decreto / Oficio</th>
                  <th scope="col" className="text-left p-2 font-medium">Efectiva nómina</th>
                  <th scope="col" className="text-left p-2 font-medium">Observaciones</th>
                  {mostrarBorradosHjer && (
                    <th scope="col" className="text-left p-2 font-medium">
                      Motivo borrado
                    </th>
                  )}
                  {puedeEditar && (
                    <th scope="col" className="text-right p-2 font-medium w-1" aria-label="Acciones" />
                  )}
                </tr>
              </thead>
              <tbody>
                {historicoJerarquias.map((h) => {
                  const borrado = Boolean(h.deleted_at);
                  return (
                    <tr
                      key={h.id}
                      className={`border-t border-border ${borrado ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="p-2">{formatDate(h.fecha)}</td>
                      <td className="p-2 font-medium">
                        {h.jerarquia_nueva_nombre ?? jerName(h.jerarquia_nueva_id)}
                      </td>
                      <td className="p-2 font-mono text-xs">{h.decreto ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {formatDate(h.fecha_efectiva_nomina)}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {h.observaciones ?? "—"}
                      </td>
                      {mostrarBorradosHjer && (
                        <td className="p-2 text-xs text-muted-foreground">
                          {h.delete_reason ?? "—"}
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {borrado ? (
                            esAdmin ? (
                              <button
                                type="button"
                                onClick={() => restaurarHjer(h.id)}
                                disabled={restaurandoHjer === h.id}
                                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                                title="Restaurar"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                Restaurar
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setBorrando({
                                  tipo: "hjerarquia",
                                  id: h.id,
                                  etiqueta:
                                    h.jerarquia_nueva_nombre ??
                                    jerName(h.jerarquia_nueva_id),
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Histórico de ubicaciones">
        {esAdmin && (
          <div className="mb-3 flex justify-end">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarBorradosHub}
                onChange={(e) => setMostrarBorradosHub(e.target.checked)}
                className="rounded border-input"
              />
              Mostrar borrados
            </label>
          </div>
        )}
        {historicoUbicaciones.length === 0 ? (
          <EmptyState
            title={
              mostrarBorradosHub
                ? "Sin traslados borrados"
                : "Sin traslados registrados"
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Desde</th>
                  <th scope="col" className="text-left p-2 font-medium">Estación</th>
                  <th scope="col" className="text-left p-2 font-medium">Zona</th>
                  <th scope="col" className="text-left p-2 font-medium">División</th>
                  <th scope="col" className="text-left p-2 font-medium">Área</th>
                  <th scope="col" className="text-left p-2 font-medium">Agrupación</th>
                  <th scope="col" className="text-left p-2 font-medium">Sección</th>
                  <th scope="col" className="text-left p-2 font-medium">Horario</th>
                  {mostrarBorradosHub && (
                    <th scope="col" className="text-left p-2 font-medium">
                      Motivo borrado
                    </th>
                  )}
                  {puedeEditar && (
                    <th scope="col" className="text-right p-2 font-medium w-1" aria-label="Acciones" />
                  )}
                </tr>
              </thead>
              <tbody>
                {historicoUbicaciones.map((u) => {
                  const borrado = Boolean(u.deleted_at);
                  return (
                    <tr
                      key={u.id}
                      className={`border-t border-border ${borrado ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="p-2">{formatDate(u.fecha_desde)}</td>
                      <td className="p-2 font-medium">{u.estacion ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{u.zona ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{u.division ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{u.area ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{u.agrupacion ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{u.seccion ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{u.horario ?? "—"}</td>
                      {mostrarBorradosHub && (
                        <td className="p-2 text-xs text-muted-foreground">
                          {u.delete_reason ?? "—"}
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {borrado ? (
                            esAdmin ? (
                              <button
                                type="button"
                                onClick={() => restaurarHub(u.id)}
                                disabled={restaurandoHub === u.id}
                                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                                title="Restaurar"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                Restaurar
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setBorrando({
                                  tipo: "hubicacion",
                                  id: u.id,
                                  etiqueta: u.estacion ?? `Ubicación ${u.id}`,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Tiempo en administración pública">
        {esAdmin && (
          <div className="mb-3 flex justify-end">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarBorradosTap}
                onChange={(e) => setMostrarBorradosTap(e.target.checked)}
                className="rounded border-input"
              />
              Mostrar borrados
            </label>
          </div>
        )}
        {tiempoAdmPublica.length === 0 ? (
          <EmptyState
            title={
              mostrarBorradosTap
                ? "Sin antecedentes borrados"
                : "Sin antecedentes en otros entes públicos"
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">Dependencia</th>
                  <th scope="col" className="text-left p-2 font-medium">Ingreso</th>
                  <th scope="col" className="text-left p-2 font-medium">Egreso</th>
                  <th scope="col" className="text-right p-2 font-medium">Años aprox.</th>
                  <th scope="col" className="text-left p-2 font-medium">Observaciones</th>
                  {mostrarBorradosTap && (
                    <th scope="col" className="text-left p-2 font-medium">
                      Motivo borrado
                    </th>
                  )}
                  {puedeEditar && (
                    <th scope="col" className="text-right p-2 font-medium w-1" aria-label="Acciones" />
                  )}
                </tr>
              </thead>
              <tbody>
                {tiempoAdmPublica.map((t) => {
                  const borrado = Boolean(t.deleted_at);
                  return (
                    <tr
                      key={t.id}
                      className={`border-t border-border ${borrado ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="p-2 font-medium">{t.dependencia}</td>
                      <td className="p-2">{formatDate(t.fecha_ingreso)}</td>
                      <td className="p-2">{formatDate(t.fecha_egreso)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {t.anios_aprox ?? "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {t.observaciones ?? "—"}
                      </td>
                      {mostrarBorradosTap && (
                        <td className="p-2 text-xs text-muted-foreground">
                          {t.delete_reason ?? "—"}
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="p-2 text-right whitespace-nowrap">
                          {borrado ? (
                            esAdmin ? (
                              <button
                                type="button"
                                onClick={() => restaurarTap(t.id)}
                                disabled={restaurandoTap === t.id}
                                className="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                                title="Restaurar"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                Restaurar
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setBorrando({
                                  tipo: "tap",
                                  id: t.id,
                                  etiqueta: t.dependencia,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              Eliminar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {borrando && (
        <ConfirmarBorrado
          titulo={
            borrando.tipo === "hjerarquia"
              ? "Eliminar registro de jerarquía"
              : borrando.tipo === "hubicacion"
                ? "Eliminar registro de ubicación"
                : "Eliminar tiempo en adm. pública"
          }
          descripcion={`Vas a marcar como eliminado el registro "${borrando.etiqueta}".`}
          onConfirm={(motivo) => ejecutarBorrado(borrando, motivo)}
          onClose={() => setBorrando(null)}
        />
      )}
    </SectionShell>
  );
}
