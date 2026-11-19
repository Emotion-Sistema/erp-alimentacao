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
import { esquemaCombo, gravarCombo, partesDosCombos } from "./combos";
import { fotosAtivas } from "./fotos";
import { posicaoDaGravacao, reposicionar, travarLista } from "./posicao";
import {
  GRUPOS_POR_PRODUTO,
  PRECO_MAXIMO_CENTAVOS,
  TAMANHOS_POR_PRODUTO,
  TEMPO_DE_PREPARO_MAXIMO,
  type Produto,
  nomeComparavel,
  type Tamanho,
} from "./produtos-comum";
import { exigir, type Ator } from "./sessao";

export * from "./produtos-comum";

const MAIOR_ID = 2_147_483_647; // integer do PostgreSQL
const id = (msg: string) =>
  z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);

const centavos = (rotulo: string, minimo: number) =>
  z
    .number({ error: `${rotulo}: em centavos, um número inteiro.` })
    .int(`${rotulo}: em centavos, um número inteiro.`)
    .min(minimo, minimo ? `${rotulo} de pelo menos R$ 0,01.` : `${rotulo}: não pode ser negativo.`)
    .max(PRECO_MAXIMO_CENTAVOS, `${rotulo} de no máximo R$ 9.999,99.`);

const textoCurto = (rotulo: string, max: number) =>
  z
    .string({ error: `Informe o nome do ${rotulo}.` })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, `Informe o nome do ${rotulo}.`)
        .max(max, `Nome do ${rotulo} com no máximo ${max} letras.`)
        .refine((v) => !/\p{Cc}/u.test(v), `Nome do ${rotulo} com caractere inválido.`),
    );

const esquemaTamanho = z.object(
  {
    /** Sem id: tamanho novo. Com id: um tamanho deste produto (pode ser um desativado, que volta). */
    id: id("Tamanho não encontrado.").optional(),
    nome: textoCurto("tamanho", 30),
    acrescimoCentavos: centavos("Acréscimo do tamanho", 0),
    /** Nulo: igual ao da loja. Ausente: novo = igual à loja; existente = fica como está. */
    acrescimoDeliveryCentavos: centavos("Acréscimo do tamanho no delivery", 0).nullable().optional(),
  },
  { error: "Tamanho em formato inválido." },
);

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
    /** Preço no delivery; nulo = igual ao da loja. */
    precoDeliveryCentavos: centavos("Preço no delivery", 1).nullable().optional(),
    /** Lista completa e na ordem: o que não vier fica inativo. Ausente: fica como está. */
    tamanhos: z
      .array(esquemaTamanho, { error: "Tamanhos em formato inválido." })
      .max(TAMANHOS_POR_PRODUTO, `No máximo ${TAMANHOS_POR_PRODUTO} tamanhos por produto.`)
      .optional(),
    /** Grupos de adicionais oferecidos, na ordem: o que não vier sai do produto. Ausente: fica como está. */
    /** Combo montado por partes (lista completa); null desmonta; ausente: fica como está. */
    combo: esquemaCombo.optional(),
    gruposAdicionais: z
      .array(id("Grupo de adicionais não encontrado."), { error: "Grupos de adicionais em formato inválido." })
      .max(GRUPOS_POR_PRODUTO, `No máximo ${GRUPOS_POR_PRODUTO} grupos de adicionais por produto.`)
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
  "preco_delivery_centavos as precoDeliveryCentavos",
  "combo as eCombo",
  "ordem",
  "ativo",
] as const;

type ProdutoSimples = Omit<Produto, "tamanhos" | "gruposAdicionais" | "fotoId" | "combo"> & { eCombo: boolean };

/** Tamanhos ativos e grupos ligados (ativos) de cada produto pedido, na ordem. */
async function extrasDosProdutos(
  db: Banco,
  ids: number[],
): Promise<Map<number, { tamanhos: Tamanho[]; gruposAdicionais: number[] }>> {
  const mapa = new Map(ids.map((i) => [i, { tamanhos: [] as Tamanho[], gruposAdicionais: [] as number[] }]));
  if (!ids.length) return mapa;
  const tamanhos = await db
    .selectFrom("produto_tamanho")
    .select([
      "id",
      "produto_id as produtoId",
      "nome",
      "acrescimo_centavos as acrescimoCentavos",
      "acrescimo_delivery_centavos as acrescimoDeliveryCentavos",
      "ordem",
    ])
    .where("produto_id", "in", ids)
    .where("ativo", "=", true)
    .orderBy("ordem")
    .orderBy("id")
    .execute();
  for (const { produtoId, ...t } of tamanhos) mapa.get(produtoId)!.tamanhos.push(t);
  const ligacoes = await db
    .selectFrom("produto_grupo_adicional")
    .select(["produto_id as produtoId", "grupo_id as grupoId"])
    .where("produto_id", "in", ids)
    .where("ativo", "=", true)
    .orderBy("ordem")
    .orderBy("grupo_id")
    .execute();
  for (const l of ligacoes) mapa.get(l.produtoId)!.gruposAdicionais.push(l.grupoId);
  return mapa;
}

