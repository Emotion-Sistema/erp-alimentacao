/**
 * Fichas técnicas (E08; migração 0019; decisão 0025).
 * Quem vê a receita: `cadastros.ver` (a cozinha também). Custo e margem só aparecem para quem
 * tem `custos.ver` (o servidor tira o resto). Quem grava: `cadastros.gerenciar`.
 * Gravar a receita sempre cria uma versão nova (as antigas ficam); só o "ativo" muda sem versão.
 * Toda gravação de ficha pega a trava das fichas: assim dois preparos não passam a usar um ao
 * outro ao mesmo tempo, e a conferência de "receita circular" vale.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import {
  analisarFichas,
  Fracao,
  custoSobrePreco,
  EQUIPAMENTOS_POR_FICHA,
  ETAPAS_POR_FICHA,
  ITENS_POR_FICHA,
  PENDENCIAS_POR_FICHA,
  TIPOS_DE_FICHA,
  UNIDADES_DA_FICHA,
  type AnaliseDaFicha,
  type FichaParaConta,
  type IngredienteParaConta,
  type ItemDaFicha,
  type Pendencia,
  type TipoDeFicha,
  type UnidadeDaFicha,
  type VersaoDaFicha,
} from "./fichas-comum";
import { pode } from "./permissoes";
import { nomeComparavel } from "./produtos-comum";
import { exigir, type Ator } from "./sessao";

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);
const decimal = (rotulo: string) =>
  z
    .union([z.string(), z.number()], { error: `${rotulo}: um número.` })
    .transform((v) => String(v).trim().replace(",", "."))
    .refine(
      (v) => /^\d{1,10}(\.\d{1,4})?$/.test(v) && /[1-9]/.test(v),
      `${rotulo}: use um número maior que zero, com até 4 casas depois da vírgula.`,
    );
const texto = (rotulo: string, min: number, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(min, `${rotulo} com pelo menos ${min} letra${min > 1 ? "s" : ""}.`)
        .max(max, `${rotulo} com no máximo ${max} letras.`)
        .refine((v) => !/\p{Cc}/u.test(v), `${rotulo} com caractere inválido.`),
    );
/** Texto opcional: vazio vira nulo. */
const opcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .transform((v) => v.replace(/[ \t]+/g, " "))
    .pipe(
      z
        .string()
        .max(max, `${rotulo} com no máximo ${max} letras.`)
        // Recusa caractere de controle de propósito (a quebra de linha, \n, passa).
        // eslint-disable-next-line no-control-regex
        .refine((v) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(v), `${rotulo} com caractere inválido.`),
    )
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const inteiro = (rotulo: string, min: number, max: number) =>
  z
    .number({ error: `${rotulo}: um número inteiro.` })
    .int(`${rotulo}: um número inteiro.`)
    .min(min, `${rotulo} de pelo menos ${min}.`)
    .max(max, `${rotulo} de no máximo ${max}.`);

const esquemaItem = z.object(
  {
    ingredienteId: id("Ingrediente não encontrado.").optional(),
    preparoId: id("Preparo não encontrado.").optional(),
    /** Nulo = pendência (a gosto, medida caseira sem peso). */
    quantidade: decimal("Quantidade").nullable(),
    opcional: z.boolean({ error: "Opcional: sim ou não." }).optional(),
    medidaCaseira: opcional("Medida caseira", 60),
    observacao: opcional("Observação do item", 120),
  },
  { error: "Item da ficha em formato inválido." },
);

const esquemaEtapa = z.object(
  { texto: texto("Etapa do preparo", 1, 500), minutos: inteiro("Minutos da etapa", 0, 1440).nullable().optional() },
  { error: "Etapa em formato inválido." },
);

const esquemaFicha = z.object(
  {
    id: id("Ficha não encontrada.").optional(),
    tipo: z.enum(TIPOS_DE_FICHA, { error: "Tipo de ficha desconhecido." }).optional(),
    produtoId: id("Produto não encontrado.").optional(),
    tamanhoId: id("Tamanho não encontrado.").optional(),
    adicionalId: id("Adicional não encontrado.").optional(),
    nome: texto("Nome do preparo", 2, 80).optional(),
    unidadeRendimento: z.enum(UNIDADES_DA_FICHA, { error: "Unidade do rendimento: g, ml ou un." }).optional(),
    /** Número da versão que a pessoa abriu para editar (protege contra gravar por cima de outra). */
    versaoBase: inteiro("Versão base", 1, 1_000_000).optional(),
    receita: z
      .object(
        {
          rende: decimal("Rende").nullable(),
          porcaoQuantidade: decimal("Porção").nullable().optional(),
          porcaoUnidade: z.enum(UNIDADES_DA_FICHA, { error: "Unidade da porção: g, ml ou un." }).nullable().optional(),
          tempoMin: inteiro("Tempo total (min)", 0, 1440).nullable().optional(),
          validadeDias: inteiro("Validade (dias)", 0, 365).nullable().optional(),
          etapas: z.array(esquemaEtapa).max(ETAPAS_POR_FICHA, `No máximo ${ETAPAS_POR_FICHA} etapas.`).optional(),
          equipamentos: z
            .array(texto("Equipamento", 2, 60))
            .max(EQUIPAMENTOS_POR_FICHA, `No máximo ${EQUIPAMENTOS_POR_FICHA} equipamentos.`)
            .optional(),
          observacoes: opcional("Observações", 2000),
          motivo: opcional("O que mudou", 200),
          itens: z.array(esquemaItem).max(ITENS_POR_FICHA, `No máximo ${ITENS_POR_FICHA} itens.`),
          pendencias: z
            .array(texto("Pendência", 2, 200))
            .max(PENDENCIAS_POR_FICHA, `No máximo ${PENDENCIAS_POR_FICHA} pendências.`)
            .optional(),
        },
        { error: "Receita em formato inválido." },
      )
      .optional(),
    ativo: z.boolean({ error: "Ativo: sim ou não." }).optional(),
  },
  { error: "Ficha em formato inválido." },
);

