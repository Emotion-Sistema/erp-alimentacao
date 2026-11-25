/**
 * Recebimento da transferência entre áreas (E09; migração 0024; decisão 0027, item 9; decisão do
 * responsável em 25/11/2026: quem recebe confirma).
 * - A transferência entre áreas (`transferir`) tira da origem e deixa os mesmos lotes "a receber"
 *   na área de destino. Esse saldo não é livre, não é consumido, não entra em contagem e não muda de
 *   lugar por outro caminho (os lançamentos só aceitam em uso ou guardado). Enquanto há "a receber"
 *   do item na área, a contagem dele ali é recusada (estoque-contagem.ts).
 * - `confirmarRecebimento`: leva do "a receber" para o em uso ou o guardado do destino.
 * - `recusarRecebimento` (motivo obrigatório): devolve aos mesmos lotes, área e local de onde saiu.
 * - Cada recebimento termina uma vez só: trava da linha do recebimento (FOR UPDATE), chave contra
 *   repetição como o resto do motor e, no banco, a chave primária do fim.
 * - Quem pode: cuidar da área de destino (cargo ativo) E ser a pessoa indicada ou ter
 *   `caixa.autorizar` (supervisão e gestão: supervisor, gerente geral, dono e administrador).
 * - Contagem cega: com contagem aberta do item na área, quem não é da gestão não vê a quantidade.
 * - Custo médio inalterado: só muda de lugar (o total e o valor do item não mudam).
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { AREAS_ESTOQUE, NOME_DA_AREA, type AreaEstoque } from "./cadastros";
import { ErroDeRegra } from "./erros";
import { motorDoEstoque as m, type Lancado } from "./estoque";
import { LOCAIS, q4DoBanco, textoQ4, type LocalDoEstoque } from "./estoque-comum";
import { pode } from "./permissoes";
import { exigir, type Ator } from "./sessao";

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const idDoRecebimento = z.number({ error: "Recebimento não encontrado." }).int("Recebimento não encontrado.").positive("Recebimento não encontrado.").max(2_147_483_647, "Recebimento não encontrado.");
const chave = z
  .string({ error: "Chave do lançamento em formato inválido." })
  .min(8, "Chave do lançamento em formato inválido.")
  .max(200, "Chave do lançamento em formato inválido.")
  .refine((v) => !/\p{Cc}/u.test(v), "Chave do lançamento em formato inválido.");

const esquemaConfirmar = z.object(
  {
    chave: chave.optional(),
    recebimentoId: idDoRecebimento,
    local: z.enum(LOCAIS, { error: "Escolha onde fica: em uso ou guardado." }),
  },
  { error: "Confirmação em formato inválido." },
);
const esquemaRecusar = z.object(
  {
    chave: chave.optional(),
    recebimentoId: idDoRecebimento,
    observacao: z
      .string({ error: "Escreva por que está recusando." })
      .trim()
      .min(3, "Escreva por que está recusando.")
      .max(500, "Motivo com no máximo 500 letras.")
      .refine((v) => !/[^\P{Cc}\n\r\t]/u.test(v), "Motivo com caractere inválido."),
  },
  { error: "Recusa em formato inválido." },
);

type Recebimento = {
  id: number;
  movimento_id: string;
  item_id: number;
  area_origem: AreaEstoque;
  local_origem: LocalDoEstoque;
  area_destino: AreaEstoque;
  recebido_por: number;
  recebido_por_nome: string;
};

async function lerRecebimento(db: Banco, id: number, travar: boolean): Promise<Recebimento | undefined> {
  const r = await sql<Recebimento>`
    SELECT r.id, r.movimento_id::text AS movimento_id, r.item_id, r.area_origem, r.local_origem, r.area_destino, r.recebido_por, u.nome AS recebido_por_nome
    FROM estoque_recebimento r JOIN usuario u ON u.id = r.recebido_por
    WHERE r.id = ${id} ${travar ? sql`FOR UPDATE OF r` : sql``}`.execute(db);
  return r.rows[0];
}

/**
 * Pode confirmar ou recusar: cuida da área de destino (cargo ativo) e é a pessoa indicada ou tem
 * `caixa.autorizar` (supervisão e gestão). Recusas ficam na auditoria.
 */
async function exigirQuemRecebe(db: Banco, ator: Ator | null, r: Recebimento): Promise<Ator> {
  const a = await m.exigirAreas(db, ator, [r.area_destino]);
  if (a.usuarioId === r.recebido_por) return a;
  try {
    return await exigir(db, a, "caixa.autorizar", { tipo: "estoque_recebimento", id: r.id });
  } catch (e) {
    if (e instanceof ErroDeRegra && e.codigo === "sem_permissao")
      throw new ErroDeRegra("sem_permissao", `Quem confirma este recebimento é ${r.recebido_por_nome} ou a supervisão de ${NOME_DA_AREA[r.area_destino]}.`);
    throw e;
  }
}

