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
  aValorBool,
  aValorForm,
  estadoSeccion,
  type FuncionarioFormData,
  type SeccionId,
} from "@/components/funcionarios/seccionesFuncionario";
import type { CatalogosFuncionario } from "@/lib/catalogos";
import type { CampoCustom } from "@/app/(app)/admin/campos-custom/actions";
import {
  actualizarFuncionario,
  type EditarFuncionarioPayload,
} from "./actions";

interface Props {
  funcionario: Record<string, unknown>;
  catalogos: CatalogosFuncionario;
  camposCustom: CampoCustom[];
  esAdmin: boolean;
  userRoles: string[];
}

function inicializarDesde(
  f: Record<string, unknown>,
): FuncionarioFormData {
  return {
    ...VALORES_INICIALES,
    // Identidad
    nacionalidad: aValorForm(f.nacionalidad) || "V",
    cedula: aValorForm(f.cedula),
    rif: aValorForm(f.rif),
    apellidos: aValorForm(f.apellidos),
    nombres: aValorForm(f.nombres),
    fecha_nacimiento: aValorForm(f.fecha_nacimiento),
    sexo: aValorForm(f.sexo),
    estado_civil_id: aValorForm(f.estado_civil_id),
    grupo_sanguineo_id: aValorForm(f.grupo_sanguineo_id),
    factor_sanguineo: aValorForm(f.factor_sanguineo),
    lugar_nacimiento: aValorForm(f.lugar_nacimiento),
    pais_nacimiento: aValorForm(f.pais_nacimiento),
    tipo_nacionalizacion: aValorForm(f.tipo_nacionalizacion),
    fecha_nacionalizacion: aValorForm(f.fecha_nacionalizacion),
    numero_gaceta_nacionalizacion: aValorForm(f.numero_gaceta_nacionalizacion),
    pais_origen: aValorForm(f.pais_origen),
    idiomas: aValorForm(f.idiomas),

    // Empleo
    tipo_personal: aValorForm(f.tipo_personal),
    numero_empleado: aValorForm(f.numero_empleado),
    numero_equipo: aValorForm(f.numero_equipo),
    fecha_primer_ingreso: aValorForm(f.fecha_primer_ingreso),
    promocion: aValorForm(f.promocion),
    estatus: aValorForm(f.estatus),
    condicion_id: aValorForm(f.condicion_id),
    jerarquia_id: aValorForm(f.jerarquia_id),
    cargo_id: aValorForm(f.cargo_id),
    pre_jubilado: aValorBool(f.pre_jubilado),
    es_voluntario: aValorBool(f.es_voluntario),
    institucion_formadora_id: aValorForm(f.institucion_formadora_id),
    licencia_conducir: aValorForm(f.licencia_conducir),
    fecha_egreso: aValorForm(f.fecha_egreso),
    fecha_reintegro: aValorForm(f.fecha_reintegro),
    fecha_este: aValorForm(f.fecha_este),
    fecha_ingreso_gdf: aValorForm(f.fecha_ingreso_gdf),
    iutb: aValorBool(f.iutb),
    egresado_unes: aValorBool(f.egresado_unes),

    // Ubicación
    zona_id: aValorForm(f.zona_id),
    estacion_id: aValorForm(f.estacion_id),
    area_id: aValorForm(f.area_id),
    dependencia_id: aValorForm(f.dependencia_id),
    division_id: aValorForm(f.division_id),
    seccion: aValorForm(f.seccion),
    horario: aValorForm(f.horario),

    // Contacto
    telefono_habitacion: aValorForm(f.telefono_habitacion),
    telefono_movil: aValorForm(f.telefono_movil),
    telefono_otros: aValorForm(f.telefono_otros),
    correo: aValorForm(f.correo),
    persona_contacto: aValorForm(f.persona_contacto),
    telefono_contacto: aValorForm(f.telefono_contacto),
    parentesco_contacto: aValorForm(f.parentesco_contacto),

    // Domicilio: ya no vive en personal.funcionarios — se gestiona aparte
    // vía /funcionarios/{id}/direcciones (tabla personal.direcciones, 1:N).

    // Educación
    nivel_educativo_id: aValorForm(f.nivel_educativo_id),
    profesion: aValorForm(f.profesion),
    especialidad_id: aValorForm(f.especialidad_id),

    // Observaciones
    observaciones: aValorForm(f.observaciones),
  };
}

