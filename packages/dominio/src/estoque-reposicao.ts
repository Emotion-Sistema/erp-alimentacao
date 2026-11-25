/**
 * Linhas de reposição (E10 parte 1, só regras; RC-09 seções 3 e 4; migração 0025; decisão 0029).
 * - `definirLinhas`: saudável, emergência e nível de abastecimento do em uso, por item e área; e
 *   como avisar o uso do guardado (urgente, normal ou desligado). Quem cuida da área define (como o
 *   resto do estoque): cozinha = cozinheira; salão = supervisor; a gestão (gerente geral, dono,
 *   administrador) em todas. Cada mudança fica no histórico com quem e quando.
 * - O estado (saudável, repor, emergência, esgotado) muda na transação de cada movimento
 *   (estoque-reposicao-estado.ts); aqui só se lê.
 * - `reavaliarReposicao`: a virada do dia (lote que venceu sem movimento), pelo worker.
 * - `itensParaRepor`: o ponto de encaixe com a lista de compras (outra frente): o que está abaixo
 *   da linha e quanto falta para voltar à linha saudável. Não cria lista.
 * - `sugerirLinhas`: sugestão a partir do consumo real (nunca grava sozinha) e o "dura até".
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { AREAS_ESTOQUE, type AreaEstoque } from "./cadastros";
import { ErroDeRegra } from "./erros";
import { motorDoEstoque } from "./estoque";
import { acaoDaArea, q4, q4DoBanco, QUANTIDADE_MAXIMA, textoQ4 } from "./estoque-comum";
import {
  AVISOS_DO_GUARDADO,
  avaliarReposicao,
  gravidade,
  type AvisoDoGuardado,
  type ParParaReavaliar,
  type SituacaoDeReposicao,
} from "./estoque-reposicao-estado";
import { Fracao } from "./fichas-comum";
import { pode } from "./permissoes";
import { exigir, type Ator } from "./sessao";

const { garantirItens, travarItens, exigirAreas, exigirAlgumaArea, quantidadeNaBase, areasPadrao, hoje } = motorDoEstoque;

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", p.error.issues.map((i) => i.message).join(" "));
  return p.data;
}

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);
const area = z.enum(AREAS_ESTOQUE, { error: "Área de estoque inválida." });
const referencia = {
  ingredienteId: id("Ingrediente não encontrado.").optional(),
  preparoId: id("Preparo não encontrado.").optional(),
};
type Referencia = { ingredienteId?: number; preparoId?: number };
const umItem = (r: Referencia) => (r.ingredienteId === undefined) !== (r.preparoId === undefined);
const MSG_UM_ITEM = "Escolha um ingrediente ou um preparo.";

/** Quantidade de uma linha: zero ou mais, até 4 casas; nulo (ou ausente) = sem esta linha. */
const valorDaLinha = (rotulo: string) =>
  z
    .union([z.string(), z.number(), z.null()], { error: `${rotulo}: um número.` })
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return null;
      const q = q4(v);
      if (q === null || q > QUANTIDADE_MAXIMA) {
        ctx.addIssue({ code: "custom", message: `${rotulo}: um número de zero para cima, com até 4 casas depois da vírgula.` });
        return z.NEVER;
      }
      return q;
    });

const esquemaLinhas = z
  .object(
    {
      ...referencia,
      /** Sem ela, a área do item. */
      area: area.optional(),
      saudavel: valorDaLinha("Linha saudável"),
      emergencia: valorDaLinha("Linha de emergência"),
      abastecimento: valorDaLinha("Nível de abastecimento"),
      /** Unidade em que as linhas foram informadas (sem ela, a do estoque). */
      unidade: z.string({ error: "Unidade em formato inválido." }).trim().min(1, "Unidade em formato inválido.").max(40, "Unidade em formato inválido.").optional(),
      avisoGuardado: z.enum(AVISOS_DO_GUARDADO, { error: "Aviso do guardado: urgente, normal ou desligado." }).optional(),
      observacao: z
        .string({ error: "Observação em formato inválido." })
        .trim()
        .max(500, "Observação com no máximo 500 letras.")
        .refine((v) => !/[^\P{Cc}\n\r\t]/u.test(v), "Observação com caractere inválido.")
        .transform((v) => (v === "" ? null : v))
        .optional(),
    },
    { error: "Linhas em formato inválido." },
  )
  .refine(umItem, MSG_UM_ITEM);

