/**
 * Produtos (E07 parte 2, PR 3; migração 0012; decisão 0018).
 * Cada produto é de uma categoria (cardápio e horário de venda) e, se passa pela produção, de um
 * tipo de produção (tela da cozinha) com tempo de preparo. Preço em centavos inteiros.
 * Quem vê: `cadastros.ver`. Quem cria e altera: `cadastros.gerenciar`.
 * Tudo na auditoria com antes e depois (o histórico de preço fica lá); nada se apaga.
 * Posição: o lugar do produto dentro da categoria (`posicao`, 1 = primeiro), como em categorias.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { posicaoDaGravacao, reposicionar, travarLista } from "./posicao";
import {
  PRECO_MAXIMO_CENTAVOS,
  TEMPO_DE_PREPARO_MAXIMO,
  type Produto,
} from "./produtos-comum";
import { exigir, type Ator } from "./sessao";

export * from "./produtos-comum";

const MAIOR_ID = 2_147_483_647; // integer do PostgreSQL
const id = (msg: string) =>
  z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);

const esquemaProduto = z.object(
  {
    id: id("Produto não encontrado.").optional(),
    nome: z
      .string({ error: "Informe o nome do produto." })
      .trim()
      .transform((v) => v.replace(/\s+/g, " "))
      .pipe(
        z
          .string()
          .min(2, "Nome com pelo menos 2 letras.")
          .max(60, "Nome com no máximo 60 letras.")
          .refine((v) => !/\p{Cc}/u.test(v), "Nome com caractere inválido."),
      )
      .optional(),
    descricao: z
      .string({ error: "Descrição: um texto." })
      .trim()
      .max(300, "Descrição com no máximo 300 letras.")
      // Quebra de linha e tabulação podem; outros caracteres de controle (e o nulo) não.
      .refine(
        (v) => !/(?![\n\r\t])\p{Cc}/u.test(v),
        "Descrição com caractere inválido.",
      )
      .nullish()
      // Sem o campo, fica como está; nulo ou vazio limpa.
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    categoriaId: id("Escolha a categoria.").optional(),
    /** Nulo: não passa pela produção. */
    tipoProducaoId: id("Escolha o tipo de produção.").nullable().optional(),
    precoCentavos: z
      .number({ error: "Preço: em centavos, um número inteiro." })
      .int("Preço: em centavos, um número inteiro.")
      .min(1, "Preço de pelo menos R$ 0,01.")
      .max(PRECO_MAXIMO_CENTAVOS, "Preço de no máximo R$ 9.999,99.")
      .optional(),
    tempoPreparoMin: z
      .number({ error: "Tempo de preparo: em minutos, um número inteiro." })
      .int("Tempo de preparo: em minutos, um número inteiro.")
      .min(1, "Tempo de preparo de pelo menos 1 minuto.")
      .max(
        TEMPO_DE_PREPARO_MAXIMO,
        `Tempo de preparo de no máximo ${TEMPO_DE_PREPARO_MAXIMO} minutos.`,
      )
      .nullable()
      .optional(),
    /** Lugar dentro da categoria (1 = primeiro) entre os ativos; o sistema renumera a ordem. */
    posicao: z
      .number({ error: "Posição: um número inteiro." })
      .int("Posição: um número inteiro.")
      .min(1, "Posição de 1 em diante.")
      .max(9999, "Posição de no máximo 9999.")
      .optional(),
    ativo: z
      .boolean({ error: "Ativo: sim ou não (true ou false)." })
      .optional(),
  },
  { error: "Dados do produto em formato inválido." },
);

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success)
    throw new ErroDeRegra(
      "dados_invalidos",
      [...new Set(p.error.issues.map((i) => i.message))].join(" "),
    );
  return p.data;
}

const colunas = [
  "id",
  "nome",
  "descricao",
  "categoria_id as categoriaId",
  "tipo_producao_id as tipoProducaoId",
  "preco_centavos as precoCentavos",
  "tempo_preparo_min as tempoPreparoMin",
  "ordem",
  "ativo",
] as const;