const esquemaCusto = z.object(
  {
    ingredienteId: id("Ingrediente não encontrado."),
    /** Nulo apaga a referência. */
    custoCentavos: inteiro("Custo (em centavos)", 0, 99_999_999).nullable(),
    quantidade: decimal("Quantidade do custo").optional(),
  },
  { error: "Custo em formato inválido." },
);

/** Id que vem do endereço (texto só com dígitos) vira número; o resto segue para a validação. */
const idDaRota = (v: unknown) => (typeof v === "string" && /^[1-9][0-9]{0,9}$/.test(v) ? Number(v) : v);

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success)
    throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

// ---------------------------------------------------------------- leitura

type LinhaDaFicha = {
  id: number;
  tipo: TipoDeFicha;
  produtoId: number | null;
  tamanhoId: number | null;
  adicionalId: number | null;
  nomePreparo: string | null;
  unidadeRendimento: UnidadeDaFicha | null;
  versaoAtualId: number | null;
  ativo: boolean;
};

async function linhasDasFichas(db: Banco, ids?: number[]): Promise<LinhaDaFicha[]> {
  let q = db
    .selectFrom("ficha")
    .select([
      "id",
      "tipo",
      "produto_id as produtoId",
      "tamanho_id as tamanhoId",
      "adicional_id as adicionalId",
      "nome as nomePreparo",
      "unidade_rendimento as unidadeRendimento",
      "versao_atual_id as versaoAtualId",
      "ativo",
    ]);
  if (ids) {
    if (!ids.length) return [];
    q = q.where("id", "in", ids);
  }
  return q.orderBy("id").execute();
}

/** Nome do que a ficha descreve: "X-Bacon", "Batata frita · Inteira", "Bacon extra", "Tempero". */
async function nomesDosAlvos(db: Banco, linhas: LinhaDaFicha[]): Promise<Map<number, string>> {
  const nomes = new Map<number, string>();
  const prod = linhas.flatMap((l) => (l.produtoId ? [l.produtoId] : []));
  const tam = linhas.flatMap((l) => (l.tamanhoId ? [l.tamanhoId] : []));
  const adi = linhas.flatMap((l) => (l.adicionalId ? [l.adicionalId] : []));
  const p = prod.length ? await db.selectFrom("produto").select(["id", "nome"]).where("id", "in", prod).execute() : [];
  const t = tam.length
    ? await db
        .selectFrom("produto_tamanho as t")
        .innerJoin("produto as p", "p.id", "t.produto_id")
        .select(["t.id", "t.nome", "p.nome as produto"])
        .where("t.id", "in", tam)
        .execute()
    : [];
  const a = adi.length
    ? await db
        .selectFrom("adicional as a")
        .innerJoin("grupo_adicional as g", "g.id", "a.grupo_id")
        .select(["a.id", "a.nome", "g.nome as grupo"])
        .where("a.id", "in", adi)
        .execute()
    : [];
  const pm = new Map(p.map((x) => [x.id, x.nome]));
  const tm = new Map(t.map((x) => [x.id, `${x.produto} · ${x.nome}`]));
  const am = new Map(a.map((x) => [x.id, `${x.nome} (${x.grupo})`]));
  for (const l of linhas)
    nomes.set(
      l.id,
      l.tipo === "produto"
        ? (pm.get(l.produtoId!) ?? "?")
        : l.tipo === "tamanho"
          ? (tm.get(l.tamanhoId!) ?? "?")
          : l.tipo === "adicional"
            ? (am.get(l.adicionalId!) ?? "?")
            : l.nomePreparo!,
    );
  return nomes;
}

async function versoesCompletas(db: Banco, versaoIds: number[]): Promise<Map<number, VersaoDaFicha>> {
  const saida = new Map<number, VersaoDaFicha>();
  if (!versaoIds.length) return saida;
  const vs = await db
    .selectFrom("ficha_versao as v")
    .innerJoin("usuario as u", "u.id", "v.criada_por")
    .select([
      "v.id",
      "v.numero",
      "v.rende",
      "v.porcao_quantidade as porcaoQuantidade",
      "v.porcao_unidade as porcaoUnidade",
      "v.tempo_min as tempoMin",
      "v.validade_dias as validadeDias",
      "v.etapas",
      "v.equipamentos",
      "v.observacoes",
      "v.motivo",
      "u.nome as criadaPor",
      "v.criada_em as criadaEm",
    ])
    .where("v.id", "in", versaoIds)
    .execute();
  const itens = await db
    .selectFrom("ficha_item as i")
    .leftJoin("ingrediente as g", "g.id", "i.ingrediente_id")
    .leftJoin("ficha as p", "p.id", "i.preparo_id")
    .select([
      "i.versao_id as versaoId",
      "i.ordem",
      "i.ingrediente_id as ingredienteId",
      "i.preparo_id as preparoId",
      "i.quantidade",
      "i.opcional",
      "i.medida_caseira as medidaCaseira",
      "i.observacao",
      "g.nome as nomeIngrediente",
      "g.unidade_base as unidadeIngrediente",
      "p.nome as nomePreparo",
      "p.unidade_rendimento as unidadePreparo",
    ])
    .where("i.versao_id", "in", versaoIds)
    .orderBy("i.versao_id")
    .orderBy("i.ordem")
    .execute();
  const pend = await db
    .selectFrom("ficha_pendencia")
    .select(["versao_id as versaoId", "texto"])
    .where("versao_id", "in", versaoIds)
    .orderBy("id")
    .execute();
  for (const v of vs)
    saida.set(v.id, {
      ...v,
      rende: v.rende === null ? null : limpo(v.rende),
      porcaoQuantidade: v.porcaoQuantidade === null ? null : limpo(v.porcaoQuantidade),
      criadaEm: new Date(v.criadaEm).toISOString(),
      etapas: v.etapas.map((e) => ({ texto: e.texto, minutos: e.minutos ?? null })),
      itens: [],
      pendencias: [],
    });
  for (const i of itens)
    saida.get(i.versaoId)!.itens.push({
      ordem: i.ordem,
      ingredienteId: i.ingredienteId,
      preparoId: i.preparoId,
      nome: (i.ingredienteId ? i.nomeIngrediente : i.nomePreparo) ?? "?",
      unidade: ((i.ingredienteId ? i.unidadeIngrediente : i.unidadePreparo) ?? "un") as UnidadeDaFicha,
      quantidade: i.quantidade === null ? null : limpo(i.quantidade),
      opcional: i.opcional,
      medidaCaseira: i.medidaCaseira,
      observacao: i.observacao,
    });
  for (const p of pend) saida.get(p.versaoId)!.pendencias.push(p.texto);
  return saida;
}

