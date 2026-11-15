import type { HTMLAttributes, ReactNode } from "react";
import { Icone, type NomeDeIcone } from "./Icone";
import { Selo } from "./Selo";

/**
 * Cartão de uma linha de lista: título forte com a situação (Ativo/Inativo) à direita, o corpo
 * (normalmente uma FichaDeDados), seções (ex.: Embalagens) e as ações em botões secundários.
 * No celular cada ação ocupa a linha inteira.
 */
export function ItemDeLista({
  titulo,
  ativo,
  acoes,
  children,
  ...resto
}: {
  titulo: ReactNode;
  /** Mostra o selo Ativo/Inativo. Omita quando a situação não se aplica. */
  ativo?: boolean;
  acoes?: ReactNode;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return (
    <article className="erp-item" {...resto}>
      <header className="erp-item__cabeca">
        <h2 className="erp-item__titulo">{titulo}</h2>
        {ativo !== undefined && (
          <Selo variante={ativo ? "sucesso" : "neutro"} icone={ativo ? "ok" : undefined}>
            {ativo ? "Ativo" : "Inativo"}
          </Selo>
        )}
      </header>
      {children && <div className="erp-item__corpo">{children}</div>}
      {acoes && <div className="erp-item__acoes">{acoes}</div>}
    </article>
  );
}

/** Seção de um item (ex.: "Embalagens"): título pequeno e o conteúdo embaixo. */
export function SecaoDoItem({ titulo, icone, children }: { titulo: string; icone?: NomeDeIcone; children: ReactNode }) {
  return (
    <section className="erp-secao">
      <h3 className="erp-secao__titulo">
        {icone && <Icone nome={icone} />}
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Grupo de chips ou selos, com quebra de linha (cada filho é um <li>). */
export function GrupoDeChips({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <ul className="erp-chips" aria-label={rotulo}>
      {children}
    </ul>
  );
}
