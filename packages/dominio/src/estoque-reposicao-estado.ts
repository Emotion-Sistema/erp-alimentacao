/**
 * Estado de reposição do item por área (E10 parte 1; RC-09 seções 3 e 4; migração 0025; decisão 0029).
 *
 * `reavaliarReposicao` roda DENTRO da transação de todo movimento que muda saldo, no fechamento do
 * lançamento (`Lancamento.fechar`, em estoque.ts), com o item já travado (FOR UPDATE). Por isso
 * dois movimentos ao mesmo tempo nunca avaliam o mesmo item juntos: o segundo espera a trava e já
 * lê o estado que o primeiro gravou. É o que garante UM aviso por cruzamento de linha.
 *
 * Este arquivo não importa estoque.ts (estoque.ts é quem o chama).
 */
import { sql, type Banco } from "@erp/banco";
import { criarAviso, type Prioridade } from "./avisos";
import { AREAS_ESTOQUE, NOME_DA_AREA, type AreaEstoque } from "./cadastros";
import { acaoDaArea, q4DoBanco, textoQ4 } from "./estoque-comum";
import { CARGOS, PERMISSOES, type Cargo } from "./permissoes";

type Trx = Banco;

export const SITUACOES_DE_REPOSICAO = ["saudavel", "repor", "emergencia", "esgotado"] as const;
export type SituacaoDeReposicao = (typeof SITUACOES_DE_REPOSICAO)[number];
export const NOME_DA_SITUACAO_DE_REPOSICAO: Readonly<Record<SituacaoDeReposicao, string>> = {
  saudavel: "Saudável",
  repor: "Repor",
  emergencia: "Emergência",
  esgotado: "Esgotado",
};
/** Quanto pior, maior. */
const GRAVIDADE: Readonly<Record<SituacaoDeReposicao, number>> = { saudavel: 0, repor: 1, emergencia: 2, esgotado: 3 };
export const gravidade = (s: SituacaoDeReposicao) => GRAVIDADE[s];

export const AVISOS_DO_GUARDADO = ["urgente", "normal", "desligado"] as const;
export type AvisoDoGuardado = (typeof AVISOS_DO_GUARDADO)[number];

/** Tipos dos avisos de reposição na central (o `dados` de cada um serve à lista de compras). */
export const TIPOS_DE_AVISO_DE_REPOSICAO = {
  repor: "estoque.repor",
  emergencia: "estoque.emergencia",
  esgotado: "estoque.esgotado",
  usandoGuardado: "estoque.usando_guardado",
  abastecer: "estoque.abastecer",
} as const;

export type Linhas = { saudavel: bigint | null; emergencia: bigint | null; abastecimento: bigint | null };

/**
 * Situação pelo total livre (em uso + guardado; sem bloqueado, vencido nem "a receber").
 * Zero = esgotado; abaixo da emergência = emergência; abaixo da saudável = repor. Em cima da linha
 * ainda não cruzou.
 */
export function situacaoPelasLinhas(total: bigint, l: Linhas): SituacaoDeReposicao {
  if (total <= 0n) return "esgotado";
  if (l.emergencia !== null && total < l.emergencia) return "emergencia";
  if (l.saudavel !== null && total < l.saudavel) return "repor";
  return "saudavel";
}

/**
 * Precisa trazer do guardado: em uso abaixo do nível de abastecimento, ou o consumo já está usando o
 * guardado (RC-09 seção 1); e só se há guardado para trazer.
 */
export function precisaAbastecer(emUso: bigint, guardado: bigint, abastecimento: bigint | null, usandoGuardado: boolean): boolean {
  const abaixo = (abastecimento !== null && emUso < abastecimento) || usandoGuardado;
  return abaixo && guardado > 0n;
}

/** Quem compra (avisos de linha saudável, emergência e uso do guardado). */
const COMPRAS: readonly Cargo[] = ["gerente_geral"];

/** Quem cuida da área (linha, contagem, abastecer), sem a gestão: cozinha = cozinheira; salão = supervisor. */
export function quemCuidaDaArea(area: AreaEstoque): Cargo[] {
  return CARGOS.filter((c) => PERMISSOES[c].includes(acaoDaArea(area)) && !PERMISSOES[c].includes("compras.gerenciar"));
}

export type ParParaReavaliar = { itemId: number; area: AreaEstoque; usouGuardado: boolean };

