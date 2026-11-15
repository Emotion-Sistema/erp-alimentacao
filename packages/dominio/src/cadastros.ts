/**
 * Cadastros da E07, parte 1 (decisão 0015): fornecedores, ingredientes e conversões.
 * Quantidade é decimal exato (texto "1234.5678"), nunca float. A conta de conversão é uma só,
 * no banco (função para_unidade_base). Nada se apaga: desativa (RC-17). Toda mudança fica na
 * auditoria com o antes e o depois.
 */
import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { exigir, type Ator } from "./sessao";

export const UNIDADES_BASE = ["g", "ml", "un"] as const;
export type UnidadeBase = (typeof UNIDADES_BASE)[number];
export const NOME_DA_UNIDADE_BASE: Readonly<Record<UnidadeBase, string>> = { g: "gramas (g)", ml: "mililitros (ml)", un: "unidades (un)" };

/** Áreas de estoque e quem cuida de cada uma (RC-09 seção 4, decisão 0008). */
export const AREAS_ESTOQUE = ["cozinha", "bebidas_salao", "cafeteria", "sorvete"] as const;
export type AreaEstoque = (typeof AREAS_ESTOQUE)[number];
export const NOME_DA_AREA: Readonly<Record<AreaEstoque, string>> = {
  cozinha: "Alimentos da cozinha",
  bebidas_salao: "Bebidas do salão",
  cafeteria: "Cafeteria",
  sorvete: "Potes de sorvete (60 Sabores)",
};

// ---------- validações ----------

/** Decimal positivo com até 4 casas, vírgula ou ponto ("1,5" -> "1.5"). Nunca passa por float. */
export const decimalPositivo = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(",", "."))
  .refine((v) => /^\d{1,10}(\.\d{1,4})?$/.test(v) && /[1-9]/.test(v), "Use um número maior que zero, com até 4 casas depois da vírgula.");

function digitosOk(d: string, pesos: number[]): boolean {
  const n = pesos.length;
  const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const resto = soma % 11;
  return Number(d[n]) === (resto < 2 ? 0 : 11 - resto);
}
/** CPF ou CNPJ com os dígitos verificadores certos. Recebe só dígitos. */
export function documentoValido(d: string): boolean {
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) return digitosOk(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) && digitosOk(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d.length === 14)
    return digitosOk(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) && digitosOk(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return false;
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

const nome = (rotulo: string) => z.string({ error: `Informe o nome ${rotulo}.` }).trim().min(2, `O nome ${rotulo} precisa de pelo menos 2 letras.`).max(120);

export const dadosFornecedor = z.object({
  id: z.number().int().positive().optional(),
  nome: nome("do fornecedor"),
  documento: z
    .string()
    .nullish()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || documentoValido(v), "CPF ou CNPJ inválido (confira os números)."),
  contato: textoOpcional(120),
  telefone: textoOpcional(30),
  email: textoOpcional(200).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  prazoEntregaDias: z.number().int().min(0).max(90, "Prazo de 0 a 90 dias.").nullish().transform((v) => v ?? null),
  observacao: textoOpcional(500),
  ativo: z.boolean().default(true),
});

export const dadosIngrediente = z.object({
  id: z.number().int().positive().optional(),
  nome: nome("do ingrediente"),
  /** Só na criação; depois não muda. */
  unidadeBase: z.enum(UNIDADES_BASE, { error: "Escolha a unidade do estoque: g, ml ou un." }).optional(),
  area: z.enum(AREAS_ESTOQUE, { error: "Escolha a área de estoque." }),
  fornecedorId: z.number().int().positive().nullish().transform((v) => v ?? null),
  ativo: z.boolean().default(true),
});

export const dadosConversao = z.object({
  id: z.number().int().positive().optional(),
  nome: z.string({ error: "Informe a unidade de compra (ex.: caixa)." }).trim().min(1, "Informe a unidade de compra (ex.: caixa).").max(40),
  quantidadeBase: decimalPositivo,
  ativo: z.boolean().default(true),
});

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", p.error.issues.map((i) => i.message).join(" "));
  return p.data;
}

/** Traduz recusas do banco em mensagens de regra (nome repetido, equivalência errada...). */
function traduzir(e: unknown, repetido: string): never {
  const erro = e as { code?: string; message?: string };
  if (erro.code === "23505") throw new ErroDeRegra("conflito", repetido);
  if (erro.code === "23514" && erro.message && !erro.message.includes("violates check constraint"))
    throw new ErroDeRegra("dados_invalidos", erro.message);
  if (erro.code === "23503") throw new ErroDeRegra("dados_invalidos", "Fornecedor ou ingrediente não encontrado.");
  throw e;
}

/** "1030.0000" -> "1030"; "0.2500" -> "0.25". Só para mostrar; o banco guarda o exato. */
export function decimalLimpo(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

// ---------- fornecedores ----------

export type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  prazoEntregaDias: number | null;
  observacao: string | null;
  ativo: boolean;
};

