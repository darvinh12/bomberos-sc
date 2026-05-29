import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { puedeEditarSeccion } from "@/lib/permisos-funcionario";
import NuevoTiempoAdmPubForm from "./form";

interface FuncionarioMin {
  id: number;
  nombre_completo: string | null;
  apellidos: string;
  nombres: string;
}

interface Me {
  roles: string[];
}

export default async function NuevoTiempoAdmPubPage({
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
        <h1 className="text-2xl font-bold mt-1">
          Nuevo registro de administración pública
        </h1>
        <p className="text-sm text-muted-foreground">
          Para: <span className="font-semibold">{nombre}</span>
        </p>
      </div>
      <NuevoTiempoAdmPubForm funcionarioId={fid} />
    </div>
  );
}
