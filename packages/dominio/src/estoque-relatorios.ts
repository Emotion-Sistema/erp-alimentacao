/**
 * Relatórios do estoque (E09 parte 5; decisão 0027): perdas por motivo e em reais, diferenças das
 * contagens e valor do estoque por área. Só leitura. Cada um vê as próprias áreas; valores em
 * reais só com `custos.ver` e todas as áreas (o valor é do item inteiro, pelo custo médio).
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { AREAS_ESTOQUE, type AreaEstoque } from "./cadastros";
import { ErroDeRegra } from "./erros";
import { motorDoEstoque as m, painelDoEstoque } from "./estoque";
import { q4DoBanco, textoQ4 } from "./estoque-comum";
import { pode } from "./permissoes";
import { exigir, type Ator } from "./sessao";

const data = z.iso.date({ error: "Data em formato inválido (use AAAA-MM-DD)." });
const esquemaPeriodo = z
  .object({ desde: data, ate: data, area: z.enum(AREAS_ESTOQUE, { error: "Área de estoque inválida." }).optional() }, { error: "Período em formato inválido." })
  .refine((p) => p.desde <= p.ate, "A data inicial vem antes da final.")
  .refine((p) => (Date.parse(p.ate) - Date.parse(p.desde)) / 86_400_000 <= 366, "Período de no máximo 1 ano.");

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

async function areasDoPedido(db: Banco, ator: Ator | null, area?: AreaEstoque) {
  const { ator: a, areas } = await m.exigirAlgumaArea(db, ator);
  if (area && !areas.includes(area)) await m.exigirAreas(db, a, [area]);
  const escolhidas = area ? [area] : areas;
  return { ator: a, areas: escolhidas, comValor: pode(a.cargoAtivo, "custos.ver") && areas.length === AREAS_ESTOQUE.length };
}

/** Dia local da loja de um instante (para o filtro do período). */
const DIA_LOCAL = sql`(m.criado_em AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date`;

export type LinhaDePerda = { motivo: string; itemId: number; nome: string; unidade: string; vezes: number; quantidade: string; valorCentavos: string | null };
export type RelatorioDePerdas = { porMotivo: { motivo: string; vezes: number; valorCentavos: string | null }[]; itens: LinhaDePerda[]; totalCentavos: string | null };

