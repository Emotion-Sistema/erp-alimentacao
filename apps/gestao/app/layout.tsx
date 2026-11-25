import type { Metadata, Viewport } from "next";
// Letra da equipe (aprovada em 18/11/2026): arquivos dentro do app, só os pesos usados.
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "@erp/interface/tema.css";
import "./gestao.css";
import "./balcao.css";
import { cookies } from "next/headers";
import { banco } from "@erp/banco";
import { preferenciasDaSessao } from "@erp/dominio";
import { CORES_DO_TEMA_CLARO } from "@erp/interface";
import { COOKIE_SESSAO } from "@/src/servidor/http";
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
  // O navegador nunca escurece a gestão sozinho (pedido de 15/11 e 18/11/2026): o escuro só vem
  // quando a pessoa escolhe (decisão 0030), pelo atributo data-tema. Gera <meta name="color-scheme" content="only light">.
  colorScheme: "only light",
};

/**
 * Tema e letra de quem está dentro (decisão 0030), já no HTML que sai do servidor: a página nasce
 * com a escolha da pessoa, sem piscar claro antes do escuro. Sem sessão: claro, letra normal.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { tema, letra } = await preferenciasDaSessao(banco(), (await cookies()).get(COOKIE_SESSAO)?.value);
  return (
    <html lang="pt-BR" data-tema={tema} data-letra={letra}>
      <body>
        <ProvedorDeAjuda>{children}</ProvedorDeAjuda>
      </body>
    </html>
  );
}