export type LinhasDaArea = {
  itemId: number;
  area: AreaEstoque;
  unidade: string;
  saudavel: string | null;
  emergencia: string | null;
  abastecimento: string | null;
  avisoGuardado: AvisoDoGuardado;
  alteradoPor: string | null;
  alteradoEm: string | null;
  /** Nulo enquanto há contagem aberta do item nesta área para quem não é da gestão (contagem cega). */
  situacao: SituacaoDeReposicao | null;
  usandoGuardado: boolean | null;
  abastecer: boolean | null;
};

/**
 * Define (substitui) as linhas do item na área. O que não vier fica sem linha (nulo); o aviso do
 * guardado volta a "urgente" se não vier. Emergência não pode ser maior que a saudável. Reavalia o
 * estado na mesma transação (sob a trava do item): se o item já está abaixo da linha nova, o
 * aviso sai agora, uma vez. Mandar as mesmas linhas de novo não muda nada nem repete o histórico.
 */
export async function definirLinhas(db: Banco, ator: Ator | null, dados: unknown): Promise<LinhasDaArea> {
  if (!ator) await exigir(db, ator, "estoque.cozinha", { tipo: "estoque_linha" });
  const d = validar(esquemaLinhas, dados);
  const [padrao] = await areasPadrao(db, [d]);
  const ar = d.area ?? padrao!;
  const quem = await exigirAreas(db, ator, [ar]);
  await db.transaction().execute(async (trx) => {
    const [itemId] = await garantirItens(trx, [d]);
    const itens = await travarItens(trx, [itemId!]);
    const item = itens.get(itemId!)!;
    const naBase = async (q: bigint | null) => (q === null || q === 0n ? q : quantidadeNaBase(trx, item, textoQ4(q), d.unidade));
    const saudavel = await naBase(d.saudavel);
    const emergencia = await naBase(d.emergencia);
    const abastecimento = await naBase(d.abastecimento);
    if (saudavel !== null && emergencia !== null && emergencia > saudavel)
      throw new ErroDeRegra("dados_invalidos", "A linha de emergência não pode ser maior que a linha saudável.");
    const avisoGuardado = d.avisoGuardado ?? "urgente";
    const atual = await trx.selectFrom("estoque_linha").selectAll().where("item_id", "=", item.id).where("area", "=", ar).executeTakeFirst();
    const igual =
      atual &&
      nuloQ4(atual.saudavel) === saudavel &&
      nuloQ4(atual.emergencia) === emergencia &&
      nuloQ4(atual.abastecimento) === abastecimento &&
      atual.aviso_guardado === avisoGuardado &&
      atual.observacao === (d.observacao ?? null);
    if (!igual) {
      const valores = {
        saudavel: saudavel === null ? null : textoQ4(saudavel),
        emergencia: emergencia === null ? null : textoQ4(emergencia),
        abastecimento: abastecimento === null ? null : textoQ4(abastecimento),
        aviso_guardado: avisoGuardado,
        observacao: d.observacao ?? null,
        alterado_por: quem.usuarioId,
        alterado_em: sql<Date>`clock_timestamp()`,
      };
      await trx
        .insertInto("estoque_linha")
        .values({ item_id: item.id, area: ar, ...valores })
        .onConflict((oc) => oc.columns(["item_id", "area"]).doUpdateSet(valores))
        .execute();
      await avaliarReposicao(trx, [{ itemId: item.id, area: ar, usouGuardado: false }], null);
    }
  });
  const r = await linhasDoItem(db, quem, { ingredienteId: d.ingredienteId, preparoId: d.preparoId });
  return r.areas.find((x) => x.area === ar)!;
}

