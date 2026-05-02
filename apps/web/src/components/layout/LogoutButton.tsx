"use client";

import { useTransition } from "react";
import { logoutAction } from "./logout-action";

export default function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => logoutAction())}
      disabled={pending}
      className="w-full mt-1 text-left px-3 py-2 text-xs rounded-md hover:bg-accent transition disabled:opacity-50"
    >
      {pending ? "Cerrando…" : "🚪 Cerrar sesión"}
    </button>
  );
}
