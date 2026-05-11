"use client";

import { useTransition } from "react";
import { logoutAction } from "./logout-action";

export default function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => logoutAction())}
      disabled={pending}
      className="w-full text-left px-2 py-1.5 text-[12px] rounded text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors disabled:opacity-50"
    >
      {pending ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
