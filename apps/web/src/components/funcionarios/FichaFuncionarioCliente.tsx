"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  IdCard,
  Award,
  ShieldCheck,
  HeartPulse,
  HardHat,
  HandCoins,
  Users,
  Sparkles,
  FileText,
  History,
} from "lucide-react";
import SeccionNav, { type Seccion } from "./SeccionNav";
import HeaderFuncionario from "./HeaderFuncionario";
import PanelAcciones, { type CatalogosAcciones } from "./PanelAcciones";

import SeccionResumen from "./secciones-detalle/SeccionResumen";
import SeccionDatos from "./secciones-detalle/SeccionDatos";
import SeccionCarrera from "./secciones-detalle/SeccionCarrera";
import SeccionOperativo from "./secciones-detalle/SeccionOperativo";
import SeccionSalud from "./secciones-detalle/SeccionSalud";
import SeccionEquipos from "./secciones-detalle/SeccionEquipos";
import SeccionBeneficios from "./secciones-detalle/SeccionBeneficios";
import SeccionFamilia from "./secciones-detalle/SeccionFamilia";
import SeccionHabilidades from "./secciones-detalle/SeccionHabilidades";
import SeccionDocumentos from "./secciones-detalle/SeccionDocumentos";
import SeccionAuditoria from "./secciones-detalle/SeccionAuditoria";
import {
  accesoSeccion,
  puedeVerSeccion,
  type NivelAcceso,
  type SeccionFuncionario,
} from "@/lib/permisos-funcionario";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funcionario: any;
  userRoles: string[];
  puedeEditar: boolean;
  catalogosAcciones: CatalogosAcciones;
}

interface SeccionConPermiso extends Seccion {
  permisoId: SeccionFuncionario;
}

const SECCIONES: SeccionConPermiso[] = [
  { id: "resumen", permisoId: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "datos", permisoId: "datos", label: "Datos personales", icon: IdCard },
  { id: "carrera", permisoId: "carrera", label: "Carrera", icon: Award },
  { id: "operativo", permisoId: "operativo", label: "Operativo", icon: ShieldCheck },
  { id: "salud", permisoId: "salud", label: "Salud", icon: HeartPulse },
  { id: "equipos", permisoId: "equipos", label: "Equipos", icon: HardHat },
  { id: "beneficios", permisoId: "beneficios", label: "Beneficios", icon: HandCoins },
  { id: "familia", permisoId: "familia", label: "Familia", icon: Users },
  { id: "habilidades", permisoId: "habilidades", label: "Habilidades", icon: Sparkles },
  { id: "documentos", permisoId: "documentos", label: "Documentos", icon: FileText },
  { id: "auditoria", permisoId: "auditoria", label: "Auditoría", icon: History },
];