const limpo = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);

/**
 * Carrega tudo o que a conta precisa a partir das fichas pedidas: as fichas, os preparos que
 * elas usam (de qualquer profundidade, pela versão atual) e os ingredientes.
 */
async function carregarParaConta(
  db: Banco,
  ids: number[],
): Promise<{ fichas: Map<number, FichaParaConta>; ingredientes: Map<number, IngredienteParaConta>; linhas: Map<number, LinhaDaFicha>; versoes: Map<number, VersaoDaFicha> }> {
  const fichas = new Map<number, FichaParaConta>();
  const linhasMap = new Map<number, LinhaDaFicha>();
  const versoes = new Map<number, VersaoDaFicha>();
  const ingIds = new Set<number>();
  let fila = [...new Set(ids)];
  for (let nivel = 0; fila.length && nivel < 50; nivel++) {
    const linhas = await linhasDasFichas(db, fila.filter((f) => !linhasMap.has(f)));
    const nomes = await nomesDosAlvos(db, linhas);
    const vs = await versoesCompletas(
      db,
      linhas.flatMap((l) => (l.versaoAtualId ? [l.versaoAtualId] : [])),
    );
    const proxima = new Set<number>();
    for (const l of linhas) {
      linhasMap.set(l.id, l);
      const v = l.versaoAtualId ? vs.get(l.versaoAtualId)! : null;
      if (v) versoes.set(v.id, v);
      fichas.set(l.id, { id: l.id, tipo: l.tipo, nome: nomes.get(l.id)!, ativo: l.ativo, unidadeRendimento: l.unidadeRendimento, versao: v });
      for (const i of v?.itens ?? []) {
        if (i.ingredienteId) ingIds.add(i.ingredienteId);
        if (i.preparoId && !linhasMap.has(i.preparoId)) proxima.add(i.preparoId);
      }
    }
    fila = [...proxima];
  }
  const ings = ingIds.size
    ? await db
        .selectFrom("ingrediente")
        .select(["id", "nome", "ativo", "custo_ref_centavos as custoCentavos", "custo_ref_quantidade as custoQuantidade"])
        .where("id", "in", [...ingIds])
        .execute()
    : [];
  return { fichas, ingredientes: new Map(ings.map((g) => [g.id, g])), linhas: linhasMap, versoes };
}

// ---------------------------------------------------------------- painel

export type ResumoDaFicha = {
  id: number;
  tipo: TipoDeFicha;
  nome: string;
  produtoId: number | null;
  tamanhoId: number | null;
  adicionalId: number | null;
  unidadeRendimento: UnidadeDaFicha | null;
  ativo: boolean;
  versao: number | null;
  atualizadaEm: string | null;
  completa: boolean;
  pendencias: number;
  /** Só para quem tem `custos.ver` (senão nulo e falso). */
  custoCentavos: number | null;
  custoParcial: boolean;
  /** Custo sobre o preço, em pontos-base, na loja e no delivery (produto, tamanho, adicional). */
  custoPbLoja: number | null;
  custoPbDelivery: number | null;
  /** O que a ficha descreve saiu do cardápio (produto, tamanho ou adicional desativado). */
  foraDoCardapio: boolean;
};

export type PainelDeFichas = {
  podeVerCusto: boolean;
  podeGerenciar: boolean;
  limiteCustoPb: number;
  fichas: ResumoDaFicha[];
  /** Produtos ativos (que não são combo) sem ficha. */
  semFicha: { id: number; nome: string; categoria: string }[];
  /** Para o editor: ingredientes (com custo só para quem pode ver), preparos e alvos. */
  ingredientes: { id: number; nome: string; unidade: UnidadeDaFicha; ativo: boolean; custoCentavos: number | null; custoQuantidade: string | null }[];
  produtos: { id: number; nome: string; ativo: boolean; combo: boolean }[];
  tamanhos: { id: number; produtoId: number; nome: string; ativo: boolean }[];
  adicionais: { id: number; nome: string; grupo: string; ativo: boolean }[];
  /** Ingredientes ativos com nomes que parecem o mesmo item ("Frango" e "Peito de frango"). */
  nomesParecidos: { a: { id: number; nome: string }; b: { id: number; nome: string } }[];
};

type Precos = { loja: number | null; delivery: number | null };