type Atual = {
  nome: string;
  unidade: string;
  area_padrao: AreaEstoque;
  ingrediente_id: number | null;
  preparo_id: number | null;
  saudavel: string | null;
  emergencia: string | null;
  abastecimento: string | null;
  aviso_guardado: AvisoDoGuardado | null;
  tem_linha: boolean;
  situacao: SituacaoDeReposicao | null;
  usando_guardado: boolean | null;
  abastecer: boolean | null;
  em_uso: string;
  guardado: string;
  dia: string;
};

/** Saldo livre do item na área (em uso e guardado; sem bloqueado, vencido nem "a receber"), as linhas e o estado. */
async function lerAtual(trx: Trx, itemId: number, area: AreaEstoque): Promise<Atual | null> {
  const r = await sql<Atual>`
    SELECT coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade,
      coalesce(i.area_estoque, e.area_preparo) AS area_padrao, e.ingrediente_id, e.preparo_id,
      ln.saudavel::text AS saudavel, ln.emergencia::text AS emergencia, ln.abastecimento::text AS abastecimento,
      ln.aviso_guardado, (ln.item_id IS NOT NULL) AS tem_linha,
      st.situacao, st.usando_guardado, st.abastecer,
      coalesce((SELECT sum(s.quantidade) FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
        WHERE s.item_id = e.id AND s.area = ${area} AND s.local = 'em_uso' AND NOT s.bloqueado
          AND coalesce(l.validade >= hoje_na_loja(), true)), 0)::text AS em_uso,
      coalesce((SELECT sum(s.quantidade) FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
        WHERE s.item_id = e.id AND s.area = ${area} AND s.local = 'guardado' AND NOT s.bloqueado
          AND coalesce(l.validade >= hoje_na_loja(), true)), 0)::text AS guardado,
      to_char(hoje_na_loja(), 'YYYY-MM-DD') AS dia
    FROM estoque_item e
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    LEFT JOIN estoque_linha ln ON ln.item_id = e.id AND ln.area = ${area}
    LEFT JOIN estoque_reposicao_estado st ON st.item_id = e.id AND st.area = ${area}
    WHERE e.id = ${itemId}`.execute(trx);
  return r.rows[0] ?? null;
}

const nulo = (t: string | null) => (t === null ? null : q4DoBanco(t));
const comUnidade = (q: bigint, un: string) => `${textoQ4(q)} ${un}`;

/**
 * Reavalia o estado de reposição de cada (item, área) tocado por um movimento (ou por uma mudança
 * de linha, com `movimentoId` nulo) e manda os avisos de quem cruzou uma linha para pior. Quem
 * chama já travou os itens. Só avalia a área do item, uma área com linha definida ou uma que já
 * tem estado (o item que passa por outra área, sem linha lá, não gera aviso daquela área).
 */
