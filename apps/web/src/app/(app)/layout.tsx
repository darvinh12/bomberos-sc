import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { puedeVer } from "@/lib/roles";
import LogoutButton from "@/components/layout/LogoutButton";
import RoleSwitcher from "@/components/layout/RoleSwitcher";

interface Me {
  id: number;
  usuario: string;
  nombre_completo: string;
  correo?: string | null;
  roles: string[];
  debe_cambiar_password: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_GENERAL: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/funcionarios", label: "Personal", icon: "👥" },
];

const NAV_OPERATIVO: NavItem[] = [
  { href: "/ops/guardias", label: "Guardias", icon: "🚒" },
  { href: "/ops/vacaciones", label: "Vacaciones", icon: "🌴" },
  { href: "/ops/permisos", label: "Permisos", icon: "📝" },
  { href: "/ops/comisiones", label: "Comisiones", icon: "📋" },
  { href: "/ops/faltas", label: "Faltas", icon: "⚠️" },
  { href: "/salud/reposos", label: "Reposos", icon: "🏥" },
];

const NAV_GESTION: NavItem[] = [
  { href: "/carrera", label: "Carrera", icon: "🎖️" },
  { href: "/equipo/proteccion", label: "Protección", icon: "🦺" },
  { href: "/equipo/radios", label: "Radios", icon: "📡" },
  { href: "/beneficios", label: "Beneficios", icon: "💰" },
  { href: "/egresos", label: "Egresos", icon: "🏁" },
];

const NAV_REFERENCIA: NavItem[] = [
  { href: "/catalogos", label: "Catálogos", icon: "📚" },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/usuarios", label: "Usuarios", icon: "🔑" },
  { href: "/admin/campos-custom", label: "Campos personalizados", icon: "🧩" },
];

function filtrar(items: NavItem[], roles: string[]) {
  return items.filter((i) => puedeVer(i.href, roles));
}

function NavGroup({ title, items }: { title?: string; items: NavItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      {title && (
        <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = await requireAuth();
  let me: Me | null = null;
  try {
    me = await api.get<Me>("/auth/me", token);
  } catch {
    me = null;
  }
  const roles = me?.roles ?? [];

  const general = filtrar(NAV_GENERAL, roles);
  const operativo = filtrar(NAV_OPERATIVO, roles);
  const gestion = filtrar(NAV_GESTION, roles);
  const referencia = filtrar(NAV_REFERENCIA, roles);
  const admin = roles.includes("ADMIN") ? NAV_ADMIN : [];

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
          <NavGroup items={general} />
          <NavGroup title="Operativo" items={operativo} />
          <NavGroup title="Gestión" items={gestion} />
          <NavGroup title="Referencia" items={referencia} />
          <NavGroup title="Administración" items={admin} />
        </nav>

        {me && (
          <div className="p-3 border-t space-y-2">
            <RoleSwitcher currentRoles={roles} />
            <div className="px-3 py-2 text-xs">
              <div className="font-semibold truncate">{me.nombre_completo}</div>
              <div className="text-muted-foreground">@{me.usuario}</div>
              {roles.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {roles.map((r) => (
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
            Tu contraseña debe cambiarse.{" "}
            <Link href="/perfil" className="underline">Cambiar ahora</Link>
          </div>
        )}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
