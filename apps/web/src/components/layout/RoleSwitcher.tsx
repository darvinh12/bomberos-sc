"use client";

import { useTransition } from "react";
import { switchDemoRole } from "@/app/actions/demo";
import { ROLES_DISPONIBLES } from "@/lib/roles";

export default function RoleSwitcher({ currentRoles }: { currentRoles: string[] }) {
  const [pending, start] = useTransition();
  const current = currentRoles[0] ?? "ADMIN";

  return (
    <form
      action={(fd) => {
        start(() => { void switchDemoRole(fd); });
      }}
    >
      <label
        htmlFor="demo-role-select"
        className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1 px-1"
      >
        Demo — cambiar rol
      </label>
      <select
        id="demo-role-select"
        name="rol"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full text-[12px] rounded bg-card border border-border text-foreground
                   px-2 py-1.5 disabled:opacity-50
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                   transition-colors"
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
