import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@erp/interface/tema.css";

export const metadata: Metadata = {
  title: "Casa Exemplo",
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
