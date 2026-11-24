/**
 * Contagem de estoque (E09 parte 4; RC-09 seção 5, item 2; migração 0023; decisão 0027).
 * - Contagem de um item, contagem rápida do dia (poucos itens que o sistema escolhe) e
 *   inventário da área (todos os itens).
 * - CEGA: enquanto está aberta, ninguém recebe quanto o sistema espera. Ao contar, guarda-se o
 *   esperado daquele momento (sob a trava do item); ao fechar, o ajuste é contado - esperado, por
 *   item e local, num movimento "ajuste" ligado à contagem. Venda entre contar e fechar não
 *   atrapalha: ela já saiu do saldo e não entra na diferença.
 * - Permissão: a área da contagem (`estoque.cozinha` ou `estoque.salao`). Valores só com `custos.ver`.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { AREAS_ESTOQUE, NOME_DA_AREA, type AreaEstoque } from "./cadastros";
import { ErroDeRegra } from "./erros";
import { motorDoEstoque as m } from "./estoque";
import { LOCAIS, q4, q4DoBanco, QUANTIDADE_MAXIMA, textoQ4, valorDaSaida, valorPeloCusto, type LocalDoEstoque } from "./estoque-comum";
import { pode } from "./permissoes";
import { type Ator } from "./sessao";

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);
const area = z.enum(AREAS_ESTOQUE, { error: "Área de estoque inválida." });
const local = z.enum(LOCAIS, { error: "Local inválido: em uso ou guardado." });
/** Quantos itens a contagem rápida pede por dia, se a tela não disser outro número. */
export const ITENS_DA_CONTAGEM_RAPIDA = 5;

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const textoCurto = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .min(1, `${rotulo}: escreva algo.`)
    .max(max, `${rotulo} com no máximo ${max} letras.`)
    .refine((v) => !/\p{Cc}/u.test(v), `${rotulo} com caractere inválido.`);

type Contagem = { id: number; tipo: "item" | "rapida" | "inventario"; area: AreaEstoque; situacao: "aberta" | "fechada" | "cancelada" };

/** A contagem, com a situação, e a permissão da área dela. */
async function carregar(db: Banco, ator: Ator | null, contagemId: number): Promise<{ ator: Ator; c: Contagem }> {
  const { ator: a, areas } = await m.exigirAlgumaArea(db, ator);
  const c = await db
    .selectFrom("estoque_contagem as c")
    .leftJoin("estoque_contagem_fim as f", "f.contagem_id", "c.id")
    .select(["c.id", "c.tipo", "c.area", "f.situacao"])
    .where("c.id", "=", contagemId)
    .executeTakeFirst();
  if (!c) throw new ErroDeRegra("nao_encontrado", "Contagem não encontrada.");
  if (!areas.includes(c.area)) await m.exigirAreas(db, a, [c.area]);
  return { ator: a, c: { id: c.id, tipo: c.tipo, area: c.area, situacao: c.situacao ?? "aberta" } };
}

// ---------------------------------------------------------------- abrir

const esquemaAbrir = z
  .object(
    {
      tipo: z.enum(["item", "inventario"], { error: "Tipo de contagem: de itens ou inventário." }),
      area,
      motivo: textoCurto("Motivo", 200).optional(),
      itens: z
        .array(
          z
            .object(
              {
                ingredienteId: id("Ingrediente não encontrado.").optional(),
                preparoId: id("Preparo não encontrado.").optional(),
                /** Sem local: conta os dois (em uso e guardado). */
                local: local.optional(),
              },
              { error: "Item da contagem em formato inválido." },
            )
            .refine((r) => (r.ingredienteId === undefined) !== (r.preparoId === undefined), "Escolha um ingrediente ou um preparo."),
          { error: "Itens da contagem em formato inválido." },
        )
        .max(100, "No máximo 100 itens numa contagem de itens.")
        .optional(),
    },
    { error: "Contagem em formato inválido." },
  )
  .refine((c) => c.tipo === "inventario" || (c.itens?.length ?? 0) > 0, "Escolha os itens para contar.");

