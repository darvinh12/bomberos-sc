"use client";

import { useMemo, useState, useTransition } from "react";
import {
  togglePermiso,
  type Modulo,
  type Permiso,
  type PermisoKey,
  type Rol,
} from "./actions";

const ACCIONES: { key: PermisoKey; label: string; corto: string; ayuda: string }[] = [
  { key: "puede_ver",       label: "Ver",       corto: "V", ayuda: "Listar y consultar el detalle" },
  { key: "puede_crear",     label: "Crear",     corto: "C", ayuda: "Crear nuevos registros" },
  { key: "puede_editar",    label: "Editar",    corto: "E", ayuda: "Modificar registros existentes" },
  { key: "puede_eliminar",  label: "Eliminar",  corto: "X", ayuda: "Eliminar / dar de baja" },
  { key: "puede_exportar",  label: "Exportar",  corto: "↓", ayuda: "Descargar CSV / PDF" },
  { key: "puede_aprobar",   label: "Aprobar",   corto: "✓", ayuda: "Aprobar flujos que lo requieran" },
];

type PermisoMap = Map<string, Permiso>;
const cellKey = (rol_id: number, modulo_id: number) => `${rol_id}:${modulo_id}`;

function buildMap(permisos: Permiso[]): PermisoMap {
  const m = new Map<string, Permiso>();
  for (const p of permisos) m.set(cellKey(p.rol_id, p.modulo_id), p);
  return m;
}

function getCell(map: PermisoMap, rol_id: number, modulo_id: number): Permiso {
  return (
    map.get(cellKey(rol_id, modulo_id)) ?? {
      rol_id,
      modulo_id,
      puede_ver: false,
      puede_crear: false,
      puede_editar: false,
      puede_eliminar: false,
      puede_exportar: false,
      puede_aprobar: false,
    }
  );
}

export default function MatrizPermisos({
  roles,
  modulos,
  permisos: permisosInit,
}: {
  roles: Rol[];
  modulos: Modulo[];
  permisos: Permiso[];
}) {
  const rolesActivos = roles.filter((r) => r.activo);
  const modulosActivos = modulos.filter((m) => m.activo);
  const [rolId, setRolId] = useState<number>(rolesActivos[0]?.id ?? 0);
  const [permisos, setPermisos] = useState<Permiso[]>(permisosInit);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const map = useMemo(() => buildMap(permisos), [permisos]);
  const rolActual = roles.find((r) => r.id === rolId) ?? null;

  const setCellLocal = (modulo_id: number, key: PermisoKey, value: boolean) => {
    setPermisos((prev) => {
      const idx = prev.findIndex(
        (x) => x.rol_id === rolId && x.modulo_id === modulo_id,
      );
      if (idx === -1) {
        return [
          ...prev,
          {
            rol_id: rolId,
            modulo_id,
            puede_ver: false,
            puede_crear: false,
            puede_editar: false,
            puede_eliminar: false,
            puede_exportar: false,
            puede_aprobar: false,
            [key]: value,
          },
        ];
      }
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };
      return copy;
    });
  };

  const toggle = (modulo_id: number, key: PermisoKey, value: boolean) => {
    setError(null);
    setCellLocal(modulo_id, key, value);
    start(async () => {
      const r = await togglePermiso(rolId, modulo_id, key, value);
      if (!r.ok) {
        setCellLocal(modulo_id, key, !value);
        setError(r.error ?? "No se pudo guardar");
      }
    });
  };

  const toggleFilaCompleta = (modulo_id: number, value: boolean) => {
    for (const a of ACCIONES) toggle(modulo_id, a.key, value);
  };

  const filaTodoMarcada = (modulo_id: number): boolean => {
    const c = getCell(map, rolId, modulo_id);
    return ACCIONES.every((a) => c[a.key]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm font-medium" htmlFor="sel-rol">
          Rol a configurar:
        </label>
        <select
          id="sel-rol"
          value={rolId}
          onChange={(e) => setRolId(Number(e.target.value))}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {rolesActivos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre} {r.es_sistema ? "(sistema)" : ""}
            </option>
          ))}
        </select>
        {rolActual?.descripcion && (
          <span className="text-xs text-muted-foreground">
            · {rolActual.descripcion}
          </span>
        )}
        {pending && (
          <span className="text-xs text-muted-foreground ml-auto">
            Guardando…
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3 font-medium">Módulo</th>
              {ACCIONES.map((a) => (
                <th
                  key={a.key}
                  className="p-2 font-medium text-center w-20"
                  title={a.ayuda}
                >
                  <div>{a.label}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {a.corto}
                  </div>
                </th>
              ))}
              <th className="p-2 font-medium text-center w-20">Todo</th>
            </tr>
          </thead>
          <tbody>
            {modulosActivos.map((m) => {
              const cell = getCell(map, rolId, m.id);
              return (
                <tr key={m.id} className="border-t hover:bg-muted/20">
                  <td className="p-3">
                    <div className="font-medium">{m.nombre}</div>
                    {m.descripcion && (
                      <div className="text-xs text-muted-foreground">
                        {m.descripcion}
                      </div>
                    )}
                  </td>
                  {ACCIONES.map((a) => (
                    <td key={a.key} className="p-2 text-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 cursor-pointer accent-primary"
                        checked={!!cell[a.key]}
                        disabled={pending}
                        onChange={(e) => toggle(m.id, a.key, e.target.checked)}
                      />
                    </td>
                  ))}
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 cursor-pointer accent-primary"
                      checked={filaTodoMarcada(m.id)}
                      disabled={pending}
                      onChange={(e) =>
                        toggleFilaCompleta(m.id, e.target.checked)
                      }
                      title="Marca o desmarca todas las acciones del módulo"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Los roles marcados como <em>sistema</em> no se pueden borrar, pero sus
        permisos sí son editables. El rol <strong>ADMIN</strong> siempre tiene
        acceso completo aunque no esté marcado aquí.
      </p>
    </div>
  );
}