async function comExtras(db: Banco, produtos: ProdutoSimples[]): Promise<Produto[]> {
  const ids = produtos.map((p) => p.id);
  const extras = await extrasDosProdutos(db, ids);
  const fotos = await fotosAtivas(db, ids);
  const partes = await partesDosCombos(db, produtos.filter((p) => p.eCombo).map((p) => p.id));
  return produtos.map(({ eCombo, ...p }) => ({
    ...p,
    ...extras.get(p.id)!,
    fotoId: fotos.get(p.id) ?? null,
    combo: eCombo ? { partes: partes.get(p.id) ?? [] } : null,
  }));
}

/** Todos os produtos: ativos primeiro, na ordem do cardápio (categoria, depois o lugar na categoria). */
export async function listarProdutos(
  db: Banco,
  ator: Ator | null,
): Promise<Produto[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "produto" });
  const lista = await db
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
      "p.preco_delivery_centavos as precoDeliveryCentavos",
      "p.combo as eCombo",
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
  return comExtras(db, lista);
}

/** Vários produtos com tamanhos e grupos (sem conferir permissão: uso interno). */
export async function produtosPorIds(db: Banco, ids: number[]): Promise<Produto[]> {
  const validos = ids.filter((i) => Number.isSafeInteger(i) && i > 0 && i <= MAIOR_ID);
  if (!validos.length) return [];
  return comExtras(db, await db.selectFrom("produto").select(colunas).where("id", "in", validos).execute());
}

/** Um produto com tamanhos e grupos (sem conferir permissão: uso interno, ex.: preço do item). */
export async function produtoPorId(db: Banco, id: number): Promise<Produto | undefined> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > MAIOR_ID) return undefined;
  const linha = await db.selectFrom("produto").select(colunas).where("id", "=", id).executeTakeFirst();
  return linha ? (await comExtras(db, [linha]))[0] : undefined;
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
      (e as { constraint?: string }).constraint === "produto_tamanho_nome"
        ? "Tamanho repetido neste produto."
        : "Já existe um produto ativo com esse nome.",
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
    const linha = await trx
      .selectFrom("produto")
      .select(colunas)
      .where("id", "=", d.id)
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!linha)
      throw new ErroDeRegra("nao_encontrado", "Produto não encontrado.");
    [antes] = await comExtras(trx, [linha]);
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
  // Combo: não passa pela produção como um todo (cada produto escolhido vai para a sua tela) e não tem tamanho.
  const comboDepois = d.combo !== undefined ? d.combo !== null : antes?.combo != null;
  if (comboDepois && tipoDepois !== null)
    throw new ErroDeRegra(
      "dados_invalidos",
      "Combo não passa pela produção como um todo: cada produto escolhido vai para a tela dele. Deixe o combo sem tipo de produção.",
    );
  const tamanhosDepois = d.tamanhos !== undefined ? d.tamanhos.length : (antes?.tamanhos.length ?? 0);
  if (comboDepois && tamanhosDepois > 0)
    throw new ErroDeRegra("dados_invalidos", "Combo não tem tamanhos: o tamanho fica em cada opção do combo.");
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
    ...(d.precoDeliveryCentavos === undefined
      ? {}
      : { preco_delivery_centavos: d.precoDeliveryCentavos }),
    ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
    tipo_producao_id: tipoDepois,
    combo: comboDepois,
    tempo_preparo_min: tempoDepois,
  };
  let s: ProdutoSimples;
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
  if (d.tamanhos !== undefined) await gravarTamanhos(trx, s.id, d.tamanhos);
  if (d.combo !== undefined) await gravarCombo(trx, s.id, d.combo);
  if (d.gruposAdicionais !== undefined)
    await gravarGruposDoProduto(trx, s.id, d.gruposAdicionais);
  const [depois] = await comExtras(trx, [s]);
  await auditar(trx, {
    usuarioId: quem.usuarioId,
    acao: "cadastros.gerenciar",
    resultado: "permitido",
    alvoTipo: "produto",
    alvoId: s.id,
    detalhes: {
      operacao: extra.operacao ?? (antes ? "alterar" : "criar"),
      antes: antes ?? null,
      depois,
      ...(reordenados.length ? { reordenados } : {}),
      ...extra.detalhes,
    },
    ip: quem.ip,
  });
  return depois!;
}

/**
 * Troca a lista de tamanhos do produto pela que veio (na ordem). Tamanho com id precisa ser deste
 * produto (um desativado volta); o que não veio fica inativo. Nomes repetidos são recusados.
 */
