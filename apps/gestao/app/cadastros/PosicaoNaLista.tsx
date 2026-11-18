"use client";

/**
 * "Posição na lista": a pessoa escolhe o lugar (1º, 2º...) vendo a lista que já existe e como
 * ela vai ficar. Sem número de ordem para digitar; o servidor renumera (packages/dominio/src/posicao.ts).
 * Usado em Categorias e Tipos de produção. Regra do responsável (17/11/2026): campo que depende do
 * que já está cadastrado mostra a lista do que já existe, para comparar.
 */
import { Selecao } from "../Campo";

export type ItemDaLista = { id: number; nome: string; detalhe?: string };

export function PosicaoNaLista({
  rotulo,
  itens,
  atualId,
  nomeDoAtual,
  posicao,
  aoMudar,
}: {
  rotulo: string;
  /** Os ativos, já na ordem da lista. */
  itens: ItemDaLista[];
  /** O item que está sendo editado (fica de fora das opções). Sem ele, é um novo. */
  atualId?: number;
  nomeDoAtual: string;
  posicao: number;
  aoMudar: (posicao: number) => void;
}) {
  const outros = itens.filter((i) => i.id !== atualId);
  const opcoes = Array.from({ length: outros.length + 1 }, (_, i) => ({
    valor: String(i + 1),
    texto:
      i === 0
        ? `1º: no começo${outros[0] ? ` (antes de ${outros[0].nome})` : ""}`
        : `${i + 1}º: depois de ${outros[i - 1]!.nome}${i === outros.length ? " (no fim)" : ""}`,
  }));
  const p = Math.min(Math.max(posicao, 1), outros.length + 1);
  const previa = [...outros.slice(0, p - 1).map((i) => ({ ...i, este: false })), { id: -1, nome: nomeDoAtual, detalhe: undefined, este: true }, ...outros.slice(p - 1).map((i) => ({ ...i, este: false }))];
  return (
    <div className="posicao" data-testid="posicao-na-lista">
      <Selecao
        rotulo={rotulo}
        explicacao="Escolha em que lugar ele aparece. Abaixo, a lista de como vai ficar."
        exemplo="2º: depois do primeiro da lista. Os outros descem um lugar sozinhos."
        opcoes={opcoes}
        value={String(p)}
        onChange={(e) => aoMudar(Number(e.target.value))}
      />
      <p className="posicao__titulo" id="posicao-previa">
        Como a lista vai ficar:
      </p>
      <ol className="posicao__lista" aria-labelledby="posicao-previa">
        {previa.map((i) => (
          <li key={i.id} className={i.este ? "posicao__este" : undefined} aria-current={i.este ? "true" : undefined}>
            {i.este ? <strong>{i.nome || "(este)"} ← este</strong> : i.nome}
            {i.detalhe && <span className="posicao__detalhe"> ({i.detalhe})</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
