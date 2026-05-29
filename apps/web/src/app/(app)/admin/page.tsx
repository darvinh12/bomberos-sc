import Link from "next/link";
import {
  UserCog, Lock, LayoutGrid, Building2, BookMarked, ClipboardList,
  SlidersHorizontal, Boxes, BookOpen, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";

interface AdminCard {
  href: string;
  titulo: string;
  descripcion: string;
  Icon: LucideIcon;
}

interface AdminGroup {
  titulo: string;
  descripcion: string;
  cards: AdminCard[];
}

const GRUPOS: AdminGroup[] = [
  {
    titulo: "Seguridad y accesos",
    descripcion: "Cuentas, roles y la matriz que define qué puede hacer cada uno.",
    cards: [
      {
        href: "/admin/usuarios",
        titulo: "Usuarios",
        descripcion: "Alta y baja de cuentas, asignación de roles, reseteo de contraseñas.",
        Icon: UserCog,
      },
      {
        href: "/admin/roles",
        titulo: "Roles",
        descripcion: "Definir los roles que después se asignan a las cuentas.",
        Icon: Lock,
      },
      {
        href: "/admin/permisos",
        titulo: "Matriz de permisos",
        descripcion: "Qué acciones puede ejecutar cada rol dentro de cada módulo.",
        Icon: LayoutGrid,
      },
    ],
  },
  {
    titulo: "Estructura organizacional",
    descripcion: "Zonas, estaciones, catálogos institucionales y campos de cada entidad.",
    cards: [
      {
        href: "/admin/organizacion",
        titulo: "Departamentos",
        descripcion: "Zonas, estaciones, divisiones, áreas y dependencias.",
        Icon: Building2,
      },
      {
        href: "/admin/catalogos",
        titulo: "Catálogos del sistema",
        descripcion: "Jerarquías, cargos, condiciones, especialidades, bancos y demás listas.",
        Icon: BookMarked,
      },
      {
        href: "/admin/campos-custom",
        titulo: "Campos personalizados",
        descripcion: "Agregar campos extra a funcionarios, reposos, vacaciones y otros.",
        Icon: ClipboardList,
      },
    ],
  },
  {
    titulo: "Configuración del sistema",
    descripcion: "Parámetros globales, módulos disponibles y registro de cambios.",
    cards: [
      {
        href: "/admin/parametros",
        titulo: "Parámetros",
        descripcion: "Configuración global: días de vacaciones, timeouts, valores por defecto.",
        Icon: SlidersHorizontal,
      },
      {
        href: "/admin/modulos",
        titulo: "Módulos",
        descripcion: "Secciones definidas en código que componen el sistema.",
        Icon: Boxes,
      },
      {
        href: "/admin/auditoria",
        titulo: "Auditoría",
        descripcion: "Quién hizo qué y cuándo. Trazabilidad completa de cambios.",
        Icon: BookOpen,
      },
    ],
  },
];

export default async function AdminHubPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  return (
    <div className="space-y-8 max-w-screen-xl">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Administración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuración del sistema. Solo disponible para administradores.
        </p>
      </header>

      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} aria-labelledby={`grupo-${grupo.titulo}`} className="space-y-3">
          <div className="border-b border-border pb-2">
            <h2
              id={`grupo-${grupo.titulo}`}
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              {grupo.titulo}
            </h2>
            <p className="text-xs text-muted-foreground/80 mt-0.5">{grupo.descripcion}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grupo.cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex items-start gap-3 rounded border border-border bg-card p-4
                           hover:border-primary/60 hover:bg-accent/40 transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="shrink-0 rounded bg-primary/15 border border-primary/30 p-2 text-primary-foreground/90 group-hover:bg-primary/25 transition-colors">
                  <c.Icon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground truncate">{c.titulo}</h3>
                    <ChevronRight
                      className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {c.descripcion}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
