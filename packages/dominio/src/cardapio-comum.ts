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

/** Taxa de serviço do salão. Resposta do responsável (25/11/2026, pendência 42): a casa NÃO cobra; o sistema
 * deve permitir ligar (ex.: 10%) numa configuração, que entra com os pedidos (E13). Por enquanto 0 = desligada. */
export const SERVICO_PORCENTO = 0;

export type LinhaDaComanda = { precoCentavos: number; quantidade: number };

/** Itens, serviço (porcentagem ligada, arredondada ao centavo; 0 = sem serviço) e total, em centavos inteiros. */
export function contasDaComanda(linhas: readonly LinhaDaComanda[], servicoPorcento: number = SERVICO_PORCENTO): {
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
  if (!Number.isSafeInteger(servicoPorcento) || servicoPorcento < 0 || servicoPorcento > 100)
    throw new Error("A taxa de serviço precisa ser uma porcentagem inteira de 0 a 100.");
  const servico = Math.round((itens * servicoPorcento) / 100);
  return { itens, quantidade, servico, total: itens + servico };
}
