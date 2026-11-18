import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CORES_DO_TEMA_CLARO, CORES_DO_TEMA_ESCURO } from "@erp/interface";
// Letras do cliente (aprovadas em 18/11/2026): arquivos dentro do app, só os pesos usados.
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-700.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "@erp/interface/tema.css";
import "@erp/interface/publico.css";

export const metadata: Metadata = {
  title: "E-MOTION: pedidos online",
  description: "Peça na E-MOTION: café, grill e lanches rápidos.",
  icons: { icon: "/marca/favicon.ico", apple: "/marca/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: CORES_DO_TEMA_CLARO.fundo,
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: CORES_DO_TEMA_ESCURO.fundo,
    },
  ],
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
