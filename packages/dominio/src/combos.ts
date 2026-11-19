/**
 * Combos (passo 3 do plano de 19/11/2026; migração 0017; decisão 0023).
 * Um combo é um produto montado por partes; em cada parte o cliente escolhe uma opção (um produto
 * do cardápio, com tamanho fixo se tiver, e um acréscimo opcional). Aqui ficam a leitura e a
 * gravação das partes, sempre dentro da transação do produto (quem chama já conferiu a permissão).
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { ErroDeRegra } from "./erros";
import {
  nomeComparavel,
  OPCOES_POR_PARTE,
  PARTES_POR_COMBO,
  PRECO_MAXIMO_CENTAVOS,
  type ParteDoCombo,
} from "./produtos-comum";

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);
const centavos = (rotulo: string) =>
  z
    .number({ error: `${rotulo}: em centavos, um número inteiro.` })
    .int(`${rotulo}: em centavos, um número inteiro.`)
    .min(0, `${rotulo}: não pode ser negativo.`)
    .max(PRECO_MAXIMO_CENTAVOS, `${rotulo} de no máximo R$ 9.999,99.`);

const esquemaOpcao = z.object(
  {
    id: id("Opção do combo não encontrada.").optional(),
    produtoId: id("Escolha o produto da opção."),
    /** Obrigatório se o produto tiver tamanhos; proibido se não tiver. */
    tamanhoId: id("Tamanho da opção não encontrado.").nullable().optional(),
    acrescimoCentavos: centavos("Acréscimo da opção"),
    /** Nulo: igual ao da loja. Ausente: nova = igual à loja; existente = fica como está. */
    acrescimoDeliveryCentavos: centavos("Acréscimo da opção no delivery").nullable().optional(),
  },
  { error: "Opção do combo em formato inválido." },
);

const esquemaParte = z.object(
  {
    id: id("Parte do combo não encontrada.").optional(),
    nome: z
      .string({ error: "Informe o nome da parte do combo." })
      .trim()
      .transform((v) => v.replace(/\s+/g, " "))
      .pipe(
        z
          .string()
          .min(1, "Informe o nome da parte do combo.")
          .max(40, "Nome da parte com no máximo 40 letras.")
          .refine((v) => !/\p{Cc}/u.test(v), "Nome da parte com caractere inválido."),
      ),
    opcoes: z
      .array(esquemaOpcao, { error: "Opções do combo em formato inválido." })
      .min(1, "Cada parte do combo precisa de pelo menos uma opção.")
      .max(OPCOES_POR_PARTE, `No máximo ${OPCOES_POR_PARTE} opções por parte.`),
  },
  { error: "Parte do combo em formato inválido." },
);

export const esquemaCombo = z
  .object(
    {
      partes: z
        .array(esquemaParte, { error: "Partes do combo em formato inválido." })
        .min(1, "O combo precisa de pelo menos uma parte.")
        .max(PARTES_POR_COMBO, `No máximo ${PARTES_POR_COMBO} partes por combo.`),
    },
    { error: "Combo em formato inválido." },
  )
  .nullable();

export type DadosDoCombo = z.output<typeof esquemaCombo>;

