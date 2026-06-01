import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import QueryProvider from "@/components/QueryProvider";
import PermisosSync from "@/components/PermisosSync";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Bomberos Caracas",
  description: "Sistema integral del Cuerpo de Bomberos del Distrito Capital",
  robots: { index: false, follow: false },
};

// Script no-flash: aplica la clase `dark` ANTES de que React hidrate, evitando
// el flash blanco al cargar la página si el usuario tiene tema oscuro guardado.
const noFlashScript = `
(function() {
  try {
    var t = localStorage.getItem('bomberos-theme');
    if (t === 'dark' || (t !== 'light' && true)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <PermisosSync />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
