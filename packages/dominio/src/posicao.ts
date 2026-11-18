/**
 * Posição na lista (categorias e tipos de produção). A pessoa escolhe "em que lugar" o item
 * fica (1º, 2º...), vendo a lista que já existe; o sistema renumera a ordem dos ativos de
 * 10 em 10 (10, 20, 30...), sem a pessoa digitar número. Pedido do responsável, 17/11/2026.
 * Roda dentro da transação de quem grava: trava os ativos da tabela, então duas pessoas
 * mudando a posição ao mesmo tempo esperam uma pela outra.
 */
import { sql, type Banco } from "@erp/banco";

export type Reordenado = { id: number; antes: number; depois: number };

/** Põe `id` na posição `posicao` (1 = primeiro) entre os ativos e renumera. Devolve o que mudou. */
export async function reposicionar(trx: Banco, tabela: "categoria" | "tipo_producao", id: number, posicao: number): Promise<Reordenado[]> {
  const t = sql.table(tabela);
  const ativos = (await sql<{ id: number; ordem: number }>`SELECT id, ordem FROM ${t} WHERE ativo ORDER BY ordem, nome, id FOR UPDATE`.execute(trx)).rows;
  const resto = ativos.filter((a) => a.id !== id);
  const este = ativos.find((a) => a.id === id);
  if (!este) return []; // inativo: fica no fim, fora da conta
  const i = Math.min(Math.max(posicao - 1, 0), resto.length);
  const nova = [...resto.slice(0, i), este, ...resto.slice(i)];
  const mudou: Reordenado[] = [];
  for (const [k, a] of nova.entries()) {
    const depois = (k + 1) * 10;
    if (a.ordem !== depois) mudou.push({ id: a.id, antes: a.ordem, depois });
  }
  for (const m of mudou) await sql`UPDATE ${t} SET ordem = ${m.depois}, atualizado_em = now() WHERE id = ${m.id}`.execute(trx);
  return mudou;
}
