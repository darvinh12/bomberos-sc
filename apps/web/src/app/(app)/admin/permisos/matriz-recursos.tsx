"use client";

import { useState } from "react";
import {
  RECURSOS_POR_TIPO,
  TIPOS_LABEL,
  type TipoRecurso,
} from "./recursos-catalogo";
import {
  guardarMatrizRecursos,
  type NivelAccesoMatriz,
  type PermisoRecursoMatriz,
} from "./actions";

const STORAGE_KEY = "bomberos-permisos-recursos";

type Matriz = Record<string, Record<string, NivelAccesoMatriz>>;

function permisosToMatriz(
  permisos: PermisoRecursoMatriz[],
  tipo: TipoRecurso,
): Matriz {
  const m: Matriz = {};
  for (const p of permisos) {
    if (p.recurso_tipo !== tipo) continue;
    if (!m[p.rol_codigo]) m[p.rol_codigo] = {};
    m[p.rol_codigo][p.recurso_codigo] = p.nivel;
  }
  return m;
}

interface Props {
  roles: { codigo: string; nombre: string }[];
  permisosIniciales: PermisoRecursoMatriz[];
  tipo: TipoRecurso;
}

export default function MatrizRecursos({
  roles,
  permisosIniciales,
  tipo,
}: Props) {
  const recursos = RECURSOS_POR_TIPO[tipo];
  const [matrizActual, setMatrizActual] = useState<Matriz>(() =>
    permisosToMatriz(permisosIniciales, tipo),
  );
  const [matrizOriginal, setMatrizOriginal] = useState<Matriz>(() =>
    permisosToMatriz(permisosIniciales, tipo),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cambios: PermisoRecursoMatriz[] = [];
  for (const r of recursos) {
    for (const rol of roles) {
      const actual = matrizActual[rol.codigo]?.[r.codigo] ?? "none";
      const original = matrizOriginal[rol.codigo]?.[r.codigo] ?? "none";
      if (actual !== original) {
        cambios.push({
          rol_codigo: rol.codigo,
          recurso_tipo: tipo,
          recurso_codigo: r.codigo,
          nivel: actual,
        });
      }
    }
  }
  const hayCambios = cambios.length > 0;

  function setCelda(
    rolCodigo: string,
    recursoCodigo: string,
    nivel: NivelAccesoMatriz,
  ) {
    if (rolCodigo === "ADMIN") return;
    setMatrizActual((prev) => ({
      ...prev,
      [rolCodigo]: { ...(prev[rolCodigo] ?? {}), [recursoCodigo]: nivel },
    }));
  }

  function resetearCambios() {
    setMatrizActual(matrizOriginal);
    setError(null);
    setExito(null);
  }

  async function onGuardar() {
    setGuardando(true);
    setError(null);
    setExito(null);
    try {
      const r = await guardarMatrizRecursos(cambios);
      if (!r.ok) {
        setError(r.error ?? "Error al guardar");
        return;
      }
      // Persistir en localStorage para que el hook usePermisosSync lo lea
      try {
        const todosActuales: PermisoRecursoMatriz[] = [];
        for (const rec of recursos) {
          for (const rol of roles) {
            const nivel = matrizActual[rol.codigo]?.[rec.codigo] ?? "none";
            if (nivel !== "none") {
              todosActuales.push({
                rol_codigo: rol.codigo,
                recurso_tipo: tipo,
                recurso_codigo: rec.codigo,
                nivel,
              });
            }
          }
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        const otrosTipos: PermisoRecursoMatriz[] = raw
          ? (JSON.parse(raw) as PermisoRecursoMatriz[]).filter(
              (p) => p.recurso_tipo !== tipo,
            )
          : [];
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify([...otrosTipos, ...todosActuales]),
        );
      } catch {
        // ignorar
      }
      setMatrizOriginal({ ...matrizActual });
      setExito(`${r.aplicados ?? cambios.length} permisos actualizados`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">{TIPOS_LABEL[tipo]}</h2>
          <p className="text-xs text-muted-foreground">
            ADMIN siempre tiene acceso total y no es editable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hayCambios && (
            <>
              <span className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/40 dark:text-amber-300">
                {cambios.length} cambio{cambios.length !== 1 ? "s" : ""} sin guardar
              </span>
              <button
                type="button"
                onClick={resetearCambios}
                disabled={guardando}
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                Descartar
              </button>
            </>
          )}
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

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {exito && (
        <div
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-300 p-3 text-sm"
        >
          {exito}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th
                scope="col"
                className="text-left p-3 sticky left-0 bg-muted/40 z-10 min-w-[260px]"
              >
                Recurso
              </th>
              {roles.map((r) => (
                <th
                  key={r.codigo}
                  scope="col"
                  className="text-center p-3 font-medium min-w-[120px]"
                  title={r.nombre}
                >
                  {r.codigo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recursos.map((rec) => (
              <tr
                key={rec.codigo}
                className="border-t border-border hover:bg-muted/20"
              >
                <td
                  className={`p-3 sticky left-0 bg-card z-10 ${
                    rec.esSubseccion ? "pl-8" : ""
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {rec.esSubseccion && (
                        <span className="text-muted-foreground">└ </span>
                      )}
                      {rec.label}
                    </span>
                    {rec.descripcion && (
                      <span className="text-xs text-muted-foreground">
                        {rec.descripcion}
                      </span>
                    )}
                  </div>
                </td>
                {roles.map((rol) => {
                  const esAdmin = rol.codigo === "ADMIN";
                  const nivel = esAdmin
                    ? "edit"
                    : matrizActual[rol.codigo]?.[rec.codigo] ?? "none";
                  return (
                    <td key={rol.codigo} className="p-2 text-center">
                      <select
                        aria-label={`Nivel de ${rol.codigo} para ${rec.label}`}
                        value={nivel}
                        onChange={(e) =>
                          setCelda(
                            rol.codigo,
                            rec.codigo,
                            e.target.value as NivelAccesoMatriz,
                          )
                        }
                        disabled={esAdmin}
                        className="rounded border border-input bg-background text-xs px-2 py-1 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="edit">Editar</option>
                        <option value="view">Ver</option>
                        <option value="none">Sin acceso</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
