"use client";

import { usePermisosSync } from "@/lib/usePermisos";

/** Side-effect only: sincroniza el cache global de permisos. */
export default function PermisosSync() {
  usePermisosSync();
  return null;
}
