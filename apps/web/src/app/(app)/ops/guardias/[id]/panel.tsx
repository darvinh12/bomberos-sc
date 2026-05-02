"use client";

import { useState, useTransition } from "react";
import {
  asignarFuncionarioAGuardia,
  cerrarGuardia,
  marcarAsistencia,
} from "../nuevo/actions";

interface Asignado {
  id: number;
  nombre_completo: string;
  rol_guardia: string | null;
  asistio: boolean | null;
}

interface Disponible {
  id: number;
  nombre_completo: string | null;
  apellidos: string;
  nombres: string;
}

const ROLES = ["JEFE_GUARDIA", "SUB_JEFE", "OPERADOR", "BOMBERO", "PARAMEDICO", "CHOFER"];

export default function GuardiaPanel({
  guardiaId,
  cerrada,
  asignados: asignadosInicial,
  disponibles,
  puedeEditar,
}: {
  guardiaId: number;
  cerrada: boolean;
  asignados: Asignado[];
  disponibles: Disponible[];
  puedeEditar: boolean;
}) {
  const [asignados, setAsignados] = useState(asignadosInicial);
  const [disp, setDisp] = useState(disponibles);
  const [seleccion, setSeleccion] = useState<number | "">("");
  const [rol, setRol] = useState("BOMBERO");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cerradaState, setCerradaState] = useState(cerrada);

  const asignar = () => {
    if (!seleccion) return;
    const fid = Number(seleccion);
    const f = disp.find((x) => x.id === fid);
    if (!f) return;
    setError(null);
    start(async () => {
      const r = await asignarFuncionarioAGuardia(guardiaId, fid, rol);
      if (r.ok) {
        setAsignados([
          ...asignados,
          {
            id: f.id,
            nombre_completo: f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`,
            rol_guardia: rol,
            asistio: null,
          },
        ]);
        setDisp(disp.filter((x) => x.id !== fid));
        setSeleccion("");
      } else {
        setError(r.error ?? "Error");
      }
    });
  };

  const cerrar = () => {
    if (!confirm("¿Cerrar la guardia? Esta acción es irreversible.")) return;
    setError(null);
    start(async () => {
      const r = await cerrarGuardia(guardiaId);
      if (r.ok) setCerradaState(true);
      else setError(r.error ?? "Error");
    });
  };

  const toggleAsistencia = (gfId: number, asistio: boolean) => {
    setError(null);
    let motivo: string | null = null;
    if (!asistio) {
      motivo = prompt("Motivo de inasistencia (opcional):") ?? null;
    }
    start(async () => {
      const r = await marcarAsistencia(guardiaId, gfId, asistio, motivo);
      if (r.ok) {
        setAsignados((prev) =>
          prev.map((a) => (a.id === gfId ? { ...a, asistio } : a)),
        );
      } else {
        setError(r.error ?? "Error");
      }
    });
  };

  return (
    <>
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex justify-between items-center">
          <h2 className="font-semibold">Funcionarios asignados ({asignados.length})</h2>
          {puedeEditar && !cerradaState && (
            <button
              onClick={cerrar}
              disabled={pending}
              className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-60"
            >
              Cerrar guardia
            </button>
          )}
        </div>
        {asignados.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Sin funcionarios asignados todavía.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left p-3">Funcionario</th>
                <th className="text-left p-3">Rol en guardia</th>
                <th className="text-center p-3">Asistencia</th>
              </tr>
            </thead>
            <tbody>
              {asignados.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3 font-medium">{a.nombre_completo}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {a.rol_guardia ?? "—"}
                  </td>
                  <td className="p-3 text-center">
                    {puedeEditar && !cerradaState ? (
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => toggleAsistencia(a.id, true)}
                          disabled={pending}
                          className={`px-2 py-0.5 text-xs rounded border ${
                            a.asistio === true
                              ? "bg-green-100 border-green-300 text-green-800"
                              : "hover:bg-green-50"
                          }`}
                          title="Marcar como asistió"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => toggleAsistencia(a.id, false)}
                          disabled={pending}
                          className={`px-2 py-0.5 text-xs rounded border ${
                            a.asistio === false
                              ? "bg-red-100 border-red-300 text-red-800"
                              : "hover:bg-red-50"
                          }`}
                          title="Marcar como NO asistió"
                        >
                          ✗
                        </button>
                      </div>
                    ) : a.asistio === true ? (
                      <span className="text-green-700">✓ Asistió</span>
                    ) : a.asistio === false ? (
                      <span className="text-red-700">✗ No asistió</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {puedeEditar && !cerradaState && (
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm">Asignar funcionario</h2>
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1">Funcionario</label>
              <select
                value={seleccion}
                onChange={(e) =>
                  setSeleccion(e.target.value ? Number(e.target.value) : "")
                }
                className="input"
              >
                <option value="">— Seleccione —</option>
                {disp.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`}
                  </option>
                ))}
              </select>
              {disp.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  No hay más funcionarios activos en esta estación.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Rol</label>
              <select value={rol} onChange={(e) => setRol(e.target.value)} className="input">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={asignar}
            disabled={pending || !seleccion}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Asignando…" : "+ Asignar"}
          </button>
        </section>
      )}
    </>
  );
}
