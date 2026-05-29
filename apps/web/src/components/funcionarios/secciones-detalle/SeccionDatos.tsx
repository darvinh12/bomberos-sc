"use client";

import { SectionShell, Card, Field } from "./_shared";
import { formatCedula, formatDate } from "@/lib/utils";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funcionario: any;
}

export default function SeccionDatos({ funcionario: f }: Props) {
  const sexoLabel =
    f.sexo === "M" ? "Masculino" : f.sexo === "F" ? "Femenino" : f.sexo ?? null;

  return (
    <SectionShell
      title="Datos personales"
      description="Información completa registrada del funcionario."
    >
      <Card title="Identidad">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Cédula" value={formatCedula(f.nacionalidad, f.cedula)} mono />
          <Field label="RIF" value={f.rif} mono />
          <Field label="Apellidos" value={f.apellidos} />
          <Field label="Nombres" value={f.nombres} />
          <Field label="Fecha de nacimiento" value={formatDate(f.fecha_nacimiento)} />
          <Field label="Sexo" value={sexoLabel} />
          <Field label="Estado civil" value={f.estado_civil_nombre} />
          <Field label="Grupo sanguíneo" value={f.grupo_sanguineo_nombre} />
          <Field label="Factor RH" value={f.factor_sanguineo} />
          <Field label="Lugar de nacimiento" value={f.lugar_nacimiento} />
          <Field label="País de nacimiento" value={f.pais_nacimiento} />
        </div>
      </Card>

      {(f.tipo_nacionalizacion ||
        f.fecha_nacionalizacion ||
        f.numero_gaceta_nacionalizacion ||
        f.pais_origen ||
        f.idiomas) && (
        <Card title="Nacionalización">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Tipo" value={f.tipo_nacionalizacion} />
            <Field label="Fecha" value={formatDate(f.fecha_nacionalizacion)} />
            <Field label="N° Gaceta" value={f.numero_gaceta_nacionalizacion} mono />
            <Field label="País de origen" value={f.pais_origen} />
            <Field label="Idiomas" value={f.idiomas} />
          </div>
        </Card>
      )}

      <Card title="Empleo institucional">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Tipo de personal" value={f.tipo_personal} />
          <Field label="Estatus" value={f.estatus} />
          <Field label="N° empleado" value={f.numero_empleado} mono />
          <Field label="N° equipo" value={f.numero_equipo} mono />
          <Field label="Jerarquía" value={f.jerarquia_nombre} />
          <Field label="Cargo" value={f.cargo_nombre} />
          <Field label="Condición" value={f.condicion_nombre} />
          <Field label="Promoción" value={f.promocion} />
          <Field label="Institución formadora" value={f.institucion_formadora_nombre} />
          <Field label="Licencia de conducir" value={f.licencia_conducir} />
          <Field label="Mérito" value={f.merito} />
          <Field label="Pre-jubilado" value={f.pre_jubilado ? "Sí" : "No"} />
          <Field label="Voluntario" value={f.es_voluntario ? "Sí" : "No"} />
        </div>
      </Card>

      <Card title="Fechas históricas">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Primer ingreso" value={formatDate(f.fecha_primer_ingreso)} />
          <Field label="Fecha ESTE" value={formatDate(f.fecha_este)} />
          <Field label="Fecha ingreso GDF" value={formatDate(f.fecha_ingreso_gdf)} />
          <Field label="Fecha egreso" value={formatDate(f.fecha_egreso)} />
          <Field label="Fecha reintegro" value={formatDate(f.fecha_reintegro)} />
        </div>
      </Card>

      <Card title="Ubicación administrativa">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Zona" value={f.zona_nombre} />
          <Field label="Estación" value={f.estacion_nombre} />
          <Field label="Sección" value={f.seccion} />
          <Field label="Horario" value={f.horario} />
        </div>
      </Card>

      <Card title="Contacto">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Teléfono habitación" value={f.telefono_habitacion} />
          <Field label="Teléfono móvil" value={f.telefono_movil} />
          <Field label="Teléfono otros" value={f.telefono_otros} />
          <Field label="Correo electrónico" value={f.correo} />
          <Field label="Persona contacto" value={f.persona_contacto} />
          <Field label="Teléfono contacto" value={f.telefono_contacto} />
          <Field label="Parentesco contacto" value={f.parentesco_contacto} />
        </div>
      </Card>

      <Card title="Educación">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Nivel educativo" value={f.nivel_educativo_nombre} />
          <Field label="Profesión" value={f.profesion} />
          <Field label="Especialidad" value={f.especialidad_nombre} />
        </div>
      </Card>

      {f.observaciones && (
        <Card title="Observaciones">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {f.observaciones}
          </p>
        </Card>
      )}
    </SectionShell>
  );
}
