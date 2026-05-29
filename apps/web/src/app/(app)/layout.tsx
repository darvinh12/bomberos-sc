import Link from "next/link";
import {
  LayoutDashboard, Users, ShieldCheck, CalendarDays, FileCheck2,
  Briefcase, AlertTriangle, HeartPulse, Award, HardHat, Radio,
  HandCoins, DoorOpen, BookOpen, Settings, UserCog, Lock, Boxes,
  Building2, BookMarked, SlidersHorizontal, LayoutGrid, ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { requireAuth } from "@/lib/session";
import { api } from "@/lib/api";
import { puedeVer } from "@/lib/roles";
import LogoutButton from "@/components/layout/LogoutButton";
import RoleSwitcher from "@/components/layout/RoleSwitcher";
import GlobalSearch from "@/components/layout/GlobalSearch";
import MobileSidebar from "@/components/layout/MobileSidebar";

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
  Icon: LucideIcon;
}

const NAV_GENERAL: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard", Icon: LayoutDashboard },
  { href: "/funcionarios",label: "Personal",  Icon: Users },
];

const NAV_OPERATIVO: NavItem[] = [
  { href: "/ops/guardias",   label: "Guardias",   Icon: ShieldCheck },
  { href: "/ops/vacaciones", label: "Vacaciones", Icon: CalendarDays },
  { href: "/ops/permisos",   label: "Permisos",   Icon: FileCheck2 },
  { href: "/ops/comisiones", label: "Comisiones", Icon: Briefcase },
  { href: "/ops/faltas",     label: "Faltas",     Icon: AlertTriangle },
  { href: "/salud/reposos",  label: "Reposos",    Icon: HeartPulse },
];

const NAV_GESTION: NavItem[] = [
  { href: "/carrera",           label: "Carrera",    Icon: Award },
  { href: "/equipo/proteccion", label: "Protección", Icon: HardHat },
  { href: "/equipo/radios",     label: "Radios",     Icon: Radio },
  { href: "/beneficios",        label: "Beneficios", Icon: HandCoins },
  { href: "/egresos",           label: "Egresos",    Icon: DoorOpen },
];

const NAV_REFERENCIA: NavItem[] = [
  { href: "/catalogos", label: "Catálogos", Icon: BookOpen },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/admin",               label: "Panel admin",          Icon: Settings },
  { href: "/admin/usuarios",      label: "Usuarios",             Icon: UserCog },
  { href: "/admin/roles",         label: "Roles",                Icon: Lock },
  { href: "/admin/modulos",       label: "Módulos",              Icon: Boxes },
  { href: "/admin/permisos",      label: "Matriz de permisos",   Icon: LayoutGrid },
  { href: "/admin/organizacion",  label: "Departamentos",        Icon: Building2 },
  { href: "/admin/catalogos",     label: "Catálogos",            Icon: BookMarked },
  { href: "/admin/parametros",    label: "Parámetros",           Icon: SlidersHorizontal },
  { href: "/admin/campos-custom", label: "Campos personalizados",Icon: ClipboardList },
  { href: "/admin/auditoria",     label: "Auditoría",            Icon: BookOpen },
];

function filtrar(items: NavItem[], roles: string[]) {
  return items.filter((i) => puedeVer(i.href, roles));
}

function NavGroup({ title, items }: { title?: string; items: NavItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      {title && (
        <div className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {title}
        </div>
      )}
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
          {label}
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

  const general    = filtrar(NAV_GENERAL, roles);
  const operativo  = filtrar(NAV_OPERATIVO, roles);
  const gestion    = filtrar(NAV_GESTION, roles);
  const referencia = filtrar(NAV_REFERENCIA, roles);
  const admin      = roles.includes("ADMIN") ? NAV_ADMIN : [];

  return (
    <div className="min-h-screen flex bg-background">

      {/* Skip link a11y */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded focus:text-sm focus:font-medium"
      >
        Saltar al contenido principal
      </a>

      {/* ── Sidebar — hidden on mobile ── */}
      <aside
        className="w-56 bg-background hidden md:flex flex-col shrink-0 border-r border-border"
        aria-label="Navegación principal"
      >

        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-[11px] font-bold tracking-wide">CB</span>
            </div>
            <div className="leading-snug">
              <div className="text-foreground text-sm font-semibold">Bomberos</div>
              <div className="text-muted-foreground text-[11px] font-medium">Caracas</div>
            </div>
          </Link>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 shrink-0">
          <GlobalSearch />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          <NavGroup items={general} />
          <NavGroup title="Operativo" items={operativo} />
          <NavGroup title="Gestión" items={gestion} />
          <NavGroup title="Referencia" items={referencia} />
          <NavGroup title="Administración" items={admin} />
        </nav>

        {/* User footer */}
        {me && (
          <div className="shrink-0 border-t border-border px-3 pt-3 pb-3 space-y-2">
            <RoleSwitcher currentRoles={roles} />
            <div className="px-1">
              <div className="text-[13px] font-medium text-foreground truncate">
                {me.nombre_completo}
              </div>
              <div className="text-[11px] text-muted-foreground">@{me.usuario}</div>
              {roles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {roles.map((r) => (
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

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile topbar */}
        <div className="md:hidden h-14 flex items-center gap-3 px-3 border-b border-border shrink-0 bg-card">
          <MobileSidebar me={me ? { nombre_completo: me.nombre_completo, usuario: me.usuario, roles } : null}>
            <NavGroup items={general} />
            <NavGroup title="Operativo" items={operativo} />
            <NavGroup title="Gestión" items={gestion} />
            <NavGroup title="Referencia" items={referencia} />
            {admin.length > 0 && <NavGroup title="Administración" items={admin} />}
          </MobileSidebar>
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded flex items-center justify-center shrink-0">
              <span className="text-primary-foreground text-[10px] font-bold tracking-wide">CB</span>
            </div>
            <span className="text-foreground text-sm font-semibold">Bomberos Caracas</span>
          </Link>
        </div>

        {/* Password change alert */}
        {me?.debe_cambiar_password && (
          <div className="shrink-0 bg-amber-950/40 border-b border-amber-800/50 px-6 py-2 text-sm text-amber-300">
            Su contraseña debe cambiarse.{" "}
            <Link href="/perfil" className="font-semibold underline">
              Cambiar ahora
            </Link>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto focus:outline-none">
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
