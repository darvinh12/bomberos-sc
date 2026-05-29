"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Catalogo, CatalogoEstacion } from "@/lib/catalogos";
import { crearHistUbicacion } from "./actions";

interface Props {
  funcionarioId: number;
  zonas: Catalogo[];
  estaciones: CatalogoEstacion[];
  divisiones: Catalogo[];
  areas: Catalogo[];
}

export default function NuevoHistUbicacionForm({
  funcionarioId,
  zonas,
  estaciones,
  divisiones,
  areas,
}: Props) {
  const router = useRouter();
  const [fechaDesde, setFechaDesde] = useState("");
  const [zonaSel, setZonaSel] = useState(""); // guarda zona.id como string
  const [estacionSel, setEstacionSel] = useState("");
  const [divisionSel, setDivisionSel] = useState("");
  const [areaSel, setAreaSel] = useState("");
  const [seccion, setSeccion] = useState("");
  const [horario, setHorario] = useState("");
  const [agrupacion, setAgrupacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const zonaIdNum = useMemo(() => Number(zonaSel) || null, [zonaSel]);
  const estacionesFiltradas = useMemo(
    () =>
      zonaIdNum
        ? estaciones.filter((e) => e.zona_id === zonaIdNum)
        : estaciones,
    [estaciones, zonaIdNum],
  );

  const codigoZona = useMemo(() => {
    const z = zonas.find((z) => z.id === zonaIdNum);
    return z?.codigo ?? "";
  }, [zonas, zonaIdNum]);

  const codigoEstacion = useMemo(() => {
    const e = estaciones.find((e) => String(e.id) === estacionSel);
    return e?.codigo ?? "";
  }, [estaciones, estacionSel]);

  const codigoDivision = useMemo(() => {
    const d = divisiones.find((d) => String(d.id) === divisionSel);
    return d?.codigo ?? "";
  }, [divisiones, divisionSel]);

  const codigoArea = useMemo(() => {
    const a = areas.find((a) => String(a.id) === areaSel);
    return a?.codigo ?? "";
  }, [areas, areaSel]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fechaDesde) {
      setError("La fecha es obligatoria");
      return;
    }
    if (!codigoZona) {
      setError("Seleccione una zona");
      return;
    }
    if (seccion && !/^[A-Z]$/.test(seccion.toUpperCase())) {
      setError("La sección debe ser una sola letra A-Z");
      return;
    }
    startTransition(async () => {
      const r = await crearHistUbicacion(funcionarioId, {
        fecha_desde: fechaDesde,
        cod_zona: codigoZona,
        cod_estacion: codigoEstacion,
        cod_division: codigoDivision,
        cod_area: codigoArea,
        seccion,
        horario,
        agrupacion,
      });
      if (r.ok) {
        router.push(`/funcionarios/${funcionarioId}`);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-card p-6 space-y-4"
      noValidate
    >
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Fecha desde" required>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className={inputClass}
            required
          />
        </Field>

        <Field label="Zona" required>
          <select
            value={zonaSel}
            onChange={(e) => {
              setZonaSel(e.target.value);
              setEstacionSel("");
            }}
            className={inputClass}
            required
          >
            <option value="">Seleccione…</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Estación">
          <select
            value={estacionSel}
            onChange={(e) => setEstacionSel(e.target.value)}
            className={inputClass}
            disabled={!zonaSel}
          >
            <option value="">—</option>
            {estacionesFiltradas.map((es) => (
              <option key={es.id} value={es.id}>
                {es.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="División">
          <select
            value={divisionSel}
            onChange={(e) => setDivisionSel(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {divisiones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Área">
          <select
            value={areaSel}
            onChange={(e) => setAreaSel(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sección (1 letra)">
          <input
            type="text"
            value={seccion}
            onChange={(e) =>
              setSeccion(e.target.value.toUpperCase().slice(0, 1))
            }
            maxLength={1}
            pattern="[A-Z]"
            className={inputClass}
            placeholder="A"
          />
        </Field>

        <Field label="Horario">
          <input
            type="text"
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
            className={inputClass}
            placeholder="Ej. 24x48"
          />
        </Field>

        <Field label="Agrupación">
          <input
            type="text"
            value={agrupacion}
            onChange={(e) => setAgrupacion(e.target.value)}
            className={inputClass}
            placeholder="Ej. Operativa"
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <Link
          href={`/funcionarios/${funcionarioId}`}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {pending ? "Guardando…" : "Crear registro"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
