"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { isDemoMode } from "./demo-fixtures";
import { api } from "./api";
import { setPermisosCache, type PermisoRecurso } from "./permisos-cache";

const STORAGE_KEY = "bomberos-permisos-recursos";

async function fetchPermisos(): Promise<PermisoRecurso[]> {
  if (isDemoMode()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as PermisoRecurso[];
    } catch {
      // localStorage no disponible
    }
    return [];
  }

  try {
    return await api.get<PermisoRecurso[]>("/admin/permisos-recursos");
  } catch {
    return [];
  }
}

/**
 * Mantiene el cache global de permisos sincronizado con el backend.
 * Polling cada 30s + revalidación on focus. En demo mode escucha
 * storage events para multi-tab.
 *
 * Montar UNA vez en una raíz cliente (PermisosSync component).
 */
export function usePermisosSync(): void {
  const { data } = useQuery({
    queryKey: ["permisos-recursos"],
    queryFn: fetchPermisos,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 25_000,
  });

  useEffect(() => {
    if (data) setPermisosCache(data);
  }, [data]);

  useEffect(() => {
    if (!isDemoMode()) return;
    function handler(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setPermisosCache(JSON.parse(e.newValue) as PermisoRecurso[]);
      } catch {
        // ignorar JSON inválido
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
}

/** Guarda permisos en localStorage del cliente (modo demo). */
export function guardarPermisosDemoLocal(items: PermisoRecurso[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    setPermisosCache(items);
  } catch {
    // ignorar
  }
}
