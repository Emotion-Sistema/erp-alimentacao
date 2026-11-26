/**
 * Desperdício por vencimento (ideia nº 15, aprovada em 25/11/2026; D1 e D7; RC-09 "Lote perto do
 * vencimento"; migração 0029; decisão 0029).
 *
 * - `dinheiroEmRisco` (D1): quanto em R$ vence nos próximos 3 e 7 dias, por área e item (quantidade do
 *   lote x custo médio do item), e quanto já venceu e continua no estoque. Só com `custos.ver`, e só
 *   nas áreas que a pessoa vê.
 * - `avisarValidades` (D1 e D7, no worker de hora em hora): um aviso por lote e área, uma vez só
 *   (tabela `estoque_lote_aviso`, chave primária, sob uma trava):
 *   - "perto do vencimento" (normal): lote livre que vence hoje ou nos próximos `DIAS_PERTO_DO_VENCIMENTO`
 *     dias, para quem cuida da área e para o gerente geral. Não avisa o lote que já ENTROU perto do
 *     vencimento (ex.: molho feito hoje que vale 2 dias): esse se sabe na entrada (D4a) e a cozinha usa
 *     no dia;
 *   - "vencido sem perda" (normal, D7): lote vencido há `DIAS_VENCIDO_SEM_PERDA` dias ou mais que ainda
 *     tem saldo (livre ou bloqueado): ninguém registrou a perda. Para quem cuida da área.
 *   O aviso vale até o fim do turno (RC-18). Por isso só nasce com a loja em turno: o que vence de
 *   madrugada avisa na primeira hora do turno seguinte.
 * Os textos não têm quantidades (a contagem cega vale também nos avisos).
 * Hipóteses (26/11/2026): 2 dias para "perto" e 2 dias para "vencido sem perda"; quando houver
 * configuração, os dias saem dela.
 *
 * Este arquivo importa estoque.ts (estoque.ts não o importa).
 */
import { sql, type Banco } from "@erp/banco";
import { criarAviso } from "./avisos";
import { AREAS_ESTOQUE, NOME_DA_AREA, type AreaEstoque } from "./cadastros";
import { q4DoBanco, textoQ4, valorDaSaida } from "./estoque-comum";
import { quemCuidaDaArea } from "./estoque-reposicao-estado";
import { areasDoAtor } from "./estoque";
import type { Cargo } from "./permissoes";
import { exigir, type Ator } from "./sessao";

export const DIAS_PERTO_DO_VENCIMENTO = 2;
export const DIAS_VENCIDO_SEM_PERDA = 2;

export const TIPOS_DE_AVISO_DE_VALIDADE = {
  perto: "estoque.perto_do_vencimento",
  vencido: "estoque.vencido_sem_perda",
} as const;

// ---------------------------------------------------------------- D1: dinheiro em risco

export type ItemEmRisco = {
  itemId: number;
  nome: string;
  unidade: string;
  area: AreaEstoque;
  /** Quantidade livre que vence de hoje até hoje + 3 dias, e até hoje + 7 dias (a de 7 inclui a de 3). */
  quantidade3: string;
  quantidade7: string;
  valor3Centavos: string;
  valor7Centavos: string;
  /** Vencido que continua no estoque (livre ou bloqueado). */
  quantidadeVencida: string;
  valorVencidoCentavos: string;
  /** A validade mais próxima entre os lotes que contam aqui. */
  primeiraValidade: string;
};

export type DinheiroEmRisco = {
  hoje: string;
  em3DiasCentavos: string;
  em7DiasCentavos: string;
  vencidoCentavos: string;
  porArea: { area: AreaEstoque; em3DiasCentavos: string; em7DiasCentavos: string; vencidoCentavos: string }[];
  itens: ItemEmRisco[];
};

/**
 * D1. "Vence em 3 dias" = validade de hoje até hoje + 3 (o último dia de uso é a validade). Só o em
 * uso e o guardado (o "a receber" ainda não é da área). O valor é a parte do valor do item que cabe
 * à quantidade (custo médio, como na saída). `dia` só para testes.
 */
