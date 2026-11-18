/**
 * Posição na lista (categorias e tipos de produção). A pessoa escolhe "em que lugar" o item
 * fica (1º, 2º...), vendo a lista que já existe; o sistema renumera a ordem dos ativos de
 * 10 em 10 (10, 20, 30...), sem a pessoa digitar número. Pedido do responsável, 17/11/2026.
 * Concorrência: toda gravação dessas tabelas chama `travarLista` como PRIMEIRO comando da
 * transação. É uma trava única por tabela (advisory lock), então duas gravações esperam uma pela
 * outra sem deadlock e a segunda lê a lista já com a mudança da primeira.
 * Auditoria: a renumeração fica em `detalhes.reordenados` ({id, antes, depois}) do registro do
 * item gravado; para saber por que um item mudou de lugar, procure o id dele nesse campo.
 */
import { sql, type Banco } from "@erp/banco";

export type Reordenado = { id: number; antes: number; depois: number };

const TABELAS = ["categoria", "tipo_producao"] as const;
type Tabela = (typeof TABELAS)[number];
function conferir(tabela: Tabela) {
  if (!TABELAS.includes(tabela)) throw new Error(`tabela sem posição: ${String(tabela)}`);
}

/** Primeiro comando da transação de qualquer gravação de `tabela`. */
export async function travarLista(trx: Banco, tabela: Tabela): Promise<void> {
  conferir(tabela);
  await sql`SELECT pg_advisory_xact_lock(hashtext(${"posicao:" + tabela}))`.execute(trx);
}

/**
 * Posição que vale nesta gravação: a escolhida; senão, no fim para item novo ou reativado
 * (quando não veio `ordem` explícita); senão, nenhuma (a lista não muda).
 */
export function posicaoDaGravacao(d: { posicao?: number; ordem?: number }, antes: { ativo: boolean } | undefined, depoisAtivo: boolean): number | undefined {
  if (d.posicao !== undefined) return d.posicao;
  if (d.ordem !== undefined || !depoisAtivo) return undefined;
  if (!antes || !antes.ativo) return Number.MAX_SAFE_INTEGER;
  return undefined;
}

/** Põe `id` na posição `posicao` (1 = primeiro) entre os ativos e renumera. Devolve o que mudou. */
export async function reposicionar(trx: Banco, tabela: Tabela, id: number, posicao: number): Promise<Reordenado[]> {
  conferir(tabela);
  const t = sql.table(tabela);
  const ativos = (await sql<{ id: number; ordem: number }>`SELECT id, ordem FROM ${t} WHERE ativo ORDER BY ordem, nome, id FOR NO KEY UPDATE`.execute(trx)).rows;
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