const nuloQ4 = (t: string | null) => (t === null ? null : q4DoBanco(t));

/** Há contagem aberta do item na área (para esconder a situação de quem conta). */
async function areasEmContagem(db: Banco, itemId: number): Promise<Set<AreaEstoque>> {
  const r = await sql<{ area: AreaEstoque }>`
    SELECT DISTINCT c.area FROM estoque_contagem c JOIN estoque_contagem_item ci ON ci.contagem_id = c.id
    WHERE ci.item_id = ${itemId} AND NOT EXISTS (SELECT 1 FROM estoque_contagem_fim f WHERE f.contagem_id = c.id)`.execute(db);
  return new Set(r.rows.map((x) => x.area));
}

export type MudancaDeLinha = {
  area: AreaEstoque;
  saudavel: string | null;
  emergencia: string | null;
  abastecimento: string | null;
  avisoGuardado: AvisoDoGuardado;
  observacao: string | null;
  por: string;
  em: string;
};

/**
 * Linhas e estado do item nas áreas da pessoa (a do item e as que têm linha ou estado), com as
 * últimas mudanças das linhas. Quem não cuida de nenhuma dessas áreas é recusado (auditado).
 */
export async function linhasDoItem(db: Banco, ator: Ator | null, ref: unknown): Promise<{ areas: LinhasDaArea[]; mudancas: MudancaDeLinha[] }> {
  const r = validar(z.object(referencia, { error: "Item em formato inválido." }).refine(umItem, MSG_UM_ITEM), ref);
  const { ator: a, areas: minhas } = await exigirAlgumaArea(db, ator);
  const [padrao] = await areasPadrao(db, [r]);
  const item = await db
    .selectFrom("estoque_item")
    .select("id")
    .where(r.ingredienteId !== undefined ? "ingrediente_id" : "preparo_id", "=", (r.ingredienteId ?? r.preparoId)!)
    .executeTakeFirst();
  const unidade = await unidadeDe(db, r);
  const linhas = item
    ? await sql<{ area: AreaEstoque; saudavel: string | null; emergencia: string | null; abastecimento: string | null; aviso_guardado: AvisoDoGuardado | null; por: string | null; em: string | null; situacao: SituacaoDeReposicao | null; usando: boolean | null; abastecer: boolean | null }>`
        SELECT ar.area, ln.saudavel::text AS saudavel, ln.emergencia::text AS emergencia, ln.abastecimento::text AS abastecimento, ln.aviso_guardado,
          u.nome AS por, to_char(ln.alterado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS em,
          st.situacao, st.usando_guardado AS usando, st.abastecer
        FROM (SELECT area FROM estoque_linha WHERE item_id = ${item.id} UNION SELECT area FROM estoque_reposicao_estado WHERE item_id = ${item.id}) ar
        LEFT JOIN estoque_linha ln ON ln.item_id = ${item.id} AND ln.area = ar.area
        LEFT JOIN usuario u ON u.id = ln.alterado_por
        LEFT JOIN estoque_reposicao_estado st ON st.item_id = ${item.id} AND st.area = ar.area`.execute(db)
    : { rows: [] };
  const doItem = new Set<AreaEstoque>([padrao!, ...linhas.rows.map((x) => x.area)]);
  const visiveis = AREAS_ESTOQUE.filter((x) => doItem.has(x) && minhas.includes(x));
  if (visiveis.length === 0) await exigir(db, a, acaoDaArea(padrao!), { tipo: "estoque_linha", id: padrao! });
  const cegas = item && !pode(a.cargoAtivo, "estoque.desfazer") ? await areasEmContagem(db, item.id) : new Set<AreaEstoque>();
  const areas = visiveis.map((ar): LinhasDaArea => {
    const x = linhas.rows.find((l) => l.area === ar);
    const cego = cegas.has(ar);
    return {
      itemId: item?.id ?? 0,
      area: ar,
      unidade,
      saudavel: x?.saudavel == null ? null : textoQ4(q4DoBanco(x.saudavel)),
      emergencia: x?.emergencia == null ? null : textoQ4(q4DoBanco(x.emergencia)),
      abastecimento: x?.abastecimento == null ? null : textoQ4(q4DoBanco(x.abastecimento)),
      avisoGuardado: x?.aviso_guardado ?? "urgente",
      alteradoPor: x?.por ?? null,
      alteradoEm: x?.em ?? null,
      situacao: cego ? null : (x?.situacao ?? null),
      usandoGuardado: cego ? null : (x?.usando ?? null),
      abastecer: cego ? null : (x?.abastecer ?? null),
    };
  });
  const mudancas = item
    ? (
        await sql<{ area: AreaEstoque; saudavel: string | null; emergencia: string | null; abastecimento: string | null; aviso_guardado: AvisoDoGuardado; observacao: string | null; por: string; em: string }>`
          SELECT m.area, m.saudavel::text AS saudavel, m.emergencia::text AS emergencia, m.abastecimento::text AS abastecimento, m.aviso_guardado, m.observacao,
            u.nome AS por, to_char(m.em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS em
          FROM estoque_linha_mudanca m JOIN usuario u ON u.id = m.por
          WHERE m.item_id = ${item.id} AND m.area = ANY(${visiveis}::text[]) ORDER BY m.id DESC LIMIT 20`.execute(db)
      ).rows.map((m) => ({
        area: m.area,
        saudavel: m.saudavel === null ? null : textoQ4(q4DoBanco(m.saudavel)),
        emergencia: m.emergencia === null ? null : textoQ4(q4DoBanco(m.emergencia)),
        abastecimento: m.abastecimento === null ? null : textoQ4(q4DoBanco(m.abastecimento)),
        avisoGuardado: m.aviso_guardado,
        observacao: m.observacao,
        por: m.por,
        em: m.em,
      }))
    : [];
  return { areas, mudancas };
}