/** Partes e opções ATIVAS de cada combo pedido, na ordem. */
export async function partesDosCombos(db: Banco, comboIds: number[]): Promise<Map<number, ParteDoCombo[]>> {
  const mapa = new Map<number, ParteDoCombo[]>(comboIds.map((i) => [i, []]));
  if (!comboIds.length) return mapa;
  const partes = await db
    .selectFrom("combo_parte")
    .select(["id", "combo_id as comboId", "nome", "ordem"])
    .where("combo_id", "in", comboIds)
    .where("ativo", "=", true)
    .orderBy("ordem")
    .orderBy("id")
    .execute();
  if (!partes.length) return mapa;
  const opcoes = await db
    .selectFrom("combo_opcao")
    .select([
      "id",
      "parte_id as parteId",
      "produto_id as produtoId",
      "tamanho_id as tamanhoId",
      "acrescimo_centavos as acrescimoCentavos",
      "acrescimo_delivery_centavos as acrescimoDeliveryCentavos",
      "ordem",
    ])
    .where(
      "parte_id",
      "in",
      partes.map((p) => p.id),
    )
    .where("ativo", "=", true)
    .orderBy("ordem")
    .orderBy("id")
    .execute();
  const porParte = new Map<number, ParteDoCombo>();
  for (const { comboId, ...p } of partes) {
    const parte = { ...p, opcoes: [] };
    porParte.set(p.id, parte);
    mapa.get(comboId)!.push(parte);
  }
  for (const { parteId, ...o } of opcoes) porParte.get(parteId)!.opcoes.push(o);
  return mapa;
}

/**
 * Troca as partes do combo pela lista que veio (na ordem); `null` desmonta o combo (tudo inativo).
 * Opção: produto ativo, que não é combo nem o próprio; com tamanho do próprio produto se ele tiver
 * tamanhos. Parte e opção com id precisam ser deste combo.
 */
