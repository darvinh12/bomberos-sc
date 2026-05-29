"use client";

import { useState } from "react";
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

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funcionario: any;
  userRoles: string[];
  puedeEditar: boolean;
}

const SECCIONES: Seccion[] = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "datos", label: "Datos personales", icon: IdCard },
  { id: "carrera", label: "Carrera", icon: Award },
  { id: "operativo", label: "Operativo", icon: ShieldCheck },
  { id: "salud", label: "Salud", icon: HeartPulse },
  { id: "equipos", label: "Equipos", icon: HardHat },
  { id: "beneficios", label: "Beneficios", icon: HandCoins },
  { id: "familia", label: "Familia", icon: Users },
  { id: "habilidades", label: "Habilidades", icon: Sparkles },
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "auditoria", label: "Auditoría", icon: History },
];

export default function FichaFuncionarioCliente({
  funcionario,
  userRoles,
  puedeEditar,
}: Props) {
  const [activa, setActiva] = useState<string>("resumen");

  return (
    <div className="space-y-4">
      <HeaderFuncionario f={funcionario} puedeEditar={puedeEditar} />

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 md:gap-6">
        <aside className="md:sticky md:top-32 self-start">
          <SeccionNav
            secciones={SECCIONES}
            activa={activa}
            onChange={setActiva}
            modo="lectura"
          />
        </aside>

        <main className="min-w-0">
          <Panel id="resumen" activa={activa}>
            <SeccionResumen funcionario={funcionario} userRoles={userRoles} />
          </Panel>
          <Panel id="datos" activa={activa}>
            <SeccionDatos funcionario={funcionario} />
          </Panel>
          <Panel id="carrera" activa={activa}>
            <SeccionCarrera funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="operativo" activa={activa}>
            <SeccionOperativo funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="salud" activa={activa}>
            <SeccionSalud funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="equipos" activa={activa}>
            <SeccionEquipos funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="beneficios" activa={activa}>
            <SeccionBeneficios funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="familia" activa={activa}>
            <SeccionFamilia funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="habilidades" activa={activa}>
            <SeccionHabilidades funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
          <Panel id="documentos" activa={activa}>
            <SeccionDocumentos funcionario={funcionario} userRoles={userRoles} />
          </Panel>
          <Panel id="auditoria" activa={activa}>
            <SeccionAuditoria funcionarioId={funcionario.id} userRoles={userRoles} />
          </Panel>
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