async function unidadeDe(db: Banco, r: Referencia): Promise<string> {
  if (r.ingredienteId !== undefined) {
    const i = await db.selectFrom("ingrediente").select("unidade_base").where("id", "=", r.ingredienteId).executeTakeFirst();
    if (!i) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
    return i.unidade_base;
  }
  const f = await db.selectFrom("ficha").select("unidade_rendimento").where("id", "=", r.preparoId!).where("tipo", "=", "preparo").executeTakeFirst();
  if (!f) throw new ErroDeRegra("nao_encontrado", "Preparo não encontrado.");
  return String(f.unidade_rendimento);
}

// ---------------------------------------------------------------- ponto de encaixe: lista de compras

export type ItemParaRepor = {
  itemId: number;
  ingredienteId: number | null;
  preparoId: number | null;
  nome: string;
  unidade: string;
  area: AreaEstoque;
  situacao: Exclude<SituacaoDeReposicao, "saudavel">;
  /** Livre agora (em uso + guardado; sem bloqueado, vencido nem "a receber"). */
  quantidade: string;
  /** Vindo de outra área, esperando confirmação: só informação (não conta no total). */
  aReceber: string;
  saudavel: string | null;
  emergencia: string | null;
  /** Quanto comprar para voltar à linha saudável; nulo sem linha saudável. */
  paraRepor: string | null;
  usandoGuardado: boolean;
  fornecedor: { id: number; nome: string; prazoEntregaDias: number | null } | null;
  desde: string;
};

/**
 * O que precisa de compra agora (repor, emergência, esgotado), o mais grave primeiro, com a
 * quantidade para voltar à linha saudável. É o que a lista de compras (outra frente) vai ler; aqui
 * nada é criado. Só para quem compra (`compras.gerenciar`: gerente geral, dono, administrador).
 */
