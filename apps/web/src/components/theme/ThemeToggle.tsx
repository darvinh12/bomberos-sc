"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface Props {
  variant?: "icon" | "full";
}

export default function ThemeToggle({ variant = "full" }: Props) {
  const { theme, toggle } = useTheme();
  const esOscuro = theme === "dark";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        title={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {esOscuro ? (
          <Sun className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Moon className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {esOscuro ? (
        <>
          <Sun className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
          Modo claro
        </>
      ) : (
        <>
          <Moon className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
          Modo oscuro
        </>
      )}
    </button>
  );
}
