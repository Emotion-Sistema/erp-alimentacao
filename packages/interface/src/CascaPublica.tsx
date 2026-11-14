import type { ReactNode } from "react";

export type CascaPublicaProps = {
  nome: string;
  links: { href: string; texto: string }[];
  /** Endereço da página aberta, para marcar o item do menu. */
  atual?: string;
  rodape?: ReactNode;
  children: ReactNode;
};

/** Moldura das páginas públicas (loja e site): topo com navegação, conteúdo e rodapé. */
export function CascaPublica({ nome, links, atual, rodape, children }: CascaPublicaProps) {
  return (
    <div className="erp-publico">
      <header className="erp-publico__topo">
        <a href="/" className="erp-publico__marca">
          {nome}
        </a>
        <nav aria-label="Menu" className="erp-publico__menu">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="erp-publico__link" aria-current={atual === l.href ? "page" : undefined}>
              {l.texto}
            </a>
          ))}
        </nav>
      </header>
      <main className="erp-publico__conteudo">{children}</main>
      <footer className="erp-publico__rodape">{rodape ?? `${nome}. Em construção.`}</footer>
    </div>
  );
}
