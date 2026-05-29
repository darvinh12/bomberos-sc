"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import SeccionNav, {
  type Seccion as SeccionNavItem,
} from "@/components/funcionarios/SeccionNav";
import SeccionesFormFuncionario from "@/components/funcionarios/SeccionesFormFuncionario";
import {
  SECCIONES,
  VALORES_INICIALES,
  estadoSeccion,
  type FuncionarioFormData,
  type SeccionId,
} from "@/components/funcionarios/seccionesFuncionario";
import type { CatalogosFuncionario } from "@/lib/catalogos";
import { crearFuncionario } from "./actions";

interface Props {
  catalogos: CatalogosFuncionario;
  userRoles: string[];
}

export default function NuevoForm({ catalogos, userRoles }: Props) {
  const router = useRouter();
  const [data, setData] = useState<FuncionarioFormData>(VALORES_INICIALES);
  const [seccion, setSeccion] = useState<SeccionId>("identidad");
  const [foto, setFoto] = useState<File | null>(null);
  const [errores, setErrores] = useState<
    Partial<Record<keyof FuncionarioFormData, string>>
  >({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField<K extends keyof FuncionarioFormData>(
    key: K,
    value: FuncionarioFormData[K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
    if (errores[key]) {
      setErrores((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  const seccionesConEstado: SeccionNavItem[] = useMemo(
    () =>
      SECCIONES.map((s) => ({
        ...s,
        estado: estadoSeccion(s.id, data, true),
      })),
    [data],
  );

  function validar(): boolean {
    const errs: Partial<Record<keyof FuncionarioFormData, string>> = {};
    if (!data.cedula.trim()) errs.cedula = "Obligatorio";
    else if (!Number.isFinite(Number(data.cedula)))
      errs.cedula = "Debe ser un número";
    if (!data.apellidos.trim()) errs.apellidos = "Obligatorio";
    else if (data.apellidos.trim().length < 2)
      errs.apellidos = "Mínimo 2 caracteres";
    if (!data.nombres.trim()) errs.nombres = "Obligatorio";
    else if (data.nombres.trim().length < 2)
      errs.nombres = "Mínimo 2 caracteres";
    if (!data.fecha_primer_ingreso)
      errs.fecha_primer_ingreso = "Obligatorio";
    if (
      data.correo &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)
    )
      errs.correo = "Correo inválido";

    setErrores(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorGlobal(null);

    if (!validar()) {
      // Saltar a la primera sección con error
      if (errores.cedula || errores.apellidos || errores.nombres) {
        setSeccion("identidad");
      } else if (errores.fecha_primer_ingreso) {
        setSeccion("empleo");
      } else if (errores.correo) {
        setSeccion("contacto");
      }
      return;
    }

    startTransition(async () => {
      const fotoFd = foto ? new FormData() : null;
      if (foto && fotoFd) fotoFd.append("file", foto, foto.name);

      const result = await crearFuncionario(
        {
          // Identidad
          nacionalidad: data.nacionalidad,
          cedula: data.cedula,
          rif: data.rif,
          apellidos: data.apellidos,
          nombres: data.nombres,
          fecha_nacimiento: data.fecha_nacimiento,
          sexo: data.sexo,
          estado_civil_id: data.estado_civil_id,
          grupo_sanguineo_id: data.grupo_sanguineo_id,
          factor_sanguineo: data.factor_sanguineo,
          lugar_nacimiento: data.lugar_nacimiento,
          pais_nacimiento: data.pais_nacimiento,
          tipo_nacionalizacion: data.tipo_nacionalizacion,
          fecha_nacionalizacion: data.fecha_nacionalizacion,
          numero_gaceta_nacionalizacion: data.numero_gaceta_nacionalizacion,
          pais_origen: data.pais_origen,
          idiomas: data.idiomas,
          // Empleo
          tipo_personal: data.tipo_personal,
          numero_empleado: data.numero_empleado,
          numero_equipo: data.numero_equipo,
          fecha_primer_ingreso: data.fecha_primer_ingreso,
          promocion: data.promocion,
          condicion_id: data.condicion_id,
          jerarquia_id: data.jerarquia_id,
          cargo_id: data.cargo_id,
          pre_jubilado: data.estatus === "PRE_JUBILADO" || data.estatus === "Pre-jubilado",
          es_voluntario: data.es_voluntario,
          institucion_formadora_id: data.institucion_formadora_id,
          licencia_conducir: data.licencia_conducir,
          fecha_egreso: data.fecha_egreso,
          fecha_reintegro: data.fecha_reintegro,
          fecha_este: data.fecha_este,
          fecha_ingreso_gdf: data.fecha_ingreso_gdf,
          // Ubicación
          zona_id: data.zona_id,
          estacion_id: data.estacion_id,
          area_id: data.area_id,
          dependencia_id: data.dependencia_id,
          division_id: data.division_id,
          seccion: data.seccion,
          horario: data.horario,
          // Contacto
          telefono_habitacion: data.telefono_habitacion,
          telefono_movil: data.telefono_movil,
          telefono_otros: data.telefono_otros,
          correo: data.correo,
          persona_contacto: data.persona_contacto,
          telefono_contacto: data.telefono_contacto,
          parentesco_contacto: data.parentesco_contacto,
          // Domicilio: no se incluye aquí — se gestiona aparte vía
          // /funcionarios/{id}/direcciones tras crear el funcionario.
          // Educación
          nivel_educativo_id: data.nivel_educativo_id,
          profesion: data.profesion,
          especialidad_id: data.especialidad_id,
          // Observaciones
          observaciones: data.observaciones,
        },
        fotoFd,
      );

      if (!result.ok) {
        setErrorGlobal(result.error);
        return;
      }
      router.push(`/funcionarios/${result.id}`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6"
      noValidate
    >
      <aside className="md:sticky md:top-4 md:self-start">
        <SeccionNav
          secciones={seccionesConEstado}
          activa={seccion}
          onChange={(id) => setSeccion(id as SeccionId)}
          modo="form"
        />
      </aside>

      <div className="space-y-4 min-w-0">
        {errorGlobal && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
          >
            {errorGlobal}
          </div>
        )}

        <SeccionesFormFuncionario
          seccion={seccion}
          data={data}
          setField={setField}
          errores={errores}
          catalogos={catalogos}
          esAlta={true}
          fotoUrlRemota={null}
          onFotoChange={setFoto}
          userRoles={userRoles}
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link
            href="/funcionarios"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isPending ? "Guardando…" : "Crear funcionario"}
          </button>
        </div>
      </div>
    </form>
  );
}
