import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { api } from "@/lib/api";
import LogoutButton from "@/components/layout/LogoutButton";

interface Me {
  id: number;
  usuario: string;
  nombre_completo: string;
  correo?: string | null;
  roles: string[];
  debe_cambiar_password: boolean;
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/funcionarios", label: "Personal", icon: "👥" },
  { href: "/salud/reposos", label: "Reposos", icon: "🏥" },
  { href: "/ops/guardias", label: "Guardias", icon: "🚒" },
  { href: "/ops/vacaciones", label: "Vacaciones", icon: "🌴" },
  { href: "/ops/permisos", label: "Permisos", icon: "📝" },
  { href: "/ops/comisiones", label: "Comisiones", icon: "📋" },
  { href: "/ops/faltas", label: "Faltas", icon: "⚠️" },
  { href: "/carrera", label: "Carrera", icon: "🎖️" },
  { href: "/equipo/proteccion", label: "Protección", icon: "🦺" },
  { href: "/equipo/radios", label: "Radios", icon: "📡" },
  { href: "/beneficios", label: "Beneficios", icon: "💰" },
  { href: "/egresos", label: "Egresos", icon: "🏁" },
  { href: "/catalogos", label: "Catálogos", icon: "📚" },
];

const NAV_ADMIN = [
  { href: "/admin/usuarios", label: "Usuarios", icon: "🔑" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = await requireAuth();
  let me: Me | null = null;
  try {
    me = await api.get<Me>("/auth/me", token);
  } catch {
    me = null;
  }

  return (
    <div className="min-h-screen flex bg-secondary/30">
      <aside className="w-64 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">🚒</span>
            <span className="font-bold text-sm leading-tight">
              Bomberos<br />Caracas
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          {me?.roles?.includes("ADMIN") && (
            <>
              <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                Administración
              </div>
              {NAV_ADMIN.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </>
          )}
        </nav>

        {me && (
          <div className="p-3 border-t">
            <div className="px-3 py-2 text-xs">
              <div className="font-semibold truncate">{me.nombre_completo}</div>
              <div className="text-muted-foreground">@{me.usuario}</div>
              {me.roles?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {me.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-block px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px]"
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

      <main className="flex-1 overflow-auto">
        {me?.debe_cambiar_password && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-sm text-yellow-800">
            Tu contraseña debe cambiarse. <Link href="/perfil" className="underline">Cambiar ahora</Link>
          </div>
        )}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
