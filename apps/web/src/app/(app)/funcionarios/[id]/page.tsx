import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import type {
  Catalogo,
  CatalogoEstacion,
} from "@/lib/catalogos";
import FichaFuncionarioCliente from "@/components/funcionarios/FichaFuncionarioCliente";
import type { CatalogosAcciones } from "@/components/funcionarios/PanelAcciones";

export default async function FuncionarioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let f: any;
  try {
    f = await api.get(`/funcionarios/${params.id}`, token);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  // Catálogos para el Panel de Acciones. Cargados en paralelo y degradados
  // a [] si alguno falla (no debe tumbar la ficha).
  const [
    jerarquias,
    zonas,
    estaciones,
    divisiones,
    areas,
    tiposReposo,
  ] = await Promise.all([
    api.get<Catalogo[]>("/catalogos/jerarquias", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/zonas", token).catch(() => [] as Catalogo[]),
    api
      .get<CatalogoEstacion[]>("/catalogos/estaciones", token)
      .catch(() => [] as CatalogoEstacion[]),
    api.get<Catalogo[]>("/catalogos/divisiones", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/areas", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/tipos-reposo", token).catch(() => [] as Catalogo[]),
  ]);

  const catalogosAcciones: CatalogosAcciones = {
    jerarquias,
    zonas,
    estaciones,
    divisiones,
    areas,
    tiposReposo,
  };

  return (
    <FichaFuncionarioCliente
      funcionario={f}
      userRoles={me.roles}
      puedeEditar={puedeEditar}
      catalogosAcciones={catalogosAcciones}
    />
  );
}
