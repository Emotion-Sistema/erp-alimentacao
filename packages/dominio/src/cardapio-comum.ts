/**
 * Cardápio para lançar pedido e as contas da comanda (tela "Novo pedido", protótipo A).
 * Sem banco: serve à tela e ao servidor. Dinheiro sempre em centavos inteiros.
 *
 * A comanda ainda NÃO é gravada: o pedido de verdade (com preço e receita versionados, baixa de
 * estoque uma vez e envio para a cozinha) chega na etapa E13. Aqui é só a conta na tela.
 */

/** O que a pessoa do atendimento recebe de cada produto: nada de custo nem dado interno. */
export type ItemDoCardapio = {
  id: number;
  nome: string;
  categoria: { id: number; nome: string; ordem: number };
  /** Preço da loja (no salão), em centavos. */
  precoCentavos: number;
  fotoId: number | null;
  tempoPreparoMin: number | null;
};

/** Taxa de serviço do salão: 10% sobre os itens (como no protótipo). HIPÓTESE: pendência 42 de
 * docs/04-pendencias.md ainda aberta (há serviço? é opcional?). Confirmar com o responsável antes da E13. */
export const SERVICO_PORCENTO = 10;

export type LinhaDaComanda = { precoCentavos: number; quantidade: number };

/** Itens, serviço (10%, arredondado ao centavo) e total da comanda, em centavos inteiros. */
export function contasDaComanda(linhas: readonly LinhaDaComanda[]): {
  itens: number;
  quantidade: number;
  servico: number;
  total: number;
} {
  let itens = 0;
  let quantidade = 0;
  for (const l of linhas) {
    if (!Number.isSafeInteger(l.precoCentavos) || !Number.isSafeInteger(l.quantidade) || l.quantidade < 0 || l.precoCentavos < 0)
      throw new Error("Preço e quantidade da comanda precisam ser inteiros e não negativos.");
    itens += l.precoCentavos * l.quantidade;
    quantidade += l.quantidade;
  }
  const servico = Math.round((itens * SERVICO_PORCENTO) / 100);
  return { itens, quantidade, servico, total: itens + servico };
}