export async function reavaliarReposicao(trx: Trx, pares: readonly ParParaReavaliar[], movimentoId: string | null): Promise<void> {
  if (pares.length === 0) return;
  const juntos = new Map<string, ParParaReavaliar>();
  for (const p of pares) {
    const k = `${p.itemId}:${p.area}`;
    const ja = juntos.get(k);
    juntos.set(k, { ...p, usouGuardado: p.usouGuardado || (ja?.usouGuardado ?? false) });
  }
  const ordem = [...juntos.values()].sort((a, b) => a.itemId - b.itemId || AREAS_ESTOQUE.indexOf(a.area) - AREAS_ESTOQUE.indexOf(b.area));
  let unidadeId: number | null | undefined;
  const unidade = async () => {
    if (unidadeId === undefined) {
      const u = await trx.selectFrom("unidade").select("id").orderBy("id").limit(1).executeTakeFirst();
      unidadeId = u?.id ?? null;
    }
    return unidadeId;
  };
  for (const p of ordem) {
    const a = await lerAtual(trx, p.itemId, p.area);
    if (!a) continue;
    if (!a.tem_linha && a.area_padrao !== p.area && a.situacao === null) continue;
    const linhas: Linhas = { saudavel: nulo(a.saudavel), emergencia: nulo(a.emergencia), abastecimento: nulo(a.abastecimento) };
    const emUso = q4DoBanco(a.em_uso);
    const guardado = q4DoBanco(a.guardado);
    const total = emUso + guardado;
    const antes = {
      situacao: a.situacao ?? "saudavel",
      usando: a.usando_guardado ?? false,
      abastecer: a.abastecer ?? false,
    };
    const situacao = situacaoPelasLinhas(total, linhas);
    // Usando o guardado: liga quando o consumo trouxe do guardado; desliga quando o em uso foi
    // abastecido (há em uso livre de novo). Assim o aviso é um a cada vez que COMEÇA a usar.
    const usando = p.usouGuardado ? true : emUso > 0n ? false : antes.usando;
    const abastecer = precisaAbastecer(emUso, guardado, linhas.abastecimento, usando);

    const lugar = NOME_DA_AREA[p.area];
    const dados = {
      itemId: p.itemId,
      ingredienteId: a.ingrediente_id,
      preparoId: a.preparo_id,
      area: p.area,
      unidade: a.unidade,
      quantidade: textoQ4(total),
      emUso: textoQ4(emUso),
      guardado: textoQ4(guardado),
      saudavel: linhas.saudavel === null ? null : textoQ4(linhas.saudavel),
      emergencia: linhas.emergencia === null ? null : textoQ4(linhas.emergencia),
      abastecimento: linhas.abastecimento === null ? null : textoQ4(linhas.abastecimento),
      // Quanto falta para voltar à linha saudável (para a lista de compras).
      paraRepor: linhas.saudavel !== null && linhas.saudavel > total ? textoQ4(linhas.saudavel - total) : null,
      movimentoId,
    };
    // Primeira avaliação vinda de uma mudança de linha (o item nunca foi avaliado nesta área, ex.:
    // linha definida numa área ainda vazia): só registra o estado, sem aviso. Movimento avisa sempre.
    const silencioso = a.situacao === null && movimentoId === null;
    const avisar = async (tipo: string, prioridade: Prioridade, paraCargos: readonly Cargo[], texto: string, extra: Record<string, unknown>) => {
      if (silencioso) return null;
      const u = await unidade();
      if (u === null) return null;
      return criarAviso(trx, { unidadeId: u, paraCargos, tipo, prioridade, texto, dados: { ...dados, ...extra } });
    };
    const evento = async (tipo: "situacao" | "usando_guardado" | "abastecer", de: string, para: string, avisoId: string | null) => {
      if (silencioso) return; // o estado só começa aqui: não houve mudança
      await trx
        .insertInto("estoque_reposicao_evento")
        .values({ item_id: p.itemId, area: p.area, tipo, de, para, quantidade: textoQ4(total), em_uso: textoQ4(emUso), movimento_id: movimentoId, aviso_id: avisoId })
        .execute();
    };

    if (situacao !== antes.situacao) {
      let avisoId: string | null = null;
      // Só avisa quando piora (cruzou uma linha para baixo). Recuperar não avisa: zera o "já avisei".
      if (gravidade(situacao) > gravidade(antes.situacao)) {
        const ext = { estado: situacao, acao: situacao === "esgotado" ? "ver_produtos_afetados" : situacao === "emergencia" ? "comprar_agora" : "lista_de_compras" };
        if (situacao === "repor")
          avisoId = await avisar(
            TIPOS_DE_AVISO_DE_REPOSICAO.repor,
            "normal",
            COMPRAS,
            `"${a.nome}" entrou em reposição (${lugar}): há ${comUnidade(total, a.unidade)}, linha saudável ${comUnidade(linhas.saudavel!, a.unidade)}. Coloque na lista de compras.`,
            ext,
          );
        else if (situacao === "emergencia")
          avisoId = await avisar(
            TIPOS_DE_AVISO_DE_REPOSICAO.emergencia,
            "urgente",
            COMPRAS,
            `Emergência: "${a.nome}" (${lugar}) está abaixo da linha de emergência: há ${comUnidade(total, a.unidade)}, linha ${comUnidade(linhas.emergencia!, a.unidade)}. Comprar agora.`,
            ext,
          );
        else
          avisoId = await avisar(
            TIPOS_DE_AVISO_DE_REPOSICAO.esgotado,
            "urgente",
            [...COMPRAS, ...quemCuidaDaArea(p.area)],
            `"${a.nome}" esgotou (${lugar}). Registre a entrada ou confira os produtos afetados.`,
            ext,
          );
      }
      await evento("situacao", antes.situacao, situacao, avisoId);
    }

    if (usando !== antes.usando) {
      let avisoId: string | null = null;
      const config = a.aviso_guardado ?? "urgente";
      if (usando && config !== "desligado")
        avisoId = await avisar(
          TIPOS_DE_AVISO_DE_REPOSICAO.usandoGuardado,
          config,
          COMPRAS,
          `Começou a usar o estoque guardado de "${a.nome}" (${lugar}): restam ${comUnidade(guardado, a.unidade)} no guardado. Coloque na lista de compras.`,
          { estado: situacao, acao: "lista_de_compras" },
        );
      await evento("usando_guardado", antes.usando ? "sim" : "nao", usando ? "sim" : "nao", avisoId);
    }

    if (abastecer !== antes.abastecer) {
      let avisoId: string | null = null;
      // Para quem cuida da área: sem quantidades no texto (a contagem cega vale também nos avisos).
      if (abastecer)
        avisoId = await avisar(
          TIPOS_DE_AVISO_DE_REPOSICAO.abastecer,
          "normal",
          quemCuidaDaArea(p.area),
          `Abastecer a linha: trazer "${a.nome}" do guardado para o em uso (${lugar}).`,
          { estado: situacao, acao: "confirmar_que_trouxe" },
        );
      await evento("abastecer", antes.abastecer ? "sim" : "nao", abastecer ? "sim" : "nao", avisoId);
    }

    await sql`
      INSERT INTO estoque_reposicao_estado (item_id, area, situacao, usando_guardado, abastecer, quantidade, em_uso, guardado, dia, movimento_id, atualizado_em)
      VALUES (${p.itemId}, ${p.area}, ${situacao}, ${usando}, ${abastecer}, ${textoQ4(total)}::numeric, ${textoQ4(emUso)}::numeric, ${textoQ4(guardado)}::numeric,
        ${a.dia}::date, ${movimentoId}::bigint, clock_timestamp())
      ON CONFLICT (item_id, area) DO UPDATE SET situacao = EXCLUDED.situacao, usando_guardado = EXCLUDED.usando_guardado, abastecer = EXCLUDED.abastecer,
        quantidade = EXCLUDED.quantidade, em_uso = EXCLUDED.em_uso, guardado = EXCLUDED.guardado, dia = EXCLUDED.dia,
        movimento_id = coalesce(EXCLUDED.movimento_id, estoque_reposicao_estado.movimento_id), atualizado_em = EXCLUDED.atualizado_em`.execute(trx);
  }
}

