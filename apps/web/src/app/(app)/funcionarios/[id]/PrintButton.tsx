"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Imprimir ficha del funcionario"
    >
      <Printer className="w-3.5 h-3.5" aria-hidden="true" />
      Imprimir ficha
    </button>
  );
}