export async function dinheiroEmRisco(db: Banco, ator: Ator | null, opcoes: { dia?: string } = {}): Promise<DinheiroEmRisco> {
  await exigir(db, ator, "custos.ver", { tipo: "estoque_validade" });
  const areas = areasDoAtor(ator);
  const r = await sql<{
    item_id: number;
    nome: string;
    unidade: string;
    area: AreaEstoque;
    q3: string;
    q7: string;
    qv: string;
    primeira: string;
    q_total: string;
    v_total: string;
    hoje: string;
  }>`
    WITH d AS (SELECT coalesce(${opcoes.dia ?? null}::date, hoje_na_loja()) AS dia)
    SELECT s.item_id, coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade, s.area,
      coalesce(sum(s.quantidade) FILTER (WHERE NOT s.bloqueado AND l.validade >= d.dia AND l.validade <= d.dia + 3), 0)::text AS q3,
      coalesce(sum(s.quantidade) FILTER (WHERE NOT s.bloqueado AND l.validade >= d.dia AND l.validade <= d.dia + 7), 0)::text AS q7,
      coalesce(sum(s.quantidade) FILTER (WHERE l.validade < d.dia), 0)::text AS qv,
      to_char(min(l.validade) FILTER (WHERE l.validade < d.dia OR NOT s.bloqueado), 'YYYY-MM-DD') AS primeira,
      e.quantidade::text AS q_total, e.valor_centavos::text AS v_total, to_char(d.dia, 'YYYY-MM-DD') AS hoje
    FROM d, estoque_saldo s
    JOIN estoque_lote l ON l.id = s.lote_id
    JOIN estoque_item e ON e.id = s.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id
    LEFT JOIN ficha f ON f.id = e.preparo_id
    WHERE s.quantidade > 0 AND s.local IN ('em_uso', 'guardado') AND s.area = ANY(${areas}::text[])
      AND l.validade IS NOT NULL AND l.validade <= d.dia + 7
    GROUP BY s.item_id, i.nome, f.nome, i.unidade_base, f.unidade_rendimento, s.area, e.quantidade, e.valor_centavos, d.dia
    HAVING sum(s.quantidade) FILTER (WHERE l.validade < d.dia OR (NOT s.bloqueado AND l.validade >= d.dia)) > 0
    ORDER BY lower(coalesce(i.nome, f.nome)), s.item_id, s.area`.execute(db);
  const hoje = r.rows[0]?.hoje ?? (await sql<{ d: string }>`SELECT to_char(coalesce(${opcoes.dia ?? null}::date, hoje_na_loja()), 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
  const somaArea = new Map<AreaEstoque, { v3: bigint; v7: bigint; vv: bigint }>();
  let t3 = 0n;
  let t7 = 0n;
  let tv = 0n;
  const itens: ItemEmRisco[] = r.rows.map((x) => {
    const qT = q4DoBanco(x.q_total);
    const vT = BigInt(x.v_total);
    const q3 = q4DoBanco(x.q3);
    const q7 = q4DoBanco(x.q7);
    const qv = q4DoBanco(x.qv);
    const v3 = valorDaSaida(qT, vT, q3);
    const v7 = valorDaSaida(qT, vT, q7);
    const vv = valorDaSaida(qT, vT, qv);
    const a = somaArea.get(x.area) ?? { v3: 0n, v7: 0n, vv: 0n };
    somaArea.set(x.area, { v3: a.v3 + v3, v7: a.v7 + v7, vv: a.vv + vv });
    t3 += v3;
    t7 += v7;
    tv += vv;
    return {
      itemId: x.item_id,
      nome: x.nome,
      unidade: x.unidade,
      area: x.area,
      quantidade3: textoQ4(q3),
      quantidade7: textoQ4(q7),
      valor3Centavos: v3.toString(),
      valor7Centavos: v7.toString(),
      quantidadeVencida: textoQ4(qv),
      valorVencidoCentavos: vv.toString(),
      primeiraValidade: x.primeira,
    };
  });
  return {
    hoje,
    em3DiasCentavos: t3.toString(),
    em7DiasCentavos: t7.toString(),
    vencidoCentavos: tv.toString(),
    porArea: AREAS_ESTOQUE.filter((a) => somaArea.has(a)).map((a) => {
      const s = somaArea.get(a)!;
      return { area: a, em3DiasCentavos: s.v3.toString(), em7DiasCentavos: s.v7.toString(), vencidoCentavos: s.vv.toString() };
    }),
    itens,
  };
}

// ---------------------------------------------------------------- D1 e D7: avisos por lote

const GERENCIA: readonly Cargo[] = ["gerente_geral"];

/** Quem cuida da área; se ninguém cuida só dela, o gerente geral. */
function daArea(area: AreaEstoque): Cargo[] {
  const c = quemCuidaDaArea(area);
  return c.length ? c : [...GERENCIA];
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function quandoVence(dias: number, validade: string): string {
  if (dias <= 0) return `hoje (${ddmm(validade)})`;
  if (dias === 1) return `amanhã (${ddmm(validade)})`;
  return `em ${dias} dias (${ddmm(validade)})`;
}

type Candidato = {
  lote_id: number;
  area: AreaEstoque;
  item_id: number;
  nome: string;
  validade: string;
  codigo: string | null;
  dias: number;
  tipo: "perto_do_vencimento" | "vencido_sem_perda";
};

/**
 * Manda os avisos de validade que faltam (D1 "perto do vencimento" e D7 "vencido sem perda"). Pode
 * rodar muitas vezes, ao mesmo tempo: cada lote avisa uma vez só por área e tipo. `dia` e `agora`
 * só para testes.
 */
export async function avisarValidades(db: Banco, opcoes: { dia?: string; agora?: Date } = {}): Promise<{ perto: number; vencidos: number; foraDoTurno: boolean }> {
  return db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtext('estoque:avisos_validade'))`.execute(trx);
    const u = await sql<{ id: number; no_turno: boolean }>`
      SELECT u.id, EXISTS (SELECT 1 FROM turno_em(u.id, coalesce(${opcoes.agora ?? null}::timestamptz, now()))) AS no_turno
      FROM unidade u ORDER BY u.id LIMIT 1`.execute(trx);
    const unidade = u.rows[0];
    if (!unidade) return { perto: 0, vencidos: 0, foraDoTurno: false };
    if (!unidade.no_turno) return { perto: 0, vencidos: 0, foraDoTurno: true };
    // Lote e área com saldo no em uso ou guardado, com validade. Perto: tem saldo livre, vence de hoje
    // até hoje + N e entrou com mais de N dias de validade. Vencido: validade antes de hoje - N + 1
    // (vencido há N dias ou mais), com qualquer saldo. E ainda sem o aviso do tipo.
    const r = await sql<Candidato>`
      WITH d AS (SELECT coalesce(${opcoes.dia ?? null}::date, hoje_na_loja()) AS dia,
                        coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo') AS fuso),
      c AS (
        SELECT s.lote_id, s.area, l.item_id, l.validade, l.codigo, l.criado_em, bool_or(NOT s.bloqueado) AS tem_livre
        FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id, d
        WHERE s.quantidade > 0 AND s.local IN ('em_uso', 'guardado') AND l.validade IS NOT NULL
          AND (l.validade <= d.dia + ${DIAS_PERTO_DO_VENCIMENTO}::int)
        GROUP BY s.lote_id, s.area, l.item_id, l.validade, l.codigo, l.criado_em
      ),
      t AS (
        SELECT c.*, CASE
            WHEN c.validade < d.dia - ${DIAS_VENCIDO_SEM_PERDA}::int + 1 THEN 'vencido_sem_perda'
            WHEN c.validade >= d.dia AND c.tem_livre
              AND c.validade - (c.criado_em AT TIME ZONE d.fuso)::date > ${DIAS_PERTO_DO_VENCIMENTO}::int THEN 'perto_do_vencimento'
          END AS tipo, (c.validade - d.dia) AS dias
        FROM c, d
      )
      SELECT t.lote_id, t.area, t.item_id, coalesce(i.nome, f.nome) AS nome, to_char(t.validade, 'YYYY-MM-DD') AS validade,
        t.codigo, t.dias, t.tipo
      FROM t
      JOIN estoque_item e ON e.id = t.item_id
      LEFT JOIN ingrediente i ON i.id = e.ingrediente_id
      LEFT JOIN ficha f ON f.id = e.preparo_id
      WHERE t.tipo IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM estoque_lote_aviso a WHERE a.lote_id = t.lote_id AND a.area = t.area AND a.tipo = t.tipo)
      ORDER BY t.validade, t.lote_id, t.area`.execute(trx);
    let perto = 0;
    let vencidos = 0;
    for (const x of r.rows) {
      const lugar = NOME_DA_AREA[x.area];
      const doLote = x.codigo ? ` (lote ${x.codigo})` : "";
      const base = { itemId: x.item_id, loteId: x.lote_id, area: x.area, validade: x.validade, codigo: x.codigo };
      let avisoId: string;
      if (x.tipo === "perto_do_vencimento") {
        avisoId = await criarAviso(trx, {
          unidadeId: unidade.id,
          paraCargos: [...new Set([...daArea(x.area), ...GERENCIA])],
          tipo: TIPOS_DE_AVISO_DE_VALIDADE.perto,
          prioridade: "normal",
          texto: `Perto do vencimento: "${x.nome}"${doLote} vence ${quandoVence(x.dias, x.validade)}, em ${lugar}. Use primeiro ou registre o descarte.`,
          dados: { ...base, acao: "usar_primeiro" },
        });
        perto++;
      } else {
        avisoId = await criarAviso(trx, {
          unidadeId: unidade.id,
          paraCargos: daArea(x.area),
          tipo: TIPOS_DE_AVISO_DE_VALIDADE.vencido,
          prioridade: "normal",
          texto: `Vencido parado: "${x.nome}"${doLote} venceu em ${ddmm(x.validade)} e continua em ${lugar}. Registre a perda com o motivo "Venceu" para o estoque ficar certo.`,
          dados: { ...base, acao: "registrar_perda" },
        });
        vencidos++;
      }
      await trx.insertInto("estoque_lote_aviso").values({ lote_id: x.lote_id, area: x.area, tipo: x.tipo, aviso_id: avisoId }).execute();
    }
    return { perto, vencidos, foraDoTurno: false };
  });
}