async function precosDosAlvos(db: Banco, linhas: LinhaDaFicha[]): Promise<{ precos: Map<number, Precos>; fora: Set<number> }> {
  const precos = new Map<number, Precos>();
  const fora = new Set<number>();
  const prod = linhas.flatMap((l) => (l.produtoId ? [l.produtoId] : []));
  const tam = linhas.flatMap((l) => (l.tamanhoId ? [l.tamanhoId] : []));
  const adi = linhas.flatMap((l) => (l.adicionalId ? [l.adicionalId] : []));
  const p = prod.length
    ? await db.selectFrom("produto").select(["id", "ativo", "preco_centavos", "preco_delivery_centavos"]).where("id", "in", prod).execute()
    : [];
  const t = tam.length
    ? await db
        .selectFrom("produto_tamanho as t")
        .innerJoin("produto as p", "p.id", "t.produto_id")
        .select(["t.id", "t.ativo", "p.ativo as produtoAtivo", "p.preco_centavos", "p.preco_delivery_centavos", "t.acrescimo_centavos", "t.acrescimo_delivery_centavos"])
        .where("t.id", "in", tam)
        .execute()
    : [];
  const a = adi.length
    ? await db
        .selectFrom("adicional as a")
        .innerJoin("grupo_adicional as g", "g.id", "a.grupo_id")
        .select(["a.id", "a.ativo", "g.ativo as grupoAtivo", "a.preco_centavos", "a.preco_delivery_centavos"])
        .where("a.id", "in", adi)
        .execute()
    : [];
  const pm = new Map(p.map((x) => [x.id, x]));
  const tm = new Map(t.map((x) => [x.id, x]));
  const am = new Map(a.map((x) => [x.id, x]));
  for (const l of linhas) {
    if (l.tipo === "produto") {
      const x = pm.get(l.produtoId!)!;
      precos.set(l.id, { loja: x.preco_centavos, delivery: x.preco_delivery_centavos ?? x.preco_centavos });
      if (!x.ativo) fora.add(l.id);
    } else if (l.tipo === "tamanho") {
      const x = tm.get(l.tamanhoId!)!;
      const base = x.preco_delivery_centavos ?? x.preco_centavos;
      precos.set(l.id, {
        loja: x.preco_centavos + x.acrescimo_centavos,
        delivery: base + (x.acrescimo_delivery_centavos ?? x.acrescimo_centavos),
      });
      if (!x.ativo || !x.produtoAtivo) fora.add(l.id);
    } else if (l.tipo === "adicional") {
      const x = am.get(l.adicionalId!)!;
      precos.set(l.id, { loja: x.preco_centavos, delivery: x.preco_delivery_centavos ?? x.preco_centavos });
      if (!x.ativo || !x.grupoAtivo) fora.add(l.id);
    }
  }
  return { precos, fora };
}

function resumir(
  l: LinhaDaFicha,
  nome: string,
  v: VersaoDaFicha | null,
  a: AnaliseDaFicha,
  verCusto: boolean,
  preco: Precos | undefined,
  fora: boolean,
): ResumoDaFicha {
  return {
    id: l.id,
    tipo: l.tipo,
    nome,
    produtoId: l.produtoId,
    tamanhoId: l.tamanhoId,
    adicionalId: l.adicionalId,
    unidadeRendimento: l.unidadeRendimento,
    ativo: l.ativo,
    versao: v?.numero ?? null,
    atualizadaEm: v?.criadaEm ?? null,
    completa: a.completa,
    pendencias: a.pendencias.length,
    custoCentavos: verCusto ? a.custoCentavos : null,
    custoParcial: verCusto ? a.custoParcial : false,
    custoPbLoja: verCusto && preco ? custoSobrePreco(a.custoCentavos, preco.loja) : null,
    custoPbDelivery: verCusto && preco ? custoSobrePreco(a.custoCentavos, preco.delivery) : null,
    foraDoCardapio: fora,
  };
}

/** Tudo o que a tela de fichas mostra. */
export async function painelDeFichas(db: Banco, ator: Ator | null): Promise<PainelDeFichas> {
  const quem = await exigir(db, ator, "cadastros.ver", { tipo: "ficha" });
  const verCusto = pode(quem.cargoAtivo, "custos.ver");
  const todas = await linhasDasFichas(db);
  const { fichas, ingredientes, versoes } = await carregarParaConta(
    db,
    todas.map((l) => l.id),
  );
  const analise = analisarFichas(
    fichas,
    ingredientes,
    todas.map((l) => l.id),
  );
  const { precos, fora } = await precosDosAlvos(db, todas);
  const resumo = todas
    .map((l) => {
      const f = fichas.get(l.id)!;
      return resumir(l, f.nome, l.versaoAtualId ? versoes.get(l.versaoAtualId)! : null, analise.get(l.id)!, verCusto, precos.get(l.id), fora.has(l.id));
    })
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));

  const [config, semFicha, ings, produtos, tamanhos, adicionais] = await Promise.all([
    db.selectFrom("ficha_config").select("limite_custo_pb").where("id", "=", 1).executeTakeFirstOrThrow(),
    db
      .selectFrom("produto as p")
      .innerJoin("categoria as c", "c.id", "p.categoria_id")
      .select(["p.id", "p.nome", "c.nome as categoria"])
      .where("p.ativo", "=", true)
      .where("p.combo", "=", false)
      .where((w) => w.not(w.exists(w.selectFrom("ficha as f").select("f.id").whereRef("f.produto_id", "=", "p.id").where("f.ativo", "=", true))))
      .orderBy("c.nome")
      .orderBy("p.nome")
      .execute(),
    db
      .selectFrom("ingrediente")
      .select(["id", "nome", "unidade_base as unidade", "ativo", "custo_ref_centavos as custoCentavos", "custo_ref_quantidade as custoQuantidade"])
      .orderBy("ativo", "desc")
      .orderBy("nome")
      .execute(),
    db.selectFrom("produto").select(["id", "nome", "ativo", "combo"]).orderBy("ativo", "desc").orderBy("nome").execute(),
    db.selectFrom("produto_tamanho").select(["id", "produto_id as produtoId", "nome", "ativo"]).orderBy("produto_id").orderBy("ordem").execute(),
    db
      .selectFrom("adicional as a")
      .innerJoin("grupo_adicional as g", "g.id", "a.grupo_id")
      .select(["a.id", "a.nome", "g.nome as grupo", sql<boolean>`a.ativo AND g.ativo`.as("ativo")])
      .orderBy("g.nome")
      .orderBy("a.ordem")
      .execute(),
  ]);
  return {
    podeVerCusto: verCusto,
    podeGerenciar: pode(quem.cargoAtivo, "cadastros.gerenciar"),
    limiteCustoPb: config.limite_custo_pb,
    fichas: resumo,
    semFicha,
    ingredientes: ings.map((g) => ({
      ...g,
      custoCentavos: verCusto ? g.custoCentavos : null,
      custoQuantidade: verCusto && g.custoQuantidade !== null ? limpo(g.custoQuantidade) : null,
    })),
    produtos,
    tamanhos,
    adicionais,
    nomesParecidos: nomesParecidos(ings.filter((g) => g.ativo)),
  };
}