/** Todos os produtos: ativos primeiro, na ordem do cardápio (categoria, depois o lugar na categoria). */
export async function listarProdutos(
  db: Banco,
  ator: Ator | null,
): Promise<Produto[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "produto" });
  return db
    .selectFrom("produto as p")
    .innerJoin("categoria as c", "c.id", "p.categoria_id")
    .select([
      "p.id",
      "p.nome",
      "p.descricao",
      "p.categoria_id as categoriaId",
      "p.tipo_producao_id as tipoProducaoId",
      "p.preco_centavos as precoCentavos",
      "p.tempo_preparo_min as tempoPreparoMin",
      "p.ordem",
      "p.ativo",
    ])
    .orderBy("p.ativo", "desc")
    .orderBy("c.ordem")
    .orderBy("c.id")
    .orderBy("p.ordem")
    .orderBy("p.nome")
    .orderBy("p.id")
    .execute();
}

/**
 * Cria (sem id; nome, categoria e preço obrigatórios; tipo e tempo juntos ou nenhum dos dois) ou
 * altera (com id). Na alteração, campo ausente fica como está: desativar manda só `{ id, ativo }`.
 * Tirar o tipo (`tipoProducaoId: null`) também tira o tempo de preparo.
 * Categoria e tipo escolhidos agora (ou ao reativar o produto) precisam estar ativos.
 */
export async function salvarProduto(
  db: Banco,
  ator: Ator | null,
  dados: unknown,
): Promise<Produto> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", {
    tipo: "produto",
  });
  const d = validarDadosDoProduto(dados);
  try {
    return await db
      .transaction()
      .execute((trx) => gravarProdutoNaTransacao(trx, quem, d));
  } catch (e) {
    traduzirErroDoProduto(e);
  }
}

export type DadosDoProduto = z.output<typeof esquemaProduto>;

/** Valida os dados de um produto (sem id: nome, categoria e preço obrigatórios). Erro vira ErroDeRegra. */
export function validarDadosDoProduto(dados: unknown): DadosDoProduto {
  const d = validar(esquemaProduto, dados);
  if (!d.id) {
    const faltam = [
      d.nome === undefined ? "Informe o nome do produto." : null,
      d.categoriaId === undefined ? "Escolha a categoria." : null,
      d.precoCentavos === undefined ? "Informe o preço." : null,
    ].filter(Boolean);
    if (faltam.length)
      throw new ErroDeRegra("dados_invalidos", faltam.join(" "));
  }
  return d;
}

/** Recusa do banco vira mensagem de regra (nome repetido, categoria sumida, campo fora do limite). */
export function traduzirErroDoProduto(e: unknown): never {
  if (e instanceof ErroDeRegra) throw e;
  const code = (e as { code?: string }).code;
  if (code === "23505")
    throw new ErroDeRegra(
      "conflito",
      "Já existe um produto ativo com esse nome.",
    );
  if (code === "23503")
    throw new ErroDeRegra(
      "dados_invalidos",
      "Categoria ou tipo de produção não encontrado.",
    );
  if (code === "23514")
    throw new ErroDeRegra(
      "dados_invalidos",
      "Algum campo está fora do permitido. Confira os campos.",
    );
  throw e;
}

/**
 * O miolo da gravação, DENTRO de uma transação que já existe (quem chama já conferiu a permissão
 * e validou com `validarDadosDoProduto`). Usado por salvarProduto e pela importação de planilha
 * (decisão 0020), que grava tudo numa transação só. `operacao` vai para a auditoria.
 */