/** Perdas do período (desfeitas não contam), por motivo e por item. */
export async function relatorioDePerdas(db: Banco, ator: Ator | null, dados: unknown): Promise<RelatorioDePerdas> {
  const d = validar(esquemaPeriodo, dados);
  const { areas, comValor } = await areasDoPedido(db, ator, d.area);
  const r = await sql<{ motivo: string; item_id: number; nome: string; unidade: string; vezes: number; quantidade: string }>`
    SELECT m.motivo, mi.item_id, coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade,
      count(DISTINCT m.id)::int AS vezes, sum(-l.quantidade)::text AS quantidade
    FROM estoque_movimento m
    JOIN estoque_movimento_item mi ON mi.movimento_id = m.id
    JOIN estoque_movimento_linha l ON l.movimento_id = m.id AND l.item_id = mi.item_id AND l.area = ANY(${areas}::text[])
    JOIN estoque_item e ON e.id = mi.item_id LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    WHERE m.tipo = 'perda' AND ${DIA_LOCAL} BETWEEN ${d.desde}::date AND ${d.ate}::date
      AND NOT EXISTS (SELECT 1 FROM estoque_movimento x WHERE x.estorno_de = m.id)
    GROUP BY m.motivo, mi.item_id, coalesce(i.nome, f.nome), coalesce(i.unidade_base, f.unidade_rendimento)
    ORDER BY 5 DESC, 3`.execute(db);
  // O valor por item soma os movimentos (não as linhas, que podem ser várias por movimento).
  const valores = await sql<{ motivo: string; item_id: number; valor: string }>`
    SELECT m.motivo, mi.item_id, sum(-mi.valor_centavos)::text AS valor
    FROM estoque_movimento m JOIN estoque_movimento_item mi ON mi.movimento_id = m.id
    WHERE m.tipo = 'perda' AND ${DIA_LOCAL} BETWEEN ${d.desde}::date AND ${d.ate}::date
      AND NOT EXISTS (SELECT 1 FROM estoque_movimento x WHERE x.estorno_de = m.id)
      AND EXISTS (SELECT 1 FROM estoque_movimento_linha l WHERE l.movimento_id = m.id AND l.item_id = mi.item_id AND l.area = ANY(${areas}::text[]))
    GROUP BY m.motivo, mi.item_id`.execute(db);
  const valorDe = new Map(valores.rows.map((v) => [`${v.motivo}:${v.item_id}`, BigInt(v.valor)]));
  const itens: LinhaDePerda[] = r.rows.map((x) => ({
    motivo: x.motivo,
    itemId: x.item_id,
    nome: x.nome,
    unidade: x.unidade,
    vezes: x.vezes,
    quantidade: textoQ4(q4DoBanco(x.quantidade)),
    valorCentavos: comValor ? (valorDe.get(`${x.motivo}:${x.item_id}`) ?? 0n).toString() : null,
  }));
  const motivos = new Map<string, { vezes: number; v: bigint }>();
  for (const i of itens) {
    const a = motivos.get(i.motivo) ?? { vezes: 0, v: 0n };
    a.vezes += i.vezes;
    a.v += valorDe.get(`${i.motivo}:${i.itemId}`) ?? 0n;
    motivos.set(i.motivo, a);
  }
  const total = [...motivos.values()].reduce((t, x) => t + x.v, 0n);
  return {
    porMotivo: [...motivos.entries()].map(([motivo, x]) => ({ motivo, vezes: x.vezes, valorCentavos: comValor ? x.v.toString() : null })).sort((a, b) => b.vezes - a.vezes),
    itens,
    totalCentavos: comValor ? total.toString() : null,
  };
}

export type LinhaDeDiferenca = {
  contagemId: number;
  tipo: string;
  area: AreaEstoque;
  fechadaEm: string;
  itemId: number;
  nome: string;
  unidade: string;
  local: string;
  esperado: string;
  contado: string;
  /** Contado menos esperado. */
  diferenca: string;
  /** O que o ajuste lançou de fato (a falta pode ser limitada pelo que havia). */
  aplicado: string;
  /** Valor que o ajuste lançou no fechamento (não muda com compras depois). */
  valorCentavos: string | null;
};

const MAX_LINHAS = 2000;

