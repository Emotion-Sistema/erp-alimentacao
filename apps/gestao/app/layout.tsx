import type { Metadata, Viewport } from "next";
import "@erp/interface/tema.css";
import "./gestao.css";

export const metadata: Metadata = {
  title: "Gestão",
  description: "Aplicativos internos da casa",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
