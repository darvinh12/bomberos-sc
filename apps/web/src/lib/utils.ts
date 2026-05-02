import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatCedula(nacionalidad?: string | null, cedula?: number | null): string {
  if (!nacionalidad || !cedula) return "—";
  return `${nacionalidad}-${cedula.toLocaleString("es-VE")}`;
}
