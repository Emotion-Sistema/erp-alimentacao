"use client";

/**
 * Seção "Partes do combo" da janela do produto (decisão 0023): lista editável de partes ("Lanche",
 * "Bebida"), cada uma com nome e as opções (um produto do cardápio, o tamanho dele se ele tiver
 * tamanhos, o acréscimo e, como nos tamanhos, o acréscimo no delivery). Subir, descer e remover em
 * partes e opções. Até PARTES_POR_COMBO partes e OPCOES_POR_PARTE opções por parte. O estado fica
 * na janela. Opção cujo produto saiu de venda (ou cujo tamanho foi tirado) aparece "fora de venda",
 * sem campos, e pode ser removida. Repetidos e o resto das regras: o servidor confere.
 */
import { Botao, Icone, Selo } from "@erp/interface";
import { OPCOES_POR_PARTE, PARTES_POR_COMBO, type OpcaoDoCombo, type Produto } from "@erp/dominio/produtos";
import { CampoDoGrupo, Grupo, OpcaoDoGrupo, SelecaoDoGrupo, type OpcaoDaSelecao } from "../../Campo";
import { BotoesDaLinha, mover } from "../BotoesDaLinha";
import type { Categoria } from "../horarios/contas";
import { TP } from "./textos";

export type LinhaDaOpcao = { chave: number; id?: number; produtoId: string; tamanhoId: string; acrescimo: string; delivery: string };
export type LinhaDaParte = { chave: number; id?: number; nome: string; opcoes: LinhaDaOpcao[] };

let proximaChave = 0;
export const novaChaveDoCombo = () => ++proximaChave;

export const nomeDaParte = (p: LinhaDaParte, k: number) => p.nome.trim() || TP.janela.parteSemNome(k + 1);

/** Produto que pode ser opção de combo agora: ativo, não é combo nem o próprio. */
export const podeSerOpcao = (p: Produto, comboId: number | null) => p.ativo && !p.combo && p.id !== comboId;

/**
 * A opção está à venda? A mesma conta de `precoDoItem`: produto que pode ser opção e, se tem
 * tamanhos, com o tamanho escolhido entre os dele (sem tamanhos, nenhum tamanho escolhido).
 */
export function opcaoDisponivel(o: Pick<OpcaoDoCombo, "produtoId" | "tamanhoId">, porId: Map<number, Produto>, comboId: number | null): boolean {
  const p = porId.get(o.produtoId);
  if (!p || !podeSerOpcao(p, comboId)) return false;
  return o.tamanhoId === null ? p.tamanhos.length === 0 : p.tamanhos.some((t) => t.id === o.tamanhoId);
}

/** Opção que já existia e ficou fora de venda (só estas aparecem sem campos). */
export function opcaoForaDeVenda(o: LinhaDaOpcao, porId: Map<number, Produto>, comboId: number | null): boolean {
  if (!o.id || !o.produtoId) return false;
  return !opcaoDisponivel({ produtoId: Number(o.produtoId), tamanhoId: o.tamanhoId ? Number(o.tamanhoId) : null }, porId, comboId);
}

/** Nome da opção para leitor de tela e mensagens: produto e tamanho (ou "opção N"). */
export function nomeDaOpcao(o: LinhaDaOpcao, j: number, porId: Map<number, Produto>): string {
  const p = o.produtoId ? porId.get(Number(o.produtoId)) : undefined;
  if (!o.produtoId) return TP.janela.opcaoSemProduto(j + 1);
  const nome = p?.nome ?? TP.janela.produtoDesconhecido(Number(o.produtoId));
  if (!o.tamanhoId) return nome;
  const t = p?.tamanhos.find((x) => String(x.id) === o.tamanhoId);
  return `${nome} ${t ? t.nome : `(${TP.janela.tamanhoTirado})`}`;
}

export const novaOpcao = (): LinhaDaOpcao => ({ chave: novaChaveDoCombo(), produtoId: "", tamanhoId: "", acrescimo: "0,00", delivery: "" });

