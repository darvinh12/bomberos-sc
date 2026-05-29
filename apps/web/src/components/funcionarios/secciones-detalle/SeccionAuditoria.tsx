"use client";

import { PlaceholderSection } from "./_shared";

interface Props {
  funcionarioId: number;
  userRoles: string[];
}

export default function SeccionAuditoria(_: Props) {
  return (
    <PlaceholderSection
      title="Auditoría"
      message="Aquí verás el historial de cambios realizados al funcionario: quién, qué y cuándo."
    />
  );
}
