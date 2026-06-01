"use client";

import { useState } from "react";
import MatrizPermisos from "./matriz";
import MatrizRecursos from "./matriz-recursos";
import type {
  Rol,
  Modulo,
  Permiso,
  PermisoRecursoMatriz,
} from "./actions";

interface Props {
  roles: Rol[];
  modulos: Modulo[];
  permisos: Permiso[];
  permisosRecursos: PermisoRecursoMatriz[];
}

const TABS = [
  { key: "modulos", label: "Módulos del sistema" },
  { key: "seccion_ficha", label: "Secciones de ficha" },
  { key: "sidebar", label: "Navegación" },
  { key: "accion_panel", label: "Acciones funcionario" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PermisosTabs({
  roles,
  modulos,
  permisos,
  permisosRecursos,
}: Props) {
  const [active, setActive] = useState<TabKey>("modulos");
  const rolesParaMatriz = roles.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
  }));

  return (
    <div className="space-y-6">
      <div className="border-b border-border flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
              active === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "modulos" && (
        <MatrizPermisos roles={roles} modulos={modulos} permisos={permisos} />
      )}
      {active === "seccion_ficha" && (
        <MatrizRecursos
          roles={rolesParaMatriz}
          permisosIniciales={permisosRecursos}
          tipo="seccion_ficha"
        />
      )}
      {active === "sidebar" && (
        <MatrizRecursos
          roles={rolesParaMatriz}
          permisosIniciales={permisosRecursos}
          tipo="sidebar"
        />
      )}
      {active === "accion_panel" && (
        <MatrizRecursos
          roles={rolesParaMatriz}
          permisosIniciales={permisosRecursos}
          tipo="accion_panel"
        />
      )}
    </div>
  );
}