export function PartesDoCombo({
  partes,
  aoMudar,
  produtos,
  categorias,
  comboId,
  precoProprioNoDelivery,
  acrescimoDiferente,
  aoMudarAcrescimoDiferente,
}: {
  partes: LinhaDaParte[];
  aoMudar: (lista: LinhaDaParte[]) => void;
  /** Todos os produtos (para escolher as opções e ver as que saíram de venda). */
  produtos: Produto[];
  /** Na ordem do cardápio (para agrupar os produtos). */
  categorias: Categoria[];
  /** Id do combo, se já gravado (ele não pode ser opção dele mesmo). */
  comboId: number | null;
  /** O combo tem preço próprio no delivery: o acréscimo do delivery aparece sempre. */
  precoProprioNoDelivery: boolean;
  acrescimoDiferente: boolean;
  aoMudarAcrescimoDiferente: (valor: boolean) => void;
}) {
  const comDelivery = precoProprioNoDelivery || acrescimoDiferente;
  const porId = new Map(produtos.map((p) => [p.id, p]));

  // Produtos que podem ser opção, agrupados por categoria (na ordem do cardápio).
  const escolhiveis = produtos.filter((p) => podeSerOpcao(p, comboId));
  const listaDeProdutos: OpcaoDaSelecao[] = [{ valor: "", texto: TP.janela.escolhaProduto }];
  const vistas = new Set<number>();
  for (const c of categorias) {
    const daCategoria = escolhiveis.filter((p) => p.categoriaId === c.id);
    vistas.add(c.id);
    if (daCategoria.length) listaDeProdutos.push({ grupo: c.nome, opcoes: daCategoria.map((p) => ({ valor: String(p.id), texto: p.nome })) });
  }
  const semCategoria = escolhiveis.filter((p) => !vistas.has(p.categoriaId));
  if (semCategoria.length) listaDeProdutos.push(...semCategoria.map((p) => ({ valor: String(p.id), texto: p.nome })));

  const mudarParte = (chave: number, mudanca: Partial<LinhaDaParte>) => aoMudar(partes.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p)));
  const mudarOpcoes = (parte: LinhaDaParte, opcoes: LinhaDaOpcao[]) => mudarParte(parte.chave, { opcoes });
  const mudarOpcao = (parte: LinhaDaParte, chave: number, mudanca: Partial<LinhaDaOpcao>) =>
    mudarOpcoes(
      parte,
      parte.opcoes.map((o) => (o.chave === chave ? { ...o, ...mudanca } : o)),
    );

  return (
    <Grupo legenda={TP.janela.partesDoCombo} explicacao={TP.janela.partesAjuda} exemplo={TP.janela.partesExemplo} className="linha-editavel" ajudaNoTopo>
      {partes.length === 0 ? (
        <p className="hor-secao__intro">{TP.janela.semPartes}</p>
      ) : (
        <ol className="linha-editavel__lista" data-testid="partes-do-combo">
          {partes.map((parte, k) => {
            const nome = nomeDaParte(parte, k);
            return (
              <li key={parte.chave} className="linha-editavel__linha prod-combo__parte" role="group" aria-label={nome} data-testid={`parte-${k + 1}`}>
                <div className="prod-combo__cabeca">
                  <div className="linha-editavel__campos">
                    <CampoDoGrupo rotulo={TP.janela.nomeDaParte} complemento={String(k + 1)} className="linha-editavel__nome" value={parte.nome} maxLength={40} autoComplete="off" onChange={(e) => mudarParte(parte.chave, { nome: e.target.value })} />
                  </div>
                  <BotoesDaLinha nome={nome} indice={k} total={partes.length} aoMover={(passo) => aoMudar(mover(partes, k, passo))} aoRemover={() => aoMudar(partes.filter((x) => x.chave !== parte.chave))} />
                </div>
                {parte.opcoes.length === 0 ? (
                  <p className="hor-secao__intro">{TP.janela.semOpcoes}</p>
                ) : (
                  <ol className="linha-editavel__lista" data-testid={`opcoes-da-parte-${k + 1}`}>
                    {parte.opcoes.map((o, j) => {
                      const nomeOpcao = nomeDaOpcao(o, j, porId);
                      const rotulo = TP.janela.opcaoNaParte(nomeOpcao, nome);
                      const botoes = (
                        <BotoesDaLinha
                          nome={rotulo}
                          indice={j}
                          total={parte.opcoes.length}
                          aoMover={(passo) => mudarOpcoes(parte, mover(parte.opcoes, j, passo))}
                          aoRemover={() => mudarOpcoes(parte, parte.opcoes.filter((x) => x.chave !== o.chave))}
                        />
                      );
                      if (opcaoForaDeVenda(o, porId, comboId))
                        return (
                          <li key={o.chave} className="linha-editavel__linha linha-editavel__linha--inativa prod-combo__opcao" role="group" aria-label={rotulo}>
                            <div className="linha-editavel__texto">
                              <span className="linha-editavel__titulo">
                                {nomeOpcao} <Selo variante="alerta">{TP.janela.foraDeVenda}</Selo>
                              </span>
                              <span className="linha-editavel__detalhe">{TP.janela.foraDeVendaDetalhe}</span>
                            </div>
                            {botoes}
                          </li>
                        );
                      const produto = o.produtoId ? porId.get(Number(o.produtoId)) : undefined;
                      const complemento = TP.janela.daOpcao(j + 1, k + 1);
                      // Opção que já existia continua na lista mesmo se não aparece entre os escolhíveis.
                      const opcoesDoProduto =
                        o.produtoId && !escolhiveis.some((p) => String(p.id) === o.produtoId)
                          ? [...listaDeProdutos, { valor: o.produtoId, texto: nomeOpcao }]
                          : listaDeProdutos;
                      return (
                        <li key={o.chave} className="linha-editavel__linha prod-combo__opcao" role="group" aria-label={rotulo}>
                          <div className="linha-editavel__campos">
                            <SelecaoDoGrupo
                              rotulo={TP.janela.produtoDaOpcao}
                              complemento={complemento}
                              className="prod-combo__produto"
                              opcoes={opcoesDoProduto}
                              value={o.produtoId}
                              onChange={(e) => mudarOpcao(parte, o.chave, { produtoId: e.target.value, tamanhoId: "" })}
                            />
                            {produto && produto.tamanhos.length > 0 && (
                              <SelecaoDoGrupo
                                rotulo={TP.janela.tamanhoDaOpcao}
                                complemento={complemento}
                                className="prod-combo__tamanho"
                                opcoes={[{ valor: "", texto: TP.janela.escolhaTamanho }, ...produto.tamanhos.map((t) => ({ valor: String(t.id), texto: t.nome }))]}
                                value={o.tamanhoId}
                                onChange={(e) => mudarOpcao(parte, o.chave, { tamanhoId: e.target.value })}
                              />
                            )}
                            <CampoDoGrupo rotulo={TP.janela.acrescimo} complemento={complemento} className="linha-editavel__dinheiro" value={o.acrescimo} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => mudarOpcao(parte, o.chave, { acrescimo: e.target.value })} />
                            {comDelivery && (
                              <CampoDoGrupo rotulo={TP.janela.acrescimoDelivery} complemento={complemento} className="linha-editavel__dinheiro" value={o.delivery} placeholder={TP.janela.igualLoja} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => mudarOpcao(parte, o.chave, { delivery: e.target.value })} />
                            )}
                          </div>
                          {botoes}
                        </li>
                      );
                    })}
                  </ol>
                )}
                {parte.opcoes.length < OPCOES_POR_PARTE ? (
                  <Botao variante="secundario" className="linha-editavel__adicionar" aria-label={TP.janela.adicionarOpcaoEm(nome)} onClick={() => mudarOpcoes(parte, [...parte.opcoes, novaOpcao()])}>
                    <Icone nome="mais" />
                    {TP.janela.adicionarOpcao}
                  </Botao>
                ) : (
                  <p className="hor-secao__intro">{TP.janela.limiteOpcoes(OPCOES_POR_PARTE)}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {partes.length > 0 && !precoProprioNoDelivery && (
        <OpcaoDoGrupo rotulo={TP.janela.acrescimoDiferente} className="cadastros__opcao" checked={acrescimoDiferente} onChange={(e) => aoMudarAcrescimoDiferente(e.target.checked)} />
      )}
      {partes.length < PARTES_POR_COMBO ? (
        <Botao variante="secundario" className="linha-editavel__adicionar" onClick={() => aoMudar([...partes, { chave: novaChaveDoCombo(), nome: "", opcoes: [novaOpcao()] }])}>
          <Icone nome="mais" />
          {TP.janela.adicionarParte}
        </Botao>
      ) : (
        <p className="hor-secao__intro">{TP.janela.limitePartes(PARTES_POR_COMBO)}</p>
      )}
    </Grupo>
  );
}
