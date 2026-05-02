import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bomberos Caracas",
  description: "Sistema integral del Cuerpo de Bomberos del Distrito Capital",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