export async function gravarCombo(trx: Banco, comboId: number, combo: DadosDoCombo): Promise<void> {
  const partesExistentes = await trx
    .selectFrom("combo_parte")
    .select(["id", "ativo"])
    .where("combo_id", "=", comboId)
    .forNoKeyUpdate()
    .execute();
  const lista = combo?.partes ?? [];
  const nomes = new Set<string>();
  for (const p of lista) {
    const k = nomeComparavel(p.nome);
    if (nomes.has(k)) throw new ErroDeRegra("dados_invalidos", `Parte repetida no combo: ${p.nome}.`);
    nomes.add(k);
  }
  const idsPartes = lista.flatMap((p) => (p.id ? [p.id] : []));
  if (new Set(idsPartes).size !== idsPartes.length) throw new ErroDeRegra("dados_invalidos", "A mesma parte do combo veio duas vezes.");
  const desteCombo = new Set(partesExistentes.map((p) => p.id));
  if (idsPartes.some((i) => !desteCombo.has(i))) throw new ErroDeRegra("nao_encontrado", "Parte não encontrada neste combo.");

  // Confere os produtos das opções (FOR SHARE: não somem nem mudam no meio desta gravação).
  const produtoIds = [...new Set(lista.flatMap((p) => p.opcoes.map((o) => o.produtoId)))];
  const produtos = produtoIds.length
    ? await trx.selectFrom("produto").select(["id", "nome", "ativo", "combo"]).where("id", "in", produtoIds).forShare().execute()
    : [];
  const tamanhos = produtoIds.length
    ? await trx.selectFrom("produto_tamanho").select(["id", "produto_id as produtoId"]).where("produto_id", "in", produtoIds).where("ativo", "=", true).forShare().execute()
    : [];
  for (const p of lista)
    for (const o of p.opcoes) {
      const prod = produtos.find((x) => x.id === o.produtoId);
      if (!prod || !prod.ativo) throw new ErroDeRegra("dados_invalidos", `${p.nome}: produto da opção não encontrado ou fora de venda.`);
      if (prod.id === comboId) throw new ErroDeRegra("dados_invalidos", `${p.nome}: o combo não pode ser opção dele mesmo.`);
      if (prod.combo) throw new ErroDeRegra("dados_invalidos", `${p.nome}: ${prod.nome} é um combo; combo dentro de combo não pode.`);
      const dele = tamanhos.filter((t) => t.produtoId === prod.id);
      const tam = o.tamanhoId ?? null;
      if (dele.length && tam === null) throw new ErroDeRegra("dados_invalidos", `${p.nome}: escolha o tamanho de ${prod.nome}.`);
      if (!dele.length && tam !== null) throw new ErroDeRegra("dados_invalidos", `${p.nome}: ${prod.nome} não tem tamanhos.`);
      if (tam !== null && !dele.some((t) => t.id === tam)) throw new ErroDeRegra("dados_invalidos", `${p.nome}: tamanho de ${prod.nome} não encontrado.`);
    }
  for (const p of lista) {
    const vistos = new Set<string>();
    for (const o of p.opcoes) {
      const k = `${o.produtoId}:${o.tamanhoId ?? 0}`;
      if (vistos.has(k)) throw new ErroDeRegra("dados_invalidos", `${p.nome}: a mesma opção veio duas vezes.`);
      vistos.add(k);
    }
  }

  // Partes que saem ficam inativas (e as opções delas também).
  const ficam = new Set(idsPartes);
  const saem = partesExistentes.filter((p) => p.ativo && !ficam.has(p.id)).map((p) => p.id);
  if (saem.length) {
    await trx.updateTable("combo_parte").set({ ativo: false, atualizado_em: sql`now()` }).where("id", "in", saem).execute();
    await trx.updateTable("combo_opcao").set({ ativo: false, atualizado_em: sql`now()` }).where("parte_id", "in", saem).where("ativo", "=", true).execute();
  }
  if (idsPartes.length) await trx.updateTable("combo_parte").set({ ativo: false }).where("id", "in", idsPartes).execute();
  for (const [k, p] of lista.entries()) {
    const valores = { nome: p.nome, ordem: (k + 1) * 10, ativo: true };
    const parteId = p.id
      ? (await trx.updateTable("combo_parte").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", p.id).returning("id").executeTakeFirstOrThrow()).id
      : (await trx.insertInto("combo_parte").values({ ...valores, combo_id: comboId }).returning("id").executeTakeFirstOrThrow()).id;
    await gravarOpcoes(trx, parteId, p.opcoes);
  }
}

async function gravarOpcoes(trx: Banco, parteId: number, opcoes: z.output<typeof esquemaOpcao>[]): Promise<void> {
  const existentes = await trx
    .selectFrom("combo_opcao")
    .select(["id", "ativo", "acrescimo_delivery_centavos as acrescimoDelivery"])
    .where("parte_id", "=", parteId)
    .forNoKeyUpdate()
    .execute();
  const ids = opcoes.flatMap((o) => (o.id ? [o.id] : []));
  if (new Set(ids).size !== ids.length) throw new ErroDeRegra("dados_invalidos", "A mesma opção do combo veio duas vezes.");
  const destaParte = new Set(existentes.map((e) => e.id));
  if (ids.some((i) => !destaParte.has(i))) throw new ErroDeRegra("nao_encontrado", "Opção não encontrada nesta parte do combo.");
  const ficam = new Set(ids);
  const saem = existentes.filter((e) => e.ativo && !ficam.has(e.id)).map((e) => e.id);
  if (saem.length) await trx.updateTable("combo_opcao").set({ ativo: false, atualizado_em: sql`now()` }).where("id", "in", saem).execute();
  if (ids.length) await trx.updateTable("combo_opcao").set({ ativo: false }).where("id", "in", ids).execute();
  for (const [k, o] of opcoes.entries()) {
    const ja = o.id ? existentes.find((e) => e.id === o.id) : undefined;
    const valores = {
      produto_id: o.produtoId,
      tamanho_id: o.tamanhoId ?? null,
      acrescimo_centavos: o.acrescimoCentavos,
      acrescimo_delivery_centavos: o.acrescimoDeliveryCentavos !== undefined ? o.acrescimoDeliveryCentavos : (ja?.acrescimoDelivery ?? null),
      ordem: (k + 1) * 10,
      ativo: true,
    };
    if (o.id) await trx.updateTable("combo_opcao").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", o.id).execute();
    else await trx.insertInto("combo_opcao").values({ ...valores, parte_id: parteId }).execute();
  }
}
