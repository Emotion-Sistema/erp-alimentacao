import type { Metadata, Viewport } from "next";
// Letra da equipe (aprovada em 18/11/2026): arquivos dentro do app, só os pesos usados.
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "@erp/interface/tema.css";
import "./gestao.css";
import { CORES_DO_TEMA_CLARO } from "@erp/interface";
import { ProvedorDeAjuda } from "./Campo";

export const metadata: Metadata = {
  title: "Gestão",
  description: "Aplicativos internos da E-MOTION",
  icons: { icon: "/marca/favicon.ico", apple: "/marca/apple-touch-icon.png" },
};

// Barra do navegador no celular com o café da faixa do topo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: CORES_DO_TEMA_CLARO.faixaEscura,
  // Sempre claro, inclusive quando o navegador do celular escurece os sites sozinho
  // (pedido do responsável, 15/11 e 18/11/2026). Gera <meta name="color-scheme" content="only light">.
  colorScheme: "only light",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ProvedorDeAjuda>{children}</ProvedorDeAjuda>
      </body>
    </html>
  );
}
