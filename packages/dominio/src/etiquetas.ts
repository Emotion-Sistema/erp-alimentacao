/**
 * Etiqueta com código em cada lote (ideia nº 16, versão 1; migração 0030; decisão 0029, seção
 * "Etiqueta do lote").
 *
 * O CÓDIGO de cada ingrediente e preparo (BAC = bacalhau) nasce sozinho no banco, por qualquer
 * caminho de cadastro (gatilho da 0030). Cada lote de compra, saldo inicial ou produção ganha a
 * ETIQUETA (BAC-002), também pelo banco. Aqui: trocar o código ou desligar a etiqueta no cadastro, e
 * achar um lote pela etiqueta escrita no pacote.
 */
import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { estoqueDoItem, exigirAlgumaArea } from "./estoque";
import { exigir, type Ator } from "./sessao";

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const MSG_CODIGO = "Use de 2 a 5 letras sem acento (pode ter número depois da primeira letra), como BAC.";
/** Mesma regra do banco: começa com letra; o resto letra ou número; 2 a 5. */
export const FORMATO_DO_CODIGO = /^[A-Z][A-Z0-9]{1,4}$/;
const FORMATO_DA_ETIQUETA = /^[A-Z][A-Z0-9]{1,4}-[0-9]{3,9}$/;

const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(2_147_483_647, msg);

const esquemaMudar = z
  .object(
    {
      ingredienteId: id("Ingrediente não encontrado.").optional(),
      preparoId: id("Preparo não encontrado.").optional(),
      // Aceita minúscula e espaço em volta (bac -> BAC); acento e outros sinais são recusados.
      codigo: z
        .string({ error: MSG_CODIGO })
        .transform((v) => v.trim().toUpperCase())
        .refine((v) => FORMATO_DO_CODIGO.test(v), MSG_CODIGO)
        .optional(),
      usaEtiqueta: z.boolean({ error: "Diga se o produto usa etiqueta." }).optional(),
    },
    { error: "Código da etiqueta em formato inválido." },
  )
  .strict("Código da etiqueta em formato inválido.")
  .refine((d) => (d.ingredienteId === undefined) !== (d.preparoId === undefined), "Escolha um ingrediente ou um preparo.")
  .refine((d) => d.codigo !== undefined || d.usaEtiqueta !== undefined, "Nada para mudar.");

export type CodigoDaEtiqueta = { ingredienteId: number | null; preparoId: number | null; codigo: string; usaEtiqueta: boolean };

/**
 * Troca o código do produto (BAC -> BCL) ou liga/desliga a etiqueta. Quem pode editar o cadastro.
 * Recusa código de outro produto (dizendo de quem é) e código que já foi impresso em etiqueta de lote
 * de outro produto (o pacote antigo ficaria com o mesmo começo). Lotes que já entraram mantêm a
 * etiqueta que têm; a numeração do código novo continua de onde parou.
 */
export async function mudarCodigoDaEtiqueta(db: Banco, ator: Ator | null, dados: unknown): Promise<CodigoDaEtiqueta> {
  const d = validar(esquemaMudar, dados);
  const alvo = d.ingredienteId !== undefined ? { tipo: "ingrediente", id: d.ingredienteId } : { tipo: "ficha", id: d.preparoId! };
  const quem = await exigir(db, ator, "cadastros.gerenciar", alvo);
  return db.transaction().execute(async (trx) => {
    // A mesma trava do cadastro novo: dois ao mesmo tempo não pegam o mesmo código.
    await sql`SELECT pg_advisory_xact_lock(hashtext('etiqueta:codigo'))`.execute(trx);
    const antes = await trx
      .selectFrom("etiqueta_produto")
      .selectAll()
      .$if(d.ingredienteId !== undefined, (q) => q.where("ingrediente_id", "=", d.ingredienteId!))
      .$if(d.preparoId !== undefined, (q) => q.where("preparo_id", "=", d.preparoId!))
      .forUpdate()
      .executeTakeFirst();
    if (!antes) throw new ErroDeRegra("nao_encontrado", d.ingredienteId !== undefined ? "Ingrediente não encontrado." : "Preparo não encontrado.");
    if (d.codigo !== undefined && d.codigo !== antes.codigo) {
      const dono = await sql<{ nome: string; tipo: string }>`
        SELECT coalesce(i.nome, f.nome) AS nome, CASE WHEN e.ingrediente_id IS NOT NULL THEN 'ingrediente' ELSE 'preparo' END AS tipo
        FROM etiqueta_produto e LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
        WHERE e.codigo = ${d.codigo}`.execute(trx);
      if (dono.rows[0])
        throw new ErroDeRegra("conflito", `O código ${d.codigo} já é do ${dono.rows[0].tipo} "${dono.rows[0].nome}". Escolha outro.`);
      // Já impresso em lote de OUTRO produto: o pacote antigo e o novo começariam igual.
      const impresso = await sql<{ nome: string }>`
        SELECT coalesce(i.nome, f.nome) AS nome
        FROM estoque_lote l JOIN estoque_item e ON e.id = l.item_id
        LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
        WHERE l.etiqueta LIKE ${d.codigo + "-%"}
          AND NOT (e.ingrediente_id IS NOT DISTINCT FROM ${antes.ingrediente_id}::int AND e.preparo_id IS NOT DISTINCT FROM ${antes.preparo_id}::int)
        LIMIT 1`.execute(trx);
      if (impresso.rows[0])
        throw new ErroDeRegra("conflito", `O código ${d.codigo} já foi usado nas etiquetas de "${impresso.rows[0].nome}". Escolha outro.`);
    }
    const depois = await trx
      .updateTable("etiqueta_produto")
      .set({
        ...(d.codigo !== undefined ? { codigo: d.codigo } : {}),
        ...(d.usaEtiqueta !== undefined ? { usa_etiqueta: d.usaEtiqueta } : {}),
        atualizado_em: new Date(),
        atualizado_por: quem.usuarioId,
      })
      .where("id", "=", antes.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const resultado = { ingredienteId: depois.ingrediente_id, preparoId: depois.preparo_id, codigo: depois.codigo, usaEtiqueta: depois.usa_etiqueta };
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "cadastros.gerenciar",
      resultado: "permitido",
      alvoTipo: "etiqueta_produto",
      alvoId: depois.id,
      detalhes: { operacao: "alterar", antes: { codigo: antes.codigo, usaEtiqueta: antes.usa_etiqueta }, depois: { codigo: resultado.codigo, usaEtiqueta: resultado.usaEtiqueta } },
      ip: quem.ip,
    });
    return resultado;
  });
}