const colunasFornecedor = [
  "id",
  "nome",
  "documento",
  "contato",
  "telefone",
  "email",
  "prazo_entrega_dias as prazoEntregaDias",
  "observacao",
  "ativo",
] as const;

export async function listarFornecedores(db: Banco, ator: Ator | null): Promise<Fornecedor[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "fornecedor" });
  return db.selectFrom("fornecedor").select(colunasFornecedor).orderBy("ativo", "desc").orderBy(sql`lower(nome)`).execute();
}

/** Cria (sem id) ou altera (com id) um fornecedor. */
export async function salvarFornecedor(db: Banco, ator: Ator | null, dados: unknown): Promise<Fornecedor> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "fornecedor" });
  const d = validar(dadosFornecedor, dados);
  const valores = {
    nome: d.nome,
    documento: d.documento,
    contato: d.contato,
    telefone: d.telefone,
    email: d.email,
    prazo_entrega_dias: d.prazoEntregaDias,
    observacao: d.observacao,
    ativo: d.ativo,
  };
  try {
    return await db.transaction().execute(async (trx) => {
      let antes: Fornecedor | undefined;
      let salvo: Fornecedor | undefined;
      if (d.id) {
        antes = await trx.selectFrom("fornecedor").select(colunasFornecedor).where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Fornecedor não encontrado.");
        salvo = await trx
          .updateTable("fornecedor")
          .set({ ...valores, atualizado_em: sql`now()` })
          .where("id", "=", d.id)
          .returning(colunasFornecedor)
          .executeTakeFirstOrThrow();
      } else {
        salvo = await trx.insertInto("fornecedor").values(valores).returning(colunasFornecedor).executeTakeFirstOrThrow();
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "fornecedor",
        alvoId: salvo.id,
        detalhes: { operacao: d.id ? "alterar" : "criar", antes: antes ?? null, depois: salvo },
        ip: quem.ip,
      });
      return salvo;
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    traduzir(e, (e as { constraint?: string }).constraint === "fornecedor_documento" ? "Já existe um fornecedor com esse CPF ou CNPJ." : "Já existe um fornecedor com esse nome.");
  }
}

// ---------- ingredientes e conversões ----------

export type Conversao = { id: number; nome: string; quantidadeBase: string; ativo: boolean };
export type Ingrediente = {
  id: number;
  nome: string;
  unidadeBase: UnidadeBase;
  area: AreaEstoque;
  fornecedorId: number | null;
  fornecedor: string | null;
  ativo: boolean;
  conversoes: Conversao[];
};

export type UnidadePadrao = { codigo: string; nome: string; grandeza: string; fator: string };

export async function listarIngredientes(
  db: Banco,
  ator: Ator | null,
): Promise<{ ingredientes: Ingrediente[]; unidades: UnidadePadrao[] }> {
  await exigir(db, ator, "cadastros.ver", { tipo: "ingrediente" });
  const linhas = await db
    .selectFrom("ingrediente as i")
    .leftJoin("fornecedor as f", "f.id", "i.fornecedor_id")
    .select(["i.id", "i.nome", "i.unidade_base", "i.area_estoque", "i.fornecedor_id", "f.nome as fornecedor", "i.ativo"])
    .orderBy("i.ativo", "desc")
    .orderBy(sql`lower(i.nome)`)
    .execute();
  const conversoes = await db
    .selectFrom("ingrediente_conversao")
    .select(["id", "ingrediente_id", "nome", "quantidade_base", "ativo"])
    .orderBy("ativo", "desc")
    .orderBy(sql`lower(nome)`)
    .execute();
  const unidades = await db.selectFrom("unidade_medida").select(["codigo", "nome", "grandeza", "fator"]).orderBy("grandeza").orderBy("fator").execute();
  return {
    ingredientes: linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      unidadeBase: l.unidade_base,
      area: l.area_estoque,
      fornecedorId: l.fornecedor_id,
      fornecedor: l.fornecedor,
      ativo: l.ativo,
      conversoes: conversoes
        .filter((c) => c.ingrediente_id === l.id)
        .map((c) => ({ id: c.id, nome: c.nome, quantidadeBase: decimalLimpo(c.quantidade_base), ativo: c.ativo })),
    })),
    unidades: unidades.map((u) => ({ ...u, fator: decimalLimpo(u.fator) })),
  };
}

