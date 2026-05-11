import Link from "next/link";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import { listarCat, type EntidadCat, type CatItem } from "./actions";
import CatalogosTabs from "./tabs";

const ENTIDADES: EntidadCat[] = [
  "jerarquias",
  "cargos",
  "condiciones",
  "niveles-educativos",
  "especialidades",
  "estados-civiles",
  "grupos-sanguineos",
  "bancos",
];

export default async function CatalogosAdminPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN"]);

  const data = await Promise.all(
    ENTIDADES.map(async (e) => [e, await listarCat(e)] as const),
  );
  const map: Record<EntidadCat, CatItem[]> = Object.fromEntries(data) as Record<
    EntidadCat,
    CatItem[]
  >;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Administración
        </Link>
        <h1 className="text-2xl font-bold mt-1">Catálogos del sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Editá jerarquías, cargos, condiciones, niveles educativos,
          especialidades, estados civiles, grupos sanguíneos y bancos. Cada
          cambio queda auditado (mirá <Link href="/admin/auditoria" className="underline">/admin/auditoria</Link>).
          Si una opción está en uso, no se puede borrar — desactivá en su lugar.
        </p>
      </div>
      <CatalogosTabs data={map} />
    </div>
  );
}
