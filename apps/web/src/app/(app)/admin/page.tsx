import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";

type Card = {
  href: string;
  titulo: string;
  descripcion: string;
  emoji: string;
};

const CARDS: Card[] = [
  {
    href: "/admin/usuarios",
    titulo: "Usuarios",
    descripcion:
      "Alta y baja de usuarios, asignación de roles, reseteo de contraseñas.",
    emoji: "👥",
  },
  {
    href: "/admin/roles",
    titulo: "Roles",
    descripcion:
      "Crear y editar roles que después se asignan a usuarios.",
    emoji: "🎭",
  },
  {
    href: "/admin/modulos",
    titulo: "Módulos",
    descripcion:
      "Definir las secciones del sistema (funcionarios, salud, equipo…).",
    emoji: "🧩",
  },
  {
    href: "/admin/permisos",
    titulo: "Matriz de permisos",
    descripcion:
      "Marcá con checks qué puede hacer cada rol en cada módulo.",
    emoji: "🔐",
  },
  {
    href: "/admin/organizacion",
    titulo: "Departamentos",
    descripcion:
      "Zonas, estaciones, divisiones, áreas y dependencias. Cambios afectan los dropdowns de toda la app.",
    emoji: "🏢",
  },
  {
    href: "/admin/catalogos",
    titulo: "Catálogos del sistema",
    descripcion:
      "Jerarquías, cargos, condiciones, niveles educativos, especialidades, estados civiles, grupos sanguíneos, bancos.",
    emoji: "📚",
  },
  {
    href: "/admin/parametros",
    titulo: "Parámetros del sistema",
    descripcion:
      "Configuración global: días de vacaciones, timeouts, etc. Valores editables.",
    emoji: "⚙️",
  },
  {
    href: "/admin/campos-custom",
    titulo: "Campos personalizados",
    descripcion:
      "Agregá campos extra a funcionarios, reposos, vacaciones, etc.",
    emoji: "✨",
  },
  {
    href: "/admin/auditoria",
    titulo: "Auditoría",
    descripcion:
      "Quién hizo qué y cuándo. Trazabilidad completa de cambios.",
    emoji: "📜",
  },
];

export default async function AdminHubPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuración del sistema. Solo disponible para administradores.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border bg-card p-5 hover:bg-muted/30 transition"
          >
            <div className="text-3xl mb-2">{c.emoji}</div>
            <div className="font-semibold">{c.titulo}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {c.descripcion}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
