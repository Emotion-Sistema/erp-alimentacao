/**
 * Grupos de adicionais (passo 3 do plano de 19/11/2026; migração 0015; decisão 0021).
 * Um grupo ("Molhos", "Ponto da carne", "Turbine seu lanche") é reutilizável: vários produtos
 * podem oferecer o mesmo grupo. Cada grupo tem mínimo e máximo de escolhas (mínimo 0 = opcional)
 * e itens com preço (pode ser 0), preço no delivery (nulo = igual ao da loja) e quantas vezes o
 * mesmo item entra num pedido. Quem vê: `cadastros.ver`. Quem cria e altera: `cadastros.gerenciar`.
 * Nada se apaga: item que sai e grupo desativado ficam inativos; tudo na auditoria.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import {
  ESCOLHAS_POR_GRUPO,
  ITENS_POR_GRUPO,
  MAXIMO_POR_ITEM,
  nomeComparavel,
  PRECO_MAXIMO_CENTAVOS,
  type Adicional,
  type GrupoDeAdicionais,
} from "./produtos-comum";
import { exigir, type Ator } from "./sessao";

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);

const centavos = (rotulo: string) =>
  z
    .number({ error: `${rotulo}: em centavos, um número inteiro.` })
    .int(`${rotulo}: em centavos, um número inteiro.`)
    .min(0, `${rotulo}: não pode ser negativo.`)
    .max(PRECO_MAXIMO_CENTAVOS, `${rotulo} de no máximo R$ 9.999,99.`);

const nome = (rotulo: string, min: number, max: number) =>
  z
    .string({ error: `Informe o nome do ${rotulo}.` })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(min, min > 1 ? `Nome do ${rotulo} com pelo menos ${min} letras.` : `Informe o nome do ${rotulo}.`)
        .max(max, `Nome do ${rotulo} com no máximo ${max} letras.`)
        .refine((v) => !/\p{Cc}/u.test(v), `Nome do ${rotulo} com caractere inválido.`),
    );

const inteiro = (rotulo: string, min: number, max: number) =>
  z
    .number({ error: `${rotulo}: um número inteiro.` })
    .int(`${rotulo}: um número inteiro.`)
    .min(min, `${rotulo} de pelo menos ${min}.`)
    .max(max, `${rotulo} de no máximo ${max}.`);

const esquemaItem = z.object(
  {
    /** Sem id: item novo. Com id: um item deste grupo (um desativado volta). */
    id: id("Adicional não encontrado.").optional(),
    nome: nome("adicional", 1, 40),
    precoCentavos: centavos("Preço do adicional"),
    /** Nulo ou ausente: igual ao da loja. */
    precoDeliveryCentavos: centavos("Preço do adicional no delivery").nullable().optional(),
    maximoPorItem: inteiro("Vezes por item", 1, MAXIMO_POR_ITEM).optional(),
  },
  { error: "Adicional em formato inválido." },
);

const esquemaGrupo = z.object(
  {
    id: id("Grupo de adicionais não encontrado.").optional(),
    nome: nome("grupo", 2, 40).optional(),
    minimo: inteiro("Mínimo de escolhas", 0, ESCOLHAS_POR_GRUPO).optional(),
    maximo: inteiro("Máximo de escolhas", 1, ESCOLHAS_POR_GRUPO).optional(),
    /** Lista completa e na ordem: o item que não vier fica inativo. Ausente: fica como está. */
    itens: z
      .array(esquemaItem, { error: "Adicionais em formato inválido." })
      .max(ITENS_POR_GRUPO, `No máximo ${ITENS_POR_GRUPO} adicionais por grupo.`)
      .optional(),
    ativo: z.boolean({ error: "Ativo: sim ou não (true ou false)." }).optional(),
  },
  { error: "Dados do grupo de adicionais em formato inválido." },
);

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success)
    throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const colunasDoItem = [
  "id",
  "grupo_id as grupoId",
  "nome",
  "preco_centavos as precoCentavos",
  "preco_delivery_centavos as precoDeliveryCentavos",
  "maximo_por_item as maximoPorItem",
  "ordem",
  "ativo",
] as const;

async function carregarGrupos(db: Banco, ids?: number[]): Promise<GrupoDeAdicionais[]> {
  let q = db.selectFrom("grupo_adicional").select(["id", "nome", "minimo", "maximo", "ativo"]);
  if (ids) {
    if (!ids.length) return [];
    q = q.where("id", "in", ids);
  }
  const grupos = await q.orderBy("ativo", "desc").orderBy("nome").orderBy("id").execute();
  if (!grupos.length) return [];
  const itens = await db
    .selectFrom("adicional")
    .select(colunasDoItem)
    .where(
      "grupo_id",
      "in",
      grupos.map((g) => g.id),
    )
    .orderBy("ativo", "desc")
    .orderBy("ordem")
    .orderBy("id")
    .execute();
  const porGrupo = new Map<number, Adicional[]>(grupos.map((g) => [g.id, []]));
  for (const { grupoId, ...a } of itens) porGrupo.get(grupoId)!.push(a);
  return grupos.map((g) => ({ ...g, itens: porGrupo.get(g.id)! }));
}

/** Todos os grupos de adicionais (ativos primeiro, por nome), com os itens. */
export async function listarGruposDeAdicionais(db: Banco, ator: Ator | null): Promise<GrupoDeAdicionais[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "grupo_adicional" });
  return carregarGrupos(db);
}

