import type { ReactNode } from "react";
import { CascaPublica, EmConstrucao } from "@erp/interface";

export const LINKS = [
  { href: "/cardapio", texto: "Cardápio" },
  { href: "/meu-pedido", texto: "Meu pedido" },
  { href: "/entrar", texto: "Entrar" },
];

export function Casca({
  atual,
  children,
}: {
  atual?: string;
  children: ReactNode;
}) {
  return (
    <CascaPublica nome="E-MOTION" links={LINKS} atual={atual}>
      {children}
    </CascaPublica>
  );
}

export function Provisoria({
  caminho,
  titulo,
  etapa,
  oQueVem,
}: {
  caminho: string;
  titulo: string;
  etapa: string;
  oQueVem: string;
}) {
  return (
    <Casca atual={caminho}>
      <EmConstrucao titulo={titulo} etapa={etapa} oQueVem={oQueVem} />
    </Casca>
  );
}
