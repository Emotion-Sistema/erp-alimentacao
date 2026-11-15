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
import { pode } from "./permissoes";
import { exigir, type Ator } from "./sessao";
import { NOME_DA_FAMILIA, UNIDADES_PARA_MOSTRAR, baseDaUnidade, opcoesDaBase, type UnidadeParaMostrar } from "./unidades-do-estoque";

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
  endereco: textoOpcional(300),
  ativo: z.boolean().default(true),
});

export const dadosIngrediente = z.object({
  id: z.number().int().positive().optional(),
  nome: nome("do ingrediente"),
  /** Só na criação; depois não muda. */
  unidadeBase: z.enum(UNIDADES_BASE, { error: "Escolha a unidade do estoque: kg, g, L, ml, un ou dz." }).optional(),
  /** Como ver e informar as quantidades (ideia nº 5): kg ou g, L ou ml, un ou dz. */
  unidadeExibicao: z.enum(UNIDADES_PARA_MOSTRAR, { error: "Escolha a unidade: kg, g, L, ml, un ou dz." }).optional(),
  area: z.enum(AREAS_ESTOQUE, { error: "Escolha a área de estoque." }),
  fornecedorId: z.number().int().positive().nullish().transform((v) => v ?? null),
  ativo: z.boolean().default(true),
});

export const dadosConversao = z.object({
  id: z.number().int().positive().optional(),
  nome: z
    .string({ error: "Informe a unidade de compra (ex.: caixa)." })
    .trim()
    .min(1, "Informe a unidade de compra (ex.: caixa).")
    .max(40)
    .refine((v) => /[\p{L}\p{N}]/u.test(v), "O nome da unidade de compra precisa ter letras ou números."),
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
  // Gatilho da regra (sem nome de restrição): a mensagem dele é para a pessoa. Restrição do
  // esquema (com nome): mensagem genérica, sem expor nome interno (e sem depender do idioma do banco).
  if (erro.code === "23514" && erro.message && !(erro as { constraint?: string }).constraint) throw new ErroDeRegra("dados_invalidos", erro.message);
  if (erro.code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum valor está fora do permitido. Confira os campos.");
  if (erro.code === "23503") throw new ErroDeRegra("dados_invalidos", "Fornecedor ou ingrediente não encontrado.");
  if (erro.code === "22003") throw new ErroDeRegra("nao_encontrado", "Cadastro não encontrado.");
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
  endereco: string | null;
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
  "endereco",
  "ativo",
] as const;

/**
 * Quem só vê cadastros (cozinheira, supervisor, financeiro) recebe nome, prazo e situação:
 * CPF, telefone, e-mail e contato podem ser de pessoa física e ficam com quem gerencia.
 */
export async function listarFornecedores(db: Banco, ator: Ator | null): Promise<Fornecedor[]> {
  const quem = await exigir(db, ator, "cadastros.ver", { tipo: "fornecedor" });
  const todos = await db.selectFrom("fornecedor").select(colunasFornecedor).orderBy("ativo", "desc").orderBy(sql`lower(nome)`).execute();
  if (pode(quem.cargoAtivo, "cadastros.gerenciar")) return todos;
  return todos.map((f) => ({ ...f, documento: null, contato: null, telefone: null, email: null, observacao: null, endereco: null }));
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
    endereco: d.endereco,
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

export type Conversao = { id: number; nome: string; quantidadeBase: string; ativo: boolean; modeloId?: number | null };
export type Ingrediente = {
  id: number;
  nome: string;
  unidadeBase: UnidadeBase;
  unidadeExibicao: UnidadeParaMostrar;
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
    .select(["i.id", "i.nome", "i.unidade_base", "i.unidade_exibicao", "i.area_estoque", "i.fornecedor_id", "f.nome as fornecedor", "i.ativo"])
    .orderBy("i.ativo", "desc")
    .orderBy(sql`lower(i.nome)`)
    .execute();
  const conversoes = await db
    .selectFrom("ingrediente_conversao")
    .select(["id", "ingrediente_id", "nome", "quantidade_base", "ativo", "modelo_id"])
    .orderBy("ativo", "desc")
    .orderBy(sql`lower(nome)`)
    .execute();
  const unidades = await db.selectFrom("unidade_medida").select(["codigo", "nome", "grandeza", "fator"]).orderBy("grandeza").orderBy("fator").execute();
  return {
    ingredientes: linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      unidadeBase: l.unidade_base,
      unidadeExibicao: l.unidade_exibicao,
      area: l.area_estoque,
      fornecedorId: l.fornecedor_id,
      fornecedor: l.fornecedor,
      ativo: l.ativo,
      conversoes: conversoes
        .filter((c) => c.ingrediente_id === l.id)
        .map((c) => ({ id: c.id, nome: c.nome, quantidadeBase: decimalLimpo(c.quantidade_base), ativo: c.ativo, modeloId: c.modelo_id })),
    })),
    unidades: unidades.map((u) => ({ ...u, fator: decimalLimpo(u.fator) })),
  };
}