/**
 * Conferência (para `conferirEstoque`): o estado de cada item e área bate com o saldo livre e as
 * linhas de agora. O vencido é contado pelo dia da última avaliação (a virada do dia não acusa
 * diferença; o item é reavaliado no próximo movimento).
 */
export async function conferirReposicao(db: Banco): Promise<string[]> {
  const r = await sql<{ item_id: number; area: AreaEstoque; situacao: SituacaoDeReposicao; abastecer: boolean; usando: boolean; q: string; em_uso: string; guardado: string; em_uso_agora: string; guardado_agora: string; saudavel: string | null; emergencia: string | null; abastecimento: string | null }>`
    SELECT st.item_id, st.area, st.situacao, st.abastecer, st.usando_guardado AS usando, st.quantidade::text AS q, st.em_uso::text AS em_uso, st.guardado::text AS guardado,
      coalesce((SELECT sum(s.quantidade) FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
        WHERE s.item_id = st.item_id AND s.area = st.area AND s.local = 'em_uso' AND NOT s.bloqueado AND coalesce(l.validade >= st.dia, true)), 0)::text AS em_uso_agora,
      coalesce((SELECT sum(s.quantidade) FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
        WHERE s.item_id = st.item_id AND s.area = st.area AND s.local = 'guardado' AND NOT s.bloqueado AND coalesce(l.validade >= st.dia, true)), 0)::text AS guardado_agora,
      ln.saudavel::text AS saudavel, ln.emergencia::text AS emergencia, ln.abastecimento::text AS abastecimento
    FROM estoque_reposicao_estado st LEFT JOIN estoque_linha ln ON ln.item_id = st.item_id AND ln.area = st.area`.execute(db);
  const problemas: string[] = [];
  for (const x of r.rows) {
    const onde = `reposição ${x.item_id}/${x.area}`;
    const emUso = q4DoBanco(x.em_uso_agora);
    const guardado = q4DoBanco(x.guardado_agora);
    if (q4DoBanco(x.em_uso) !== emUso || q4DoBanco(x.guardado) !== guardado) problemas.push(`${onde} difere do saldo livre`);
    const linhas = { saudavel: nulo(x.saudavel), emergencia: nulo(x.emergencia), abastecimento: nulo(x.abastecimento) };
    if (situacaoPelasLinhas(emUso + guardado, linhas) !== x.situacao) problemas.push(`${onde} com situação diferente das linhas`);
    if (precisaAbastecer(emUso, guardado, linhas.abastecimento, x.usando) !== x.abastecer) problemas.push(`${onde} com "abastecer" diferente do saldo`);
  }
  return problemas;
}