export async function itensParaRepor(db: Banco, ator: Ator | null, filtro: unknown = {}): Promise<ItemParaRepor[]> {
  await exigir(db, ator, "compras.gerenciar", { tipo: "estoque_reposicao" });
  const f = validar(z.object({ area: area.optional() }, { error: "Filtro em formato inválido." }), filtro);
  const r = await sql<{
    item_id: number;
    ingrediente_id: number | null;
    preparo_id: number | null;
    nome: string;
    unidade: string;
    area: AreaEstoque;
    situacao: Exclude<SituacaoDeReposicao, "saudavel">;
    quantidade: string;
    a_receber: string;
    saudavel: string | null;
    emergencia: string | null;
    usando: boolean;
    fornecedor_id: number | null;
    fornecedor: string | null;
    prazo: number | null;
    desde: string;
  }>`
    SELECT st.item_id, e.ingrediente_id, e.preparo_id, coalesce(i.nome, fi.nome) AS nome, coalesce(i.unidade_base, fi.unidade_rendimento) AS unidade,
      st.area, st.situacao, st.quantidade::text AS quantidade,
      coalesce((SELECT sum(s.quantidade) FROM estoque_saldo s WHERE s.item_id = st.item_id AND s.area = st.area AND s.local = 'a_receber' AND s.quantidade > 0), 0)::text AS a_receber,
      ln.saudavel::text AS saudavel, ln.emergencia::text AS emergencia, st.usando_guardado AS usando,
      fo.id AS fornecedor_id, fo.nome AS fornecedor, fo.prazo_entrega_dias AS prazo,
      to_char((SELECT max(ev.em) FROM estoque_reposicao_evento ev WHERE ev.item_id = st.item_id AND ev.area = st.area AND ev.tipo = 'situacao' AND ev.para = st.situacao)
        AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS desde
    FROM estoque_reposicao_estado st
    JOIN estoque_item e ON e.id = st.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha fi ON fi.id = e.preparo_id
    LEFT JOIN fornecedor fo ON fo.id = i.fornecedor_id
    LEFT JOIN estoque_linha ln ON ln.item_id = st.item_id AND ln.area = st.area
    WHERE st.situacao <> 'saudavel' AND (${f.area ?? null}::text IS NULL OR st.area = ${f.area ?? null}::text)
      AND coalesce(i.ativo, fi.ativo)`.execute(db);
  return r.rows
    .map((x) => {
      const q = q4DoBanco(x.quantidade);
      const s = x.saudavel === null ? null : q4DoBanco(x.saudavel);
      return {
        itemId: x.item_id,
        ingredienteId: x.ingrediente_id,
        preparoId: x.preparo_id,
        nome: x.nome,
        unidade: x.unidade,
        area: x.area,
        situacao: x.situacao,
        quantidade: textoQ4(q),
        aReceber: textoQ4(q4DoBanco(x.a_receber)),
        saudavel: s === null ? null : textoQ4(s),
        emergencia: x.emergencia === null ? null : textoQ4(q4DoBanco(x.emergencia)),
        paraRepor: s !== null && s > q ? textoQ4(s - q) : null,
        usandoGuardado: x.usando,
        fornecedor: x.fornecedor_id === null ? null : { id: x.fornecedor_id, nome: x.fornecedor!, prazoEntregaDias: x.prazo },
        desde: x.desde,
      };
    })
    .sort((a, b) => gravidade(b.situacao) - gravidade(a.situacao) || a.nome.localeCompare(b.nome, "pt-BR") || a.area.localeCompare(b.area));
}

// ---------------------------------------------------------------- virada do dia (worker)

/** Itens por transação na reavaliação da virada do dia: poucos, para não segurar a venda. */
const ITENS_POR_BLOCO = 10;