/**
 * Antes da transação: o recebimento existe e a pessoa pode mexer nele. Quem não cuida da área de
 * destino recebe a mesma resposta de um id que não existe ("não encontrado"): não descobre nada.
 */
async function prepararFim(db: Banco, ator: Ator | null, recebimentoId: number): Promise<{ quem: Ator; r: Recebimento }> {
  const { ator: a, areas } = await m.exigirAlgumaArea(db, ator);
  const r = await lerRecebimento(db, recebimentoId, false);
  if (!r || !areas.includes(r.area_destino)) throw new ErroDeRegra("nao_encontrado", "Recebimento não encontrado.");
  return { quem: await exigirQuemRecebe(db, a, r), r };
}

export type ResultadoDoRecebimento = Lancado & { recebimentoId: number; situacao: "confirmado" | "recusado" };

/**
 * Confirma o recebimento: o que está "a receber" na área de destino vai para o em uso ou o
 * guardado dela (movimento "transferencia" ligado ao recebimento). Uma vez só.
 */
export async function confirmarRecebimento(db: Banco, ator: Ator | null, dados: unknown): Promise<ResultadoDoRecebimento> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaConfirmar, dados);
  const { quem } = await prepararFim(db, ator, d.recebimentoId);
  return terminar(db, quem, { situacao: "confirmado", recebimentoId: d.recebimentoId, chave: d.chave, local: d.local, observacao: null });
}

/**
 * Recusa o recebimento (motivo obrigatório): o item volta aos mesmos lotes, área e local de onde
 * saiu (movimento "transferencia" ligado ao recebimento). Uma vez só.
 */
export async function recusarRecebimento(db: Banco, ator: Ator | null, dados: unknown): Promise<ResultadoDoRecebimento> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaRecusar, dados);
  const { quem } = await prepararFim(db, ator, d.recebimentoId);
  return terminar(db, quem, { situacao: "recusado", recebimentoId: d.recebimentoId, chave: d.chave, local: null, observacao: d.observacao });
}

type Fim = { situacao: "confirmado" | "recusado"; recebimentoId: number; chave: string | undefined; local: LocalDoEstoque | null; observacao: string | null };

async function terminar(db: Banco, quem: Ator, f: Fim): Promise<ResultadoDoRecebimento> {
  return db.transaction().execute(async (trx) => {
    const assinatura = m.assinar(`recebimento_${f.situacao}`, { recebimentoId: f.recebimentoId, local: f.local, observacao: f.observacao });
    const ja = await m.jaLancado(trx, f.chave, assinatura);
    if (ja) return { ...ja, recebimentoId: f.recebimentoId, situacao: f.situacao };
    // Trava o recebimento: duas confirmações (ou confirmação e recusa) ao mesmo tempo, uma espera a
    // outra e encontra o fim já gravado.
    const r = await lerRecebimento(trx, f.recebimentoId, true);
    if (!r) throw new ErroDeRegra("nao_encontrado", "Recebimento não encontrado.");
    const fim = await trx
      .selectFrom("estoque_recebimento_fim as f")
      .innerJoin("usuario as u", "u.id", "f.por")
      .select(["f.situacao", "u.nome"])
      .where("f.recebimento_id", "=", r.id)
      .executeTakeFirst();
    if (fim) throw new ErroDeRegra("conflito", `Este recebimento já foi ${fim.situacao} por ${fim.nome}.`);
    const itens = await m.travarItens(trx, [r.item_id]);
    const mov = await m.novoMovimento(trx, {
      tipo: "transferencia",
      autorId: quem.usuarioId,
      observacao: f.observacao,
      chave: f.chave ?? null,
      assinatura: f.chave ? assinatura : null,
    });
    const l = new m.Lancamento(trx, mov, itens);
    // Os lotes que a transferência deixou "a receber" (só o deste recebimento: outro recebimento do
    // mesmo lote para a mesma área divide o mesmo saldo).
    const partes = await sql<{ lote_id: number; q: string }>`
      SELECT lote_id, sum(quantidade)::text AS q FROM estoque_movimento_linha
      WHERE movimento_id = ${r.movimento_id}::bigint AND item_id = ${r.item_id} AND area = ${r.area_destino} AND local = 'a_receber'
      GROUP BY lote_id ORDER BY lote_id`.execute(trx);
    if (!partes.rows.length) throw new Error(`Recebimento ${r.id} sem linhas a receber.`);
    for (const p of partes.rows) {
      const q = q4DoBanco(p.q);
      await l.mexer(r.item_id, p.lote_id, r.area_destino, "a_receber", false, -q);
      if (f.situacao === "confirmado") await l.mexer(r.item_id, p.lote_id, r.area_destino, f.local!, false, q);
      else await l.mexer(r.item_id, p.lote_id, r.area_origem, r.local_origem, false, q);
    }
    await l.fechar();
    await trx
      .insertInto("estoque_recebimento_fim")
      .values({ recebimento_id: r.id, situacao: f.situacao, movimento_id: mov, local: f.local, observacao: f.observacao, por: quem.usuarioId })
      .execute();
    return { movimentoId: mov, repetido: false, recebimentoId: r.id, situacao: f.situacao };
  });
}

