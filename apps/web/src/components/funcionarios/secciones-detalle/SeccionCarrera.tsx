"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { SectionShell, Card, EmptyState } from "./_shared";

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
}

interface TiempoAdmPublica {
  id: number;
  funcionario_id: number;
  dependencia: string;
  fecha_ingreso: string | null;
  fecha_egreso: string | null;
  anios_aprox: number | null;
  observaciones: string | null;
}

interface Datos {
  ascensos: Ascenso[];
  cursos: Curso[];
  evaluaciones: Evaluacion[];
  reconocimientos: Reconocimiento[];
  meritos: Merito[];
  jerarquias: Record<number, Jerarquia>;
  historicoJerarquias: HistoricoJerarquia[];
  historicoUbicaciones: HistoricoUbicacion[];
  tiempoAdmPublica: TiempoAdmPublica[];
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

export default function SeccionCarrera({ funcionarioId, userRoles }: Props) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeCrearAscenso = hasAnyRole(userRoles, ["ADMIN", "RRHH"]);
  const puedeCrearCurso = hasAnyRole(userRoles, ["ADMIN", "RRHH", "SUPERVISOR"]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [asc, cur, ev, rec, mer, jer, hjer, hub, tap] = await Promise.all([
          api
            .get<Page<Ascenso>>(`/carrera/ascensos?funcionario_id=${funcionarioId}&page_size=100`)
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
            .get<Page<Merito>>(`/carrera/meritos?funcionario_id=${funcionarioId}&page_size=100`)
            .catch(() => ({ items: [] }) as Page<Merito>),
          api.get<Jerarquia[]>("/catalogos/jerarquias").catch(() => [] as Jerarquia[]),
          api
            .get<Page<HistoricoJerarquia>>(
              `/funcionarios/${funcionarioId}/historico-jerarquias?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<HistoricoJerarquia>),
          api
            .get<Page<HistoricoUbicacion>>(
              `/funcionarios/${funcionarioId}/historico-ubicaciones?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<HistoricoUbicacion>),
          api
            .get<Page<TiempoAdmPublica>>(
              `/funcionarios/${funcionarioId}/tiempo-admpublica?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<TiempoAdmPublica>),
        ]);
        if (!alive) return;
        const jerarquias: Record<number, Jerarquia> = {};
        for (const j of jer) jerarquias[j.id] = j;
        setData({
          ascensos: asc.items ?? [],
          cursos: cur.items ?? [],
          evaluaciones: ev.items ?? [],
          reconocimientos: rec.items ?? [],
          meritos: mer.items ?? [],
          jerarquias,
          historicoJerarquias: hjer.items ?? [],
          historicoUbicaciones: hub.items ?? [],
          tiempoAdmPublica: tap.items ?? [],
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

  if (error) {
    return (
      <SectionShell title="Carrera">
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell title="Carrera">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  const jerName = (id: number | null) =>
    id === null ? "—" : (data.jerarquias[id]?.nombre ?? `Jerarquía ${id}`);

  return (
    <SectionShell
      title="Carrera"
      description="Ascensos, cursos, evaluaciones, reconocimientos y méritos del funcionario."
    >
      <Card title="Ascensos">
        {data.ascensos.length === 0 ? (
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
                {data.ascensos.map((a) => (
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
        {puedeCrearAscenso && data.ascensos.length > 0 && (
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
        {data.cursos.length === 0 ? (
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
                {data.cursos.map((c) => (
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
        {puedeCrearCurso && data.cursos.length > 0 && (
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
        {data.evaluaciones.length === 0 ? (
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
                {data.evaluaciones.map((e) => (
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
        {data.reconocimientos.length === 0 ? (
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
                {data.reconocimientos.map((r) => (
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
        {data.meritos.length === 0 ? (
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
                {data.meritos.map((m) => (
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
        {data.historicoJerarquias.length === 0 ? (
          <EmptyState title="Sin cambios de jerarquía registrados" />
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
                </tr>
              </thead>
              <tbody>
                {data.historicoJerarquias.map((h) => (
                  <tr key={h.id} className="border-t border-border">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Histórico de ubicaciones">
        {data.historicoUbicaciones.length === 0 ? (
          <EmptyState title="Sin traslados registrados" />
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
                </tr>
              </thead>
              <tbody>
                {data.historicoUbicaciones.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="p-2">{formatDate(u.fecha_desde)}</td>
                    <td className="p-2 font-medium">{u.estacion ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{u.zona ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{u.division ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{u.area ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{u.agrupacion ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{u.seccion ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{u.horario ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Tiempo en administración pública">
        {data.tiempoAdmPublica.length === 0 ? (
          <EmptyState title="Sin antecedentes en otros entes públicos" />
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
                </tr>
              </thead>
              <tbody>
                {data.tiempoAdmPublica.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2 font-medium">{t.dependencia}</td>
                    <td className="p-2">{formatDate(t.fecha_ingreso)}</td>
                    <td className="p-2">{formatDate(t.fecha_egreso)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {t.anios_aprox ?? "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {t.observaciones ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </SectionShell>
  );
}