/** Abre uma contagem de itens escolhidos ou o inventário da área inteira. */
export async function abrirContagem(db: Banco, ator: Ator | null, dados: unknown): Promise<ContagemVista> {
  if (!ator) await m.exigirAlgumaArea(db, ator);
  const d = validar(esquemaAbrir, dados);
  const quem = await m.exigirAreas(db, ator, [d.area]);
  const id = await db.transaction().execute(async (trx) => {
    let linhas: { itemId: number; local: LocalDoEstoque }[];
    if (d.tipo === "item") {
      const ids = await m.garantirItens(trx, d.itens!);
      linhas = d.itens!.flatMap((i, k) => (i.local ? [i.local] : LOCAIS).map((l) => ({ itemId: ids[k]!, local: l })));
    } else {
      const r = await sql<{ ingrediente_id: number | null; preparo_id: number | null }>`
        SELECT i.id AS ingrediente_id, NULL::int AS preparo_id FROM ingrediente i WHERE i.ativo AND i.area_estoque = ${d.area}
        UNION
        SELECT NULL::int, f.id FROM ficha f LEFT JOIN estoque_item e ON e.preparo_id = f.id
          WHERE f.tipo = 'preparo' AND f.ativo AND coalesce(e.area_preparo, 'cozinha') = ${d.area}
        UNION
        SELECT e.ingrediente_id, e.preparo_id FROM estoque_item e
          WHERE EXISTS (SELECT 1 FROM estoque_saldo s WHERE s.item_id = e.id AND s.area = ${d.area} AND s.quantidade > 0)`.execute(trx);
      if (r.rows.length === 0) throw new ErroDeRegra("conflito", `Não há itens em ${NOME_DA_AREA[d.area]} para contar.`);
      if (r.rows.length > 2000) throw new ErroDeRegra("conflito", "Itens demais para um inventário de uma vez.");
      const ids = await m.garantirItens(
        trx,
        r.rows.map((x) => (x.ingrediente_id !== null ? { ingredienteId: x.ingrediente_id } : { preparoId: x.preparo_id! })),
      );
      linhas = ids.flatMap((itemId) => LOCAIS.map((l) => ({ itemId, local: l })));
    }
    const c = await trx
      .insertInto("estoque_contagem")
      .values({ tipo: d.tipo, area: d.area, motivo: d.motivo ?? null, aberta_por: quem.usuarioId })
      .returning("id")
      .executeTakeFirstOrThrow();
    const unicas = [...new Map(linhas.map((l) => [`${l.itemId}:${l.local}`, l])).values()];
    await trx
      .insertInto("estoque_contagem_item")
      .values(unicas.map((l) => ({ contagem_id: c.id, item_id: l.itemId, local: l.local })))
      .execute();
    return c.id;
  });
  return verContagem(db, quem, { contagemId: id });
}

// ---------------------------------------------------------------- contagem rápida do dia

/**
 * A contagem rápida de hoje da área (cria se ainda não existe). O sistema escolhe poucos itens,
 * nesta ordem: o que faltou numa venda nos últimos 7 dias; o que mais divergiu nas contagens dos
 * últimos 30; o de maior valor na área; e o que está há mais tempo sem contar.
 */
