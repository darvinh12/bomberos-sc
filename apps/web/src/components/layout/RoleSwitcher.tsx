"use client";

import { useTransition } from "react";
import { switchDemoRole } from "@/app/actions/demo";

interface RolOption {
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

interface Props {
  currentRoles: string[];
  roles: RolOption[];
}

export default function RoleSwitcher({ currentRoles, roles }: Props) {
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
        {roles.map((r) => (
          <option key={r.codigo} value={r.codigo} title={r.descripcion ?? undefined}>
            {r.nombre}
          </option>
        ))}
      </select>
    </form>
  );
}