/** Cria (sem id, com unidadeBase) ou altera (com id) um ingrediente. A unidade base não muda. */
export async function salvarIngrediente(db: Banco, ator: Ator | null, dados: unknown): Promise<{ id: number }> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente" });
  const d = validar(dadosIngrediente, dados);
  if (!d.id && !d.unidadeBase) throw new ErroDeRegra("dados_invalidos", "Escolha a unidade do estoque: g, ml ou un.");
  const colunas = ["id", "nome", "unidade_base", "area_estoque", "fornecedor_id", "ativo"] as const;
  try {
    return await db.transaction().execute(async (trx) => {
      if (d.fornecedorId) {
        const f = await trx.selectFrom("fornecedor").select("ativo").where("id", "=", d.fornecedorId).executeTakeFirst();
        if (!f) throw new ErroDeRegra("dados_invalidos", "Fornecedor não encontrado.");
        if (!f.ativo) throw new ErroDeRegra("dados_invalidos", "Esse fornecedor está desativado.");
      }
      const valores = { nome: d.nome, area_estoque: d.area, fornecedor_id: d.fornecedorId, ativo: d.ativo };
      let antes: Record<string, unknown> | undefined;
      let salvo;
      if (d.id) {
        antes = await trx.selectFrom("ingrediente").select(colunas).where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
        if (d.unidadeBase && d.unidadeBase !== antes.unidade_base)
          throw new ErroDeRegra("dados_invalidos", "A unidade do estoque não muda depois de criada. Desative o ingrediente e cadastre outro.");
        salvo = await trx
          .updateTable("ingrediente")
          .set({ ...valores, atualizado_em: sql`now()` })
          .where("id", "=", d.id)
          .returning(colunas)
          .executeTakeFirstOrThrow();
      } else {
        salvo = await trx
          .insertInto("ingrediente")
          .values({ ...valores, unidade_base: d.unidadeBase! })
          .returning(colunas)
          .executeTakeFirstOrThrow();
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "ingrediente",
        alvoId: salvo.id,
        detalhes: { operacao: d.id ? "alterar" : "criar", antes: antes ?? null, depois: salvo },
        ip: quem.ip,
      });
      return { id: salvo.id };
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    traduzir(e, "Já existe um ingrediente com esse nome.");
  }
}

/** Cria (sem id) ou altera (com id) uma conversão de compra de um ingrediente. */
export async function salvarConversao(db: Banco, ator: Ator | null, ingredienteId: number, dados: unknown): Promise<Conversao> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente", id: ingredienteId });
  const d = validar(dadosConversao, dados);
  try {
    return await db.transaction().execute(async (trx) => {
      const ing = await trx.selectFrom("ingrediente").select(["id", "unidade_base"]).where("id", "=", ingredienteId).executeTakeFirst();
      if (!ing) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
      const colunas = ["id", "nome", "quantidade_base", "ativo"] as const;
      const valores = { nome: d.nome, quantidade_base: d.quantidadeBase, ativo: d.ativo };
      let antes: Record<string, unknown> | undefined;
      let salvo;
      if (d.id) {
        antes = await trx
          .selectFrom("ingrediente_conversao")
          .select(colunas)
          .where("id", "=", d.id)
          .where("ingrediente_id", "=", ingredienteId)
          .forUpdate()
          .executeTakeFirst();
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Conversão não encontrada.");
        salvo = await trx
          .updateTable("ingrediente_conversao")
          .set({ ...valores, atualizado_em: sql`now()` })
          .where("id", "=", d.id)
          .returning(colunas)
          .executeTakeFirstOrThrow();
      } else {
        salvo = await trx
          .insertInto("ingrediente_conversao")
          .values({ ...valores, ingrediente_id: ingredienteId })
          .returning(colunas)
          .executeTakeFirstOrThrow();
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "ingrediente",
        alvoId: ingredienteId,
        detalhes: { operacao: d.id ? "alterar_conversao" : "criar_conversao", unidadeBase: ing.unidade_base, antes: antes ?? null, depois: salvo },
        ip: quem.ip,
      });
      return { id: salvo.id, nome: salvo.nome, quantidadeBase: decimalLimpo(salvo.quantidade_base), ativo: salvo.ativo };
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    traduzir(e, "Esse ingrediente já tem uma conversão com esse nome.");
  }
}

/**
 * Quanto `quantidade` `unidade` vale na unidade base do ingrediente (texto decimal exato).
 * Sem caminho de conversão, recusa com a explicação (nunca chuta). Usada pela importação de
 * planilha, pela compra e pela ficha técnica.
 */
export async function converterParaBase(db: Banco, ingredienteId: number, quantidade: string | number, unidade: string): Promise<string> {
  const q = validar(decimalPositivo, quantidade);
  try {
    const r = await sql<{ v: string }>`SELECT para_unidade_base(${ingredienteId}, ${q}::numeric, ${unidade})::text AS v`.execute(db);
    return decimalLimpo(r.rows[0]!.v);
  } catch (e) {
    const erro = e as { code?: string; message?: string };
    if (erro.code === "22023" || erro.code === "P0002") throw new ErroDeRegra("dados_invalidos", erro.message ?? "Conversão impossível.");
    throw e;
  }
}