export default function EditarForm({
  funcionario,
  catalogos,
  camposCustom,
  esAdmin,
  userRoles,
}: Props) {
  const router = useRouter();
  const id = Number(funcionario.id);
  const merito =
    typeof funcionario.merito === "number" ? (funcionario.merito as number) : null;
  const fotoUrlRemota = aValorForm(funcionario.foto_url) || null;

  const inicial = useMemo(() => inicializarDesde(funcionario), [funcionario]);
  const [data, setData] = useState<FuncionarioFormData>(inicial);
  const metaInicial = (funcionario.metadata as Record<string, unknown> | undefined) ?? {};
  const [metadata, setMetadata] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of camposCustom) {
      const v = metaInicial[c.codigo];
      m[c.codigo] = v === null || v === undefined ? "" : String(v);
    }
    return m;
  });

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
        estado: estadoSeccion(s.id, data, false),
      })),
    [data],
  );

  function validar(): boolean {
    const errs: Partial<Record<keyof FuncionarioFormData, string>> = {};
    if (!data.apellidos.trim()) errs.apellidos = "Obligatorio";
    else if (data.apellidos.trim().length < 2)
      errs.apellidos = "Mínimo 2 caracteres";
    if (!data.nombres.trim()) errs.nombres = "Obligatorio";
    else if (data.nombres.trim().length < 2)
      errs.nombres = "Mínimo 2 caracteres";
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
      if (errores.apellidos || errores.nombres) setSeccion("identidad");
      else if (errores.correo) setSeccion("contacto");
      return;
    }

    startTransition(async () => {
      const fotoFd = foto ? new FormData() : null;
      if (foto && fotoFd) fotoFd.append("file", foto, foto.name);

      const meta: Record<string, unknown> = {};
      for (const c of camposCustom) {
        const v = metadata[c.codigo]?.trim() ?? "";
        if (v) meta[c.codigo] = v;
      }

      const payload: EditarFuncionarioPayload = {
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
        estatus: data.estatus,
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

        // Domicilio: se gestiona aparte vía /funcionarios/{id}/direcciones.

        // Educación
        nivel_educativo_id: data.nivel_educativo_id,
        profesion: data.profesion,
        especialidad_id: data.especialidad_id,

        // Observaciones
        observaciones: data.observaciones,
        metadata: Object.keys(meta).length > 0 ? meta : undefined,
      };

      const result = await actualizarFuncionario(id, payload, fotoFd);

      if (!result.ok) {
        setErrorGlobal(result.error);
        return;
      }
      router.push(`/funcionarios/${id}`);
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
          esAlta={false}
          fotoUrlRemota={fotoUrlRemota}
          funcionarioId={id}
          onFotoChange={setFoto}
          merito={merito}
          userRoles={userRoles}
        />

        {/* Campos personalizados — solo en la sección de observaciones */}
        {seccion === "observaciones" && camposCustom.length > 0 && (
          <fieldset className="rounded-xl border border-border bg-card p-6">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Campos personalizados
            </legend>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {camposCustom.map((c) => (
                <CampoCustomInput
                  key={c.id}
                  campo={c}
                  valor={metadata[c.codigo] ?? ""}
                  onChange={(v) =>
                    setMetadata((prev) => ({ ...prev, [c.codigo]: v }))
                  }
                />
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
          <Link
            href={`/funcionarios/${id}`}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cancelar
          </Link>
          <div className="flex items-center gap-3">
            {esAdmin && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Modo administrador
              </span>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function CampoCustomInput({
  campo,
  valor,
  onChange,
}: {
  campo: CampoCustom;
  valor: string;
  onChange: (v: string) => void;
}) {
  const id = `meta_${campo.codigo}`;
  const common = {
    id,
    value: valor,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
    className: "input",
    required: campo.requerido,
  };

  let control: React.ReactNode;
  switch (campo.tipo) {
    case "texto_largo":
      control = <textarea {...common} rows={2} />;
      break;
    case "numero":
      control = <input {...common} type="number" />;
      break;
    case "fecha":
      control = <input {...common} type="date" />;
      break;
    case "booleano":
      control = (
        <select {...common}>
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
      break;
    case "seleccion":
      control = (
        <select {...common}>
          <option value="">—</option>
          {(campo.opciones ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    default:
      control = <input {...common} type="text" />;
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1">
        {campo.etiqueta}
        {campo.requerido && <span className="text-destructive ml-1">*</span>}
      </label>
      {control}
      {campo.ayuda && (
        <p className="mt-1 text-[10px] text-muted-foreground">{campo.ayuda}</p>
      )}
    </div>
  );
}