/** Pares de ingredientes ativos em que um nome contém o outro, palavra por palavra. */
export function nomesParecidos(ings: { id: number; nome: string }[]): PainelDeFichas["nomesParecidos"] {
  const pares: PainelDeFichas["nomesParecidos"] = [];
  const palavras = ings.map((g) => ({ g, p: ` ${nomeComparavel(g.nome)} ` }));
  for (let i = 0; i < palavras.length; i++)
    for (let j = i + 1; j < palavras.length; j++) {
      const a = palavras[i]!;
      const b = palavras[j]!;
      if (a.p.trim().length < 3 || b.p.trim().length < 3) continue;
      if (a.p.includes(b.p) || b.p.includes(a.p))
        pares.push({ a: { id: a.g.id, nome: a.g.nome }, b: { id: b.g.id, nome: b.g.nome } });
    }
  return pares.slice(0, 200);
}

// ---------------------------------------------------------------- uma ficha

export type FichaCompleta = {
  resumo: ResumoDaFicha;
  versao: VersaoDaFicha | null;
  pendencias: Pendencia[];
  /** Consumo por porção (ou por unidade do preparo) por ingrediente; vazio se incompleta. */
  consumo: AnaliseDaFicha["consumo"];
  /** Ingredientes sem custo de referência (só para quem vê custo). */
  semCusto: AnaliseDaFicha["semCusto"];
  /** Custo de cada item (só para quem vê custo): centavos por receita inteira; nulo se não deu. */
  custoDosItens: (number | null)[];
  historico: { id: number; numero: number; criadaPor: string; criadaEm: string; motivo: string | null }[];
  /** Fichas cuja versão atual usa este preparo. */
  usadoEm: { id: number; nome: string }[];
};

export async function verFicha(db: Banco, ator: Ator | null, idDaFicha: unknown): Promise<FichaCompleta> {
  const quem = await exigir(db, ator, "cadastros.ver", { tipo: "ficha" });
  const fichaId = validar(id("Ficha não encontrada."), idDaRota(idDaFicha));
  const verCusto = pode(quem.cargoAtivo, "custos.ver");
  const { fichas, ingredientes, linhas, versoes } = await carregarParaConta(db, [fichaId]);
  const l = linhas.get(fichaId);
  if (!l) throw new ErroDeRegra("nao_encontrado", "Ficha não encontrada.");
  const f = fichas.get(fichaId)!;
  const v = l.versaoAtualId ? versoes.get(l.versaoAtualId)! : null;
  // Analisa a ficha e os preparos dela (para o custo de cada item).
  const preparosDosItens = (v?.itens ?? []).flatMap((i) => (i.preparoId ? [i.preparoId] : []));
  const analise = analisarFichas(fichas, ingredientes, [fichaId, ...preparosDosItens]);
  const a = analise.get(fichaId)!;
  const { precos, fora } = await precosDosAlvos(db, [l]);
  const historico = await db
    .selectFrom("ficha_versao as v")
    .innerJoin("usuario as u", "u.id", "v.criada_por")
    .select(["v.id", "v.numero", "u.nome as criadaPor", "v.criada_em as criadaEm", "v.motivo"])
    .where("v.ficha_id", "=", fichaId)
    .orderBy("v.numero", "desc")
    .execute();
  const usadoEm = await db
    .selectFrom("ficha_item as i")
    .innerJoin("ficha as f", "f.versao_atual_id", "i.versao_id")
    .select("f.id")
    .where("i.preparo_id", "=", fichaId)
    .where("f.ativo", "=", true)
    .distinct()
    .execute();
  const nomesUsado = await nomesDosAlvos(db, await linhasDasFichas(db, usadoEm.map((u) => u.id)));
  const custoDosItens = (v?.itens ?? []).map((i) => custoDoItem(i, ingredientes, analise));
  return {
    resumo: resumir(l, f.nome, v, a, verCusto, precos.get(l.id), fora.has(l.id)),
    versao: v,
    pendencias: a.pendencias,
    consumo: a.consumo,
    semCusto: verCusto ? a.semCusto : [],
    custoDosItens: verCusto ? custoDosItens : custoDosItens.map(() => null),
    historico: historico.map((h) => ({ ...h, criadaEm: new Date(h.criadaEm).toISOString() })),
    usadoEm: usadoEm.map((u) => ({ id: u.id, nome: nomesUsado.get(u.id) ?? "?" })).sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")),
  };
}

function custoDoItem(i: ItemDaFicha, ingredientes: Map<number, IngredienteParaConta>, analise: Map<number, AnaliseDaFicha>): number | null {
  if (i.quantidade === null) return null;
  // Conta exata com as mesmas frações da regra; arredonda só no fim.
  const q = Fracao.decimal(i.quantidade);
  if (i.ingredienteId) {
    const g = ingredientes.get(i.ingredienteId);
    if (!g || g.custoCentavos === null || g.custoQuantidade === null) return null;
    return Number(q.vezes(Fracao.inteiro(g.custoCentavos)).dividido(Fracao.decimal(g.custoQuantidade)).arredondado());
  }
  const sub = i.preparoId ? analise.get(i.preparoId) : undefined;
  if (!sub?.custoExato) return null;
  return Number(q.vezes(sub.custoExato).arredondado());
}