export default function FichaFuncionarioCliente({
  funcionario,
  userRoles,
  puedeEditar,
  catalogosAcciones,
}: Props) {
  const seccionesDisponibles = useMemo(
    () => SECCIONES.filter((s) => puedeVerSeccion(s.permisoId, userRoles)),
    [userRoles],
  );

  const primeraDisponible = seccionesDisponibles[0]?.id ?? "";
  const [activa, setActiva] = useState<string>(primeraDisponible);

  // Si el rol cambia o la sección activa deja de estar disponible (ej. URL hash
  // que apunta a "auditoria" para un usuario LOGISTICA), saltar a la primera.
  useEffect(() => {
    if (seccionesDisponibles.length === 0) return;
    if (!seccionesDisponibles.some((s) => s.id === activa)) {
      setActiva(primeraDisponible);
    }
  }, [seccionesDisponibles, activa, primeraDisponible]);

  const niveles = useMemo<Record<string, NivelAcceso>>(() => {
    const out: Record<string, NivelAcceso> = {};
    for (const s of SECCIONES) {
      out[s.id] = accesoSeccion(s.permisoId, userRoles);
    }
    return out;
  }, [userRoles]);

  if (seccionesDisponibles.length === 0) {
    return (
      <div className="space-y-4">
        <HeaderFuncionario f={funcionario} puedeEditar={puedeEditar} />
        <div
          role="alert"
          className="rounded-md bg-muted/40 border border-border p-6 text-center text-sm text-muted-foreground"
        >
          No tienes acceso a ninguna sección de esta ficha con tu rol actual.
        </div>
      </div>
    );
  }

  const seccionesParaNav: Seccion[] = seccionesDisponibles.map((s) => ({
    id: s.id,
    label: s.label,
    icon: s.icon,
  }));

  return (
    <div className="space-y-4">
      <HeaderFuncionario f={funcionario} puedeEditar={puedeEditar} />

      <PanelAcciones
        funcionarioId={funcionario.id}
        estatus={funcionario.estatus}
        userRoles={userRoles}
        catalogos={catalogosAcciones}
      />

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 md:gap-6">
        <aside className="md:sticky md:top-32 self-start">
          <SeccionNav
            secciones={seccionesParaNav}
            activa={activa}
            onChange={setActiva}
            modo="lectura"
          />
        </aside>

        <main className="min-w-0">
          {puedeVerSeccion("resumen", userRoles) && (
            <Panel id="resumen" activa={activa}>
              <SeccionResumen
                funcionario={funcionario}
                userRoles={userRoles}
                nivelAcceso={niveles.resumen}
              />
            </Panel>
          )}
          {puedeVerSeccion("datos", userRoles) && (
            <Panel id="datos" activa={activa}>
              <SeccionDatos funcionario={funcionario} nivelAcceso={niveles.datos} />
            </Panel>
          )}
          {puedeVerSeccion("carrera", userRoles) && (
            <Panel id="carrera" activa={activa}>
              <SeccionCarrera
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.carrera}
              />
            </Panel>
          )}
          {puedeVerSeccion("operativo", userRoles) && (
            <Panel id="operativo" activa={activa}>
              <SeccionOperativo
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.operativo}
              />
            </Panel>
          )}
          {puedeVerSeccion("salud", userRoles) && (
            <Panel id="salud" activa={activa}>
              <SeccionSalud
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.salud}
              />
            </Panel>
          )}
          {puedeVerSeccion("equipos", userRoles) && (
            <Panel id="equipos" activa={activa}>
              <SeccionEquipos
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.equipos}
              />
            </Panel>
          )}
          {puedeVerSeccion("beneficios", userRoles) && (
            <Panel id="beneficios" activa={activa}>
              <SeccionBeneficios
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.beneficios}
              />
            </Panel>
          )}
          {puedeVerSeccion("familia", userRoles) && (
            <Panel id="familia" activa={activa}>
              <SeccionFamilia
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.familia}
              />
            </Panel>
          )}
          {puedeVerSeccion("habilidades", userRoles) && (
            <Panel id="habilidades" activa={activa}>
              <SeccionHabilidades
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.habilidades}
              />
            </Panel>
          )}
          {puedeVerSeccion("documentos", userRoles) && (
            <Panel id="documentos" activa={activa}>
              <SeccionDocumentos
                funcionario={funcionario}
                userRoles={userRoles}
                nivelAcceso={niveles.documentos}
              />
            </Panel>
          )}
          {puedeVerSeccion("auditoria", userRoles) && (
            <Panel id="auditoria" activa={activa}>
              <SeccionAuditoria
                funcionarioId={funcionario.id}
                userRoles={userRoles}
                nivelAcceso={niveles.auditoria}
              />
            </Panel>
          )}
        </main>
      </div>
    </div>
  );
}

function Panel({
  id,
  activa,
  children,
}: {
  id: string;
  activa: string;
  children: React.ReactNode;
}) {
  if (id !== activa) return null;
  return (
    <section
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="space-y-4"
    >
      {children}
    </section>
  );
}
