import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";

interface Catalogo {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

interface Jerarquia extends Catalogo {
  nombre_corto: string | null;
  orden: number;
  es_oficial: boolean;
  es_tropa: boolean;
  es_estado_mayor: boolean;
}

interface Estacion extends Catalogo {
  zona_id: number;
}

const ENDPOINTS = [
  { key: "jerarquias", label: "Jerarquías", path: "/catalogos/jerarquias" },
  { key: "cargos", label: "Cargos", path: "/catalogos/cargos" },
  { key: "condiciones", label: "Condiciones", path: "/catalogos/condiciones" },
  { key: "niveles", label: "Niveles educativos", path: "/catalogos/niveles-educativos" },
  { key: "especialidades", label: "Especialidades", path: "/catalogos/especialidades" },
  { key: "estados", label: "Estados civiles", path: "/catalogos/estados-civiles" },
  { key: "sangre", label: "Grupos sanguíneos", path: "/catalogos/grupos-sanguineos" },
  { key: "bancos", label: "Bancos", path: "/catalogos/bancos" },
  { key: "zonas", label: "Zonas", path: "/catalogos/zonas" },
  { key: "estaciones", label: "Estaciones", path: "/catalogos/estaciones" },
  { key: "divisiones", label: "Divisiones", path: "/catalogos/divisiones" },
  { key: "areas", label: "Áreas", path: "/catalogos/areas" },
  { key: "dependencias", label: "Dependencias", path: "/catalogos/dependencias" },
] as const;

export default async function CatalogosPage() {
  const token = await requireAuth();

  const results = await Promise.all(
    ENDPOINTS.map(async (e) => {
      try {
        const data = await api.get<Catalogo[]>(e.path, token);
        return { ...e, data, error: null as string | null };
      } catch (err: unknown) {
        return {
          ...e,
          data: [] as Catalogo[],
          error: err instanceof Error ? err.message : "Error",
        };
      }
    })
  );

  const total = results.reduce((acc, r) => acc + r.data.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catálogos del sistema</h1>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString("es-VE")} registros activos en {ENDPOINTS.length} catálogos
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => (
          <div key={r.key} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">{r.label}</h2>
                <p className="text-xs text-muted-foreground font-mono">{r.path}</p>
              </div>
              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                {r.data.length}
              </span>
            </div>

            {r.error ? (
              <div className="p-4 text-xs text-destructive">{r.error}</div>
            ) : r.data.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Sin registros
              </div>
            ) : (
              <ul className="max-h-80 overflow-auto divide-y text-sm">
                {r.data.slice(0, 50).map((item) => (
                  <li
                    key={item.id}
                    className="px-4 py-2 hover:bg-muted/30 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{item.nombre}</div>
                      {r.key === "jerarquias" && (item as Jerarquia).nombre_corto && (
                        <div className="text-xs text-muted-foreground">
                          {(item as Jerarquia).nombre_corto}
                          {(item as Jerarquia).es_oficial && " · Oficial"}
                          {(item as Jerarquia).es_tropa && " · Tropa"}
                          {(item as Jerarquia).es_estado_mayor && " · EM"}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {item.codigo}
                    </span>
                  </li>
                ))}
                {r.data.length > 50 && (
                  <li className="px-4 py-2 text-xs text-muted-foreground text-center">
                    + {r.data.length - 50} más…
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
