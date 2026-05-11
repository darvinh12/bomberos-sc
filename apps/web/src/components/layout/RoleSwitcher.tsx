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
      <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1 px-1">
        Demo — rol
      </label>
      <select
        name="rol"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full text-[12px] rounded bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1.5 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-slate-600"
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
