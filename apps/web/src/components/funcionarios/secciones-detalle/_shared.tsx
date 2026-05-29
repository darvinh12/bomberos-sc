"use client";

import { Eye } from "lucide-react";
import { ReactNode } from "react";

export function SectionShell({
  title,
  description,
  children,
  actions,
  soloLectura = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Si es true, muestra un indicador discreto debajo del título y suprime el
   * área de `actions` (que típicamente contiene botones de creación).
   */
  soloLectura?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
          {soloLectura && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground italic">
              <Eye className="w-3 h-3" aria-hidden="true" />
              Solo lectura — no puedes modificar esta sección con tu rol actual.
            </p>
          )}
        </div>
        {actions && !soloLectura && (
          <div className="flex items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card border border-border rounded-lg overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div
        className={`text-sm text-foreground ${
          mono ? "font-mono tabular-nums" : "font-medium"
        }`}
      >
        {empty ? <span className="text-muted-foreground/60">—</span> : value}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-border rounded-lg bg-muted/20">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function PlaceholderSection({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <SectionShell title={title}>
      <EmptyState title="En construcción" hint={message} />
    </SectionShell>
  );
}
