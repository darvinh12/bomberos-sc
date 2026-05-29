"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Catalogo, CatalogoEstacion } from "@/lib/catalogos";
import { trasladar } from "./actions";
import {
  BaseFormProps,
  Field,
  ErrorBanner,
  FormActions,
  inputClass,
} from "./_form-shared";

interface Props extends BaseFormProps {
  zonas: Catalogo[];
  estaciones: CatalogoEstacion[];
  divisiones: Catalogo[];
  areas: Catalogo[];
}

export default function FormTrasladar({
  funcionarioId,
  onSuccess,
  onCancel,
  zonas,
  estaciones,
  divisiones,
  areas,
}: Props) {
  const router = useRouter();
  const [fechaDesde, setFechaDesde] = useState("");
  const [codZona, setCodZona] = useState("");
  const [codEstacion, setCodEstacion] = useState("");
  const [codDivision, setCodDivision] = useState("");
  const [codArea, setCodArea] = useState("");
  const [seccion, setSeccion] = useState("");
  const [horario, setHorario] = useState("");
  const [agrupacion, setAgrupacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const estacionesFiltradas = useMemo(() => {
    if (!codZona) return estaciones;
    const z = Number(codZona);
    return estaciones.filter((e) => e.zona_id === z);
  }, [estaciones, codZona]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fechaDesde) {
      setError("La fecha desde es obligatoria");
      return;
    }
    if (!codZona) {
      setError("Seleccione la zona");
      return;
    }
    if (!codEstacion) {
      setError("Seleccione la estación");
      return;
    }
    start(async () => {
      const r = await trasladar(funcionarioId, {
        fecha_desde: fechaDesde,
        cod_zona: codZona,
        cod_estacion: codEstacion,
        cod_division: codDivision,
        cod_area: codArea,
        seccion,
        horario,
        agrupacion,
      });
      if (r.ok) {
        onSuccess();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <ErrorBanner message={error} />

      <Field label="Fecha desde" required>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className={inputClass}
          required
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Zona" required>
          <select
            value={codZona}
            onChange={(e) => {
              setCodZona(e.target.value);
              setCodEstacion("");
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
        <Field label="Estación" required>
          <select
            value={codEstacion}
            onChange={(e) => setCodEstacion(e.target.value)}
            className={inputClass}
            required
            disabled={!codZona}
          >
            <option value="">{codZona ? "Seleccione…" : "Seleccione zona primero"}</option>
            {estacionesFiltradas.map((est) => (
              <option key={est.id} value={est.id}>
                {est.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="División">
          <select
            value={codDivision}
            onChange={(e) => setCodDivision(e.target.value)}
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
            value={codArea}
            onChange={(e) => setCodArea(e.target.value)}
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Sección">
          <input
            type="text"
            value={seccion}
            onChange={(e) => setSeccion(e.target.value)}
            className={inputClass}
            placeholder="Ej. A"
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
          />
        </Field>
      </div>

      <FormActions onCancel={onCancel} pending={pending} submitLabel="Registrar traslado" />
    </form>
  );
}
