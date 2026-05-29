import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { puedeEditarSeccion } from "@/lib/permisos-funcionario";
import type { Catalogo, CatalogoEstacion } from "@/lib/catalogos";
import NuevoHistUbicacionForm from "./form";

interface FuncionarioMin {
  id: number;
  nombre_completo: string | null;
  apellidos: string;
  nombres: string;
}

interface Me {
  roles: string[];
}

export default async function NuevoHistUbicacionPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  const me = await api
    .get<Me>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));

  const fid = Number(params.id);
  if (!Number.isFinite(fid) || fid <= 0) notFound();
  if (!puedeEditarSeccion("carrera", me.roles)) redirect(`/funcionarios/${fid}`);

  let funcionario: FuncionarioMin;
  try {
    funcionario = await api.get<FuncionarioMin>(`/funcionarios/${fid}`, token);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [zonas, estaciones, divisiones, areas] = await Promise.all([
    api.get<Catalogo[]>("/catalogos/zonas", token).catch(() => [] as Catalogo[]),
    api
      .get<CatalogoEstacion[]>("/catalogos/estaciones", token)
      .catch(() => [] as CatalogoEstacion[]),
    api
      .get<Catalogo[]>("/catalogos/divisiones", token)
      .catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/areas", token).catch(() => [] as Catalogo[]),
  ]);

  const nombre =
    funcionario.nombre_completo ||
    `${funcionario.apellidos ?? ""} ${funcionario.nombres ?? ""}`.trim();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href={`/funcionarios/${fid}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Ficha del funcionario
        </Link>
        <h1 className="text-2xl font-bold mt-1">Nuevo registro de ubicación</h1>
        <p className="text-sm text-muted-foreground">
          Para: <span className="font-semibold">{nombre}</span>
        </p>
      </div>
      <NuevoHistUbicacionForm
        funcionarioId={fid}
        zonas={zonas}
        estaciones={estaciones}
        divisiones={divisiones}
        areas={areas}
      />
    </div>
  );
}
