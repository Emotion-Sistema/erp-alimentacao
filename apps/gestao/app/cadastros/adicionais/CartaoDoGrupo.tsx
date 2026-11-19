"use client";

/**
 * Cartão de um grupo de adicionais: nome, a regra em linguagem simples ("Opcional, até 3"),
 * os itens com preço ("grátis" quando 0), em quantos produtos ativos é usado e, para quem
 * gerencia, Editar e Desativar/Reativar.
 */
import { Botao, Selo } from "@erp/interface";
import type { GrupoDeAdicionais } from "@erp/dominio/produtos";
import { precoDoAdicional, regraDoGrupo, TA } from "./textos";

export function CartaoDoGrupo({
  grupo,
  usadoEm,
  podeGerenciar,
  aoEditar,
  aoMudarAtivo,
}: {
  grupo: GrupoDeAdicionais;
  /** Quantos produtos ativos oferecem este grupo. */
  usadoEm: number;
  podeGerenciar: boolean;
  aoEditar: () => void;
  aoMudarAtivo: (ativo: boolean) => void;
}) {
  const g = grupo;
  const itens = g.itens.filter((i) => i.ativo);
  return (
    <article className={["hor-cat", !g.ativo && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`grupo-${g.nome}`}>
      <header className="hor-cat__cabeca">
        <h3 className="hor-cat__nome">{g.nome}</h3>
        {!g.ativo && <Selo variante="alerta">{TA.cartao.desativado}</Selo>}
      </header>
      <div className="hor-cat__selos">
        <Selo variante={g.minimo > 0 ? "info" : undefined} data-testid="regra-do-grupo">
          {regraDoGrupo(g.minimo, g.maximo)}
        </Selo>
        <Selo data-testid="uso-do-grupo">{TA.cartao.usadoEm(usadoEm)}</Selo>
      </div>
      {itens.length === 0 ? (
        <p className="hor-cat__descricao hor-cat__descricao--vazia">{TA.cartao.semItens}</p>
      ) : (
        <ul className="adic-itens" aria-label={TA.cartao.itens(g.nome)}>
          {itens.map((i) => (
            <li key={i.id} className="adic-itens__item">
              <span className="adic-itens__nome">{i.nome}</span>
              <span className="adic-itens__preco">
                {precoDoAdicional(i.precoCentavos)}
                {i.precoDeliveryCentavos !== null && i.precoDeliveryCentavos !== i.precoCentavos && (
                  <span className="adic-itens__extra"> ({TA.cartao.delivery(precoDoAdicional(i.precoDeliveryCentavos))})</span>
                )}
                {i.maximoPorItem > 1 && <span className="adic-itens__extra">, {TA.cartao.vezes(i.maximoPorItem)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {podeGerenciar && (
        <div className="hor-cat__acoes">
          <Botao variante="secundario" aria-label={TA.cartao.editar(g.nome)} onClick={aoEditar}>
            Editar
          </Botao>
          {g.ativo ? (
            <Botao variante="secundario" aria-label={TA.cartao.desativar(g.nome)} onClick={() => aoMudarAtivo(false)}>
              Desativar
            </Botao>
          ) : (
            <Botao variante="secundario" aria-label={TA.cartao.reativar(g.nome)} onClick={() => aoMudarAtivo(true)}>
              Reativar
            </Botao>
          )}
        </div>
      )}
    </article>
  );
}