/** Cria (sem id, com unidadeBase) ou altera (com id) um ingrediente. A unidade base não muda. */
export async function salvarIngrediente(db: Banco, ator: Ator | null, dados: unknown): Promise<{ id: number }> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente" });
  const d = validar(dadosIngrediente, dados);
  const baseNova = d.unidadeBase ?? (d.id ? undefined : d.unidadeExibicao && baseDaUnidade(d.unidadeExibicao));
  if (!d.id && !baseNova) throw new ErroDeRegra("dados_invalidos", "Escolha a unidade do estoque: kg, g, L, ml, un ou dz.");
  if (!d.id) conferirFamilia(baseNova!, d.unidadeExibicao);
  const colunas = ["id", "nome", "unidade_base", "unidade_exibicao", "area_estoque", "fornecedor_id", "ativo"] as const;
  try {
    return await db.transaction().execute(async (trx) => {
      if (d.fornecedorId) {
        // FOR SHARE: ninguém desativa o fornecedor enquanto este ingrediente é ligado a ele.
        const f = await trx.selectFrom("fornecedor").select("ativo").where("id", "=", d.fornecedorId).forShare().executeTakeFirst();
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
        conferirFamilia(antes.unidade_base as UnidadeBase, d.unidadeExibicao);
        salvo = await trx
          .updateTable("ingrediente")
          .set({ ...valores, ...(d.unidadeExibicao ? { unidade_exibicao: d.unidadeExibicao } : {}), atualizado_em: sql`now()` })
          .where("id", "=", d.id)
          .returning(colunas)
          .executeTakeFirstOrThrow();
      } else {
        salvo = await trx
          .insertInto("ingrediente")
          .values({ ...valores, unidade_base: baseNova!, unidade_exibicao: d.unidadeExibicao ?? baseNova! })
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

/** A unidade para mostrar tem de ser da mesma família da unidade do estoque (kg com g, L com ml, dz com un). */
function conferirFamilia(base: UnidadeBase, exibicao: UnidadeParaMostrar | undefined): void {
  if (!exibicao || baseDaUnidade(exibicao) === base) return;
  const certas = opcoesDaBase(base).map((o) => o.sigla).join(" ou ");
  throw new ErroDeRegra("dados_invalidos", `Este ingrediente conta em ${NOME_DA_FAMILIA[base]}: escolha ${certas}.`);
}

/** Cria (sem id) ou altera (com id) uma conversão de compra de um ingrediente. */
const dadosDoModelo = z.object({
  modeloId: z.number({ error: "Escolha a embalagem do catálogo." }).int().positive(),
  /** Só quando o tamanho do modelo não é da mesma família do estoque (ou não tem tamanho). */
  quantidadeBase: decimalPositivo.optional(),
});

/**
 * Cria (sem id) ou altera (com id) uma conversão de compra de um ingrediente. Com `modeloId`
 * (ideia nº 6), cria a partir do catálogo: o nome vem do modelo e a quantidade sai da conta
 * quando o tamanho é da mesma família do estoque; senão, a pessoa informa `quantidadeBase`.
 */
export async function salvarConversao(db: Banco, ator: Ator | null, ingredienteId: number, dados: unknown): Promise<Conversao> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente", id: ingredienteId });
  if (dados && typeof dados === "object" && "modeloId" in dados) return conversaoDoModelo(db, quem, ingredienteId, validar(dadosDoModelo, dados));
  const d = validar(dadosConversao, dados);
  try {
    return await db.transaction().execute(async (trx) => {
      const ing = await trx.selectFrom("ingrediente").select(["id", "unidade_base", "ativo"]).where("id", "=", ingredienteId).forShare().executeTakeFirst();
      if (!ing) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
      if (!ing.ativo) throw new ErroDeRegra("dados_invalidos", "Esse ingrediente está desativado. Reative antes de mexer nas conversões.");
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

async function conversaoDoModelo(
  db: Banco,
  quem: { usuarioId: number; ip?: string | null },
  ingredienteId: number,
  d: { modeloId: number; quantidadeBase?: string },
): Promise<Conversao> {
  try {
    return await db.transaction().execute(async (trx) => {
      const ing = await trx.selectFrom("ingrediente").select(["id", "unidade_base", "ativo"]).where("id", "=", ingredienteId).forShare().executeTakeFirst();
      if (!ing) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
      if (!ing.ativo) throw new ErroDeRegra("dados_invalidos", "Esse ingrediente está desativado. Reative antes de mexer nas embalagens.");
      // FOR SHARE: o modelo não muda de tamanho nem é desativado enquanto é ligado aqui.
      const m = await sql<{ nome: string; ativo: boolean; q: string | null }>`
        SELECT m.nome, m.ativo,
               CASE WHEN u.grandeza = b.grandeza THEN round(m.tamanho * u.fator, 4)::text END AS q
        FROM embalagem_modelo m
        LEFT JOIN unidade_medida u ON u.codigo = m.unidade
        CROSS JOIN unidade_medida b
        WHERE m.id = ${d.modeloId} AND b.codigo = ${ing.unidade_base}
        FOR SHARE OF m`.execute(trx);
      const modelo = m.rows[0];
      if (!modelo) throw new ErroDeRegra("nao_encontrado", "Embalagem do catálogo não encontrada.");
      if (!modelo.ativo) throw new ErroDeRegra("dados_invalidos", "Essa embalagem está desativada no catálogo.");
      const quantidade = modelo.q ?? d.quantidadeBase;
      if (!quantidade)
        throw new ErroDeRegra(
          "dados_invalidos",
          `${ing.unidade_base === "un" ? "Quantas" : "Quantos"} ${NOME_DA_UNIDADE_BASE[ing.unidade_base]} vêm em 1 ${modelo.nome}? Informe a quantidade.`,
        );
      const salvo = await trx
        .insertInto("ingrediente_conversao")
        .values({ ingrediente_id: ingredienteId, nome: modelo.nome, quantidade_base: quantidade, modelo_id: d.modeloId })
        .returning(["id", "nome", "quantidade_base", "ativo", "modelo_id"])
        .executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "ingrediente",
        alvoId: ingredienteId,
        detalhes: { operacao: "criar_conversao_do_catalogo", unidadeBase: ing.unidade_base, antes: null, depois: salvo },
        ip: quem.ip ?? null,
      });
      return { id: salvo.id, nome: salvo.nome, quantidadeBase: decimalLimpo(salvo.quantidade_base), ativo: salvo.ativo, modeloId: salvo.modelo_id };
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    traduzir(e, "Esse ingrediente já tem essa embalagem.");
  }
}

/**
 * USO INTERNO DO SERVIDOR (não ligar direto numa rota: não confere permissão; quem chama já
 * conferiu a dela, como a importação, a compra e a ficha técnica).
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
    if (erro.code === "22023" || erro.code === "P0002" || erro.code === "22003") throw new ErroDeRegra("dados_invalidos", erro.message ?? "Conversão impossível.");
    throw e;
  }
}

// ---------- cadastro rápido (ideia nº 4) ----------

const MAXIMO_POR_LOTE = 300;
const dadosDoLote = z
  .array(
    z.object({
      nome: nome("do ingrediente"),
      unidadeBase: z.enum(UNIDADES_BASE, { error: "Escolha a unidade do estoque: kg, g, L, ml, un ou dz." }),
      unidadeExibicao: z.enum(UNIDADES_PARA_MOSTRAR, { error: "Escolha a unidade: kg, g, L, ml, un ou dz." }).optional(),
      area: z.enum(AREAS_ESTOQUE, { error: "Escolha a área de estoque." }),
      fornecedorId: z.number().int().positive().nullish().transform((v) => v ?? null),
      embalagens: z.array(dadosConversao.pick({ nome: true, quantidadeBase: true })).max(10).default([]),
    }),
  )
  .min(1, "Marque pelo menos um item.")
  .max(MAXIMO_POR_LOTE, `No máximo ${MAXIMO_POR_LOTE} itens por vez.`);

/**
 * Grava vários ingredientes de uma vez (catálogo pronto ou lista colada), cada um com as
 * embalagens. Tudo ou nada: se um item falha, nenhum é gravado e a mensagem diz qual item e
 * por quê (a mesma regra de cada cadastro: nome único entre os ativos, conversão sem
 * equivalência errada, tamanho no nome que bate). Cada item fica na auditoria.
 */
export async function cadastrarEmLote(db: Banco, ator: Ator | null, dados: unknown): Promise<{ criados: number; ids: number[] }> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente" });
  const itens = validar(dadosDoLote, dados);
  const chaves = new Map<string, string>();
  for (const it of itens) {
    const k = it.nome.toLowerCase().replace(/\s+/g, " ");
    if (chaves.has(k)) throw new ErroDeRegra("dados_invalidos", `"${it.nome}" aparece duas vezes na lista.`);
    chaves.set(k, it.nome);
    try {
      conferirFamilia(it.unidadeBase, it.unidadeExibicao);
    } catch (e) {
      if (e instanceof ErroDeRegra) throw new ErroDeRegra("dados_invalidos", `"${it.nome}": ${e.message} Nada foi gravado; corrija e tente de novo.`);
      throw e;
    }
    const embs = new Set<string>();
    for (const e of it.embalagens) {
      const ke = e.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      if (embs.has(ke)) throw new ErroDeRegra("dados_invalidos", `"${it.nome}": a embalagem "${e.nome}" aparece duas vezes.`);
      embs.add(ke);
    }
  }
  return db.transaction().execute(async (trx) => {
    const ids: number[] = [];
    for (const it of itens) {
      // Tudo ou nada pela própria transação: qualquer erro desfaz o lote inteiro.
      try {
        if (it.fornecedorId) {
          const f = await trx.selectFrom("fornecedor").select("ativo").where("id", "=", it.fornecedorId).forShare().executeTakeFirst();
          if (!f?.ativo) throw new ErroDeRegra("dados_invalidos", "Fornecedor não encontrado ou desativado.");
        }
        const salvo = await trx
          .insertInto("ingrediente")
          .values({ nome: it.nome, unidade_base: it.unidadeBase, unidade_exibicao: it.unidadeExibicao ?? it.unidadeBase, area_estoque: it.area, fornecedor_id: it.fornecedorId })
          .returning(["id", "nome", "unidade_base", "unidade_exibicao", "area_estoque", "fornecedor_id", "ativo"])
          .executeTakeFirstOrThrow();
        const conversoes = [];
        for (const e of it.embalagens) {
          conversoes.push(
            await trx
              .insertInto("ingrediente_conversao")
              .values({ ingrediente_id: salvo.id, nome: e.nome, quantidade_base: e.quantidadeBase })
              .returning(["id", "nome", "quantidade_base"])
              .executeTakeFirstOrThrow(),
          );
        }
        await auditar(trx, {
          usuarioId: quem.usuarioId,
          acao: "cadastros.gerenciar",
          resultado: "permitido",
          alvoTipo: "ingrediente",
          alvoId: salvo.id,
          detalhes: { operacao: "criar_em_lote", antes: null, depois: { ...salvo, conversoes } },
          ip: quem.ip,
        });
        ids.push(salvo.id);
      } catch (e) {
        const motivo =
          e instanceof ErroDeRegra
            ? e.message
            : (e as { code?: string }).code === "23505"
              ? (e as { constraint?: string }).constraint === "ingrediente_conversao_nome"
                ? "duas embalagens com o mesmo nome (ex.: \"1 saco\" e \"saco\" são a mesma)."
                : "já existe um ingrediente ativo com esse nome."
              : (e as { code?: string }).code === "23514"
                ? (e as { constraint?: string }).constraint
                  ? "algum valor está fora do permitido."
                  : (e as Error).message
                : null;
        if (motivo === null) throw e;
        throw new ErroDeRegra("dados_invalidos", `"${it.nome}": ${motivo} Nada foi gravado; corrija e tente de novo.`);
      }
    }
    return { criados: ids.length, ids };
  });
}

/** Catálogo pronto para a tela, marcando o que já está cadastrado (ativo). */
export async function catalogoParaCadastrar(db: Banco, ator: Ator | null) {
  await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente" });
  const { CATALOGO_INGREDIENTES, GRUPOS_DO_CATALOGO, chaveDeBusca } = await import("./catalogo-ingredientes");
  const ativos = await db.selectFrom("ingrediente").select("nome").where("ativo", "=", true).execute();
  const ja = new Set(ativos.map((a) => chaveDeBusca(a.nome)));
  return {
    grupos: GRUPOS_DO_CATALOGO,
    itens: CATALOGO_INGREDIENTES.map((c) => ({ ...c, jaCadastrado: ja.has(chaveDeBusca(c.nome)) })),
    jaCadastrados: ativos.map((a) => a.nome),
  };
}

// ---------- consulta pública do CNPJ (ideia nº 4; responsável pediu em 15/11/2026) ----------

export type DadosDoCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  ativa: boolean;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
};
type Buscar = (url: string, init: { signal: AbortSignal; headers: Record<string, string>; redirect: "error" }) => Promise<{ status: number; json(): Promise<unknown> }>;

const respostaBrasilApi = z.object({
  cnpj: z.string(),
  razao_social: z.string().max(300),
  nome_fantasia: z.string().max(300).nullish(),
  descricao_situacao_cadastral: z.string().max(60).nullish(),
  descricao_tipo_de_logradouro: z.string().max(60).nullish(),
  logradouro: z.string().max(200).nullish(),
  numero: z.string().max(30).nullish(),
  complemento: z.string().max(200).nullish(),
  bairro: z.string().max(100).nullish(),
  municipio: z.string().max(100).nullish(),
  uf: z.string().max(2).nullish(),
  cep: z.string().max(10).nullish(),
  ddd_telefone_1: z.string().max(20).nullish(),
  email: z.string().max(200).nullish(),
});

/**
 * Busca nome, situação e endereço de um CNPJ na consulta pública gratuita BrasilAPI
 * (dados da Receita). Só PREENCHE o formulário: nada é gravado aqui. Devolve apenas os
 * campos da empresa (nunca a lista de sócios). Fora do ar ou lento (6 s): a pessoa
 * preenche à mão. `buscar` é trocado nos testes (sem rede).
 */
export async function consultarCnpj(db: Banco, ator: Ator | null, cnpjDigitado: string, buscar: Buscar = fetch as unknown as Buscar): Promise<DadosDoCnpj> {
  await exigir(db, ator, "cadastros.gerenciar", { tipo: "fornecedor" });
  const cnpj = String(cnpjDigitado ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14 || !documentoValido(cnpj)) throw new ErroDeRegra("dados_invalidos", "CNPJ inválido (confira os 14 números).");
  const fora = () => new ErroDeRegra("conflito", "A consulta do CNPJ não respondeu agora. Preencha à mão ou tente de novo em instantes.");
  let r: { status: number; json(): Promise<unknown> };
  try {
    r = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" }, redirect: "error" });
  } catch {
    throw fora();
  }
  if (r.status === 404) throw new ErroDeRegra("nao_encontrado", "Esse CNPJ não foi encontrado na Receita. Confira os números.");
  if (r.status !== 200) throw fora();
  let d: z.infer<typeof respostaBrasilApi>;
  try {
    d = respostaBrasilApi.parse(await r.json());
  } catch {
    throw fora();
  }
  if (d.cnpj.replace(/\D/g, "") !== cnpj) throw fora();
  const limpo = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim() || null;
  const rua = [limpo(d.descricao_tipo_de_logradouro), limpo(d.logradouro)].filter(Boolean).join(" ");
  const partes = [
    [rua, limpo(d.numero)].filter(Boolean).join(", "),
    limpo(d.complemento),
    limpo(d.bairro),
    [limpo(d.municipio), limpo(d.uf)].filter(Boolean).join("/"),
    d.cep ? `CEP ${d.cep.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null,
  ].filter((p) => p);
  const situacao = limpo(d.descricao_situacao_cadastral);
  return {
    cnpj,
    razaoSocial: limpo(d.razao_social) ?? "",
    nomeFantasia: limpo(d.nome_fantasia),
    situacao,
    ativa: (situacao ?? "").toUpperCase() === "ATIVA",
    endereco: partes.length ? partes.join(" - ").slice(0, 300) : null,
    telefone: limpo(d.ddd_telefone_1),
    email: limpo(d.email)?.toLowerCase() ?? null,
  };
}
