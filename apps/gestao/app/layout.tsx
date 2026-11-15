import type { Metadata, Viewport } from "next";
import "@erp/interface/tema.css";
import "./gestao.css";
import { ProvedorDeAjuda } from "./Campo";

export const metadata: Metadata = {
  title: "Gestão",
  description: "Aplicativos internos da casa",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ProvedorDeAjuda>{children}</ProvedorDeAjuda>
      </body>
    </html>
  );
}
