import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import WizardCarga from "@/components/cargar-datos/WizardCarga";

interface Me {
  usuario: string;
  nombre_completo?: string;
  roles: string[];
}

interface DashboardCounts {
  personal_activo: number;
  personal_jubilado: number;
  personal_reposo: number;
  personal_comision: number;
  personal_pre_jubilado: number;
  personal_fallecido: number;
}

export const metadata = {
  title: "Puesta en marcha · Cargar datos",
};

export default async function CargarDatosPage() {
  const token = await requireAuth();

  let me: Me = { usuario: "", roles: [] };
  let counts: DashboardCounts | null = null;
  try {
    [me, counts] = await Promise.all([
      api.get<Me>("/auth/me", token).catch(() => ({ usuario: "", roles: [] } as Me)),
      api.get<DashboardCounts>("/dashboard", token).catch(() => null),
    ]);
  } catch {
    /* best-effort */
  }

  const roles = me.roles ?? [];
  const autorizado = hasAnyRole(roles, ["ADMIN", "RRHH"] as never[]);

  if (!autorizado) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          El asistente de puesta en marcha está disponible para los roles
          Administrador y RRHH. Contacta a tu administrador si necesitas cargar
          datos.
        </p>
      </div>
    );
  }

  const personalCargado = counts
    ? counts.personal_activo +
      counts.personal_jubilado +
      counts.personal_reposo +
      counts.personal_comision +
      counts.personal_pre_jubilado +
      counts.personal_fallecido
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Puesta en marcha del sistema</h1>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          Este asistente te guía para cargar la data real del cuerpo de bomberos
          en el orden correcto. Sigue las fases de arriba hacia abajo: cada una
          se apoya en la anterior, así ningún formulario falla por falta de un
          dato previo. Tu avance se guarda automáticamente en este dispositivo.
        </p>
      </div>

      <WizardCarga usuario={me.usuario} personalCargado={personalCargado} />
    </div>
  );
}