/**
 * Reavalia o estado de reposição dos itens e áreas que podem ter mudado só porque o dia passou (um
 * lote venceu sem movimento do item). Roda no worker, de hora em hora e logo depois da virada do
 * dia da loja. Usa a mesma avaliação e a mesma trava dos movimentos (itens por id, em blocos
 * pequenos, uma transação por bloco): os avisos saem uma vez por cruzamento, mesmo com duas
 * execuções ao mesmo tempo (a segunda espera a trava e lê o estado que a primeira gravou).
 * `agora` (para teste): o instante em que o dia da loja é calculado; sem ele, agora.
 */
export async function reavaliarReposicao(db: Banco, opcoes: { agora?: Date } = {}): Promise<{ dia: string; avaliados: number }> {
  const agora = opcoes.agora?.toISOString() ?? null;
  const dia = (
    await sql<{ d: string }>`
      SELECT to_char(CASE WHEN ${agora}::timestamptz IS NULL THEN hoje_na_loja()
        ELSE (${agora}::timestamptz AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date END, 'YYYY-MM-DD') AS d`.execute(db)
  ).rows[0]!.d;
  // Lote com saldo livre que venceu depois da última avaliação (ou item ainda sem estado na área
  // dele ou numa área com linha). O resto não muda com o dia.
  const r = await sql<{ item_id: number; area: AreaEstoque }>`
    SELECT DISTINCT s.item_id, s.area
    FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
    JOIN estoque_item e ON e.id = s.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id
    LEFT JOIN estoque_reposicao_estado st ON st.item_id = s.item_id AND st.area = s.area
    WHERE s.quantidade > 0 AND NOT s.bloqueado AND s.local IN ('em_uso', 'guardado') AND l.validade < ${dia}::date
      AND CASE WHEN st.item_id IS NOT NULL THEN l.validade >= st.dia
        ELSE s.area = coalesce(i.area_estoque, e.area_preparo) OR EXISTS (SELECT 1 FROM estoque_linha ln WHERE ln.item_id = s.item_id AND ln.area = s.area) END
    ORDER BY s.item_id, s.area`.execute(db);
  const porItem = new Map<number, ParParaReavaliar[]>();
  for (const x of r.rows) porItem.set(x.item_id, [...(porItem.get(x.item_id) ?? []), { itemId: x.item_id, area: x.area, usouGuardado: false }]);
  const ids = [...porItem.keys()];
  for (let k = 0; k < ids.length; k += ITENS_POR_BLOCO) {
    const bloco = ids.slice(k, k + ITENS_POR_BLOCO);
    await db.transaction().execute(async (trx) => {
      await travarItens(trx, bloco);
      await avaliarReposicao(trx, bloco.flatMap((i) => porItem.get(i)!), null, dia);
    });
  }
  return { dia, avaliados: r.rows.length };
}

// ---------------------------------------------------------------- sugestão de linhas e "dura até"

export type ContaDaSugestao = {
  /** Consumo no período, em dez-milésimos da unidade do estoque. */
  consumo: bigint;
  dias: number;
  prazoDias: number;
  folgaDias: number;
  /** Livre agora, em dez-milésimos. */
  total: bigint;
};

/**
 * A conta da sugestão (RC-09 seção 3), sem banco, exata e arredondada só no fim (meio para cima):
 * média diária = consumo / dias; emergência = média x prazo do fornecedor; saudável = emergência +
 * média x dias de folga; dura = livre / média (dias inteiros, para baixo). Sem consumo: sem
 * sugestão e sem "dura até".
 */
