/**
 * Catálogo de embalagens (ideia nº 6, migração 0009, decisão 0015 item 10). Modelo = tipo +
 * tamanho opcional ("saco 25 kg", "caixa 12 un", "caixa"), com fornecedor opcional (vira o padrão
 * dele). No ingrediente, a embalagem continua sendo a conversão; `salvarConversao` aceita
 * `modeloId` e faz a conta sozinho quando o tamanho é da mesma família do estoque.
 * Nada se apaga (desativa); tudo na auditoria com antes e depois.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { exigir, type Ator } from "./sessao";

export type ModeloDeEmbalagem = {
  id: number;
  tipo: string;
  /** Texto decimal exato ("25", "2.5") ou nulo quando o modelo não tem tamanho. */
  tamanho: string | null;
  unidade: string | null;
  nome: string;
  fornecedorId: number | null;
  fornecedor: string | null;
  ativo: boolean;
  /** Quantos ingredientes ativos usam este modelo. */
  emUso: number;
};

const limpo = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);

const dadosModelo = z
  .object({
    id: z.number().int().positive().optional(),
    tipo: z
      .string({ error: "Informe o tipo da embalagem (ex.: saco)." })
      .trim()
      .transform((v) => v.replace(/\s+/g, " "))
      .pipe(
        z
          .string()
          .min(2, "O tipo precisa de pelo menos 2 letras (ex.: saco).")
          .max(24, "Tipo com no máximo 24 letras.")
          .refine((v) => /\p{L}/u.test(v) && !/[0-9\p{Cc}]/u.test(v), "O tipo é só a palavra (ex.: saco); o tamanho vai no campo ao lado."),
      ),
    tamanho: z
      .string()
      .trim()
      .transform((v) => v.replace(",", "."))
      .refine((v) => v === "" || /^\d{1,7}(\.\d{1,4})?$/.test(v), "Tamanho: número com até 4 casas (ex.: 25 ou 2,5).")
      .nullish()
      .transform((v) => (v ? v : null)),
    unidade: z.string().trim().min(1).max(10).nullish().transform((v) => v ?? null),
    fornecedorId: z.number().int().positive().nullish().transform((v) => v ?? null),
    ativo: z.boolean().default(true),
  })
  .refine((d) => (d.tamanho === null) === (d.unidade === null), "Tamanho e unidade andam juntos: informe os dois ou nenhum.");

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", p.error.issues.map((i) => i.message).join(" "));
  return p.data;
}

export async function listarModelosDeEmbalagem(db: Banco, ator: Ator | null): Promise<ModeloDeEmbalagem[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "embalagem_modelo" });
  const linhas = await db
    .selectFrom("embalagem_modelo as m")
    .leftJoin("fornecedor as f", "f.id", "m.fornecedor_id")
    .select([
      "m.id",
      "m.tipo",
      sql<string | null>`m.tamanho::text`.as("tamanho"),
      "m.unidade",
      "m.nome",
      "m.fornecedor_id",
      "f.nome as fornecedor",
      "m.ativo",
      sql<number>`(SELECT count(*)::int FROM ingrediente_conversao c JOIN ingrediente i ON i.id = c.ingrediente_id
                   WHERE c.modelo_id = m.id AND c.ativo AND i.ativo)`.as("em_uso"),
    ])
    .orderBy("m.ativo", "desc")
    .orderBy("m.tipo")
    .orderBy(sql`m.tamanho NULLS FIRST`)
    .orderBy("m.id")
    .execute();
  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    tamanho: l.tamanho === null ? null : limpo(l.tamanho),
    unidade: l.unidade,
    nome: l.nome,
    fornecedorId: l.fornecedor_id,
    fornecedor: l.fornecedor,
    ativo: l.ativo,
    emUso: l.em_uso,
  }));
}

/** Cria (sem id) ou altera (com id) um modelo. Tipo e tamanho não mudam se já está em uso. */
export async function salvarModeloDeEmbalagem(db: Banco, ator: Ator | null, dados: unknown): Promise<ModeloDeEmbalagem> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "embalagem_modelo" });
  const d = validar(dadosModelo, dados);
  const colunas = ["id", "tipo", "tamanho", "unidade", "nome", "fornecedor_id", "ativo"] as const;
  try {
    const id = await db.transaction().execute(async (trx) => {
      // O tipo não pode ser uma unidade ("kg", "litro"): viraria uma equivalência errada no ingrediente.
      const ehUnidade = await sql<{ c: string | null }>`SELECT (unidade_padrao(${d.tipo})).codigo AS c`.execute(trx);
      if (ehUnidade.rows[0]?.c) throw new ErroDeRegra("dados_invalidos", `"${d.tipo}" é uma unidade, não um tipo de embalagem. Use saco, caixa, pacote...`);
      let unidade: string | null = null;
      if (d.unidade) {
        const u = await sql<{ c: string | null }>`SELECT (unidade_padrao(${d.unidade})).codigo AS c`.execute(trx);
        unidade = u.rows[0]?.c ?? null;
        if (!unidade) throw new ErroDeRegra("dados_invalidos", "Unidade do tamanho desconhecida. Use kg, g, L, ml, un ou dz.");
      }
      if (d.fornecedorId) {
        const f = await trx.selectFrom("fornecedor").select("ativo").where("id", "=", d.fornecedorId).forShare().executeTakeFirst();
        if (!f) throw new ErroDeRegra("dados_invalidos", "Fornecedor não encontrado.");
        if (!f.ativo) throw new ErroDeRegra("dados_invalidos", "Esse fornecedor está desativado.");
      }
      const valores = { tipo: d.tipo.toLowerCase(), tamanho: d.tamanho, unidade, fornecedor_id: d.fornecedorId, ativo: d.ativo };
      let antes: Record<string, unknown> | undefined;
      let salvo;
      if (d.id) {
        antes = await trx.selectFrom("embalagem_modelo").select(colunas).where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Embalagem não encontrada.");
        salvo = await trx
          .updateTable("embalagem_modelo")
          .set({ ...valores, atualizado_em: sql`now()` })
          .where("id", "=", d.id)
          .returning(colunas)
          .executeTakeFirstOrThrow();
      } else {
        salvo = await trx.insertInto("embalagem_modelo").values(valores).returning(colunas).executeTakeFirstOrThrow();
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "embalagem_modelo",
        alvoId: salvo.id,
        detalhes: { operacao: d.id ? "alterar" : "criar", antes: antes ?? null, depois: salvo },
        ip: quem.ip,
      });
      return salvo.id;
    });
    return (await listarModelosDeEmbalagem(db, ator)).find((m) => m.id === id)!;
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    const erro = e as { code?: string; message?: string; constraint?: string };
    if (erro.code === "23505") throw new ErroDeRegra("conflito", "Essa embalagem já existe no catálogo (para esse fornecedor).");
    if (erro.code === "23514" && erro.message && !erro.constraint) throw new ErroDeRegra("dados_invalidos", erro.message);
    if (erro.code === "23514" && erro.constraint === "embalagem_modelo_nome_curto")
      throw new ErroDeRegra("dados_invalidos", "Nome da embalagem longo demais: encurte o tipo.");
    if (erro.code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum valor está fora do permitido. Confira os campos.");
    if (erro.code === "22003") throw new ErroDeRegra("nao_encontrado", "Cadastro não encontrado.");
    throw e;
  }
}
