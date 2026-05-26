"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

interface Me {
  nombre_completo: string;
  usuario: string;
  roles: string[];
}

interface Props {
  me: Me | null;
  children: React.ReactNode;
}

export default function MobileSidebar({ me, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-56 bg-background border-r border-border flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal={open}
        aria-label="Menú de navegación"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            onClick={() => setOpen(false)}
          >
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-[11px] font-bold tracking-wide">CB</span>
            </div>
            <div className="leading-snug">
              <div className="text-foreground text-sm font-semibold">Bomberos</div>
              <div className="text-muted-foreground text-[11px]">Caracas</div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {children}
        </nav>

        {/* User footer */}
        {me && (
          <div className="shrink-0 border-t border-border px-3 pt-3 pb-3 space-y-2">
            <div className="px-1">
              <div className="text-[13px] font-medium text-foreground truncate">
                {me.nombre_completo}
              </div>
              <div className="text-[11px] text-muted-foreground">@{me.usuario}</div>
              {me.roles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {me.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-block px-1.5 py-0.5 bg-primary/20 text-primary/80 rounded text-[10px] font-medium uppercase tracking-wide"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <LogoutButton />
          </div>
        )}
      </aside>
    </>
  );
}
