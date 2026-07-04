"use client";

import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export interface BaseFormProps {
  funcionarioId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors";

export function Field({
  label,
  required,
  hint,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

export function WarningBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800/50 dark:text-amber-300 p-3 text-xs flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function FormActions({
  onCancel,
  pending,
  submitLabel = "Confirmar",
  danger = false,
}: {
  onCancel: () => void;
  pending: boolean;
  submitLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-border">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-5 py-2 text-sm font-semibold transition-opacity disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          danger
            ? "bg-destructive text-destructive-foreground hover:opacity-90"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </div>
  );
}