export function calcularSugestao(c: ContaDaSugestao): { mediaDiaria: bigint; emergencia: bigint | null; saudavel: bigint | null; duraDias: number | null } {
  if (c.dias <= 0) throw new Error("Período sem dias.");
  const dias = BigInt(c.dias);
  const media = new Fracao(c.consumo, dias).arredondado();
  if (c.consumo <= 0n) return { mediaDiaria: 0n, emergencia: null, saudavel: null, duraDias: null };
  const emergencia = new Fracao(c.consumo * BigInt(c.prazoDias), dias).arredondado();
  const folga = new Fracao(c.consumo * BigInt(c.folgaDias), dias).arredondado();
  return { mediaDiaria: media, emergencia, saudavel: emergencia + folga, duraDias: Number((c.total * dias) / c.consumo) };
}

const esquemaSugestao = z
  .object(
    {
      ...referencia,
      area: area.optional(),
      /** Quantos dias de consumo olhar (até `ate`, inclusive). */
      dias: z.number({ error: "Dias: um número inteiro." }).int("Dias: um número inteiro.").min(1, "Dias: de 1 a 365.").max(365, "Dias: de 1 a 365.").optional(),
      /** Último dia do período (AAAA-MM-DD); sem ele, hoje. */
      ate: z.iso.date({ error: "Data em formato inválido (use AAAA-MM-DD)." }).optional(),
      /** Prazo de entrega, se o cadastro do fornecedor não tiver. */
      prazoDias: z.number({ error: "Prazo: um número inteiro de dias." }).int("Prazo: um número inteiro de dias.").min(0, "Prazo: de 0 a 90 dias.").max(90, "Prazo: de 0 a 90 dias.").optional(),
      folgaDias: z.number({ error: "Folga: um número inteiro de dias." }).int("Folga: um número inteiro de dias.").min(0, "Folga: de 0 a 90 dias.").max(90, "Folga: de 0 a 90 dias.").optional(),
    },
    { error: "Pedido de sugestão em formato inválido." },
  )
  .refine(umItem, MSG_UM_ITEM);

export type SugestaoDeLinhas = {
  area: AreaEstoque;
  unidade: string;
  de: string;
  ate: string;
  dias: number;
  consumo: string;
  mediaDiaria: string;
  prazoDias: number;
  prazoDe: "fornecedor" | "informado";
  folgaDias: number;
  emergencia: string | null;
  saudavel: string | null;
  /** Livre agora e "dura até" no ritmo do período; nulos durante a contagem cega (quem não é da gestão). */
  total: string | null;
  duraDias: number | null;
  duraAte: string | null;
  atuais: { saudavel: string | null; emergencia: string | null };
};

export const DIAS_DA_SUGESTAO = 28;
export const FOLGA_DA_SUGESTAO = 3;

/**
 * Sugere as linhas de um item numa área pelo consumo real (consumo de venda e gasto em produção,
 * menos o que foi desfeito) dos últimos `dias` dias até `ate`. Só sugere: nada é gravado; quem
 * decide aceita com `definirLinhas`. Prazo: o do fornecedor do ingrediente, se houver; senão o
 * informado (sem nenhum, recusa pedindo o prazo).
 */