export type LoteAchado = { itemId: number; ingredienteId: number | null; preparoId: number | null; nome: string; loteId: number; etiqueta: string };

/**
 * Acha o lote pela etiqueta escrita no pacote (BAC-002; aceita minúscula, espaço e sem o traço:
 * "bac 2", "BAC002"). Só acha o que a pessoa pode ver: o lote tem de ter saldo nas áreas dela (a
 * mesma regra da gaveta do item).
 */
export async function acharPelaEtiqueta(db: Banco, ator: Ator | null, texto: unknown): Promise<LoteAchado> {
  // Quem não cuida de nenhuma área é recusado antes de qualquer busca.
  await exigirAlgumaArea(db, ator);
  const etiqueta = normalizarEtiqueta(texto);
  if (!etiqueta) throw new ErroDeRegra("dados_invalidos", "Digite a etiqueta como está no pacote, por exemplo BAC-002.");
  const r = await sql<{ lote_id: number; item_id: number; ingrediente_id: number | null; preparo_id: number | null }>`
    SELECT l.id AS lote_id, l.item_id, e.ingrediente_id, e.preparo_id
    FROM estoque_lote l JOIN estoque_item e ON e.id = l.item_id
    WHERE l.etiqueta = ${etiqueta}`.execute(db);
  const achado = r.rows[0];
  const naoAchou = new ErroDeRegra("nao_encontrado", `Nenhum lote com a etiqueta ${etiqueta} no seu estoque.`);
  // Mesma resposta para "não existe" e "não é seu" (não revela o que há nas outras áreas).
  if (!achado) throw naoAchou;
  let item;
  try {
    item = await estoqueDoItem(db, ator, achado.ingrediente_id !== null ? { ingredienteId: achado.ingrediente_id } : { preparoId: achado.preparo_id });
  } catch (e) {
    if (e instanceof ErroDeRegra && (e.codigo === "sem_permissao" || e.codigo === "nao_encontrado")) throw naoAchou;
    throw e;
  }
  if (!item.lotes.some((l) => l.loteId === achado.lote_id)) throw naoAchou;
  return { itemId: achado.item_id, ingredienteId: achado.ingrediente_id, preparoId: achado.preparo_id, nome: item.nome, loteId: achado.lote_id, etiqueta };
}

/** "bac 2", "BAC002", " bac-0002 " -> BAC-002 (número com pelo menos 3 dígitos). Nulo se não parece etiqueta. */
export function normalizarEtiqueta(texto: unknown): string | null {
  if (typeof texto !== "string" || texto.length > 40) return null;
  const m = /^([A-Z][A-Z0-9]{1,4}?)[\s-]*([0-9]{1,9})$/.exec(texto.trim().toUpperCase());
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  const e = `${m[1]}-${n < 1000 ? String(n).padStart(3, "0") : String(n)}`;
  return FORMATO_DA_ETIQUETA.test(e) ? e : null;
}
