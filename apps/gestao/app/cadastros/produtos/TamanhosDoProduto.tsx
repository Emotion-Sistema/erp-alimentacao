"use client";

/**
 * Seção "Tamanhos" da janela do produto (decisão 0021): lista editável de nome e acréscimo (e,
 * se o produto tem preço próprio no delivery ou a pessoa pedir, o acréscimo no delivery), com
 * subir, descer e remover. Até TAMANHOS_POR_PRODUTO. O estado fica na janela.
 */
import { Botao, Icone } from "@erp/interface";
import { TAMANHOS_POR_PRODUTO } from "@erp/dominio/produtos";
import { CampoDoGrupo, Grupo, OpcaoDoGrupo } from "../../Campo";
import { BotoesDaLinha, mover } from "../BotoesDaLinha";
import { TP } from "./textos";

export type LinhaDoTamanho = { chave: number; id?: number; nome: string; acrescimo: string; delivery: string };

let proximaChave = 0;
export const novaChaveDeTamanho = () => ++proximaChave;

export const nomeDoTamanho = (t: LinhaDoTamanho, k: number) => t.nome.trim() || TP.janela.tamanhoSemNome(k + 1);

export function TamanhosDoProduto({
  tamanhos,
  aoMudar,
  precoProprioNoDelivery,
  acrescimoDiferente,
  aoMudarAcrescimoDiferente,
}: {
  tamanhos: LinhaDoTamanho[];
  aoMudar: (lista: LinhaDoTamanho[]) => void;
  /** O produto tem preço próprio no delivery: o acréscimo do delivery aparece sempre. */
  precoProprioNoDelivery: boolean;
  acrescimoDiferente: boolean;
  aoMudarAcrescimoDiferente: (valor: boolean) => void;
}) {
  const comDelivery = precoProprioNoDelivery || acrescimoDiferente;
  const mudar = (chave: number, mudanca: Partial<LinhaDoTamanho>) => aoMudar(tamanhos.map((t) => (t.chave === chave ? { ...t, ...mudanca } : t)));
  return (
    <Grupo legenda={TP.janela.tamanhos} explicacao={TP.janela.tamanhosAjuda} exemplo={TP.janela.tamanhosExemplo} className="linha-editavel" ajudaNoTopo>
      {tamanhos.length === 0 ? (
        <p className="hor-secao__intro">{TP.janela.semTamanhos}</p>
      ) : (
        <ol className="linha-editavel__lista" data-testid="tamanhos-do-produto">
          {tamanhos.map((t, k) => {
            const nome = nomeDoTamanho(t, k);
            return (
              <li key={t.chave} className="linha-editavel__linha" role="group" aria-label={nome}>
                <div className="linha-editavel__campos">
                  <CampoDoGrupo rotulo={TP.janela.tamanho} complemento={String(k + 1)} className="linha-editavel__nome" value={t.nome} maxLength={30} autoComplete="off" onChange={(e) => mudar(t.chave, { nome: e.target.value })} />
                  <CampoDoGrupo rotulo={TP.janela.acrescimo} complemento={TP.janela.doTamanho(k + 1)} className="linha-editavel__dinheiro" value={t.acrescimo} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => mudar(t.chave, { acrescimo: e.target.value })} />
                  {comDelivery && (
                    <CampoDoGrupo rotulo={TP.janela.acrescimoDelivery} complemento={TP.janela.doTamanho(k + 1)} className="linha-editavel__dinheiro" value={t.delivery} placeholder={TP.janela.igualLoja} inputMode="decimal" maxLength={14} autoComplete="off" onChange={(e) => mudar(t.chave, { delivery: e.target.value })} />
                  )}
                </div>
                <BotoesDaLinha nome={nome} indice={k} total={tamanhos.length} aoMover={(passo) => aoMudar(mover(tamanhos, k, passo))} aoRemover={() => aoMudar(tamanhos.filter((x) => x.chave !== t.chave))} />
              </li>
            );
          })}
        </ol>
      )}
      {tamanhos.length > 0 && !precoProprioNoDelivery && (
        <OpcaoDoGrupo rotulo={TP.janela.acrescimoDiferente} className="cadastros__opcao" checked={acrescimoDiferente} onChange={(e) => aoMudarAcrescimoDiferente(e.target.checked)} />
      )}
      {tamanhos.length < TAMANHOS_POR_PRODUTO ? (
        <Botao
          variante="secundario"
          className="linha-editavel__adicionar"
          onClick={() => aoMudar([...tamanhos, { chave: novaChaveDeTamanho(), nome: "", acrescimo: "0,00", delivery: "" }])}
        >
          <Icone nome="mais" />
          {TP.janela.adicionarTamanho}
        </Botao>
      ) : (
        <p className="hor-secao__intro">{TP.janela.limiteTamanhos(TAMANHOS_POR_PRODUTO)}</p>
      )}
    </Grupo>
  );
}
