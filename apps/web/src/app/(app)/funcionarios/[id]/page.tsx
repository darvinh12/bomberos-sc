import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import FichaFuncionarioCliente from "@/components/funcionarios/FichaFuncionarioCliente";

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

  return (
    <FichaFuncionarioCliente
      funcionario={f}
      userRoles={me.roles}
      puedeEditar={puedeEditar}
    />
  );
}
