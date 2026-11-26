"use client";

/**
 * Para repor (E10, decisão 0029): o que está abaixo da linha saudável, em seções Esgotou,
 * Emergência e Repor, com quanto comprar para voltar à linha saudável, o que já vem de outra área,
 * o fornecedor e desde quando. Chips por área e "Baixar lista" (planilha montada aqui). Lê
 * GET /api/estoque/repor, que só responde a quem compra (`compras.gerenciar`, no servidor).
 */
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Selo, varianteDaArea } from "@erp/interface";
import type { ItemParaRepor } from "@erp/dominio";
import { linhasParaCsv } from "@erp/dominio/importar";
import { chamar } from "../../chamar";
import { formatarDataHora } from "../../formatar";
import { baixarArquivo, hojeNaLoja, q4, qtd } from "../comum";
import type { ContextoDoEstoque } from "../contexto";
import { TE } from "../textos";

const T = TE.repor;
const SECOES = ["esgotado", "emergencia", "repor"] as const;
const qtdNaPlanilha = (v: string | null) => (v === null ? "" : v.replace(".", ","));

export function ParaRepor({ contexto, versao }: { contexto: ContextoDoEstoque; versao: number }) {
  const [itens, setItens] = useState<ItemParaRepor[] | null>(null);
  const [erro, setErro] = useState("");
  const [area, setArea] = useState("");

  const carregar = useCallback(async () => {
    const r = await chamar<ItemParaRepor[]>("/api/estoque/repor");
    if (r.ok && r.dados) {
      setItens(r.dados);
      setErro("");
    } else setErro(r.mensagem);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const nome = (a: string) => contexto.nomeDaArea[a] ?? a;
  const vistos = (itens ?? []).filter((i) => !area || i.area === area);
  // Chips: só as áreas que têm algo para repor (e "Todas").
  const areasComItem = contexto.areas.filter((a) => (itens ?? []).some((i) => i.area === a.valor));

  function baixar() {
    baixarArquivo(
      `para-repor-${hojeNaLoja()}.csv`,
      linhasParaCsv([
        ["Situação", "Item", "Área", "Há agora", "Linha saudável", "Comprar", "A receber", "Unidade", "Fornecedor", "Prazo de entrega (dias)", "Desde"],
        ...vistos.map((i) => [
          T.secoes[i.situacao] ?? i.situacao,
          i.nome,
          nome(i.area),
          qtdNaPlanilha(i.quantidade),
          qtdNaPlanilha(i.saudavel),
          qtdNaPlanilha(i.paraRepor),
          qtdNaPlanilha(i.aReceber),
          i.unidade,
          i.fornecedor?.nome ?? "",
          i.fornecedor?.prazoEntregaDias === null || i.fornecedor === null ? "" : String(i.fornecedor.prazoEntregaDias),
          i.desde ? formatarDataHora(i.desde) : "",
        ]),
      ]),
    );
  }

  return (
    <div className="est-painel" data-testid="para-repor">
      <p className="hor-tela__intro">{T.intro}</p>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {!itens && !erro && <p aria-live="polite">{TE.carregando}</p>}
      {itens && itens.length === 0 && <p className="hor-vazio">{T.vazio}</p>}
      {itens && itens.length > 0 && (
        <>
          <div className="balcao-barra">
            <div className="balcao-chips" role="group" aria-label={T.areas}>
              <button type="button" className="balcao-chip" aria-pressed={!area} onClick={() => setArea("")}>
                {T.todas} <em>{itens.length}</em>
              </button>
              {areasComItem.map((a) => (
                <button key={a.valor} type="button" className="balcao-chip" aria-pressed={area === a.valor} onClick={() => setArea(a.valor)}>
                  {a.texto} <em>{itens.filter((i) => i.area === a.valor).length}</em>
                </button>
              ))}
            </div>
            <div className="balcao-acoes">
              <Botao variante="secundario" disabled={vistos.length === 0} onClick={baixar}>
                {T.baixar}
              </Botao>
            </div>
          </div>
          {vistos.length === 0 ? (
            <p className="hor-vazio">{T.nadaNaArea}</p>
          ) : (
            <div className="balcao-lista">
              <div className="balcao-lista__cab" aria-hidden="true">
                <span>{T.colItem}</span>
                <span>{T.colComprar}</span>
              </div>
              {SECOES.map((sec) => {
                const daSecao = vistos.filter((i) => i.situacao === sec);
                if (daSecao.length === 0) return null;
                return (
                  <section key={sec} className="hor-secao" aria-labelledby={`repor-${sec}`} data-testid={`secao-${sec}`}>
                    <h2 id={`repor-${sec}`}>{T.secoes[sec]}</h2>
                    <ul className="hor-cats">
                      {daSecao.map((i) => (
                        <li key={`${i.itemId}-${i.area}`} className="hor-cats__item">
                          <LinhaParaRepor item={i} nomeDaArea={nome(i.area)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LinhaParaRepor({ item: i, nomeDaArea }: { item: ItemParaRepor; nomeDaArea: string }) {
  const detalhes = [T.haAgora(qtd(i.quantidade, i.unidade)), i.saudavel === null ? T.semSaudavel : T.saudavel(qtd(i.saudavel, i.unidade)), q4(i.aReceber) > 0n ? T.aReceber(qtd(i.aReceber, i.unidade)) : null].filter(Boolean);
  const fornecedor = i.fornecedor ? T.fornecedor(i.fornecedor.nome, i.fornecedor.prazoEntregaDias) : T.semFornecedor;
  return (
    <article className="hor-cat est-repor" data-testid={`repor-${i.nome}`}>
      <header className="hor-cat__cabeca">
        <h3 className="hor-cat__nome">{i.nome}</h3>
        <Selo variante={varianteDaArea(i.area)}>{nomeDaArea}</Selo>
        {i.usandoGuardado && <Selo variante="info">{T.usandoGuardado}</Selo>}
      </header>
      <p className="hor-cat__descricao">{detalhes.join(". ")}.</p>
      <p className="hor-cat__descricao est-repor__apoio">
        {fornecedor}
        {i.desde ? `. ${T.desde(formatarDataHora(i.desde))}` : ""}.
      </p>
      <div className="hor-cat__acoes">
        <strong className="est-repor__comprar" data-testid="comprar">
          {i.paraRepor === null ? T.semQuanto : T.comprar(qtd(i.paraRepor, i.unidade))}
        </strong>
      </div>
    </article>
  );
}