export async function sugerirLinhas(db: Banco, ator: Ator | null, dados: unknown): Promise<SugestaoDeLinhas> {
  if (!ator) await exigir(db, ator, "estoque.cozinha", { tipo: "estoque_linha" });
  const d = validar(esquemaSugestao, dados);
  const [padrao] = await areasPadrao(db, [d]);
  const ar = d.area ?? padrao!;
  const quem = await exigirAreas(db, ator, [ar]);
  const unidade = await unidadeDe(db, d);
  const fornecedor =
    d.ingredienteId !== undefined
      ? await db
          .selectFrom("ingrediente as i")
          .innerJoin("fornecedor as f", "f.id", "i.fornecedor_id")
          .select("f.prazo_entrega_dias as prazo")
          .where("i.id", "=", d.ingredienteId)
          .executeTakeFirst()
      : undefined;
  const prazoDoCadastro = fornecedor?.prazo ?? null;
  const prazoDias = prazoDoCadastro ?? d.prazoDias;
  if (prazoDias === undefined) throw new ErroDeRegra("dados_invalidos", "O fornecedor deste item não tem prazo de entrega no cadastro: informe em quantos dias ele entrega.");
  const dias = d.dias ?? DIAS_DA_SUGESTAO;
  const folgaDias = d.folgaDias ?? FOLGA_DA_SUGESTAO;
  const ate = d.ate ?? (await hoje(db));
  const de = somarDias(ate, -(dias - 1));
  const item = await db
    .selectFrom("estoque_item")
    .select("id")
    .where(d.ingredienteId !== undefined ? "ingrediente_id" : "preparo_id", "=", (d.ingredienteId ?? d.preparoId)!)
    .executeTakeFirst();
  let consumo = 0n;
  let total = 0n;
  if (item) {
    // Por movimento, o saldo líquido do item na área: consumo e produção que gastaram (líquido
    // negativo; a passagem automática se anula dentro da área) e o desfazer deles (líquido positivo).
    const r = await sql<{ consumo: string; total: string }>`
      WITH por_mov AS (
        SELECT m.id, m.tipo, sum(l.quantidade) AS q
        FROM estoque_movimento m JOIN estoque_movimento_linha l ON l.movimento_id = m.id
        LEFT JOIN estoque_movimento o ON o.id = m.estorno_de
        WHERE l.item_id = ${item.id} AND l.area = ${ar}
          AND (m.tipo IN ('consumo', 'producao') OR (m.tipo = 'estorno' AND o.tipo IN ('consumo', 'producao')))
          AND (m.criado_em AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date BETWEEN ${de}::date AND ${ate}::date
        GROUP BY m.id, m.tipo
      )
      SELECT coalesce(-sum(q) FILTER (WHERE (tipo <> 'estorno' AND q < 0) OR (tipo = 'estorno' AND q > 0)), 0)::text AS consumo,
        coalesce((SELECT sum(s.quantidade) FROM estoque_saldo s JOIN estoque_lote lo ON lo.id = s.lote_id
          WHERE s.item_id = ${item.id} AND s.area = ${ar} AND s.local IN ('em_uso', 'guardado') AND s.quantidade > 0 AND NOT s.bloqueado
            AND coalesce(lo.validade >= hoje_na_loja(), true)), 0)::text AS total
      FROM por_mov`.execute(db);
    consumo = q4DoBanco(r.rows[0]!.consumo);
    if (consumo < 0n) consumo = 0n;
    total = q4DoBanco(r.rows[0]!.total);
  }
  const conta = calcularSugestao({ consumo, dias, prazoDias, folgaDias, total });
  const cego = item && !pode(quem.cargoAtivo, "estoque.desfazer") ? (await areasEmContagem(db, item.id)).has(ar) : false;
  const atuais = item ? await db.selectFrom("estoque_linha").select(["saudavel", "emergencia"]).where("item_id", "=", item.id).where("area", "=", ar).executeTakeFirst() : undefined;
  const dia = await hoje(db);
  return {
    area: ar,
    unidade,
    de,
    ate,
    dias,
    consumo: textoQ4(consumo),
    mediaDiaria: textoQ4(conta.mediaDiaria),
    prazoDias,
    prazoDe: prazoDoCadastro !== null ? "fornecedor" : "informado",
    folgaDias,
    emergencia: conta.emergencia === null ? null : textoQ4(conta.emergencia),
    saudavel: conta.saudavel === null ? null : textoQ4(conta.saudavel),
    total: cego ? null : textoQ4(total),
    duraDias: cego ? null : conta.duraDias,
    duraAte: cego || conta.duraDias === null ? null : somarDias(dia, conta.duraDias),
    atuais: {
      saudavel: atuais?.saudavel == null ? null : textoQ4(q4DoBanco(atuais.saudavel)),
      emergencia: atuais?.emergencia == null ? null : textoQ4(q4DoBanco(atuais.emergencia)),
    },
  };
}

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