export async function gravarProdutoNaTransacao(
  trx: Banco,
  quem: { usuarioId: number; ip: string | null },
  d: DadosDoProduto,
  extra: { operacao?: string; detalhes?: Record<string, unknown> } = {},
): Promise<Produto> {
  await travarLista(trx, "produto");
  let antes: Produto | undefined;
  if (d.id) {
    antes = await trx
      .selectFrom("produto")
      .select(colunas)
      .where("id", "=", d.id)
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!antes)
      throw new ErroDeRegra("nao_encontrado", "Produto não encontrado.");
  }
  // Como fica depois, para conferir tipo e tempo juntos.
  const tipoDepois =
    d.tipoProducaoId !== undefined
      ? d.tipoProducaoId
      : (antes?.tipoProducaoId ?? null);
  const tempoDepois =
    tipoDepois === null
      ? null
      : d.tempoPreparoMin !== undefined
        ? d.tempoPreparoMin
        : (antes?.tempoPreparoMin ?? null);
  if (tipoDepois !== null && tempoDepois === null)
    throw new ErroDeRegra(
      "dados_invalidos",
      "Informe o tempo de preparo (o produto passa pela produção).",
    );
  if (tipoDepois === null && d.tempoPreparoMin != null)
    throw new ErroDeRegra(
      "dados_invalidos",
      "Sem tipo de produção não há tempo de preparo. Escolha o tipo ou deixe o tempo vazio.",
    );

  // Categoria e tipo escolhidos agora (ou de um produto que volta a ser vendido) precisam estar ativos.
  const reativando =
    antes !== undefined && !antes.ativo && d.ativo === true;
  const categoriaDepois = d.categoriaId ?? antes!.categoriaId;
  if (categoriaDepois !== antes?.categoriaId || reativando) {
    const c = await trx
      .selectFrom("categoria")
      .select("ativo")
      .where("id", "=", categoriaDepois)
      .forShare()
      .executeTakeFirst();
    if (!c?.ativo)
      throw new ErroDeRegra(
        "dados_invalidos",
        "Categoria não encontrada ou desativada. Escolha outra.",
      );
  }
  if (
    tipoDepois !== null &&
    (tipoDepois !== antes?.tipoProducaoId || reativando)
  ) {
    const t = await trx
      .selectFrom("tipo_producao")
      .select("ativo")
      .where("id", "=", tipoDepois)
      .forShare()
      .executeTakeFirst();
    if (!t?.ativo)
      throw new ErroDeRegra(
        "dados_invalidos",
        "Tipo de produção não encontrado ou desativado. Escolha outro.",
      );
  }

  const valores = {
    ...(d.nome === undefined ? {} : { nome: d.nome }),
    ...(d.descricao === undefined ? {} : { descricao: d.descricao }),
    ...(d.categoriaId === undefined ? {} : { categoria_id: d.categoriaId }),
    ...(d.precoCentavos === undefined
      ? {}
      : { preco_centavos: d.precoCentavos }),
    ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
    tipo_producao_id: tipoDepois,
    tempo_preparo_min: tempoDepois,
  };
  let s: Produto;
  if (antes) {
    s = await trx
      .updateTable("produto")
      .set({ ...valores, atualizado_em: sql`now()` })
      .where("id", "=", antes.id)
      .returning(colunas)
      .executeTakeFirstOrThrow();
  } else {
    s = await trx
      .insertInto("produto")
      .values({
        ...valores,
        nome: d.nome!,
        categoria_id: d.categoriaId!,
        preco_centavos: d.precoCentavos!,
      })
      .returning(colunas)
      .executeTakeFirstOrThrow();
  }
  // Mudou de categoria sem escolher lugar: vai para o fim da categoria nova.
  const mudouDeCategoria =
    antes !== undefined && antes.categoriaId !== s.categoriaId && s.ativo;
  const posicao =
    d.posicao ??
    (mudouDeCategoria
      ? Number.MAX_SAFE_INTEGER
      : posicaoDaGravacao(d, antes, s.ativo));
  const reordenados =
    posicao === undefined
      ? []
      : await reposicionar(trx, "produto", s.id, posicao, s.categoriaId);
  if (reordenados.length)
    s = await trx
      .selectFrom("produto")
      .select(colunas)
      .where("id", "=", s.id)
      .executeTakeFirstOrThrow();
  await auditar(trx, {
    usuarioId: quem.usuarioId,
    acao: "cadastros.gerenciar",
    resultado: "permitido",
    alvoTipo: "produto",
    alvoId: s.id,
    detalhes: {
      operacao: extra.operacao ?? (antes ? "alterar" : "criar"),
      antes: antes ?? null,
      depois: s,
      ...(reordenados.length ? { reordenados } : {}),
      ...extra.detalhes,
    },
    ip: quem.ip,
  });
  return s;
}
