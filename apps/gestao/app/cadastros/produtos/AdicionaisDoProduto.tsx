"use client";

/**
 * Seção "Adicionais" da janela do produto (decisão 0021): os grupos de adicionais que o produto
 * oferece, na ordem, com subir, descer e remover; para adicionar, só os grupos em uso (ativos)
 * que ainda não estão no produto. Um grupo já ligado e depois desativado aparece marcado
 * "desativado" e pode ser tirado. Os grupos são criados e editados em /cadastros/adicionais.
 */
import Link from "next/link";
import { useState } from "react";
import { Botao, Icone, Selo } from "@erp/interface";
import { GRUPOS_POR_PRODUTO, type GrupoDeAdicionais } from "@erp/dominio/produtos";
import { Grupo, Selecao } from "../../Campo";
import { regraDoGrupo } from "../adicionais/textos";
import { BotoesDaLinha, mover } from "../BotoesDaLinha";
import { TP } from "./textos";

export function AdicionaisDoProduto({
  ligados,
  grupos,
  aoMudar,
}: {
  /** Ids dos grupos ligados ao produto, na ordem. */
  ligados: number[];
  /** Todos os grupos de adicionais. */
  grupos: GrupoDeAdicionais[];
  aoMudar: (ids: number[]) => void;
}) {
  const [escolhido, setEscolhido] = useState("");
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const livres = grupos.filter((g) => g.ativo && !ligados.includes(g.id));
  const nomeDe = (id: number) => porId.get(id)?.nome ?? TP.janela.grupoDesconhecido(id);

  function adicionar() {
    const id = Number(escolhido);
    if (!id || ligados.includes(id)) return;
    aoMudar([...ligados, id]);
    setEscolhido("");
  }

  return (
    <Grupo legenda={TP.janela.adicionais} explicacao={TP.janela.adicionaisAjuda} exemplo={TP.janela.adicionaisExemplo} className="linha-editavel" ajudaNoTopo>
      {ligados.length === 0 ? (
        <p className="hor-secao__intro">{TP.janela.semGrupos}</p>
      ) : (
        <ol className="linha-editavel__lista" data-testid="grupos-do-produto">
          {ligados.map((id, k) => {
            const g = porId.get(id);
            const nome = nomeDe(id);
            const desativado = !g || !g.ativo;
            return (
              <li key={id} className={["linha-editavel__linha", desativado && "linha-editavel__linha--inativa"].filter(Boolean).join(" ")} role="group" aria-label={nome}>
                <div className="linha-editavel__texto">
                  <span className="linha-editavel__titulo">
                    {nome} {desativado && <Selo variante="alerta">{TP.janela.grupoDesativado}</Selo>}
                  </span>
                  {g && <span className="linha-editavel__detalhe">{regraDoGrupo(g.minimo, g.maximo)}</span>}
                </div>
                <BotoesDaLinha nome={nome} indice={k} total={ligados.length} aoMover={(passo) => aoMudar(mover(ligados, k, passo))} aoRemover={() => aoMudar(ligados.filter((x) => x !== id))} />
              </li>
            );
          })}
        </ol>
      )}
      {ligados.length >= GRUPOS_POR_PRODUTO ? (
        <p className="hor-secao__intro">{TP.janela.limiteGrupos(GRUPOS_POR_PRODUTO)}</p>
      ) : livres.length === 0 ? (
        <p className="hor-secao__intro">{TP.janela.nenhumGrupoLivre}</p>
      ) : (
        <div className="linha-editavel__escolher">
          <Selecao
            rotulo={TP.janela.grupoParaAdicionar}
            explicacao={TP.janela.grupoParaAdicionarAjuda}
            exemplo={TP.janela.grupoParaAdicionarExemplo}
            opcoes={[{ valor: "", texto: TP.janela.escolhaGrupo }, ...livres.map((g) => ({ valor: String(g.id), texto: `${g.nome} (${regraDoGrupo(g.minimo, g.maximo)})` }))]}
            value={escolhido}
            onChange={(e) => setEscolhido(e.target.value)}
          />
          <Botao variante="secundario" disabled={!escolhido} onClick={adicionar}>
            <Icone nome="mais" />
            {TP.janela.adicionarGrupo}
          </Botao>
        </div>
      )}
      <p>
        <Link className="linha-editavel__link" href="/cadastros/adicionais">{TP.janela.criarGrupos}</Link>
      </p>
    </Grupo>
  );
}
