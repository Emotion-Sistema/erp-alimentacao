"use client";

/**
 * Botões de uma linha numa lista editável (tamanhos do produto, grupos do produto, itens de um
 * grupo de adicionais): subir, descer e remover. Cada botão diz no nome acessível de quem ele é
 * ("Subir M", "Remover Bacon"), e todos têm pelo menos 44 px para o dedo.
 */
import { Botao, Icone } from "@erp/interface";

/** Troca o item da posição `de` com o vizinho (para cima ou para baixo). */
export function mover<T>(lista: T[], de: number, passo: -1 | 1): T[] {
  const para = de + passo;
  if (para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  [nova[de], nova[para]] = [nova[para]!, nova[de]!];
  return nova;
}

export function BotoesDaLinha({
  nome,
  indice,
  total,
  aoMover,
  aoRemover,
}: {
  /** Como a linha se chama para quem usa leitor de tela (ex.: o nome do tamanho). */
  nome: string;
  indice: number;
  total: number;
  aoMover: (passo: -1 | 1) => void;
  aoRemover: () => void;
}) {
  return (
    <div className="linha-editavel__botoes">
      <Botao variante="secundario" className="linha-editavel__seta" aria-label={`Subir ${nome}`} title="Subir" disabled={indice === 0} onClick={() => aoMover(-1)}>
        <Icone nome="subir" />
      </Botao>
      <Botao variante="secundario" className="linha-editavel__seta" aria-label={`Descer ${nome}`} title="Descer" disabled={indice === total - 1} onClick={() => aoMover(1)}>
        <Icone nome="descer" />
      </Botao>
      <Botao variante="secundario" aria-label={`Remover ${nome}`} onClick={aoRemover}>
        Remover
      </Botao>
    </div>
  );
}