export type RecebimentoPendente = {
  recebimentoId: number;
  movimentoId: string;
  itemId: number;
  ingredienteId: number | null;
  preparoId: number | null;
  nome: string;
  unidade: string;
  areaOrigem: AreaEstoque;
  localOrigem: LocalDoEstoque;
  areaDestino: AreaEstoque;
  /** Onde quem mandou sugeriu guardar (quem recebe decide). */
  localSugerido: LocalDoEstoque;
  /** Nula enquanto há contagem aberta do item na área de destino (contagem cega; só a gestão vê). */
  quantidade: string | null;
  emContagem: boolean;
  enviadoPor: string;
  recebidoPor: { usuarioId: number; nome: string };
  quando: string;
  /** Esta pessoa pode confirmar ou recusar (a indicada ou a supervisão; o servidor confere de novo). */
  podeConfirmar: boolean;
};

const esquemaPendentes = z.object({ area: z.enum(AREAS_ESTOQUE, { error: "Área de estoque inválida." }).optional() }, { error: "Filtro em formato inválido." });

/** Recebimentos que esperam confirmação nas áreas da pessoa (ou numa delas), o mais antigo primeiro. */
export async function recebimentosPendentes(db: Banco, ator: Ator | null, filtro: unknown = {}): Promise<RecebimentoPendente[]> {
  const f = validar(esquemaPendentes, filtro);
  const { ator: a, areas } = await m.exigirAlgumaArea(db, ator);
  if (f.area && !areas.includes(f.area)) await m.exigirAreas(db, a, [f.area]);
  const escolhidas = f.area ? [f.area] : areas;
  const r = await sql<{
    id: number;
    movimento_id: string;
    item_id: number;
    ingrediente_id: number | null;
    preparo_id: number | null;
    nome: string;
    unidade: string;
    area_origem: AreaEstoque;
    local_origem: LocalDoEstoque;
    area_destino: AreaEstoque;
    local_sugerido: LocalDoEstoque;
    quantidade: string;
    enviado_por: string;
    recebido_por: number;
    recebido_por_nome: string;
    quando: string;
    em_contagem: boolean;
  }>`
    SELECT r.id, r.movimento_id::text AS movimento_id, r.item_id, e.ingrediente_id, e.preparo_id, coalesce(i.nome, fi.nome) AS nome,
      coalesce(i.unidade_base, fi.unidade_rendimento) AS unidade, r.area_origem, r.local_origem, r.area_destino, r.local_sugerido,
      r.quantidade::text AS quantidade, ua.nome AS enviado_por, r.recebido_por, ur.nome AS recebido_por_nome,
      to_char(r.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS quando,
      EXISTS (SELECT 1 FROM estoque_contagem c JOIN estoque_contagem_item ci ON ci.contagem_id = c.id
              WHERE ci.item_id = r.item_id AND c.area = r.area_destino
                AND NOT EXISTS (SELECT 1 FROM estoque_contagem_fim cf WHERE cf.contagem_id = c.id)) AS em_contagem
    FROM estoque_recebimento r
    JOIN estoque_movimento mv ON mv.id = r.movimento_id
    JOIN usuario ua ON ua.id = mv.autor_id
    JOIN usuario ur ON ur.id = r.recebido_por
    JOIN estoque_item e ON e.id = r.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha fi ON fi.id = e.preparo_id
    WHERE r.area_destino = ANY(${escolhidas}::text[])
      AND NOT EXISTS (SELECT 1 FROM estoque_recebimento_fim f WHERE f.recebimento_id = r.id)
    ORDER BY r.id LIMIT 200`.execute(db);
  const gestao = pode(a.cargoAtivo, "estoque.desfazer");
  const supervisao = pode(a.cargoAtivo, "caixa.autorizar");
  return r.rows.map((x) => {
    const cego = x.em_contagem && !gestao;
    return {
      recebimentoId: x.id,
      movimentoId: x.movimento_id,
      itemId: x.item_id,
      ingredienteId: x.ingrediente_id,
      preparoId: x.preparo_id,
      nome: x.nome,
      unidade: x.unidade,
      areaOrigem: x.area_origem,
      localOrigem: x.local_origem,
      areaDestino: x.area_destino,
      localSugerido: x.local_sugerido,
      quantidade: cego ? null : textoQ4(q4DoBanco(x.quantidade)),
      emContagem: cego,
      enviadoPor: x.enviado_por,
      recebidoPor: { usuarioId: x.recebido_por, nome: x.recebido_por_nome },
      quando: x.quando,
      podeConfirmar: supervisao || x.recebido_por === a.usuarioId,
    };
  });
}
