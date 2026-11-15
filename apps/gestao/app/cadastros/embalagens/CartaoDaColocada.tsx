"use client";

/**
 * Uma embalagem já colocada no ingrediente: nome, a conta ("= 25 kg") e as ações.
 * Quando a conta não sai do nome (outra família ou sem tamanho), a quantidade fica num campo
 * logo ali: aberto se falta, ou por "Corrigir" quando já tem valor.
 */
import { useState } from "react";
import { Botao, Icone, Selo } from "@erp/interface";
import { Campo } from "../../Campo";
import { equivalenciaNaUnidade, type UnidadeBase } from "../auxiliares";
import { nomeParaMostrar, perguntaDaQuantidade, quantidadeDigitada } from "./contas";
import { T } from "./textos";

export function CartaoDaColocada({
  nome,
  quantidade,
  calculada,
  base,
  exibicao,
  inativa,
  acoes,
  aoMudarQuantidade,
  salvarQuantidade,
}: {
  nome: string;
  /** Quantidade na unidade de dentro (g, ml, un), como texto; pode estar vazia. */
  quantidade: string;
  /** A conta sai do nome? Então não há campo (a quantidade é fixa). */
  calculada: boolean;
  base: UnidadeBase;
  exibicao?: string;
  inativa?: boolean;
  acoes: React.ReactNode;
  /** Item ainda não gravado: muda a quantidade na hora. */
  aoMudarQuantidade?: (q: string) => void;
  /** Ingrediente gravado: grava a nova quantidade (devolve true se deu certo). */
  salvarQuantidade?: (q: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(quantidade.replace(".", ","));
  const final = quantidadeDigitada(quantidade);
  const equivalencia = final ? equivalenciaNaUnidade(final, base, exibicao) : null;
  const mostrado = nomeParaMostrar(nome);
  const podeCorrigir = !calculada && !inativa && (aoMudarQuantidade || salvarQuantidade);
  const campoAberto = podeCorrigir && (editando || (!final && !!aoMudarQuantidade));
  return (
    <li className={["emb-colocada", !final && !inativa && "emb-colocada--falta", inativa && "emb-colocada--inativa"].filter(Boolean).join(" ")} data-testid={`colocada-${nome}`}>
      <Icone nome="caixa" />
      <span className="emb-colocada__nome">{mostrado}</span>{" "}
      {equivalencia ? (
        <span className="emb-colocada__conta">= {equivalencia}</span>
      ) : (
        <Selo variante="alerta" icone="alerta">
          falta a quantidade
        </Selo>
      )}
      {inativa && <Selo>{T.ingrediente.inativa}</Selo>}
      <span className="emb-colocada__acoes">
        {podeCorrigir && !campoAberto && (
          <Botao
            variante="secundario"
            aria-label={T.ingrediente.corrigir(mostrado)}
            onClick={() => {
              setRascunho(quantidade.replace(".", ","));
              setEditando(true);
            }}
          >
            Corrigir
          </Botao>
        )}
        {acoes}
      </span>
      {campoAberto && (
        <div className="emb-colocada__quantidade">
          <Campo
            rotulo={perguntaDaQuantidade(base, nome)}
            explicacao={T.ingrediente.quantidade.explicacao(base)}
            exemplo={T.ingrediente.quantidade.exemplo(base)}
            value={aoMudarQuantidade ? quantidade.replace(".", ",") : rascunho}
            onChange={(e) => (aoMudarQuantidade ? aoMudarQuantidade(e.target.value) : setRascunho(e.target.value))}
            onFocus={() => setEditando(true)}
            onBlur={() => aoMudarQuantidade && setEditando(false)}
            inputMode="decimal"
            autoComplete="off"
            autoFocus={editando}
          />
          {salvarQuantidade && (
            <span className="cadastros__botoes">
              <Botao
                disabled={!quantidadeDigitada(rascunho)}
                onClick={async () => {
                  const q = quantidadeDigitada(rascunho);
                  if (q && (await salvarQuantidade(q))) setEditando(false);
                }}
              >
                {T.ingrediente.salvarQuantidade}
              </Botao>
              <Botao variante="secundario" onClick={() => setEditando(false)}>
                Cancelar
              </Botao>
            </span>
          )}
        </div>
      )}
    </li>
  );
}
