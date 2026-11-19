/**
 * Preço de um item no servidor (decisão 0021). É o que o pedido (E11) vai chamar, DENTRO da
 * transação dele, para gravar o preço aplicado: lê o produto e os grupos de adicionais do banco e
 * aplica a regra única `precoDoItem` (produtos-comum). Quem chama já conferiu a permissão.
 * Nunca confia no preço que vem da tela: só nas escolhas (tamanho e adicionais).
 */
import { type Banco } from "@erp/banco";
import { gruposDeAdicionaisPorId } from "./adicionais";
import { ErroDeRegra } from "./erros";
import { type Canal } from "./horarios-comum";
import { precoDoItem, type EscolhaDoItem, type PrecoDoItem } from "./produtos-comum";
import { produtoPorId } from "./produtos";

export async function calcularPrecoDoItem(
  trx: Banco,
  produtoId: number,
  canal: Canal,
  escolha: EscolhaDoItem,
): Promise<Extract<PrecoDoItem, { ok: true }>> {
  const produto = await produtoPorId(trx, produtoId);
  if (!produto) throw new ErroDeRegra("nao_encontrado", "Produto não encontrado.");
  const grupos = await gruposDeAdicionaisPorId(trx, produto.gruposAdicionais);
  const r = precoDoItem(produto, grupos, canal, escolha);
  if (!r.ok) throw new ErroDeRegra("dados_invalidos", r.motivo);
  return r;
}
