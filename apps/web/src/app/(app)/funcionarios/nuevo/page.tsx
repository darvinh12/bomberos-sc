import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import NuevoForm from "./form";

interface Cat {
  id: number;
  codigo: string;
  nombre: string;
}

export default async function NuevoFuncionarioPage() {
  const token = await requireAuth();
  let jerarquias: Cat[] = [];
  let cargos: Cat[] = [];
  let zonas: Cat[] = [];
  let estaciones: Cat[] = [];
  try {
    [jerarquias, cargos, zonas, estaciones] = await Promise.all([
      api.get<Cat[]>("/catalogos/jerarquias", token),
      api.get<Cat[]>("/catalogos/cargos", token),
      api.get<Cat[]>("/catalogos/zonas", token),
      api.get<Cat[]>("/catalogos/estaciones", token),
    ]);
  } catch {
    // si la API no responde, los selects quedan vacíos
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo funcionario</h1>
        <p className="text-sm text-muted-foreground">
          La fecha de primer ingreso genera automáticamente el período de servicio inicial.
        </p>
      </div>
      <NuevoForm
        jerarquias={jerarquias}
        cargos={cargos}
        zonas={zonas}
        estaciones={estaciones}
      />
    </div>
  );
}