export async function contagemRapidaDoDia(db: Banco, ator: Ator | null, dados: unknown): Promise<ContagemVista> {
  if (!ator) await m.exigirAlgumaArea(db, ator);
  const d = validar(z.object({ area, quantos: z.number({ error: "Quantos itens: um número." }).int().min(1, "Pelo menos 1 item.").max(20, "No máximo 20 itens.").optional() }, { error: "Pedido em formato inválido." }), dados);
  const quem = await m.exigirAreas(db, ator, [d.area]);
  const quantos = d.quantos ?? ITENS_DA_CONTAGEM_RAPIDA;
  const id = await db.transaction().execute(async (trx) => {
    const dia = await m.hoje(trx);
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`estoque_contagem_rapida:${d.area}:${dia}`}))`.execute(trx);
    const ja = await trx.selectFrom("estoque_contagem").select("id").where("tipo", "=", "rapida").where("area", "=", d.area).where("dia", "=", dia).executeTakeFirst();
    if (ja) return ja.id;
    const escolha = await sql<{ item_id: number; motivo: "faltou" | "mais_caro" | "divergiu" | "sem_contar"; ordem: number }>`
      WITH na_area AS (
        SELECT DISTINCT s.item_id FROM estoque_saldo s WHERE s.area = ${d.area} AND s.quantidade > 0
      ),
      faltou AS (
        SELECT mi.item_id, 1 AS ordem, max(m.id) AS peso FROM estoque_movimento_item mi JOIN estoque_movimento m ON m.id = mi.movimento_id
        WHERE mi.faltou > 0 AND m.criado_em > now() - interval '7 days'
          AND (EXISTS (SELECT 1 FROM estoque_movimento_linha l WHERE l.movimento_id = m.id AND l.item_id = mi.item_id AND l.area = ${d.area})
               OR EXISTS (SELECT 1 FROM estoque_item e LEFT JOIN ingrediente i ON i.id = e.ingrediente_id
                          WHERE e.id = mi.item_id AND coalesce(i.area_estoque, e.area_preparo) = ${d.area}))
        GROUP BY mi.item_id
      ),
      divergiu AS (
        SELECT l.item_id, 2 AS ordem, sum(abs(l.quantidade)) AS peso FROM estoque_movimento m JOIN estoque_movimento_linha l ON l.movimento_id = m.id
        WHERE m.tipo = 'ajuste' AND m.contagem_id IS NOT NULL AND m.criado_em > now() - interval '30 days' AND l.area = ${d.area}
        GROUP BY l.item_id
      ),
      caro AS (
        SELECT e.id AS item_id, 3 AS ordem,
          (e.valor_centavos::numeric * (SELECT sum(s.quantidade) FROM estoque_saldo s WHERE s.item_id = e.id AND s.area = ${d.area}) / nullif(e.quantidade, 0)) AS peso
        FROM estoque_item e WHERE e.id IN (SELECT item_id FROM na_area) AND e.valor_centavos > 0
      ),
      sem_contar AS (
        SELECT n.item_id, 4 AS ordem,
          -extract(epoch FROM coalesce((SELECT max(r.contado_em) FROM estoque_contagem_registro r
            JOIN estoque_contagem_item ci ON ci.id = r.contagem_item_id JOIN estoque_contagem c ON c.id = ci.contagem_id
            WHERE ci.item_id = n.item_id AND c.area = ${d.area}), 'epoch'::timestamptz)) AS peso
        FROM na_area n
      ),
      todos AS (
        SELECT item_id, ordem, peso, 'faltou' AS motivo FROM faltou
        UNION ALL SELECT item_id, ordem, peso, 'divergiu' FROM divergiu
        UNION ALL SELECT item_id, ordem, peso, 'mais_caro' FROM caro
        UNION ALL SELECT item_id, ordem, peso, 'sem_contar' FROM sem_contar
      ),
      primeiro AS (
        SELECT DISTINCT ON (item_id) item_id, ordem, peso, motivo FROM todos ORDER BY item_id, ordem, peso DESC NULLS LAST
      )
      SELECT item_id, motivo, ordem FROM primeiro ORDER BY ordem, peso DESC NULLS LAST, item_id LIMIT ${quantos}`.execute(trx);
    const c = await trx
      .insertInto("estoque_contagem")
      .values({ tipo: "rapida", area: d.area, dia, aberta_por: quem.usuarioId, motivo: "Contagem rápida do dia" })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (escolha.rows.length)
      await trx
        .insertInto("estoque_contagem_item")
        .values(escolha.rows.flatMap((x) => LOCAIS.map((l) => ({ contagem_id: c.id, item_id: x.item_id, local: l, motivo: x.motivo }))))
        .execute();
    return c.id;
  });
  return verContagem(db, quem, { contagemId: id });
}

// ---------------------------------------------------------------- ver

export type LinhaDaContagem = {
  contagemItemId: number;
  itemId: number;
  nome: string;
  unidade: string;
  local: LocalDoEstoque;
  motivo: string | null;
  contado: string | null;
  contadoPor: string | null;
  contadoEm: string | null;
  /** Só depois de fechada (a contagem é cega). */
  esperado: string | null;
  diferenca: string | null;
  /** Só depois de fechada e com custos.ver: valor da diferença pelo custo médio de agora. */
  valorDaDiferenca: string | null;
};

export type ContagemVista = {
  id: number;
  tipo: "item" | "rapida" | "inventario";
  area: AreaEstoque;
  dia: string | null;
  motivo: string | null;
  situacao: "aberta" | "fechada" | "cancelada";
  abertaPor: string;
  abertaEm: string;
  fim: { por: string; em: string; observacao: string | null; movimentoId: string | null } | null;
  contados: number;
  linhas: LinhaDaContagem[];
};

/** A contagem com as linhas. Aberta: sem o esperado. */
export async function verContagem(db: Banco, ator: Ator | null, dados: unknown): Promise<ContagemVista> {
  const d = validar(z.object({ contagemId: id("Contagem não encontrada.") }, { error: "Pedido em formato inválido." }), dados);
  const { ator: a, c } = await carregar(db, ator, d.contagemId);
  const comValor = pode(a.cargoAtivo, "custos.ver");
  const fechada = c.situacao === "fechada";
  const cab = await sql<{ dia: string | null; motivo: string | null; aberta_por: string; aberta_em: string; fim_por: string | null; fim_em: string | null; fim_obs: string | null; movimento_id: string | null }>`
    SELECT to_char(c.dia, 'YYYY-MM-DD') AS dia, c.motivo, u.nome AS aberta_por, to_char(c.aberta_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS aberta_em,
      uf.nome AS fim_por, to_char(f.em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fim_em, f.observacao AS fim_obs, f.movimento_id::text AS movimento_id
    FROM estoque_contagem c JOIN usuario u ON u.id = c.aberta_por
    LEFT JOIN estoque_contagem_fim f ON f.contagem_id = c.id LEFT JOIN usuario uf ON uf.id = f.por
    WHERE c.id = ${c.id}`.execute(db);
  const linhas = await sql<{
    id: number;
    item_id: number;
    nome: string;
    unidade: string;
    local: LocalDoEstoque;
    motivo: string | null;
    contado: string | null;
    esperado: string | null;
    por: string | null;
    em: string | null;
    q_item: string;
    v_item: string;
  }>`
    SELECT ci.id, ci.item_id, coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade, ci.local, ci.motivo,
      r.contado::text AS contado, r.esperado::text AS esperado, u.nome AS por, to_char(r.contado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS em,
      e.quantidade::text AS q_item, e.valor_centavos::text AS v_item
    FROM estoque_contagem_item ci JOIN estoque_item e ON e.id = ci.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    LEFT JOIN LATERAL (SELECT * FROM estoque_contagem_registro r WHERE r.contagem_item_id = ci.id ORDER BY r.id DESC LIMIT 1) r ON true
    LEFT JOIN usuario u ON u.id = r.contado_por
    WHERE ci.contagem_id = ${c.id}
    ORDER BY lower(coalesce(i.nome, f.nome)), ci.item_id, ci.local`.execute(db);
  const h = cab.rows[0]!;
  return {
    id: c.id,
    tipo: c.tipo,
    area: c.area,
    dia: h.dia,
    motivo: h.motivo,
    situacao: c.situacao,
    abertaPor: h.aberta_por,
    abertaEm: h.aberta_em,
    fim: h.fim_por ? { por: h.fim_por, em: h.fim_em!, observacao: h.fim_obs, movimentoId: h.movimento_id } : null,
    contados: linhas.rows.filter((x) => x.contado !== null).length,
    linhas: linhas.rows.map((x) => {
      const dif = fechada && x.contado !== null ? q4DoBanco(x.contado) - q4DoBanco(x.esperado!) : null;
      const qI = q4DoBanco(x.q_item);
      const vI = BigInt(x.v_item);
      return {
        contagemItemId: x.id,
        itemId: x.item_id,
        nome: x.nome,
        unidade: x.unidade,
        local: x.local,
        motivo: x.motivo,
        contado: x.contado === null ? null : textoQ4(q4DoBanco(x.contado)),
        contadoPor: x.por,
        contadoEm: x.em,
        esperado: fechada && x.esperado !== null ? textoQ4(q4DoBanco(x.esperado)) : null,
        diferenca: dif === null ? null : textoQ4(dif),
        valorDaDiferenca:
          dif === null || !comValor ? null : (dif < 0n ? -valorDaSaida(qI, vI, -dif) : valorPeloCusto(dif, vI, qI)).toString(),
      };
    }),
  };
}

// ---------------------------------------------------------------- contar

const esquemaContar = z.object(
  {
    contagemId: id("Contagem não encontrada."),
    contagemItemId: id("Item da contagem não encontrado."),
    quantidade: z
      .union([z.string(), z.number()], { error: "Quantidade em formato inválido." })
      .transform((v, ctx) => {
        const q = q4(v);
        if (q === null || q > QUANTIDADE_MAXIMA) {
          ctx.addIssue({ code: "custom", message: "Quantidade: zero ou mais, com até 4 casas depois da vírgula." });
          return z.NEVER;
        }
        return textoQ4(q);
      }),
    unidade: z.string({ error: "Unidade em formato inválido." }).trim().min(1).max(40).optional(),
  },
  { error: "Contagem em formato inválido." },
);

/**
 * Registra quanto a pessoa contou de um item num local. Guarda o esperado daquele momento (sob a
 * trava do item) sem devolvê-lo. Contar de novo vale o último.
 */
export async function registrarContagem(db: Banco, ator: Ator | null, dados: unknown): Promise<{ registroId: number }> {
  if (!ator) await m.exigirAlgumaArea(db, ator);
  const d = validar(esquemaContar, dados);
  const { ator: quem, c } = await carregar(db, ator, d.contagemId);
  return db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock_shared(hashtext(${`estoque_contagem:${c.id}`}))`.execute(trx);
    const fim = await trx.selectFrom("estoque_contagem_fim").select("situacao").where("contagem_id", "=", c.id).executeTakeFirst();
    if (fim) throw new ErroDeRegra("conflito", fim.situacao === "fechada" ? "A contagem já foi fechada." : "A contagem foi cancelada.");
    const ci = await trx.selectFrom("estoque_contagem_item").select(["item_id", "local"]).where("id", "=", d.contagemItemId).where("contagem_id", "=", c.id).executeTakeFirst();
    if (!ci) throw new ErroDeRegra("nao_encontrado", "Item da contagem não encontrado.");
    const itens = await m.travarItens(trx, [ci.item_id]);
    const item = itens.get(ci.item_id)!;
    const q = d.quantidade === "0" ? 0n : await m.quantidadeNaBase(trx, item, d.quantidade, d.unidade);
    const r = await sql<{ q: string }>`
      SELECT coalesce(sum(quantidade), 0)::text AS q FROM estoque_saldo WHERE item_id = ${ci.item_id} AND area = ${c.area} AND local = ${ci.local}`.execute(trx);
    const reg = await trx
      .insertInto("estoque_contagem_registro")
      .values({ contagem_item_id: d.contagemItemId, contado: textoQ4(q), esperado: r.rows[0]!.q, contado_por: quem.usuarioId })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { registroId: reg.id };
  });
}

