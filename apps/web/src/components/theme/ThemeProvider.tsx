"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "bomberos-theme";

function aplicarClase(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

function leerInicial(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // localStorage bloqueado
  }
  // Default: oscuro (consistente con el theme actual del proyecto)
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sincroniza el estado React con lo que ya aplicó el script no-flash en <html>
  useEffect(() => {
    const inicial = leerInicial();
    setThemeState(inicial);
    aplicarClase(inicial);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    aplicarClase(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // localStorage bloqueado
    }
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback seguro si se usa fuera del provider (SSR, test, etc)
    return {
      theme: "dark",
      setTheme: () => undefined,
      toggle: () => undefined,
    };
  }
  return ctx;
}
