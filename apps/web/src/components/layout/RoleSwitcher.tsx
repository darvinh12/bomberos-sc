"use client";

import { useTransition } from "react";
import { switchDemoRole } from "@/app/actions/demo";
import { ROLES_DISPONIBLES } from "@/lib/roles";

/**
 * Selector de rol para modo DEMO. Permite probar el control de acceso
 * sin tener una BD real con múltiples usuarios. Solo visible si el
 * usuario actual tiene rol DEMO/ADMIN o estamos en modo demo.
 */
export default function RoleSwitcher({ currentRoles }: { currentRoles: string[] }) {
  const [pending, start] = useTransition();
  const current = currentRoles[0] ?? "ADMIN";

  return (
    <form
      action={(fd) => {
        start(() => {
          void switchDemoRole(fd);
        });
      }}
      className="px-3"
    >
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        Modo demo — cambiar rol
      </label>
      <select
        name="rol"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full text-xs rounded-md border border-input bg-background px-2 py-1 disabled:opacity-50"
      >
        {ROLES_DISPONIBLES.map((r) => (
          <option key={r.codigo} value={r.codigo} title={r.descripcion}>
            {r.nombre}
          </option>
        ))}
      </select>
    </form>
  );
}
