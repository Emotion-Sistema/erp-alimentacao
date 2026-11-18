"use client";

/**
 * Cartão de um produto: lugar na categoria, nome, preço, tipo de produção (ou "Não passa pela
 * produção"), tempo de preparo, descrição e, para quem gerencia, Editar e Desativar/Reativar.
 */
import { Botao, Selo } from "@erp/interface";
import { textoDosCentavos, type Produto } from "@erp/dominio/produtos";
import { NOME_DA_AREA_DE_PRODUCAO, type TipoDeProducao } from "@erp/dominio/tipos-producao";
import { TP } from "./textos";

export function CartaoDoProduto({
  produto,
  posicao,
  tipo,
  nomeDaCategoria,
  podeGerenciar,
  aoEditar,
  aoMudarAtivo,
}: {
  produto: Produto;
  /** Lugar na categoria (1 = primeiro); nulo se desativado. */
  posicao: number | null;
  /** O tipo de produção do produto (se tiver). */
  tipo?: TipoDeProducao;
  /** Mostrado só quando o cartão fica fora do grupo da categoria (desativados). */
  nomeDaCategoria?: string;
  podeGerenciar: boolean;
  aoEditar: () => void;
  aoMudarAtivo: (ativo: boolean) => void;
}) {
  const p = produto;
  return (
    <article className={["hor-cat", !p.ativo && "hor-cat--inativa"].filter(Boolean).join(" ")} data-testid={`produto-${p.nome}`}>
      <header className="hor-cat__cabeca">
        {posicao !== null && <Selo>{TP.cartao.posicao(posicao)}</Selo>}
        <h3 className="hor-cat__nome">{p.nome}</h3>
        {!p.ativo && <Selo variante="alerta">{TP.cartao.desativado}</Selo>}
      </header>
      <p className="prod-preco" data-testid="preco-do-produto">
        {textoDosCentavos(p.precoCentavos)}
      </p>
      <div className="hor-cat__selos" data-testid="producao-do-produto">
        {p.tipoProducaoId === null ? (
          <Selo>{TP.cartao.semProducao}</Selo>
        ) : (
          <>
            <Selo variante="info">{tipo ? TP.cartao.tipo(tipo.nome, NOME_DA_AREA_DE_PRODUCAO[tipo.area]) : TP.cartao.comProducao}</Selo>
            {p.tempoPreparoMin !== null && <Selo>{TP.cartao.tempo(p.tempoPreparoMin)}</Selo>}
          </>
        )}
        {nomeDaCategoria && <Selo>{TP.cartao.categoria(nomeDaCategoria)}</Selo>}
      </div>
      {p.descricao && <p className="hor-cat__descricao">{p.descricao}</p>}
      {podeGerenciar && (
        <div className="hor-cat__acoes">
          <Botao variante="secundario" aria-label={TP.cartao.editar(p.nome)} onClick={aoEditar}>
            Editar
          </Botao>
          {p.ativo ? (
            <Botao variante="secundario" aria-label={TP.cartao.desativar(p.nome)} onClick={() => aoMudarAtivo(false)}>
              Desativar
            </Botao>
          ) : (
            <Botao variante="secundario" aria-label={TP.cartao.reativar(p.nome)} onClick={() => aoMudarAtivo(true)}>
              Reativar
            </Botao>
          )}
        </div>
      )}
    </article>
  );
}
