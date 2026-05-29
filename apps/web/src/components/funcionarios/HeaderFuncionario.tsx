"use client";

import Link from "next/link";
import { ArrowLeft, Pencil, Printer, User } from "lucide-react";
import { formatCedula, formatDate } from "@/lib/utils";

interface FuncionarioHeader {
  id: number;
  nacionalidad: string;
  cedula: number;
  apellidos: string;
  nombres: string;
  nombre_completo: string | null;
  estatus: string;
  jerarquia_nombre_corto: string | null;
  zona_nombre: string | null;
  estacion_nombre: string | null;
  numero_empleado: string | null;
  fecha_primer_ingreso: string | null;
  foto_url: string | null;
}

const ESTATUS_STYLE: Record<string, string> = {
  ACTIVO: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  REPOSO: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  COMISION: "bg-sky-900/40 text-sky-300 border-sky-700/50",
  PRE_JUBILADO: "bg-violet-900/40 text-violet-300 border-violet-700/50",
  JUBILADO: "bg-muted text-muted-foreground border-border",
  EGRESADO: "bg-muted/60 text-muted-foreground border-border",
  FALLECIDO: "bg-muted/80 text-foreground border-border",
  SUSPENDIDO: "bg-red-900/40 text-red-300 border-red-700/50",
};

export default function HeaderFuncionario({
  f,
  puedeEditar,
}: {
  f: FuncionarioHeader;
  puedeEditar: boolean;
}) {
  const nombre = f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`;
  const fotoSrc =
    f.foto_url && (f.foto_url.startsWith("/") || f.foto_url.startsWith("http"))
      ? f.foto_url
      : f.foto_url
        ? `/api/funcionarios/${f.id}/foto`
        : null;

  return (
    <header className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pt-2 pb-3 bg-background/95 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <Link
          href="/funcionarios"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Personal
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-border hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Imprimir
          </button>
          {puedeEditar && (
            <Link
              href={`/funcionarios/${f.id}/editar`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Editar
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-16 h-20 shrink-0 bg-muted border border-border rounded overflow-hidden flex items-center justify-center">
          {fotoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoSrc}
              alt={`Foto de ${nombre}`}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {f.jerarquia_nombre_corto && (
              <span className="inline-block px-1.5 py-0.5 bg-primary/15 text-primary-foreground/90 text-[11px] font-mono font-semibold rounded border border-primary/30">
                {f.jerarquia_nombre_corto}
              </span>
            )}
            <h1 className="text-lg md:text-xl font-bold text-foreground truncate">{nombre}</h1>
            <span
              className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded border ${
                ESTATUS_STYLE[f.estatus] ?? "bg-muted text-muted-foreground border-border"
              }`}
            >
              {f.estatus}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-x-4 gap-y-0.5 flex-wrap text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatCedula(f.nacionalidad, f.cedula)}
            </span>
            {f.estacion_nombre && (
              <span>
                <span className="text-foreground/60">·</span> {f.estacion_nombre}
              </span>
            )}
            {f.numero_empleado && (
              <span>
                <span className="text-foreground/60">·</span> N° {f.numero_empleado}
              </span>
            )}
            {f.fecha_primer_ingreso && (
              <span>
                <span className="text-foreground/60">·</span> Ingreso {formatDate(f.fecha_primer_ingreso)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
