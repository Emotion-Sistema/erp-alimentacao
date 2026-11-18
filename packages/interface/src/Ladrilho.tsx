import type { ReactNode } from "react";

export type LadrilhoProps = {
  href: string;
  titulo: string;
  descricao?: ReactNode;
};

/** Cartão grande e clicável (um link), com alvo de toque grande. */
export function Ladrilho({ href, titulo, descricao }: LadrilhoProps) {
  return (
    <a href={href} className="erp-ladrilho">
      <span className="erp-ladrilho__titulo">{titulo}</span>
      {descricao ? (
        <span className="erp-ladrilho__descricao">{descricao}</span>
      ) : null}
    </a>
  );
}
