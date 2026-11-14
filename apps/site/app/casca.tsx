import type { ReactNode } from "react";
import { CascaPublica, EmConstrucao } from "@erp/interface";

export const LINKS = [
  { href: "/cardapio", texto: "Cardápio" },
  { href: "/para-empresas", texto: "Para empresas" },
  { href: "/contato", texto: "Contato" },
];

export function Casca({ atual, children }: { atual?: string; children: ReactNode }) {
  return (
    <CascaPublica nome="Casa Exemplo" links={LINKS} atual={atual}>
      {children}
    </CascaPublica>
  );
}

export function Provisoria({ caminho, titulo, oQueVem }: { caminho: string; titulo: string; oQueVem: string }) {
  return (
    <Casca atual={caminho}>
      <EmConstrucao titulo={titulo} etapa="E25" oQueVem={oQueVem} />
    </Casca>
  );
}