/** Diferenças das contagens fechadas no período (só as linhas com diferença; ajuste desfeito não conta). */
export async function relatorioDeContagens(
  db: Banco,
  ator: Ator | null,
  dados: unknown,
): Promise<{ linhas: LinhaDeDiferenca[]; cortado: boolean; faltaCentavos: string | null; sobraCentavos: string | null }> {
  const d = validar(esquemaPeriodo, dados);
  const { areas, comValor } = await areasDoPedido(db, ator, d.area);
  const origem = sql`
    FROM estoque_contagem c JOIN estoque_contagem_fim fi ON fi.contagem_id = c.id AND fi.situacao = 'fechada'
    JOIN estoque_contagem_item ci ON ci.contagem_id = c.id
    JOIN LATERAL (SELECT * FROM estoque_contagem_registro r WHERE r.contagem_item_id = ci.id ORDER BY r.id DESC LIMIT 1) r ON true`;
  const filtro = sql`
    WHERE c.area = ANY(${areas}::text[]) AND r.contado <> r.esperado
      AND NOT EXISTS (SELECT 1 FROM estoque_movimento x WHERE x.estorno_de = fi.movimento_id)
      AND (fi.em AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date BETWEEN ${d.desde}::date AND ${d.ate}::date`;
  const r = await sql<{ contagem_id: number; tipo: string; area: AreaEstoque; em: string; item_id: number; nome: string; unidade: string; local: string; esperado: string; contado: string; aplicado: string | null; v: string | null }>`
    SELECT c.id AS contagem_id, c.tipo, c.area, to_char(fi.em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS em,
      ci.item_id, coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade, ci.local,
      r.esperado::text AS esperado, r.contado::text AS contado,
      (SELECT sum(l.quantidade) FROM estoque_movimento_linha l WHERE l.movimento_id = fi.movimento_id AND l.item_id = ci.item_id AND l.area = c.area AND l.local = ci.local)::text AS aplicado,
      fi.valores ->> ci.id::text AS v
    ${origem}
    JOIN estoque_item e ON e.id = ci.item_id LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    ${filtro}
    ORDER BY fi.em DESC, nome, ci.id LIMIT ${MAX_LINHAS + 1}`.execute(db);
  // Totais sobre o período inteiro, mesmo quando a lista é cortada.
  const t = await sql<{ falta: string; sobra: string }>`
    SELECT coalesce(sum(-(fi.valores ->> ci.id::text)::bigint) FILTER (WHERE (fi.valores ->> ci.id::text)::bigint < 0), 0)::text AS falta,
      coalesce(sum((fi.valores ->> ci.id::text)::bigint) FILTER (WHERE (fi.valores ->> ci.id::text)::bigint > 0), 0)::text AS sobra
    ${origem}
    ${filtro}`.execute(db);
  const linhas = r.rows.slice(0, MAX_LINHAS).map((x) => ({
    contagemId: x.contagem_id,
    tipo: x.tipo,
    area: x.area,
    fechadaEm: x.em,
    itemId: x.item_id,
    nome: x.nome,
    unidade: x.unidade,
    local: x.local,
    esperado: textoQ4(q4DoBanco(x.esperado)),
    contado: textoQ4(q4DoBanco(x.contado)),
    diferenca: textoQ4(q4DoBanco(x.contado) - q4DoBanco(x.esperado)),
    aplicado: textoQ4(x.aplicado === null ? 0n : q4DoBanco(x.aplicado)),
    valorCentavos: comValor ? BigInt(x.v ?? "0").toString() : null,
  }));
  return {
    linhas,
    cortado: r.rows.length > MAX_LINHAS,
    faltaCentavos: comValor ? t.rows[0]!.falta : null,
    sobraCentavos: comValor ? t.rows[0]!.sobra : null,
  };
}

/** Valor do estoque por área (e o total), pelo custo médio. Exige `custos.ver` e cuidar de alguma área (o financeiro, sem área, não vê). */
export async function valorDoEstoquePorArea(db: Banco, ator: Ator | null): Promise<{ areas: { area: AreaEstoque; valorCentavos: string; itens: number }[]; totalCentavos: string }> {
  const quem = await exigir(db, ator, "custos.ver", { tipo: "estoque_valor" });
  // Mesma regra dos outros relatórios: valor só para quem vê todas as áreas.
  const { areas: minhas } = await m.exigirAlgumaArea(db, quem);
  if (minhas.length !== AREAS_ESTOQUE.length) throw new ErroDeRegra("sem_permissao", "O valor do estoque é para quem cuida de todas as áreas.");
  const painel = await painelDoEstoque(db, quem, {});
  const porArea = new Map<AreaEstoque, { v: bigint; itens: number }>();
  for (const i of painel)
    for (const a of i.areas) {
      const x = porArea.get(a.area) ?? { v: 0n, itens: 0 };
      x.v += BigInt(a.valorCentavos ?? "0");
      x.itens += 1;
      porArea.set(a.area, x);
    }
  const areas = AREAS_ESTOQUE.filter((a) => porArea.has(a)).map((a) => ({ area: a, valorCentavos: porArea.get(a)!.v.toString(), itens: porArea.get(a)!.itens }));
  return { areas, totalCentavos: areas.reduce((t, a) => t + BigInt(a.valorCentavos), 0n).toString() };
}
