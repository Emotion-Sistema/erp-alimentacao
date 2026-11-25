import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { aplicarNumeros, MESAS_DA_LOJA, type Mesa } from "./mesas";
import type { Acao } from "./permissoes";
import { exigir, type Ator } from "./sessao";

/**
 * Número de cada mesa (pedido do responsável, 25/11/2026: "supervisor e acima escolhem o número das
 * mesas"). A mesa é sempre a mesma pelo código (a posição na loja); o número é o nome na tela.
 */

async function numerosGravados(db: Banco, unidadeId: number): Promise<Record<string, number>> {
  const linhas = await db.selectFrom("mesa_numero").select(["codigo", "numero"]).where("unidade_id", "=", unidadeId).execute();
  return Object.fromEntries(linhas.map((l) => [l.codigo, l.numero]));
}

/** As mesas da unidade de quem está dentro, com os números escolhidos. `acao`: a da tela que mostra. */
export async function mesasDaUnidade(db: Banco, ator: Ator | null, acao: Acao): Promise<Mesa[]> {
  const a = await exigir(db, ator, acao, { tipo: "mesa" });
  if (a.unidadeId === null) return aplicarNumeros({});
  return aplicarNumeros(await numerosGravados(db, a.unidadeId));
}

const esquema = z
  .object({ numeros: z.record(z.string().max(20), z.number().int().min(1).max(999)) })
  .strict();

/**
 * Grava o número de TODAS as mesas de uma vez (código -> número). Recusa número repetido, mesa
 * desconhecida ou faltando. Dá para trocar dois números entre si. Fica na auditoria o que mudou.
 */
export async function numerarMesas(db: Banco, ator: Ator | null, dados: unknown): Promise<Mesa[]> {
  const a = await exigir(db, ator, "mesas.numerar", { tipo: "mesa" });
  if (a.unidadeId === null) throw new ErroDeRegra("sem_permissao", "Seu cargo não está ligado a nenhuma loja.");
  const lido = esquema.safeParse(dados);
  if (!lido.success) throw new ErroDeRegra("dados_invalidos", "Cada mesa precisa de um número inteiro de 1 a 999.");
  const numeros = lido.data.numeros;
  const codigos = MESAS_DA_LOJA.map((m) => m.codigo);
  const desconhecida = Object.keys(numeros).find((c) => !codigos.includes(c));
  if (desconhecida) throw new ErroDeRegra("dados_invalidos", "Essa mesa não existe no mapa da loja.");
  const faltando = MESAS_DA_LOJA.find((m) => numeros[m.codigo] === undefined);
  if (faltando) throw new ErroDeRegra("dados_invalidos", `Falta o número de uma mesa (a que hoje é a ${faltando.numero}).`);
  const vistos = new Map<number, string>();
  for (const c of codigos) {
    const n = numeros[c]!;
    if (vistos.has(n)) throw new ErroDeRegra("conflito", `O número ${n} está em duas mesas. Cada mesa precisa de um número diferente.`);
    vistos.set(n, c);
  }
  const unidadeId = a.unidadeId;
  return db.transaction().execute(async (t) => {
    // Uma numeração de cada vez por loja: duas pessoas gravando juntas não se misturam.
    await sql`SELECT pg_advisory_xact_lock(hashtext('mesa_numero'), ${unidadeId})`.execute(t);
    const antes = aplicarNumeros(await numerosGravados(t, unidadeId));
    const mudou = antes.filter((m) => numeros[m.codigo] !== m.numero);
    if (mudou.length > 0) {
      await t
        .insertInto("mesa_numero")
        .values(codigos.map((c) => ({ unidade_id: unidadeId, codigo: c, numero: numeros[c]!, atualizado_por: a.usuarioId })))
        .onConflict((oc) =>
          oc.columns(["unidade_id", "codigo"]).doUpdateSet((e) => ({
            numero: e.ref("excluded.numero"),
            atualizado_por: e.ref("excluded.atualizado_por"),
            atualizado_em: sql`now()`,
          })),
        )
        .execute();
      await auditar(t, {
        usuarioId: a.usuarioId,
        acao: "mesas.numerar",
        resultado: "permitido",
        alvoTipo: "mesa",
        detalhes: { mudancas: mudou.map((m) => ({ mesa: m.codigo, de: m.numero, para: numeros[m.codigo] })) },
        ip: a.ip,
      });
    }
    return aplicarNumeros(numeros);
  });
}
