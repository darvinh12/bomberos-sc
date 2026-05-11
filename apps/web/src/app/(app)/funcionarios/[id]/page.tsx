import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { formatCedula, formatDate } from "@/lib/utils";
import PanelAcciones from "./acciones/panel";

interface FuncionarioDetail {
  id: number;
  nacionalidad: string;
  cedula: number;
  apellidos: string;
  nombres: string;
  nombre_completo: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  estado_civil_id: number | null;
  grupo_sanguineo_id: number | null;
  tipo_personal: string;
  numero_empleado: string | null;
  numero_equipo: string | null;
  fecha_primer_ingreso: string | null;
  estatus: string;
  jerarquia_id: number | null;
  cargo_id: number | null;
  zona_id: number | null;
  estacion_id: number | null;
  telefono_movil: string | null;
  correo: string | null;
  persona_contacto: string | null;
  telefono_contacto: string | null;
  profesion: string | null;
  iutb: boolean;
  egresado_unes: boolean;
  pre_jubilado: boolean;
  foto_url: string | null;
  observaciones: string | null;
  seccion: string | null;
  horario: string | null;
  jerarquia_nombre: string | null;
  jerarquia_nombre_corto: string | null;
  cargo_nombre: string | null;
  condicion_nombre: string | null;
  zona_nombre: string | null;
  estacion_nombre: string | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value || "—"}</div>
    </div>
  );
}

export default async function FuncionarioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  let f: FuncionarioDetail;
  try {
    f = await api.get<FuncionarioDetail>(`/funcionarios/${params.id}`, token);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar = me.roles.includes("ADMIN") || me.roles.includes("RRHH");
  const puedeAcciones = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-3xl">
            {f.foto_url ? (
              <img src={f.foto_url} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              "👤"
            )}
          </div>
          <div>
            <Link
              href="/funcionarios"
              className="text-xs text-muted-foreground hover:underline"
            >
              ← Personal
            </Link>
            <h1 className="text-2xl font-bold mt-1">
              {f.jerarquia_nombre_corto && (
                <span className="inline-block mr-2 px-2 py-0.5 rounded bg-primary/10 text-primary text-sm font-mono align-middle">
                  {f.jerarquia_nombre_corto}
                </span>
              )}
              {f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatCedula(f.nacionalidad, f.cedula)} · {f.tipo_personal} · {f.estatus}
            </p>
            {(f.jerarquia_nombre || f.cargo_nombre) && (
              <p className="text-sm mt-1">
                {f.jerarquia_nombre && (
                  <span>
                    <span className="text-muted-foreground">Rango:</span>{" "}
                    <span className="font-medium">{f.jerarquia_nombre}</span>
                  </span>
                )}
                {f.jerarquia_nombre && f.cargo_nombre && (
                  <span className="text-muted-foreground mx-2">·</span>
                )}
                {f.cargo_nombre && (
                  <span>
                    <span className="text-muted-foreground">Cargo:</span>{" "}
                    <span className="font-medium">{f.cargo_nombre}</span>
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {puedeEditar && (
          <Link
            href={`/funcionarios/${f.id}/editar`}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            ✎ Editar
          </Link>
        )}
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold mb-4">Rango y ubicación</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Rango (jerarquía)" value={f.jerarquia_nombre} />
          <Field label="Cargo" value={f.cargo_nombre} />
          <Field label="Condición" value={f.condicion_nombre} />
          <Field label="Tipo personal" value={f.tipo_personal} />
          <Field label="Zona" value={f.zona_nombre} />
          <Field label="Estación" value={f.estacion_nombre} />
          <Field label="Sección" value={f.seccion ?? null} />
          <Field label="Horario" value={f.horario ?? null} />
        </div>
      </section>

      <div className="grid md:grid-cols-3 gap-6">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Identidad</h2>
          <div className="space-y-3">
            <Field label="Cédula" value={formatCedula(f.nacionalidad, f.cedula)} />
            <Field label="Fecha nacimiento" value={formatDate(f.fecha_nacimiento)} />
            <Field label="Sexo" value={f.sexo === "M" ? "Masculino" : f.sexo === "F" ? "Femenino" : null} />
            <Field label="Profesión" value={f.profesion} />
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Empleo</h2>
          <div className="space-y-3">
            <Field label="N° empleado" value={f.numero_empleado} />
            <Field label="N° equipo" value={f.numero_equipo} />
            <Field label="Fecha 1er ingreso" value={formatDate(f.fecha_primer_ingreso)} />
            <Field label="Pre-jubilado" value={f.pre_jubilado ? "Sí" : "No"} />
            <Field label="Egresado UNES" value={f.egresado_unes ? "Sí" : "No"} />
            <Field label="IUTB" value={f.iutb ? "Sí" : "No"} />
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Contacto</h2>
          <div className="space-y-3">
            <Field label="Teléfono móvil" value={f.telefono_movil} />
            <Field label="Correo" value={f.correo} />
            <Field label="Persona de contacto" value={f.persona_contacto} />
            <Field label="Tel. contacto" value={f.telefono_contacto} />
          </div>
        </section>
      </div>

      {f.observaciones && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Observaciones</h2>
          <p className="text-sm whitespace-pre-wrap">{f.observaciones}</p>
        </section>
      )}

      {puedeAcciones && <PanelAcciones funcionarioId={f.id} estatus={f.estatus} />}
    </div>
  );
}