async function gravarTamanhos(
  trx: Banco,
  produtoId: number,
  lista: z.output<typeof esquemaTamanho>[],
): Promise<void> {
  const nomes = new Set<string>();
  for (const t of lista) {
    if (nomes.has(nomeComparavel(t.nome)))
      throw new ErroDeRegra("dados_invalidos", `Tamanho repetido: ${t.nome}.`);
    nomes.add(nomeComparavel(t.nome));
  }
  const ids = lista.flatMap((t) => (t.id ? [t.id] : []));
  if (new Set(ids).size !== ids.length)
    throw new ErroDeRegra("dados_invalidos", "O mesmo tamanho veio duas vezes.");
  const existentes = await trx
    .selectFrom("produto_tamanho")
    .select(["id", "ativo", "acrescimo_delivery_centavos as acrescimoDelivery"])
    .where("produto_id", "=", produtoId)
    .forNoKeyUpdate()
    .execute();
  const deste = new Set(existentes.map((e) => e.id));
  if (ids.some((i) => !deste.has(i)))
    throw new ErroDeRegra("nao_encontrado", "Tamanho não encontrado neste produto.");
  // Primeiro desativa os que saem (libera o nome para um tamanho novo com o mesmo nome).
  const ficam = new Set(ids);
  const saem = existentes.filter((e) => e.ativo && !ficam.has(e.id)).map((e) => e.id);
  if (saem.length)
    await trx
      .updateTable("produto_tamanho")
      .set({ ativo: false, atualizado_em: sql`now()` })
      .where("id", "in", saem)
      .execute();
  // Renomear um para o nome do outro na mesma gravação: tira os nomes do caminho antes.
  if (ids.length)
    await trx
      .updateTable("produto_tamanho")
      .set({ ativo: false })
      .where("id", "in", ids)
      .execute();
  for (const [i, t] of lista.entries()) {
    const valores = {
      nome: t.nome,
      acrescimo_centavos: t.acrescimoCentavos,
      // Ausente num tamanho que já existe: fica como está; só null limpa (igual à loja).
      acrescimo_delivery_centavos:
        t.acrescimoDeliveryCentavos !== undefined
          ? t.acrescimoDeliveryCentavos
          : t.id
            ? (existentes.find((e) => e.id === t.id)?.acrescimoDelivery ?? null)
            : null,
      ordem: (i + 1) * 10,
      ativo: true,
    };
    if (t.id)
      await trx
        .updateTable("produto_tamanho")
        .set({ ...valores, atualizado_em: sql`now()` })
        .where("id", "=", t.id)
        .execute();
    else
      await trx
        .insertInto("produto_tamanho")
        .values({ ...valores, produto_id: produtoId })
        .execute();
  }
}

/**
 * Troca os grupos de adicionais do produto pelos que vieram (na ordem). Grupo novo na lista precisa
 * estar ativo; o que não veio sai do produto (a ligação fica inativa, nada se apaga).
 */
async function gravarGruposDoProduto(
  trx: Banco,
  produtoId: number,
  grupos: number[],
): Promise<void> {
  if (new Set(grupos).size !== grupos.length)
    throw new ErroDeRegra("dados_invalidos", "O mesmo grupo de adicionais veio duas vezes.");
  const ligados = await trx
    .selectFrom("produto_grupo_adicional")
    .select(["grupo_id as grupoId", "ativo"])
    .where("produto_id", "=", produtoId)
    .forNoKeyUpdate()
    .execute();
  const jaAtivos = new Set(ligados.filter((l) => l.ativo).map((l) => l.grupoId));
  const novos = grupos.filter((g) => !jaAtivos.has(g));
  if (novos.length) {
    // FOR SHARE: o grupo não pode ser desativado no meio desta gravação.
    const ativos = await trx
      .selectFrom("grupo_adicional")
      .select("id")
      .where("id", "in", novos)
      .where("ativo", "=", true)
      .forShare()
      .execute();
    if (ativos.length !== novos.length)
      throw new ErroDeRegra(
        "dados_invalidos",
        "Grupo de adicionais não encontrado ou desativado. Escolha outro.",
      );
  }
  const ficam = new Set(grupos);
  const saem = [...jaAtivos].filter((g) => !ficam.has(g));
  if (saem.length)
    await trx
      .updateTable("produto_grupo_adicional")
      .set({ ativo: false, atualizado_em: sql`now()` })
      .where("produto_id", "=", produtoId)
      .where("grupo_id", "in", saem)
      .execute();
  for (const [i, g] of grupos.entries())
    await trx
      .insertInto("produto_grupo_adicional")
      .values({ produto_id: produtoId, grupo_id: g, ordem: (i + 1) * 10, ativo: true })
      .onConflict((oc) =>
        oc.columns(["produto_id", "grupo_id"]).doUpdateSet({
          ordem: (i + 1) * 10,
          ativo: true,
          atualizado_em: sql`now()`,
        }),
      )
      .execute();
}