// ---------------------------------------------------------------- fechar e cancelar

const esquemaFim = z.object(
  {
    contagemId: id("Contagem não encontrada."),
    observacao: textoCurto("Observação", 500).optional(),
  },
  { error: "Pedido em formato inválido." },
);

export type AjusteDaContagem = { itemId: number; nome: string; unidade: string; local: LocalDoEstoque; diferenca: string; aplicado: string };

/**
 * Fecha a contagem e lança o ajuste: para cada item e local contado, contado - esperado. Falta: sai
 * primeiro o vencido, depois o que vence antes, depois o bloqueado (nunca além do que há agora).
 * Sobra: entra num lote novo, pelo custo médio (estimado). Item não contado não muda.
 */
export async function fecharContagem(db: Banco, ator: Ator | null, dados: unknown): Promise<{ movimentoId: string | null; repetido: false; ajustes: AjusteDaContagem[] }> {
  if (!ator) await m.exigirAlgumaArea(db, ator);
  const d = validar(esquemaFim, dados);
  const { ator: quem, c } = await carregar(db, ator, d.contagemId);
  return db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`estoque_contagem:${c.id}`}))`.execute(trx);
    const fim = await trx.selectFrom("estoque_contagem_fim").select("situacao").where("contagem_id", "=", c.id).executeTakeFirst();
    if (fim) throw new ErroDeRegra("conflito", fim.situacao === "fechada" ? "A contagem já foi fechada." : "A contagem foi cancelada.");
    const contadas = await sql<{ item_id: number; local: LocalDoEstoque; contado: string; esperado: string }>`
      SELECT ci.item_id, ci.local, r.contado::text AS contado, r.esperado::text AS esperado
      FROM estoque_contagem_item ci
      JOIN LATERAL (SELECT * FROM estoque_contagem_registro r WHERE r.contagem_item_id = ci.id ORDER BY r.id DESC LIMIT 1) r ON true
      WHERE ci.contagem_id = ${c.id} ORDER BY ci.item_id, ci.local`.execute(trx);
    if (contadas.rows.length === 0) throw new ErroDeRegra("conflito", "Nada foi contado ainda. Conte ao menos um item ou cancele a contagem.");
    const difs = contadas.rows.map((x) => ({ ...x, dif: q4DoBanco(x.contado) - q4DoBanco(x.esperado) })).filter((x) => x.dif !== 0n);
    let movimentoId: string | null = null;
    const ajustes: AjusteDaContagem[] = [];
    if (difs.length) {
      const itens = await m.travarItens(trx, difs.map((x) => x.item_id));
      movimentoId = await m.novoMovimento(trx, {
        tipo: "ajuste",
        autorId: quem.usuarioId,
        motivo: "contagem",
        observacao: d.observacao ?? `Contagem ${c.id}`,
        contagemId: c.id,
      });
      const l = new m.Lancamento(trx, movimentoId, itens);
      for (const x of difs) {
        const item = l.item(x.item_id);
        if (x.dif < 0n) {
          const livres = await m.pedacos(trx, item.id, { area: c.area, local: x.local, modo: "vencido_e_livre" });
          const bloqueados = await m.pedacos(trx, item.id, { area: c.area, local: x.local, modo: "bloqueado" });
          const r = await l.tirar(item.id, [...livres, ...bloqueados], -x.dif);
          if (r.tirado > 0n) l.saida(item.id, r.tirado);
          ajustes.push({ itemId: item.id, nome: item.nome, unidade: item.unidade, local: x.local, diferenca: textoQ4(x.dif), aplicado: textoQ4(-r.tirado) });
        } else {
          const lote = await l.novoLote(item.id, null, "contagem");
          await l.mexer(item.id, lote, c.area, x.local, false, x.dif);
          l.entrada(item.id, x.dif, l.estimar(item.id, x.dif), { estimado: true });
          ajustes.push({ itemId: item.id, nome: item.nome, unidade: item.unidade, local: x.local, diferenca: textoQ4(x.dif), aplicado: textoQ4(x.dif) });
        }
      }
      await l.fechar();
    }
    await trx
      .insertInto("estoque_contagem_fim")
      .values({ contagem_id: c.id, situacao: "fechada", movimento_id: movimentoId, observacao: d.observacao ?? null, por: quem.usuarioId })
      .execute();
    return { movimentoId, repetido: false, ajustes };
  });
}

/** Cancela uma contagem aberta (nada é ajustado; o que foi contado fica no histórico). */
export async function cancelarContagem(db: Banco, ator: Ator | null, dados: unknown): Promise<{ cancelada: true }> {
  if (!ator) await m.exigirAlgumaArea(db, ator);
  const d = validar(esquemaFim.refine((x) => !!x.observacao, "Escreva por que está cancelando."), dados);
  const { ator: quem, c } = await carregar(db, ator, d.contagemId);
  await db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`estoque_contagem:${c.id}`}))`.execute(trx);
    const fim = await trx.selectFrom("estoque_contagem_fim").select("situacao").where("contagem_id", "=", c.id).executeTakeFirst();
    if (fim) throw new ErroDeRegra("conflito", fim.situacao === "fechada" ? "A contagem já foi fechada." : "A contagem já foi cancelada.");
    await trx.insertInto("estoque_contagem_fim").values({ contagem_id: c.id, situacao: "cancelada", observacao: d.observacao!, por: quem.usuarioId }).execute();
  });
  return { cancelada: true };
}

