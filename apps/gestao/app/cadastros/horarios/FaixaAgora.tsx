"use client";

/** Faixa "Agora": Loja e Delivery, cada um com selo verde (vendendo) ou cinza e a frase do motivo. */
import { Selo } from "@erp/interface";
import { CANAIS, NOME_DO_CANAL, textoDaSituacao } from "@erp/dominio/horarios";
import type { Horarios } from "./contas";
import { T } from "./textos";

export function FaixaAgora({ agora, lidoAs }: { agora: Horarios["agora"]; lidoAs: string }) {
  return (
    <section className="hor-agora" aria-labelledby="hor-agora-titulo" data-testid="faixa-agora">
      <h2 id="hor-agora-titulo" className="hor-agora__titulo">
        {T.agora.titulo}
      </h2>
      <ul className="hor-agora__lista">
        {CANAIS.map((c) => {
          const s = agora.canais[c];
          return (
            <li key={c} className={["hor-agora__canal", s.aberta && "hor-agora__canal--aberto"].filter(Boolean).join(" ")} data-testid={`agora-${c}`}>
              <span className="hor-agora__nome">{NOME_DO_CANAL[c]}</span>
              <Selo variante={s.aberta ? "sucesso" : "neutro"} icone={s.aberta ? "ok" : "relogio"}>
                {s.aberta ? T.agora.vendendo : T.agora.fora}
              </Selo>
              <span className="hor-agora__frase">{textoDaSituacao(s, c)}</span>
            </li>
          );
        })}
      </ul>
      {lidoAs && <p className="hor-agora__nota">{T.agora.atualizado(lidoAs)}</p>}
    </section>
  );
}