/** Os grupos pedidos (para o cálculo do preço do item; quem chama já conferiu a permissão). */
export async function gruposDeAdicionaisPorId(db: Banco, ids: number[]): Promise<GrupoDeAdicionais[]> {
  return carregarGrupos(db, [...new Set(ids)]);
}

/**
 * Cria (sem id; nome obrigatório) ou altera (com id; campo ausente fica como está) um grupo de
 * adicionais. `itens` é a lista completa, na ordem. Regras: mínimo não passa do máximo; grupo
 * ativo com escolha obrigatória precisa ter itens ativos que bastem para o mínimo.
 */
export async function salvarGrupoDeAdicionais(db: Banco, ator: Ator | null, dados: unknown): Promise<GrupoDeAdicionais> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "grupo_adicional" });
  const d = validar(esquemaGrupo, dados);
  if (!d.id && d.nome === undefined) throw new ErroDeRegra("dados_invalidos", "Informe o nome do grupo.");
  if (d.itens) {
    const nomes = new Set<string>();
    for (const i of d.itens) {
      const k = nomeComparavel(i.nome);
      if (nomes.has(k)) throw new ErroDeRegra("dados_invalidos", `Adicional repetido no grupo: ${i.nome}.`);
      nomes.add(k);
    }
    const ids = d.itens.flatMap((i) => (i.id ? [i.id] : []));
    if (new Set(ids).size !== ids.length) throw new ErroDeRegra("dados_invalidos", "O mesmo adicional veio duas vezes.");
  }
  try {
    return await db.transaction().execute(async (trx) => {
      let antes: GrupoDeAdicionais | undefined;
      if (d.id) {
        // FOR UPDATE: espera quem está ligando este grupo a um produto (FOR SHARE) terminar.
        const linha = await trx.selectFrom("grupo_adicional").select("id").where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!linha) throw new ErroDeRegra("nao_encontrado", "Grupo de adicionais não encontrado.");
        [antes] = await carregarGrupos(trx, [d.id]);
      }
      const minimo = d.minimo ?? antes?.minimo ?? 0;
      const maximo = d.maximo ?? antes?.maximo ?? 1;
      if (minimo > maximo)
        throw new ErroDeRegra("dados_invalidos", "O mínimo de escolhas não pode passar do máximo.");

      const valores = {
        ...(d.nome === undefined ? {} : { nome: d.nome }),
        ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
        minimo,
        maximo,
      };
      const grupoId = antes
        ? (
            await trx
              .updateTable("grupo_adicional")
              .set({ ...valores, atualizado_em: sql`now()` })
              .where("id", "=", antes.id)
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id
        : (await trx.insertInto("grupo_adicional").values({ ...valores, nome: d.nome! }).returning("id").executeTakeFirstOrThrow()).id;

      if (d.itens) await gravarItens(trx, grupoId, d.itens);
      const [depois] = await carregarGrupos(trx, [grupoId]);
      const capacidade = depois!.itens.filter((i) => i.ativo).reduce((s, i) => s + i.maximoPorItem, 0);
      if (depois!.ativo && depois!.minimo > capacidade)
        throw new ErroDeRegra(
          "dados_invalidos",
          depois!.minimo === 1
            ? "Escolha obrigatória precisa de pelo menos um adicional ativo no grupo."
            : `Com mínimo de ${depois!.minimo} escolhas, os adicionais ativos não bastam. Inclua mais ou diminua o mínimo.`,
        );
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "grupo_adicional",
        alvoId: grupoId,
        detalhes: { operacao: antes ? "alterar" : "criar", antes: antes ?? null, depois },
        ip: quem.ip,
      });
      return depois!;
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === "23505")
      throw new ErroDeRegra(
        "conflito",
        constraint === "adicional_nome" ? "Adicional repetido no grupo." : "Já existe um grupo de adicionais ativo com esse nome.",
      );
    if (code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum campo está fora do permitido. Confira os campos.");
    throw e;
  }
}

async function gravarItens(trx: Banco, grupoId: number, lista: z.output<typeof esquemaItem>[]): Promise<void> {
  const existentes = await trx.selectFrom("adicional").select(["id", "ativo"]).where("grupo_id", "=", grupoId).forNoKeyUpdate().execute();
  const deste = new Set(existentes.map((e) => e.id));
  const ids = lista.flatMap((i) => (i.id ? [i.id] : []));
  if (ids.some((i) => !deste.has(i))) throw new ErroDeRegra("nao_encontrado", "Adicional não encontrado neste grupo.");
  const ficam = new Set(ids);
  const saem = existentes.filter((e) => e.ativo && !ficam.has(e.id)).map((e) => e.id);
  if (saem.length)
    await trx.updateTable("adicional").set({ ativo: false, atualizado_em: sql`now()` }).where("id", "in", saem).execute();
  // Tira os nomes do caminho (um item pode receber o nome de outro na mesma gravação).
  if (ids.length) await trx.updateTable("adicional").set({ ativo: false }).where("id", "in", ids).execute();
  for (const [k, i] of lista.entries()) {
    const valores = {
      nome: i.nome,
      preco_centavos: i.precoCentavos,
      preco_delivery_centavos: i.precoDeliveryCentavos ?? null,
      maximo_por_item: i.maximoPorItem ?? 1,
      ordem: (k + 1) * 10,
      ativo: true,
    };
    if (i.id) await trx.updateTable("adicional").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", i.id).execute();
    else await trx.insertInto("adicional").values({ ...valores, grupo_id: grupoId }).execute();
  }
}