export type ContagemDaLista = Pick<ContagemVista, "id" | "tipo" | "area" | "dia" | "motivo" | "situacao" | "abertaPor" | "abertaEm"> & { itens: number; contados: number };

/** Contagens das áreas da pessoa (a mais nova primeiro). */
export async function listarContagens(db: Banco, ator: Ator | null, filtro: unknown = {}): Promise<ContagemDaLista[]> {
  const f = validar(z.object({ area: area.optional(), situacao: z.enum(["aberta", "fechada", "cancelada"]).optional(), limite: z.number().int().min(1).max(100).optional() }, { error: "Filtro em formato inválido." }), filtro);
  const { areas } = await m.exigirAlgumaArea(db, ator);
  const visiveis = f.area ? areas.filter((a) => a === f.area) : areas;
  if (f.area && !visiveis.length) await m.exigirAreas(db, ator, [f.area]);
  const r = await sql<{ id: number; tipo: ContagemVista["tipo"]; area: AreaEstoque; dia: string | null; motivo: string | null; situacao: ContagemVista["situacao"]; aberta_por: string; aberta_em: string; itens: number; contados: number }>`
    SELECT c.id, c.tipo, c.area, to_char(c.dia, 'YYYY-MM-DD') AS dia, c.motivo, coalesce(f.situacao, 'aberta') AS situacao, u.nome AS aberta_por,
      to_char(c.aberta_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS aberta_em,
      (SELECT count(*)::int FROM estoque_contagem_item ci WHERE ci.contagem_id = c.id) AS itens,
      (SELECT count(*)::int FROM estoque_contagem_item ci WHERE ci.contagem_id = c.id AND EXISTS (SELECT 1 FROM estoque_contagem_registro r WHERE r.contagem_item_id = ci.id)) AS contados
    FROM estoque_contagem c JOIN usuario u ON u.id = c.aberta_por LEFT JOIN estoque_contagem_fim f ON f.contagem_id = c.id
    WHERE c.area = ANY(${visiveis}::text[]) AND (${f.situacao ?? null}::text IS NULL OR coalesce(f.situacao, 'aberta') = ${f.situacao ?? null}::text)
    ORDER BY c.id DESC LIMIT ${f.limite ?? 30}`.execute(db);
  return r.rows.map((x) => ({ id: x.id, tipo: x.tipo, area: x.area, dia: x.dia, motivo: x.motivo, situacao: x.situacao, abertaPor: x.aberta_por, abertaEm: x.aberta_em, itens: x.itens, contados: x.contados }));
}
