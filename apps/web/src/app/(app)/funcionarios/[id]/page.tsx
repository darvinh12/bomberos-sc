import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { formatCedula, formatDate } from "@/lib/utils";

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
              {f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatCedula(f.nacionalidad, f.cedula)} · {f.tipo_personal} · {f.estatus}
            </p>
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
    </div>
  );
}
