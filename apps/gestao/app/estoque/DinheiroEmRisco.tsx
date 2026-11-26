"use client";

/**
 * Bloco "Dinheiro em risco" do painel (D1, ideia nº 15): quanto em R$ vence em até 3 e 7 dias e
 * quanto já venceu e continua no estoque, nas áreas desta tela. "Ver os itens" abre a lista por item
 * e área; tocar numa linha abre o item. Só aparece para quem vê custos (o painel nem monta o bloco
 * sem `custos.ver`, e o servidor confere de novo em GET /api/estoque/em-risco).
 */
import { useEffect, useState } from "react";
import { Aviso, Botao, Dado, FichaDeDados, Selo, varianteDaArea } from "@erp/interface";
import type { DinheiroEmRisco as Dados } from "@erp/dominio";
import { chamar } from "../chamar";
import { dia, qtd, reais } from "./comum";
import type { ContextoDoEstoque } from "./contexto";
import { TE } from "./textos";

const T = TE.emRisco;

export function DinheiroEmRisco({
  contexto,
  areas,
  versao,
  aoAbrirItem,
}: {
  contexto: ContextoDoEstoque;
  areas: readonly string[];
  /** Muda quando o painel recarrega (perda, entrada...): busca de novo. */
  versao: number;
  aoAbrirItem: (itemId: number) => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    void chamar<Dados>("/api/estoque/em-risco").then((r) => {
      if (!vivo) return;
      if (r.ok && r.dados) {
        setDados(r.dados);
        setErro("");
      } else setErro(r.mensagem);
    });
    return () => {
      vivo = false;
    };
  }, [versao]);

  if (!dados && !erro) return null;

  // O servidor manda as áreas da pessoa; aqui fica só o que é desta tela (Cozinha ou Salão).
  const somas = { em3: 0n, em7: 0n, vencido: 0n };
  for (const a of dados?.porArea ?? []) {
    if (!areas.includes(a.area)) continue;
    somas.em3 += BigInt(a.em3DiasCentavos);
    somas.em7 += BigInt(a.em7DiasCentavos);
    somas.vencido += BigInt(a.vencidoCentavos);
  }
  const itens = (dados?.itens ?? []).filter((i) => areas.includes(i.area));
  const nada = itens.length === 0;

  return (
    <section className="est-bloco" aria-labelledby="est-em-risco" data-testid="dinheiro-em-risco">
      <h2 id="est-em-risco">{T.titulo}</h2>
      {erro && <Aviso tipo="perigo">{erro}</Aviso>}
      {dados && nada && <p className="hor-secao__intro" data-testid="em-risco-resumo">{T.nada}</p>}
      {dados && !nada && (
        <>
          <FichaDeDados compacta data-testid="em-risco-resumo">
            <Dado rotulo={T.vence3} icone="relogio">
              {reais(somas.em3.toString())}
            </Dado>
            <Dado rotulo={T.vence7} icone="calendario">
              {reais(somas.em7.toString())}
            </Dado>
            <Dado rotulo={T.vencidoNoEstoque} icone="alerta">
              {reais(somas.vencido.toString())}
            </Dado>
          </FichaDeDados>
          <div className="hor-secao__botoes">
            <Botao variante="secundario" aria-expanded={aberto} aria-controls="est-em-risco-itens" onClick={() => setAberto(!aberto)}>
              {aberto ? T.esconder : T.ver}
            </Botao>
          </div>
          {aberto && (
            <ul className="est-lista" id="est-em-risco-itens" data-testid="em-risco-itens">
              {itens.map((i) => {
                const area = contexto.nomeDaArea[i.area] ?? i.area;
                const vencido = BigInt(i.valorVencidoCentavos) > 0n || i.quantidadeVencida !== "0";
                return (
                  <li key={`${i.itemId}-${i.area}`} className="est-linha" data-testid={`em-risco-${i.nome}-${i.area}`}>
                    <span className="est-linha__cabeca">
                      <strong>{i.nome}</strong>
                      <Selo variante={varianteDaArea(i.area)}>{area}</Selo>
                      {vencido && (
                        <Selo variante="perigo" icone="alerta">
                          {TE.painel.venceu}
                        </Selo>
                      )}
                    </span>
                    <FichaDeDados compacta>
                      <Dado rotulo={T.em3}>{`${qtd(i.quantidade3, i.unidade)}, ${reais(i.valor3Centavos)}`}</Dado>
                      <Dado rotulo={T.em7}>{`${qtd(i.quantidade7, i.unidade)}, ${reais(i.valor7Centavos)}`}</Dado>
                      {vencido && <Dado rotulo={T.vencido}>{`${qtd(i.quantidadeVencida, i.unidade)}, ${reais(i.valorVencidoCentavos)}`}</Dado>}
                      <Dado rotulo={T.primeira} ocultarSeVazio>
                        {dia(i.primeiraValidade).slice(0, 5)}
                      </Dado>
                    </FichaDeDados>
                    <div className="est-acoes">
                      <Botao variante="secundario" onClick={() => aoAbrirItem(i.itemId)} aria-label={T.abrir(i.nome, area)}>
                        {T.abrirBotao}
                      </Botao>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
