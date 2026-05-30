import Link from "next/link";
import { Wrench } from "lucide-react";

const ENDPOINTS_API: Record<string, string> = {
  vacaciones: "PATCH /ops/vacaciones/{id}",
  permisos: "POST /ops/permisos/{id}/autorizar  (autorizar)",
  comisiones: "PATCH /ops/comisiones/{id}",
  faltas: "PATCH /ops/faltas/{id}",
  guardias: "POST /ops/guardias/{id}/cerrar",
  jubilados: "PATCH /egresos/jubilados/{id}",
  ascensos: "POST /carrera/ascensos",
  cursos: "POST /carrera/cursos-realizados",
  reconocimientos: "POST /carrera/reconocimientos",
  proteccion: "POST /equipo/proteccion/asignaciones/{id}/devolver",
  radios: "POST /equipo/radios/asignaciones",
};

export default function EditarPendientePage({
  params,
  searchParams,
}: {
  params: { entidad: string };
  searchParams: { id?: string; desde?: string };
}) {
  const id = searchParams.id;
  const back = searchParams.desde ?? `/${params.entidad}`;
  const apiHint = ENDPOINTS_API[params.entidad];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href={back} className="text-xs text-muted-foreground hover:underline">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold mt-1">
          Editar {params.entidad} {id && `#${id}`}
        </h1>
      </div>

      <div className="rounded border border-amber-300 bg-amber-50 dark:border-amber-700/50 dark:bg-amber-900/20 p-6 space-y-4">
        <div className="flex gap-3 items-start">
          <Wrench className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-amber-900 dark:text-amber-200">
              Formulario de edición disponible próximamente
            </h2>
            <p className="text-sm text-amber-800/90 dark:text-amber-100/80 mt-1">
              Esta entidad ya se puede modificar vía API. La pantalla de edición
              completa con campos personalizados llega en la siguiente iteración.
            </p>
          </div>
        </div>

        {apiHint && (
          <div className="text-sm bg-card rounded p-3 border border-border">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Mientras tanto, endpoint API
            </div>
            <code className="font-mono text-xs text-foreground">{apiHint}</code>
          </div>
        )}

        <div className="text-xs text-amber-800/90 dark:text-amber-100/80 space-y-1">
          <p>
            <strong className="text-amber-900 dark:text-amber-200">Sí puedes editar ya:</strong> Funcionarios, Reposos, Beneficios
            (ayudas económicas) y los Roles de cada usuario.
          </p>
          <p>
            <strong className="text-amber-900 dark:text-amber-200">Admin:</strong> agrega campos personalizados desde{" "}
            <Link href="/admin/campos-custom" className="underline font-medium hover:text-amber-950 dark:hover:text-amber-50">
              /admin/campos-custom
            </Link>{" "}
            — aparecerán automáticamente al editar funcionarios o reposos.
          </p>
        </div>
      </div>
    </div>
  );
}