/** Uma versão antiga inteira (para o histórico e para comparar). */
export async function verVersaoDaFicha(db: Banco, ator: Ator | null, idDaVersao: unknown): Promise<VersaoDaFicha & { fichaId: number }> {
  await exigir(db, ator, "cadastros.ver", { tipo: "ficha_versao" });
  const versaoId = validar(id("Versão não encontrada."), idDaRota(idDaVersao));
  const linha = await db.selectFrom("ficha_versao").select("ficha_id").where("id", "=", versaoId).executeTakeFirst();
  if (!linha) throw new ErroDeRegra("nao_encontrado", "Versão não encontrada.");
  const v = (await versoesCompletas(db, [versaoId])).get(versaoId)!;
  return { ...v, fichaId: linha.ficha_id };
}

// ---------------------------------------------------------------- gravar

async function travarFichas(trx: Banco): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('fichas:gravar'))`.execute(trx);
}

/**
 * Cria uma ficha (sem id; `tipo` e o alvo) ou grava uma versão nova (com id e `receita`).
 * `{ id, ativo }` sem receita só liga ou desliga a ficha. A receita vem inteira: itens na ordem,
 * pendências anotadas, etapas. Regras: um item é ingrediente OU preparo, sem repetir; preparo de
 * outra ficha ativa e do tipo preparo; nenhum preparo pode acabar usando a si mesmo; produto
 * ativo e que não seja combo; uma ficha ativa por produto, tamanho ou adicional.
 */
export async function salvarFicha(db: Banco, ator: Ator | null, dados: unknown): Promise<FichaCompleta> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ficha" });
  const d = validar(esquemaFicha, dados);
  if (!d.id && !d.tipo) throw new ErroDeRegra("dados_invalidos", "Escolha o tipo da ficha.");
  if (!d.id && !d.receita) throw new ErroDeRegra("dados_invalidos", "Mande a receita da ficha.");
  if (d.receita) {
    const r = d.receita;
    if ((r.porcaoQuantidade == null) !== (r.porcaoUnidade == null))
      throw new ErroDeRegra("dados_invalidos", "A porção precisa da quantidade e da unidade.");
    const chaves = new Set<string>();
    for (const i of r.itens) {
      if ((i.ingredienteId === undefined) === (i.preparoId === undefined))
        throw new ErroDeRegra("dados_invalidos", "Cada item é um ingrediente ou um preparo.");
      const k = i.ingredienteId ? `i${i.ingredienteId}` : `p${i.preparoId}`;
      if (chaves.has(k)) throw new ErroDeRegra("dados_invalidos", "O mesmo ingrediente ou preparo veio duas vezes. Some as quantidades numa linha.");
      chaves.add(k);
    }
    if (new Set(r.pendencias ?? []).size !== (r.pendencias ?? []).length)
      throw new ErroDeRegra("dados_invalidos", "Pendência repetida.");
  }
  try {
    const fichaId = await db.transaction().execute(async (trx) => {
      await travarFichas(trx);
      let atual: LinhaDaFicha | undefined;
      if (d.id) {
        [atual] = await linhasDasFichas(trx, [d.id]);
        if (!atual) throw new ErroDeRegra("nao_encontrado", "Ficha não encontrada.");
        if (d.tipo && d.tipo !== atual.tipo) throw new ErroDeRegra("dados_invalidos", "O tipo da ficha não muda.");
        if (d.produtoId !== undefined || d.tamanhoId !== undefined || d.adicionalId !== undefined)
          throw new ErroDeRegra("dados_invalidos", "A ficha não troca de produto; desative e crie outra.");
        if (d.unidadeRendimento !== undefined && d.unidadeRendimento !== atual.unidadeRendimento)
          throw new ErroDeRegra("dados_invalidos", "A unidade do rendimento do preparo não muda; desative e crie outro.");
        if (d.nome !== undefined && atual.tipo !== "preparo") throw new ErroDeRegra("dados_invalidos", "Só o preparo tem nome próprio.");
      }
      const tipo = atual?.tipo ?? d.tipo!;

      // Alvo de uma ficha nova.
      if (!atual) await conferirAlvo(trx, tipo, d);

      let id: number;
      if (atual) {
        id = atual.id;
        const mudancas = {
          ...(d.nome === undefined ? {} : { nome: d.nome }),
          ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
        };
        if (d.ativo === false && atual.ativo) await conferirDesativar(trx, atual);
        if (Object.keys(mudancas).length)
          await trx.updateTable("ficha").set({ ...mudancas, atualizado_em: sql`now()` }).where("id", "=", id).execute();
      } else {
        id = (
          await trx
            .insertInto("ficha")
            .values({
              tipo,
              produto_id: tipo === "produto" ? d.produtoId! : null,
              tamanho_id: tipo === "tamanho" ? d.tamanhoId! : null,
              adicional_id: tipo === "adicional" ? d.adicionalId! : null,
              nome: tipo === "preparo" ? d.nome! : null,
              unidade_rendimento: tipo === "preparo" ? d.unidadeRendimento! : null,
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;
      }

      let numero: number | null = null;
      if (d.receita) {
        const ultima = await trx
          .selectFrom("ficha_versao")
          .select((e) => e.fn.max("numero").as("n"))
          .where("ficha_id", "=", id)
          .executeTakeFirst();
        const ultimoNumero = ultima?.n ?? 0;
        if (ultimoNumero > 0 && d.versaoBase !== ultimoNumero)
          throw new ErroDeRegra(
            "conflito",
            `Esta ficha mudou enquanto você editava (agora está na versão ${ultimoNumero}). Abra de novo e refaça a mudança.`,
          );
        await conferirItens(trx, id, d.receita.itens);
        numero = ultimoNumero + 1;
        const r = d.receita;
        const versaoId = (
          await trx
            .insertInto("ficha_versao")
            .values({
              ficha_id: id,
              numero,
              rende: r.rende,
              porcao_quantidade: r.porcaoQuantidade ?? null,
              porcao_unidade: r.porcaoUnidade ?? null,
              tempo_min: r.tempoMin ?? null,
              validade_dias: r.validadeDias ?? null,
              etapas: JSON.stringify((r.etapas ?? []).map((e) => ({ texto: e.texto, minutos: e.minutos ?? null }))),
              equipamentos: r.equipamentos ?? [],
              observacoes: r.observacoes ?? null,
              motivo: r.motivo ?? null,
              criada_por: quem.usuarioId,
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;
        if (r.itens.length)
          await trx
            .insertInto("ficha_item")
            .values(
              r.itens.map((i, k) => ({
                versao_id: versaoId,
                ordem: k + 1,
                ingrediente_id: i.ingredienteId ?? null,
                preparo_id: i.preparoId ?? null,
                quantidade: i.quantidade,
                opcional: i.opcional ?? false,
                medida_caseira: i.medidaCaseira ?? null,
                observacao: i.observacao ?? null,
              })),
            )
            .execute();
        if (r.pendencias?.length)
          await trx
            .insertInto("ficha_pendencia")
            .values(r.pendencias.map((texto) => ({ versao_id: versaoId, texto })))
            .execute();
        await trx.updateTable("ficha").set({ versao_atual_id: versaoId, atualizado_em: sql`now()` }).where("id", "=", id).execute();

        // Receita circular: confere com tudo já gravado (dentro da trava).
        if (tipo === "preparo") {
          const { fichas, ingredientes } = await carregarParaConta(trx, [id]);
          const a = analisarFichas(fichas, ingredientes, [id]).get(id)!;
          const circular = a.pendencias.find((p) => p.tipo === "receita_circular" || p.tipo === "profunda_demais");
          if (circular) throw new ErroDeRegra("dados_invalidos", circular.texto);
        }
      }

      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "ficha",
        alvoId: id,
        detalhes: {
          operacao: !atual ? "criar" : d.receita ? "nova_versao" : "alterar",
          tipo,
          versao: numero,
          motivo: d.receita?.motivo ?? null,
          ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
          ...(d.nome === undefined ? {} : { nome: d.nome }),
        },
        ip: quem.ip,
      });
      return id;
    });
    return await verFicha(db, quem, fichaId);
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === "23505")
      throw new ErroDeRegra(
        "conflito",
        constraint === "ficha_preparo_nome"
          ? "Já existe um preparo ativo com esse nome."
          : constraint === "ficha_versao_numero"
            ? "Esta ficha mudou enquanto você editava. Abra de novo e refaça a mudança."
            : "Este item já tem uma ficha ativa.",
      );
    if (code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum campo está fora do permitido. Confira os campos.");
    if (code === "23503") throw new ErroDeRegra("nao_encontrado", "Algum item escolhido não existe mais.");
    throw e;
  }
}

async function conferirAlvo(trx: Banco, tipo: TipoDeFicha, d: z.output<typeof esquemaFicha>): Promise<void> {
  const so = (campo: "produtoId" | "tamanhoId" | "adicionalId" | "preparo") => {
    const presentes = {
      produtoId: d.produtoId !== undefined,
      tamanhoId: d.tamanhoId !== undefined,
      adicionalId: d.adicionalId !== undefined,
      preparo: d.nome !== undefined || d.unidadeRendimento !== undefined,
    };
    for (const [k, v] of Object.entries(presentes))
      if (k !== campo && v) throw new ErroDeRegra("dados_invalidos", "Mande só o que a ficha descreve (produto, tamanho, adicional ou preparo).");
  };
  if (tipo === "produto") {
    so("produtoId");
    if (!d.produtoId) throw new ErroDeRegra("dados_invalidos", "Escolha o produto.");
    const p = await trx.selectFrom("produto").select(["id", "combo"]).where("id", "=", d.produtoId).where("ativo", "=", true).forShare().executeTakeFirst();
    if (!p) throw new ErroDeRegra("nao_encontrado", "Produto não encontrado ou desativado.");
    if (p.combo) throw new ErroDeRegra("dados_invalidos", "Combo não tem ficha própria: cada opção usa a ficha do seu produto.");
  } else if (tipo === "tamanho") {
    so("tamanhoId");
    if (!d.tamanhoId) throw new ErroDeRegra("dados_invalidos", "Escolha o tamanho.");
    const t = await trx
      .selectFrom("produto_tamanho as t")
      .innerJoin("produto as p", "p.id", "t.produto_id")
      .select("t.id")
      .where("t.id", "=", d.tamanhoId)
      .where("t.ativo", "=", true)
      .where("p.ativo", "=", true)
      .forShare()
      .executeTakeFirst();
    if (!t) throw new ErroDeRegra("nao_encontrado", "Tamanho não encontrado ou desativado.");
  } else if (tipo === "adicional") {
    so("adicionalId");
    if (!d.adicionalId) throw new ErroDeRegra("dados_invalidos", "Escolha o adicional.");
    const a = await trx.selectFrom("adicional").select("id").where("id", "=", d.adicionalId).where("ativo", "=", true).forShare().executeTakeFirst();
    if (!a) throw new ErroDeRegra("nao_encontrado", "Adicional não encontrado ou desativado.");
  } else {
    so("preparo");
    if (!d.nome || !d.unidadeRendimento) throw new ErroDeRegra("dados_invalidos", "O preparo precisa de nome e da unidade em que rende (g, ml ou un).");
  }
}

async function conferirItens(trx: Banco, fichaId: number, itens: z.output<typeof esquemaItem>[]): Promise<void> {
  const ings = itens.flatMap((i) => (i.ingredienteId ? [i.ingredienteId] : []));
  const preps = itens.flatMap((i) => (i.preparoId ? [i.preparoId] : []));
  if (preps.includes(fichaId)) throw new ErroDeRegra("dados_invalidos", "O preparo não pode usar a si mesmo.");
  if (ings.length) {
    const ok = await trx.selectFrom("ingrediente").select("id").where("id", "in", ings).where("ativo", "=", true).forShare().execute();
    if (ok.length !== ings.length) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado ou desativado.");
  }
  if (preps.length) {
    const ok = await trx.selectFrom("ficha").select("id").where("id", "in", preps).where("ativo", "=", true).where("tipo", "=", "preparo").execute();
    if (ok.length !== preps.length) throw new ErroDeRegra("nao_encontrado", "Preparo não encontrado ou desativado.");
  }
}

/** Preparo em uso na versão atual de uma ficha ativa não pode ser desativado. */
async function conferirDesativar(trx: Banco, f: LinhaDaFicha): Promise<void> {
  if (f.tipo !== "preparo") return;
  const uso = await trx
    .selectFrom("ficha_item as i")
    .innerJoin("ficha as x", "x.versao_atual_id", "i.versao_id")
    .select("x.id")
    .where("i.preparo_id", "=", f.id)
    .where("x.ativo", "=", true)
    .execute();
  if (uso.length) {
    const nomes = await nomesDosAlvos(trx, await linhasDasFichas(trx, [...new Set(uso.map((u) => u.id))]));
    throw new ErroDeRegra("conflito", `Este preparo está em uso: ${[...nomes.values()].slice(0, 5).join(", ")}. Tire-o dessas fichas antes.`);
  }
}

// ---------------------------------------------------------------- custo de referência e limite

/** Grava (ou apaga, com custo nulo) o custo de referência de um ingrediente. Pede `custos.ver` também. */
export async function salvarCustoDeReferencia(
  db: Banco,
  ator: Ator | null,
  dados: unknown,
): Promise<{ ingredienteId: number; custoCentavos: number | null; custoQuantidade: string | null }> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente_custo" });
  await exigir(db, quem, "custos.ver", { tipo: "ingrediente_custo" });
  const d = validar(esquemaCusto, dados);
  if (d.custoCentavos !== null && d.quantidade === undefined)
    throw new ErroDeRegra("dados_invalidos", "Informe a quantidade a que o custo se refere (ex.: 1000 g).");
  return db.transaction().execute(async (trx) => {
    const antes = await trx
      .selectFrom("ingrediente")
      .select(["id", "ativo", "custo_ref_centavos", "custo_ref_quantidade"])
      .where("id", "=", d.ingredienteId)
      .forUpdate()
      .executeTakeFirst();
    if (!antes) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
    const valores =
      d.custoCentavos === null
        ? { custo_ref_centavos: null, custo_ref_quantidade: null, custo_ref_em: null }
        : { custo_ref_centavos: d.custoCentavos, custo_ref_quantidade: d.quantidade!, custo_ref_em: sql<Date>`now()` };
    await trx.updateTable("ingrediente").set(valores).where("id", "=", d.ingredienteId).execute();
    const depois = {
      ingredienteId: d.ingredienteId,
      custoCentavos: d.custoCentavos,
      custoQuantidade: d.custoCentavos === null ? null : limpo(d.quantidade!),
    };
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "cadastros.gerenciar",
      resultado: "permitido",
      alvoTipo: "ingrediente_custo",
      alvoId: d.ingredienteId,
      detalhes: {
        antes: { custoCentavos: antes.custo_ref_centavos, custoQuantidade: antes.custo_ref_quantidade === null ? null : limpo(antes.custo_ref_quantidade) },
        depois,
      },
      ip: quem.ip,
    });
    return depois;
  });
}

/** Limite de alerta do custo sobre o preço (pontos-base, 100 a 10000). */
export async function salvarLimiteDeCusto(db: Banco, ator: Ator | null, dados: unknown): Promise<{ limiteCustoPb: number }> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ficha_config" });
  const d = validar(z.object({ limiteCustoPb: inteiro("Limite do custo (em centésimos de %)", 100, 10_000) }, { error: "Limite em formato inválido." }), dados);
  return db.transaction().execute(async (trx) => {
    const antes = await trx.selectFrom("ficha_config").select("limite_custo_pb").where("id", "=", 1).forUpdate().executeTakeFirstOrThrow();
    await trx
      .updateTable("ficha_config")
      .set({ limite_custo_pb: d.limiteCustoPb, atualizado_em: sql`now()`, atualizado_por: quem.usuarioId })
      .where("id", "=", 1)
      .execute();
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "cadastros.gerenciar",
      resultado: "permitido",
      alvoTipo: "ficha_config",
      alvoId: 1,
      detalhes: { antes: antes.limite_custo_pb, depois: d.limiteCustoPb },
      ip: quem.ip,
    });
    return { limiteCustoPb: d.limiteCustoPb };
  });
}

/**
 * Consumo de uma ficha por unidade do rendimento, com as versões usadas (para a E11 gravar no
 * pedido). Recusa ficha com pendência. Quem chama já conferiu a permissão.
 */
export async function consumoDaFicha(
  db: Banco,
  fichaId: number,
): Promise<{ consumo: AnaliseDaFicha["consumo"]; versoes: { fichaId: number; versaoId: number }[] }> {
  const { fichas, ingredientes, linhas } = await carregarParaConta(db, [fichaId]);
  if (!linhas.has(fichaId)) throw new ErroDeRegra("nao_encontrado", "Ficha não encontrada.");
  const a = analisarFichas(fichas, ingredientes, [fichaId]).get(fichaId)!;
  if (!a.completa) throw new ErroDeRegra("conflito", `A ficha tem pendências: ${a.pendencias.map((p) => p.texto).join(" ")}`);
  return {
    consumo: a.consumo,
    versoes: [...linhas.values()].flatMap((l) => (l.versaoAtualId ? [{ fichaId: l.id, versaoId: l.versaoAtualId }] : [])),
  };
}
