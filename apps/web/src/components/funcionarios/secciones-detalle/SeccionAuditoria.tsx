"use client";

import { PlaceholderSection } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

interface Props {
  funcionarioId: number;
  userRoles: string[];
  nivelAcceso: NivelAcceso;
}

export default function SeccionAuditoria(_: Props) {
  return (
    <PlaceholderSection
      title="Auditoría"
      message="Aquí verás el historial de cambios realizados al funcionario: quién, qué y cuándo."
    />
  );
}
