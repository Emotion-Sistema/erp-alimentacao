"use client";

/** Corredor recolhível de um tipo ("Sacos (5)"): botão no título e a grade de cartões embaixo. */
import { useId, type ReactNode } from "react";
import { T } from "./textos";

export function CorredorDoTipo({
  titulo,
  quantidade,
  aberto,
  aoAlternar,
  children,
  discreto,
}: {
  titulo: string;
  quantidade: number;
  aberto: boolean;
  aoAlternar: () => void;
  children: ReactNode;
  /** Corredor das desativadas: mais apagado. */
  discreto?: boolean;
}) {
  const id = useId();
  return (
    <section className={["emb-corredor", discreto && "emb-corredor--discreto"].filter(Boolean).join(" ")} aria-labelledby={`${id}-titulo`}>
      <h2 className="emb-corredor__titulo" id={`${id}-titulo`}>
        <button type="button" className="emb-corredor__botao" aria-expanded={aberto} aria-controls={`${id}-grade`} onClick={aoAlternar}>
          <span className="emb-seta" aria-hidden="true" />
          {T.corredor(titulo, quantidade)}
        </button>
      </h2>
      <div id={`${id}-grade`} hidden={!aberto} className="emb-corredor__conteudo">
        {children}
      </div>
    </section>
  );
}
