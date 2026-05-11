import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

type Tab = "cursos" | "ascensos" | "reconocimientos" | "meritos";

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
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

interface Ascenso {
  id: number;
  funcionario_id: number;
  jerarquia_anterior_id: number | null;
  jerarquia_nueva_id: number;
  fecha_efectiva: string;
  resolucion: string | null;
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

const TABS: { key: Tab; label: string; path: string }[] = [
  { key: "cursos", label: "Cursos", path: "/carrera/cursos-realizados" },
  { key: "ascensos", label: "Ascensos", path: "/carrera/ascensos" },
  { key: "reconocimientos", label: "Reconocimientos", path: "/carrera/reconocimientos" },
  { key: "meritos", label: "Méritos", path: "/carrera/meritos" },
];

interface SearchProps {
  searchParams: { tab?: string; page?: string };
}

export default async function CarreraPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api.get<{ roles: string[] }>("/auth/me", token).catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);
  const puedeCrearCurso = hasAnyRole(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);
  const puedeCrearAscenso = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  const tab: Tab =
    (TABS.find((t) => t.key === searchParams.tab)?.key as Tab) ?? "cursos";
  const page = Number(searchParams.page ?? 1);
  const path = TABS.find((t) => t.key === tab)!.path;
  const params = new URLSearchParams({
    page: String(page),
    page_size: tab === "meritos" ? "100" : "25",
  });

  let data: Page<unknown> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<unknown>>(`${path}?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Carrera</h1>
          <p className="text-sm text-muted-foreground">
            Cursos, ascensos, reconocimientos y méritos
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "cursos" && puedeCrearCurso && (
            <Link
              href="/carrera/cursos/nuevo"
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              + Nuevo curso
            </Link>
          )}
          {tab === "ascensos" && puedeCrearAscenso && (
            <Link
              href="/carrera/ascensos/nuevo"
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              + Nuevo ascenso
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/carrera?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              t.key === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {err && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {err}
        </div>
      )}

      {data && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-auto">
            {tab === "cursos" && <TableCursos rows={data.items as Curso[]} />}
            {tab === "ascensos" && <TableAscensos rows={data.items as Ascenso[]} />}
            {tab === "reconocimientos" && (
              <TableReconocimientos rows={data.items as Reconocimiento[]} />
            )}
            {tab === "meritos" && <TableMeritos rows={data.items as Merito[]} />}
          </div>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground flex justify-between">
            <span>{data.total.toLocaleString("es-VE")} registros</span>
            {data.pages > 1 && (
              <span>
                Página {data.page} de {data.pages}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TableCursos({ rows }: { rows: Curso[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="text-left p-3">Funcionario</th>
          <th className="text-left p-3">Curso</th>
          <th className="text-left p-3">Institución</th>
          <th className="text-left p-3">Fechas</th>
          <th className="text-right p-3">Horas</th>
          <th className="text-right p-3">Nota</th>
          <th className="text-left p-3">Aprobado</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-t hover:bg-muted/30">
            <td className="p-3 font-mono text-xs">#{c.funcionario_id}</td>
            <td className="p-3 font-medium">{c.nombre_libre ?? "—"}</td>
            <td className="p-3 text-muted-foreground">{c.institucion ?? "—"}</td>
            <td className="p-3 text-xs text-muted-foreground">
              {formatDate(c.fecha_inicio)} → {formatDate(c.fecha_fin)}
            </td>
            <td className="p-3 text-right">{c.horas ?? "—"}</td>
            <td className="p-3 text-right">{c.nota?.toFixed(1) ?? "—"}</td>
            <td className="p-3">
              {c.aprobado === null ? (
                <span className="text-muted-foreground">—</span>
              ) : c.aprobado ? (
                <span className="text-green-700">✓</span>
              ) : (
                <span className="text-red-700">✗</span>
              )}
            </td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow cols={7} />}
      </tbody>
    </table>
  );
}

function TableAscensos({ rows }: { rows: Ascenso[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="text-left p-3">Funcionario</th>
          <th className="text-left p-3">Jerarquía</th>
          <th className="text-left p-3">Fecha efectiva</th>
          <th className="text-left p-3">Resolución</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="border-t hover:bg-muted/30">
            <td className="p-3 font-mono text-xs">#{a.funcionario_id}</td>
            <td className="p-3">
              {a.jerarquia_anterior_id ?? "—"} → <strong>{a.jerarquia_nueva_id}</strong>
            </td>
            <td className="p-3">{formatDate(a.fecha_efectiva)}</td>
            <td className="p-3 font-mono text-xs">{a.resolucion ?? "—"}</td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow cols={4} />}
      </tbody>
    </table>
  );
}

function TableReconocimientos({ rows }: { rows: Reconocimiento[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="text-left p-3">Funcionario</th>
          <th className="text-left p-3">Reconocimiento</th>
          <th className="text-left p-3">Motivo</th>
          <th className="text-left p-3">Fecha</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t hover:bg-muted/30">
            <td className="p-3 font-mono text-xs">#{r.funcionario_id}</td>
            <td className="p-3 font-medium">{r.nombre_libre ?? "—"}</td>
            <td className="p-3 text-muted-foreground">{r.motivo ?? "—"}</td>
            <td className="p-3">{formatDate(r.fecha_otorgamiento)}</td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow cols={4} />}
      </tbody>
    </table>
  );
}

function TableMeritos({ rows }: { rows: Merito[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50">
        <tr>
          <th className="text-right p-3">#</th>
          <th className="text-left p-3">Funcionario</th>
          <th className="text-right p-3">Eval.</th>
          <th className="text-right p-3">Cursos</th>
          <th className="text-right p-3">Activ.</th>
          <th className="text-right p-3">Condec.</th>
          <th className="text-right p-3">Faltas</th>
          <th className="text-right p-3">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} className="border-t hover:bg-muted/30">
            <td className="p-3 text-right font-mono text-xs">
              {m.posicion ?? "—"}
            </td>
            <td className="p-3 font-mono text-xs">#{m.funcionario_id}</td>
            <td className="p-3 text-right">{m.puntaje_evaluacion?.toFixed(1) ?? "—"}</td>
            <td className="p-3 text-right">{m.puntaje_cursos?.toFixed(1) ?? "—"}</td>
            <td className="p-3 text-right">{m.puntaje_actividades?.toFixed(1) ?? "—"}</td>
            <td className="p-3 text-right">
              {m.puntaje_condecoraciones?.toFixed(1) ?? "—"}
            </td>
            <td className="p-3 text-right">
              {m.puntaje_faltas !== null ? (
                <span className={m.puntaje_faltas < 0 ? "text-red-700" : ""}>
                  {m.puntaje_faltas.toFixed(1)}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className="p-3 text-right font-bold">
              {m.puntaje_total?.toFixed(2) ?? "—"}
            </td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow cols={8} />}
      </tbody>
    </table>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="p-8 text-center text-muted-foreground">
        Sin registros.
      </td>
    </tr>
  );
}
