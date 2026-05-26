"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "./logout-action";

export default function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => logoutAction())}
      disabled={pending}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded
                 text-muted-foreground hover:bg-accent hover:text-foreground
                 transition-colors disabled:opacity-50
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {pending ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
