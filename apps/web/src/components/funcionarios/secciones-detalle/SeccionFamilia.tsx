"use client";

import { useEffect, useState } from "react";
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

interface Familiar {
  id: number;
  funcionario_id: number;
  parentesco: string;
  cedula: string | null;
  apellidos: string | null;
  nombres: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  condicion: string | null;
  observaciones: string | null;
}

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

function calcularEdad(fechaIso: string | null): string {
  if (!fechaIso) return "—";
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return "—";
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const m = hoy.getMonth() - fecha.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < fecha.getDate())) edad--;
  if (edad < 0) return "—";
  return `${edad}`;
}

export default function SeccionFamilia({ funcionarioId, userRoles }: Props) {
  const [items, setItems] = useState<Familiar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeEditar = hasAnyRole(userRoles, ["RRHH", "ADMIN"]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api
          .get<Page<Familiar>>(
            `/funcionarios/${funcionarioId}/carga-familiar?page_size=100`,
          )
          .catch(() => ({ items: [] }) as Page<Familiar>);
        if (!alive) return;
        setItems(res.items ?? []);
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
      <SectionShell title="Familia">
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      </SectionShell>
    );
  }

  if (items === null) {
    return (
      <SectionShell title="Familia">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </SectionShell>
    );
  }

  const nuevoHref = `/funcionarios/${funcionarioId}/carga-familiar/nuevo`;

  return (
    <SectionShell
      title="Familia"
      description="Carga familiar declarada: hijos, cónyuge, padres y otros beneficiarios HCM."
    >
      <Card title="Carga familiar">
        {items.length === 0 ? (
          <EmptyState
            title="Sin carga familiar registrada"
            hint={
              puedeEditar
                ? "Usa el botón Nuevo familiar para agregar el primer registro."
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Parentesco
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Cédula
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Nombre completo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Fecha nac.
                  </th>
                  <th scope="col" className="text-right p-2 font-medium">
                    Edad
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Sexo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Condición
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Observaciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => {
                  const nombre = [f.apellidos, f.nombres]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  return (
                    <tr key={f.id} className="border-t border-border">
                      <td className="p-2 font-medium">{f.parentesco}</td>
                      <td className="p-2 font-mono text-xs">
                        {f.cedula ?? "—"}
                      </td>
                      <td className="p-2">{nombre || "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {formatDate(f.fecha_nacimiento)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {calcularEdad(f.fecha_nacimiento)}
                      </td>
                      <td className="p-2">{f.sexo ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {f.condicion ?? "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {f.observaciones ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && (
          <div className="mt-3 text-right">
            <a
              href={nuevoHref}
              className="text-xs text-primary hover:underline"
            >
              + Nuevo familiar
            </a>
          </div>
        )}
      </Card>
    </SectionShell>
  );
}
