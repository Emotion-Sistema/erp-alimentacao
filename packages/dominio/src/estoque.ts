/**
 * Estoque (E09; RC-09; migração 0021; decisão 0027).
 * - Saldo por lote, área, local (em uso ou guardado) e situação (livre ou bloqueado). Lote vencido
 *   (validade antes de hoje na loja) não é usado por consumo nem transferência: conta como bloqueado.
 * - Todo lançamento é um movimento imutável com autor e horário (RC-17). Erro se corrige com
 *   movimento contrário.
 * - Concorrência: cada lançamento trava as linhas de `estoque_item` envolvidas, sempre em ordem de
 *   id (sem impasse). Saldo nunca fica negativo (o banco também recusa).
 * - Repetição: com `chave`, o mesmo lançamento enviado de novo devolve o movimento já gravado; a
 *   mesma chave com conteúdo diferente é recusada.
 * - Permissão por área (`estoque.cozinha` ou `estoque.salao`), conferida no servidor em cada ação.
 *   Valores em reais só para quem tem `custos.ver`.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { AREAS_ESTOQUE, converterParaBase, NOME_DA_AREA, type AreaEstoque } from "./cadastros";
import { ErroDeRegra } from "./erros";
import {
  acaoDaArea,
  custoMedioPorUnidade,
  ESCALA,
  LOCAIS,
  MOTIVOS_DE_BLOQUEIO,
  MOTIVOS_DE_PERDA,
  NOME_DO_LOCAL,
  NOME_DO_LOCAL_DO_SALDO,
  q4,
  q4DaFracao,
  q4DoBanco,
  QUANTIDADE_MAXIMA,
  textoQ4,
  valorDaSaida,
  valorPeloCusto,
  type LocalDoEstoque,
  type LocalDoSaldo,
} from "./estoque-comum";
import { Fracao } from "./fichas-comum";
import { consumoDaFicha } from "./fichas";
import { pode } from "./permissoes";
import { exigir, type Ator } from "./sessao";

type Trx = Banco;
const MAIOR_ID = 2_147_483_647;
const VALOR_MAXIMO_CENTAVOS = 10_000_000_000; // R$ 100 milhões num lançamento
const ITENS_POR_LANCAMENTO = 200;
/** Saldo inicial vem de planilha: até o limite de linhas da importação. */
const ITENS_DO_SALDO_INICIAL = 2000;

// ---------------------------------------------------------------- validação

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", p.error.issues.map((i) => i.message).join(" "));
  return p.data;
}

const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);
const area = z.enum(AREAS_ESTOQUE, { error: "Área de estoque inválida." });
const local = z.enum(LOCAIS, { error: "Local inválido: em uso ou guardado." });
const quantidade = z
  .union([z.string(), z.number()], { error: "Quantidade em formato inválido." })
  .transform((v, ctx) => {
    const q = q4(v);
    if (q === null || q <= 0n || q > QUANTIDADE_MAXIMA) {
      ctx.addIssue({ code: "custom", message: "Quantidade: um número maior que zero, com até 4 casas depois da vírgula." });
      return z.NEVER;
    }
    return textoQ4(q);
  });
const unidade = z.string({ error: "Unidade em formato inválido." }).trim().min(1, "Unidade em formato inválido.").max(40, "Unidade em formato inválido.");
const textoLivre = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .max(max, `${rotulo} com no máximo ${max} letras.`)
    .refine((v) => !/[^\P{Cc}\n\r\t]/u.test(v), `${rotulo} com caractere inválido.`)
    .transform((v) => (v === "" ? null : v));
const textoCurto = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .max(max, `${rotulo} com no máximo ${max} letras.`)
    .refine((v) => !/\p{Cc}/u.test(v), `${rotulo} com caractere inválido.`)
    .transform((v) => (v === "" ? null : v));
const data = z.iso.date({ error: "Data em formato inválido (use AAAA-MM-DD)." });
const chave = z
  .string({ error: "Chave do lançamento em formato inválido." })
  .min(8, "Chave do lançamento em formato inválido.")
  .max(200, "Chave do lançamento em formato inválido.")
  .refine((v) => !/\p{Cc}/u.test(v), "Chave do lançamento em formato inválido.");

/** Qual item: um ingrediente OU um preparo da casa. */
const referencia = {
  ingredienteId: id("Ingrediente não encontrado.").optional(),
  preparoId: id("Preparo não encontrado.").optional(),
};
type Referencia = { ingredienteId?: number; preparoId?: number };
const umItem = (r: Referencia) => (r.ingredienteId === undefined) !== (r.preparoId === undefined);
const MSG_UM_ITEM = "Escolha um ingrediente ou um preparo.";

// ---------------------------------------------------------------- itens e travas

type ItemTravado = {
  id: number;
  ingredienteId: number | null;
  preparoId: number | null;
  nome: string;
  unidade: string;
  areaPadrao: AreaEstoque;
  ativo: boolean;
  q: bigint;
  v: bigint;
  ultimoC: bigint | null;
  ultimoQ: bigint | null;
  refC: bigint | null;
  refQ: bigint | null;
};

/** Garante a linha de `estoque_item` de cada referência e devolve os ids, na ordem recebida. */
async function garantirItens(trx: Trx, refs: readonly Referencia[]): Promise<number[]> {
  const chaveDe = (r: Referencia) => (r.ingredienteId !== undefined ? `i${r.ingredienteId}` : `p${r.preparoId!}`);
  const buscar = async () => {
    const ing = refs.flatMap((r) => (r.ingredienteId !== undefined ? [r.ingredienteId] : []));
    const prep = refs.flatMap((r) => (r.preparoId !== undefined ? [r.preparoId] : []));
    const linhas = await trx
      .selectFrom("estoque_item")
      .select(["id", "ingrediente_id", "preparo_id"])
      .where((eb) => eb.or([eb("ingrediente_id", "in", ing.length ? ing : [0]), eb("preparo_id", "in", prep.length ? prep : [0])]))
      .execute();
    return new Map(linhas.map((l) => [l.ingrediente_id !== null ? `i${l.ingrediente_id}` : `p${l.preparo_id!}`, l.id]));
  };
  let mapa = await buscar();
  // Os que faltam nascem em ordem fixa (ingredientes, depois preparos, por id): dois lançamentos
  // com itens novos em ordem trocada não esperam um pelo outro na chave única.
  const faltam = [...new Map(refs.filter((r) => !mapa.has(chaveDe(r))).map((r) => [chaveDe(r), r])).values()].sort(
    (x, y) => Number(x.ingredienteId === undefined) - Number(y.ingredienteId === undefined) || (x.ingredienteId ?? x.preparoId!) - (y.ingredienteId ?? y.preparoId!),
  );
  for (const r of faltam) {
    if (r.ingredienteId !== undefined) {
      const ing = await trx.selectFrom("ingrediente").select("id").where("id", "=", r.ingredienteId).executeTakeFirst();
      if (!ing) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
      await sql`INSERT INTO estoque_item (ingrediente_id) VALUES (${r.ingredienteId}) ON CONFLICT (ingrediente_id) DO NOTHING`.execute(trx);
    } else {
      const f = await trx.selectFrom("ficha").select("id").where("id", "=", r.preparoId!).where("tipo", "=", "preparo").executeTakeFirst();
      if (!f) throw new ErroDeRegra("nao_encontrado", "Preparo não encontrado.");
      await sql`INSERT INTO estoque_item (preparo_id, area_preparo) VALUES (${r.preparoId!}, 'cozinha') ON CONFLICT (preparo_id) DO NOTHING`.execute(trx);
    }
  }
  if (faltam.length) mapa = await buscar();
  return refs.map((r) => mapa.get(chaveDe(r))!);
}

/** Área padrão de cada referência, sem travar nada (para conferir a permissão antes da transação). */
async function areasPadrao(db: Banco, refs: readonly Referencia[]): Promise<AreaEstoque[]> {
  const saida: AreaEstoque[] = [];
  for (const r of refs) {
    if (r.ingredienteId !== undefined) {
      const i = await db.selectFrom("ingrediente").select("area_estoque").where("id", "=", r.ingredienteId).executeTakeFirst();
      if (!i) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
      saida.push(i.area_estoque as AreaEstoque);
    } else {
      const f = await db
        .selectFrom("ficha as f")
        .leftJoin("estoque_item as e", "e.preparo_id", "f.id")
        .select("e.area_preparo")
        .where("f.id", "=", r.preparoId!)
        .where("f.tipo", "=", "preparo")
        .executeTakeFirst();
      if (!f) throw new ErroDeRegra("nao_encontrado", "Preparo não encontrado.");
      saida.push(f.area_preparo ?? "cozinha");
    }
  }
  return saida;
}

type LinhaDoItem = {
  id: number;
  ingrediente_id: number | null;
  preparo_id: number | null;
  nome: string;
  unidade: string;
  area: AreaEstoque;
  ativo: boolean;
  quantidade: string;
  valor: string;
  ultimo_c: string | null;
  ultimo_q: string | null;
  ref_c: string | null;
  ref_q: string | null;
};
const COLUNAS_DO_ITEM = sql`e.id, e.ingrediente_id, e.preparo_id, coalesce(i.nome, f.nome) AS nome,
  coalesce(i.unidade_base, f.unidade_rendimento) AS unidade, coalesce(i.area_estoque, e.area_preparo) AS area,
  coalesce(i.ativo, f.ativo) AS ativo, e.quantidade::text AS quantidade, e.valor_centavos::text AS valor,
  e.ultimo_custo_centavos::text AS ultimo_c, e.ultimo_custo_quantidade::text AS ultimo_q,
  i.custo_ref_centavos::text AS ref_c, i.custo_ref_quantidade::text AS ref_q`;

function paraItem(r: LinhaDoItem): ItemTravado {
  return {
    id: r.id,
    ingredienteId: r.ingrediente_id,
    preparoId: r.preparo_id,
    nome: r.nome,
    unidade: r.unidade,
    areaPadrao: r.area,
    ativo: r.ativo,
    q: q4DoBanco(r.quantidade),
    v: BigInt(r.valor),
    ultimoC: r.ultimo_c === null ? null : BigInt(r.ultimo_c),
    ultimoQ: r.ultimo_q === null ? null : q4DoBanco(r.ultimo_q),
    refC: r.ref_c === null ? null : BigInt(r.ref_c),
    refQ: r.ref_q === null ? null : q4DoBanco(r.ref_q),
  };
}

/** Trava os itens (FOR UPDATE), sempre em ordem de id. */
async function travarItens(trx: Trx, ids: readonly number[]): Promise<Map<number, ItemTravado>> {
  const unicos = [...new Set(ids)].sort((a, b) => a - b);
  const r = await sql<LinhaDoItem>`
    SELECT ${COLUNAS_DO_ITEM}
    FROM estoque_item e LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    WHERE e.id = ANY(${unicos}::int[]) ORDER BY e.id FOR UPDATE OF e`.execute(trx);
  return new Map(r.rows.map((l) => [l.id, paraItem(l)]));
}

// ---------------------------------------------------------------- pedaços de saldo

type Pedaco = { loteId: number; area: AreaEstoque; local: LocalDoSaldo; bloqueado: boolean; quantidade: bigint; validade: string | null; vencido: boolean };

type Filtro = {
  area: AreaEstoque;
  local: LocalDoEstoque;
  /** livre = só o livre e não vencido; bloqueado = só o bloqueado; perda = vencido livre, depois livre, (e bloqueado se pedido). */
  modo: "livre" | "bloqueado" | "vencido_e_livre";
  loteId?: number;
};

async function pedacos(trx: Trx, itemId: number, f: Filtro): Promise<Pedaco[]> {
  const r = await sql<{ lote_id: number; area: AreaEstoque; local: LocalDoEstoque; bloqueado: boolean; quantidade: string; validade: string | null; vencido: boolean }>`
    SELECT s.lote_id, s.area, s.local, s.bloqueado, s.quantidade::text AS quantidade,
      to_char(l.validade, 'YYYY-MM-DD') AS validade, coalesce(l.validade < hoje_na_loja(), false) AS vencido
    FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
    WHERE s.item_id = ${itemId} AND s.area = ${f.area} AND s.local = ${f.local} AND s.quantidade > 0
      AND (${f.loteId ?? null}::int IS NULL OR s.lote_id = ${f.loteId ?? null}::int)
    ORDER BY coalesce(l.validade < hoje_na_loja(), false) DESC, l.validade ASC NULLS LAST, l.id`.execute(trx);
  const todos = r.rows.map((p) => ({
    loteId: p.lote_id,
    area: p.area,
    local: p.local,
    bloqueado: p.bloqueado,
    quantidade: q4DoBanco(p.quantidade),
    validade: p.validade,
    vencido: p.vencido,
  }));
  if (f.modo === "livre") return todos.filter((p) => !p.bloqueado && !p.vencido);
  if (f.modo === "bloqueado") return todos.filter((p) => p.bloqueado);
  return todos.filter((p) => !p.bloqueado); // vencidos primeiro (a ordem já põe), depois o livre
}

// ---------------------------------------------------------------- lançamento

type Estado = { q: bigint; v: bigint; dq: bigint; dv: bigint; faltou: bigint; estimado: boolean; tocado: boolean; ultimo: { c: bigint; q: bigint } | null; informado: bigint | null };

/** Um movimento em construção: muda saldos, cria lotes e, no fim, grava o resumo por item. */
class Lancamento {
  private readonly estados = new Map<number, Estado>();
  constructor(
    private readonly trx: Trx,
    readonly movimentoId: string,
    readonly itens: Map<number, ItemTravado>,
  ) {}

  item(itemId: number): ItemTravado {
    const i = this.itens.get(itemId);
    if (!i) throw new Error(`Item ${itemId} não travado.`);
    return i;
  }

  private estado(itemId: number): Estado {
    let e = this.estados.get(itemId);
    if (!e) {
      const i = this.item(itemId);
      e = { q: i.q, v: i.v, dq: 0n, dv: 0n, faltou: 0n, estimado: false, tocado: false, ultimo: null, informado: null };
      this.estados.set(itemId, e);
    }
    return e;
  }

  /** Só registra o item no movimento (transferência, bloqueio: o total não muda). */
  tocar(itemId: number): void {
    this.estado(itemId).tocado = true;
  }

  async mexer(itemId: number, loteId: number, area: AreaEstoque, local: LocalDoSaldo, bloqueado: boolean, delta: bigint, automatica = false): Promise<void> {
    if (delta === 0n) return;
    const q = textoQ4(delta);
    if (delta > 0n) {
      await sql`
        INSERT INTO estoque_saldo (lote_id, area, local, bloqueado, item_id, quantidade)
        VALUES (${loteId}, ${area}, ${local}, ${bloqueado}, ${itemId}, ${q}::numeric)
        ON CONFLICT (lote_id, area, local, bloqueado) DO UPDATE SET quantidade = estoque_saldo.quantidade + EXCLUDED.quantidade`.execute(this.trx);
    } else {
      // Saída: o pedaço tem de existir e ter o bastante (o banco recusa negativo).
      const r = await sql`
        UPDATE estoque_saldo SET quantidade = quantidade + ${q}::numeric
        WHERE lote_id = ${loteId} AND area = ${area} AND local = ${local} AND bloqueado = ${bloqueado} AND item_id = ${itemId}`.execute(this.trx);
      if (Number(r.numAffectedRows ?? 0) !== 1) throw new Error("Saída de um saldo que não existe.");
    }
    await this.trx
      .insertInto("estoque_movimento_linha")
      .values({ movimento_id: this.movimentoId, item_id: itemId, lote_id: loteId, area, local, bloqueado, quantidade: q, automatica })
      .execute();
    this.tocar(itemId);
  }

  async novoLote(itemId: number, validade: string | null, codigo: string | null): Promise<number> {
    const r = await this.trx
      .insertInto("estoque_lote")
      .values({ item_id: itemId, validade, codigo, movimento_id: this.movimentoId })
      .returning("id")
      .executeTakeFirstOrThrow();
    return r.id;
  }

  /** Saída do total: leva a parte proporcional do valor (custo médio). Devolve o valor. */
  saida(itemId: number, q: bigint): bigint {
    const e = this.estado(itemId);
    const v = valorDaSaida(e.q, e.v, q);
    e.q -= q;
    e.v -= v;
    e.dq -= q;
    e.dv -= v;
    e.tocado = true;
    return v;
  }

  entrada(itemId: number, q: bigint, v: bigint, { estimado = false, ultimoCusto = false } = {}): void {
    const e = this.estado(itemId);
    e.q += q;
    e.v += v;
    e.dq += q;
    e.dv += v;
    e.tocado = true;
    if (estimado) e.estimado = true;
    if (ultimoCusto && q > 0n) e.ultimo = { c: v, q };
  }

  /** Só valor (correção de custo): soma `dv`, sem deixar o valor negativo nem dar valor a item zerado. */
  ajustarValor(itemId: number, dv: bigint, informado: bigint, ultimo: { c: bigint; q: bigint } | null): bigint {
    const e = this.estado(itemId);
    let aplicado = e.q === 0n ? 0n : dv;
    if (e.v + aplicado < 0n) aplicado = -e.v;
    e.v += aplicado;
    e.dv += aplicado;
    e.tocado = true;
    e.informado = informado;
    if (ultimo) e.ultimo = ultimo;
    return aplicado;
  }

  /** Estorno: muda o total em `dq` e o valor em `dv` (o valor nunca fica negativo; zerou, zera). */
  desfazer(itemId: number, dq: bigint, dv: bigint): void {
    const e = this.estado(itemId);
    e.q += dq;
    let v = dv;
    if (e.v + v < 0n) v = -e.v;
    if (e.q === 0n) v = -e.v;
    e.v += v;
    e.dq += dq;
    e.dv += v;
    e.tocado = true;
  }

  faltou(itemId: number, q: bigint): void {
    const e = this.estado(itemId);
    e.faltou += q;
    e.tocado = true;
  }

  /** Valor estimado de `q` quando não há custo informado. */
  estimar(itemId: number, q: bigint): bigint {
    const e = this.estado(itemId);
    const i = this.item(itemId);
    if (e.q > 0n) return valorPeloCusto(q, e.v, e.q);
    const u = e.ultimo ?? (i.ultimoC !== null && i.ultimoQ !== null ? { c: i.ultimoC, q: i.ultimoQ } : null);
    if (u) return valorPeloCusto(q, u.c, u.q);
    if (i.refC !== null && i.refQ !== null) return valorPeloCusto(q, i.refC, i.refQ);
    return 0n;
  }

  quantidadeAtual(itemId: number): bigint {
    return this.estado(itemId).q;
  }

  async fechar(): Promise<void> {
    for (const [itemId, e] of [...this.estados].sort((a, b) => a[0] - b[0])) {
      if (!e.tocado) continue;
      if (e.q < 0n || e.v < 0n) throw new Error("Saldo negativo no fechamento do movimento.");
      // Zerou a quantidade: o valor zera junto (o que sobrar de arredondamento sai neste movimento).
      if (e.q === 0n && e.v !== 0n) {
        e.dv -= e.v;
        e.v = 0n;
      }
      await this.trx
        .insertInto("estoque_movimento_item")
        .values({
          movimento_id: this.movimentoId,
          item_id: itemId,
          quantidade: textoQ4(e.dq),
          valor_centavos: e.dv.toString(),
          quantidade_depois: textoQ4(e.q),
          valor_depois: e.v.toString(),
          faltou: textoQ4(e.faltou),
          custo_estimado: e.estimado,
          valor_informado: e.informado === null ? null : e.informado.toString(),
        })
        .execute();
      await this.trx
        .updateTable("estoque_item")
        .set({
          quantidade: textoQ4(e.q),
          valor_centavos: e.v.toString(),
          atualizado_em: sql<Date>`clock_timestamp()`,
          ...(e.ultimo ? { ultimo_custo_centavos: e.ultimo.c.toString(), ultimo_custo_quantidade: textoQ4(e.ultimo.q) } : {}),
        })
        .where("id", "=", itemId)
        .execute();
    }
  }

  /**
   * Tira `q` dos pedaços (na ordem dada). Devolve quanto tirou e de onde. Não mexe no valor (quem
   * chama decide se é saída do total ou só mudança de lugar).
   */
  async tirar(itemId: number, partes: readonly Pedaco[], q: bigint, automatica = false): Promise<{ tirado: bigint; de: { p: Pedaco; q: bigint }[] }> {
    let falta = q;
    const de: { p: Pedaco; q: bigint }[] = [];
    for (const p of partes) {
      if (falta <= 0n) break;
      const t = p.quantidade < falta ? p.quantidade : falta;
      await this.mexer(itemId, p.loteId, p.area, p.local, p.bloqueado, -t, automatica);
      de.push({ p, q: t });
      falta -= t;
    }
    return { tirado: q - falta, de };
  }
}

type Cabecalho = {
  tipo: "entrada" | "saldo_inicial" | "transferencia" | "perda" | "bloqueio" | "desbloqueio" | "consumo" | "producao" | "ajuste" | "custo" | "estorno";
  autorId: number;
  motivo?: string | null;
  observacao?: string | null;
  recebidoPor?: number | null;
  chave?: string | null;
  assinatura?: string | null;
  origemTipo?: string | null;
  origemId?: string | null;
  fornecedorId?: number | null;
  notaNumero?: string | null;
  notaData?: string | null;
  fichaVersaoId?: number | null;
  previsto?: string | null;
  estornoDe?: string | null;
  corrigeCustoDe?: string | null;
  contagemId?: number | null;
};

async function novoMovimento(trx: Trx, c: Cabecalho): Promise<string> {
  const r = await trx
    .insertInto("estoque_movimento")
    .values({
      tipo: c.tipo,
      autor_id: c.autorId,
      motivo: c.motivo ?? null,
      observacao: c.observacao ?? null,
      recebido_por: c.recebidoPor ?? null,
      chave: c.chave ?? null,
      assinatura: c.assinatura ?? null,
      origem_tipo: c.origemTipo ?? null,
      origem_id: c.origemId ?? null,
      fornecedor_id: c.fornecedorId ?? null,
      nota_numero: c.notaNumero ?? null,
      nota_data: c.notaData ?? null,
      ficha_versao_id: c.fichaVersaoId ?? null,
      previsto: c.previsto ?? null,
      estorno_de: c.estornoDe ?? null,
      corrige_custo_de: c.corrigeCustoDe ?? null,
      contagem_id: c.contagemId ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return String(r.id);
}

/** Resultado de todo lançamento. `repetido` = a mesma chave já tinha sido gravada (nada mudou agora). */
export type Lancado = { movimentoId: string; repetido: boolean };

/**
 * Assinatura do conteúdo (sem o autor: o reenvio do mesmo pedido por outro aparelho ou pelo worker
 * é o mesmo lançamento). A chave já distingue um lançamento do outro.
 */
const assinar = (tipo: string, dados: unknown) => createHash("sha256").update(JSON.stringify([tipo, dados])).digest("hex");

/**
 * Com chave: trava a chave e, se ela já foi gravada, devolve o movimento (mesmo conteúdo) ou
 * recusa (conteúdo diferente). Sem chave: segue.
 */
async function jaLancado(trx: Trx, chaveDoLancamento: string | undefined, assinatura: string): Promise<Lancado | null> {
  if (!chaveDoLancamento) return null;
  await sql`SELECT pg_advisory_xact_lock(hashtext(${"estoque:" + chaveDoLancamento}))`.execute(trx);
  const m = await trx.selectFrom("estoque_movimento").select(["id", "assinatura"]).where("chave", "=", chaveDoLancamento).executeTakeFirst();
  if (!m) return null;
  if (m.assinatura !== assinatura) throw new ErroDeRegra("conflito", "Este lançamento já foi gravado com outros dados. Abra a tela de novo.");
  return { movimentoId: String(m.id), repetido: true };
}

/** Exige a permissão de cada área tocada (em ordem fixa, para a recusa ser sempre a mesma). */
async function exigirAreas(db: Banco, ator: Ator | null, areas: Iterable<AreaEstoque>): Promise<Ator> {
  const lista = [...new Set(areas)].sort();
  let a: Ator | null = ator;
  for (const ar of lista) a = await exigir(db, ator, acaoDaArea(ar), { tipo: "estoque_area", id: ar });
  if (!a) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  return a;
}

const nomeDaArea = (a: AreaEstoque) => NOME_DA_AREA[a];

/**
 * ": há 3 un" na mensagem de recusa, ou nada enquanto há contagem aberta do item na área e a
 * pessoa não é da gestão (a contagem é cega também nas mensagens).
 */
async function quantoHa(trx: Trx, ator: Ator, item: ItemTravado, area: AreaEstoque, q: bigint, prefixo = ": há "): Promise<string> {
  if (!pode(ator.cargoAtivo, "estoque.desfazer")) {
    const r = await sql<{ ok: boolean }>`
      SELECT EXISTS (SELECT 1 FROM estoque_contagem c JOIN estoque_contagem_item ci ON ci.contagem_id = c.id
        WHERE ci.item_id = ${item.id} AND c.area = ${area} AND NOT EXISTS (SELECT 1 FROM estoque_contagem_fim f WHERE f.contagem_id = c.id)) AS ok`.execute(trx);
    if (r.rows[0]!.ok) return prefixo === ": há " ? " (o item está em contagem)" : "; o item está em contagem;";
  }
  return `${prefixo}${comUnidade(q, item)}`;
}
const comUnidade = (q: bigint, i: ItemTravado) => `${textoQ4(q)} ${i.unidade}`;

/** Quantidade informada (com unidade opcional) -> dez-milésimos na unidade do estoque do item. */
async function quantidadeNaBase(trx: Trx, item: ItemTravado, qtd: string, un: string | undefined): Promise<bigint> {
  if (un === undefined || un.toLowerCase() === item.unidade) return q4DoBanco(qtd);
  if (item.ingredienteId === null) throw new ErroDeRegra("dados_invalidos", `O preparo "${item.nome}" conta em ${item.unidade}. Informe a quantidade nessa unidade.`);
  const base = q4DoBanco(await converterParaBase(trx, item.ingredienteId, qtd, un));
  if (base <= 0n) throw new ErroDeRegra("dados_invalidos", "A quantidade ficou zero na unidade do estoque.");
  if (base > QUANTIDADE_MAXIMA) throw new ErroDeRegra("dados_invalidos", "Quantidade grande demais.");
  return base;
}

/** Hoje na loja (AAAA-MM-DD). */
async function hoje(trx: Trx): Promise<string> {
  const r = await sql<{ d: string }>`SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS d`.execute(trx);
  return r.rows[0]!.d;
}

// ---------------------------------------------------------------- entrada

const esquemaEntrada = z.object(
  {
    chave: chave.optional(),
    fornecedorId: id("Fornecedor não encontrado.").optional(),
    notaNumero: textoCurto("Número da nota", 60).optional(),
    notaData: data.optional(),
    observacao: textoLivre("Observação", 500).optional(),
    itens: z
      .array(
        z
          .object(
            {
              ...referencia,
              quantidade,
              unidade: unidade.optional(),
              area: area.optional(),
              local,
              validade: data.optional(),
              lote: textoCurto("Código do lote", 60).optional(),
              /** Valor total desta linha em centavos (o que foi pago). Sem ele, o custo é estimado. */
              valorCentavos: z
                .number({ error: "Valor em centavos, um número inteiro." })
                .int("Valor em centavos, um número inteiro.")
                .min(0, "Valor não pode ser negativo.")
                .max(VALOR_MAXIMO_CENTAVOS, "Valor grande demais.")
                .optional(),
            },
            { error: "Item da entrada em formato inválido." },
          )
          .refine(umItem, MSG_UM_ITEM),
        { error: "Itens da entrada em formato inválido." },
      )
      .min(1, "Informe ao menos um item.")
      .max(ITENS_DO_SALDO_INICIAL, `No máximo ${ITENS_DO_SALDO_INICIAL} itens de uma vez.`),
  },
  { error: "Entrada em formato inválido." },
);

/**
 * Entrada de mercadoria (compra recebida). Cada linha vira um lote novo, no local escolhido.
 * Valor em reais só com `custos.ver`; sem valor, o custo é estimado (custo médio, último custo ou
 * custo de referência) e fica marcado como estimado para alguém corrigir depois.
 * Preparo da casa não entra por compra: entra pela produção.
 */
export async function registrarEntrada(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado> {
  return lancarEntrada(db, ator, dados, "entrada");
}

/** O que já havia na loja ao começar a usar o sistema (também aceita preparo). */
export async function registrarSaldoInicial(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado> {
  return lancarEntrada(db, ator, dados, "saldo_inicial");
}

/** Saldo inicial gravado pela planilha: guarda o resumo do pedido (para o reenvio). Uso de estoque-importar. */
export async function registrarSaldoInicialDaPlanilha(db: Banco, ator: Ator | null, dados: unknown, resumoDoPedido: string): Promise<Lancado> {
  return lancarEntrada(db, ator, dados, "saldo_inicial", resumoDoPedido);
}

async function lancarEntrada(db: Banco, ator: Ator | null, dados: unknown, tipo: "entrada" | "saldo_inicial", resumoDaPlanilha?: string): Promise<Lancado> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaEntrada, dados);
  if (tipo === "entrada" && d.itens.length > ITENS_POR_LANCAMENTO) throw new ErroDeRegra("dados_invalidos", `No máximo ${ITENS_POR_LANCAMENTO} itens por entrada.`);
  // Permissão antes de tudo (antes da chave e das travas): quem não pode não descobre nada.
  const padrao = await areasPadrao(db, d.itens);
  const areas = d.itens.map((i, k) => i.area ?? padrao[k]!);
  await exigirAreas(db, ator, areas);
  if (d.itens.some((i) => i.valorCentavos !== undefined)) await exigir(db, ator, "custos.ver", { tipo: "estoque_entrada" });
  if (tipo === "entrada" && d.itens.some((i) => i.preparoId !== undefined))
    throw new ErroDeRegra("dados_invalidos", "Preparo da casa não entra por compra: registre a produção dele.");
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar(tipo, d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) return ja;
    const ids = await garantirItens(trx, d.itens);
    const itens = await travarItens(trx, ids);
    if (d.fornecedorId !== undefined) {
      const f = await trx.selectFrom("fornecedor").select("ativo").where("id", "=", d.fornecedorId).executeTakeFirst();
      if (!f) throw new ErroDeRegra("nao_encontrado", "Fornecedor não encontrado.");
      if (!f.ativo) throw new ErroDeRegra("conflito", "O fornecedor está desativado. Reative em Fornecedores ou escolha outro.");
    }
    const dia = await hoje(trx);
    const mov = await novoMovimento(trx, {
      tipo,
      autorId: ator!.usuarioId,
      observacao: d.observacao ?? null,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
      fornecedorId: d.fornecedorId ?? null,
      notaNumero: d.notaNumero ?? null,
      notaData: d.notaData ?? null,
      ...(resumoDaPlanilha ? { origemTipo: "planilha", origemId: resumoDaPlanilha } : {}),
    });
    const l = new Lancamento(trx, mov, itens);
    for (const [k, linha] of d.itens.entries()) {
      const item = l.item(ids[k]!);
      if (!item.ativo && tipo === "entrada") throw new ErroDeRegra("conflito", `"${item.nome}" está desativado. Reative no cadastro antes de dar entrada.`);
      // Compra vencida não entra. No saldo inicial, o vencido que já está na loja entra BLOQUEADO
      // (para a contagem bater e alguém dar baixa como perda).
      const vencido = linha.validade !== undefined && linha.validade < dia;
      if (vencido && tipo === "entrada")
        throw new ErroDeRegra("dados_invalidos", `A validade de "${item.nome}" (${linha.validade}) já passou. Produto vencido não entra no estoque.`);
      const q = await quantidadeNaBase(trx, item, linha.quantidade, linha.unidade);
      const lote = await l.novoLote(item.id, linha.validade ?? null, linha.lote ?? null);
      await l.mexer(item.id, lote, areas[k]!, linha.local, vencido, q);
      if (linha.valorCentavos !== undefined) l.entrada(item.id, q, BigInt(linha.valorCentavos), { ultimoCusto: true });
      else l.entrada(item.id, q, l.estimar(item.id, q), { estimado: true });
    }
    await l.fechar();
    return { movimentoId: mov, repetido: false };
  });
}

// ---------------------------------------------------------------- transferência

const lugar = z.object({ area, local }, { error: "Lugar em formato inválido." });
const esquemaTransferencia = z
  .object(
    {
      chave: chave.optional(),
      ...referencia,
      quantidade,
      unidade: unidade.optional(),
      de: lugar,
      para: lugar,
      /** Um lote específico; sem ele, o que vence primeiro sai primeiro. */
      loteId: id("Lote não encontrado.").optional(),
      /** Entre áreas: quem vai receber e confirmar (tem de cuidar da área de destino). */
      recebidoPor: id("Quem recebeu não foi encontrado.").optional(),
      observacao: textoLivre("Observação", 500).optional(),
    },
    { error: "Transferência em formato inválido." },
  )
  .refine(umItem, MSG_UM_ITEM)
  .refine((t) => t.de.area !== t.para.area || t.de.local !== t.para.local, "Origem e destino são o mesmo lugar.")
  .refine((t) => t.de.area === t.para.area || t.recebidoPor !== undefined, "Entre áreas, informe quem recebeu.");

/** Transferência entre áreas: fica "a receber" no destino até quem recebe confirmar (migração 0024). */
export type ResultadoDaTransferencia = Lancado & {
  aReceber: { recebimentoId: number; area: AreaEstoque; recebidoPor: { usuarioId: number; nome: string } } | null;
};

/**
 * Leva do em uso para o guardado (ou o contrário), na mesma área, na hora. De uma área para outra
 * (decisão do responsável, 25/11/2026): sai da origem e fica "a receber" na área de destino até a
 * pessoa indicada (ou a supervisão daquela área) confirmar, escolhendo em uso ou guardado; o local
 * de destino informado aqui é só sugestão. Só o livre e não vencido muda de lugar. Não muda o
 * total nem o valor do item.
 */
export async function transferir(db: Banco, ator: Ator | null, dados: unknown): Promise<ResultadoDaTransferencia> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaTransferencia, dados);
  await exigirAreas(db, ator, [d.de.area]);
  const entreAreas = d.de.area !== d.para.area;
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar("transferencia", d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) return { ...ja, aReceber: await aReceberDaTransferencia(trx, ja.movimentoId) };
    if (entreAreas) await conferirQuemRecebe(trx, ator!.usuarioId, d.recebidoPor!, d.para.area);
    const [itemId] = await garantirItens(trx, [d]);
    const itens = await travarItens(trx, [itemId!]);
    const mov = await novoMovimento(trx, {
      tipo: "transferencia",
      autorId: ator!.usuarioId,
      observacao: d.observacao ?? null,
      recebidoPor: entreAreas ? d.recebidoPor! : null,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
    });
    const l = new Lancamento(trx, mov, itens);
    const item = l.item(itemId!);
    const q = await quantidadeNaBase(trx, item, d.quantidade, d.unidade);
    const partes = await pedacos(trx, item.id, { area: d.de.area, local: d.de.local, modo: "livre", loteId: d.loteId });
    const { tirado, de } = await l.tirar(item.id, partes, q);
    if (tirado < q)
      throw new ErroDeRegra(
        "conflito",
        `Não há ${comUnidade(q, item)} de "${item.nome}" livre em ${nomeDaArea(d.de.area)} (${NOME_DO_LOCAL[d.de.local].toLowerCase()})${await quantoHa(trx, ator!, item, d.de.area, tirado)}.`,
      );
    // Entre áreas: os mesmos lotes ficam "a receber" no destino (a recusa os devolve).
    for (const x of de) await l.mexer(item.id, x.p.loteId, d.para.area, entreAreas ? "a_receber" : d.para.local, false, x.q);
    await l.fechar();
    if (!entreAreas) return { movimentoId: mov, repetido: false, aReceber: null };
    await trx
      .insertInto("estoque_recebimento")
      .values({
        movimento_id: mov,
        item_id: item.id,
        area_origem: d.de.area,
        local_origem: d.de.local,
        area_destino: d.para.area,
        local_sugerido: d.para.local,
        quantidade: textoQ4(q),
        recebido_por: d.recebidoPor!,
      })
      .execute();
    return { movimentoId: mov, repetido: false, aReceber: await aReceberDaTransferencia(trx, mov) };
  });
}

async function aReceberDaTransferencia(trx: Trx, movimentoId: string): Promise<ResultadoDaTransferencia["aReceber"]> {
  const r = await trx
    .selectFrom("estoque_recebimento as r")
    .innerJoin("usuario as u", "u.id", "r.recebido_por")
    .select(["r.id", "r.area_destino", "r.recebido_por", "u.nome"])
    .where("r.movimento_id", "=", movimentoId)
    .executeTakeFirst();
  return r ? { recebimentoId: r.id, area: r.area_destino, recebidoPor: { usuarioId: r.recebido_por, nome: r.nome } } : null;
}

/**
 * Quem recebe numa área tem de estar ativo, ter um cargo que cuida dela e não ser quem manda (a
 * confirmação é de outra pessoa; decisão 0027, item 9).
 */
async function conferirQuemRecebe(trx: Trx, quemManda: number, usuarioId: number, destino: AreaEstoque): Promise<void> {
  if (usuarioId === quemManda) throw new ErroDeRegra("dados_invalidos", "Quem manda não pode ser quem recebe.");
  const cargos = await trx
    .selectFrom("usuario_perfil as up")
    .innerJoin("usuario as u", "u.id", "up.usuario_id")
    .select("up.perfil_codigo")
    .where("up.usuario_id", "=", usuarioId)
    .where("up.removido_em", "is", null)
    .where("u.ativo", "=", true)
    .execute();
  if (!cargos.some((c) => pode(c.perfil_codigo, acaoDaArea(destino))))
    throw new ErroDeRegra("dados_invalidos", `Quem recebeu precisa cuidar da área ${nomeDaArea(destino)}.`);
}

// ---------------------------------------------------------------- perda, bloqueio, desbloqueio

const esquemaPerda = z
  .object(
    {
      chave: chave.optional(),
      ...referencia,
      quantidade,
      unidade: unidade.optional(),
      area,
      local,
      motivo: z.enum(MOTIVOS_DE_PERDA, { error: "Motivo da perda inválido." }),
      observacao: textoLivre("Observação", 500).optional(),
      loteId: id("Lote não encontrado.").optional(),
      /** A perda sai do que está bloqueado (ex.: descarte do que estava em quarentena). */
      doBloqueado: z.boolean({ error: "Do bloqueado: sim ou não." }).optional(),
    },
    { error: "Perda em formato inválido." },
  )
  .refine(umItem, MSG_UM_ITEM)
  .refine((p) => p.motivo !== "outro" || !!p.observacao, "Escreva o motivo na observação.");

/** Perda (estragou, venceu, caiu...). Sai primeiro o vencido, depois o que vence antes. */
export async function registrarPerda(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaPerda, dados);
  await exigirAreas(db, ator, [d.area]);
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar("perda", d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) return ja;
    const [itemId] = await garantirItens(trx, [d]);
    const itens = await travarItens(trx, [itemId!]);
    const mov = await novoMovimento(trx, {
      tipo: "perda",
      autorId: ator!.usuarioId,
      motivo: d.motivo,
      observacao: d.observacao ?? null,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
    });
    const l = new Lancamento(trx, mov, itens);
    const item = l.item(itemId!);
    const q = await quantidadeNaBase(trx, item, d.quantidade, d.unidade);
    const partes = await pedacos(trx, item.id, { area: d.area, local: d.local, modo: d.doBloqueado ? "bloqueado" : "vencido_e_livre", loteId: d.loteId });
    const { tirado } = await l.tirar(item.id, partes, q);
    if (tirado < q)
      throw new ErroDeRegra(
        "conflito",
        `Não há ${comUnidade(q, item)} de "${item.nome}"${d.doBloqueado ? " bloqueado" : ""} em ${nomeDaArea(d.area)} (${NOME_DO_LOCAL[d.local].toLowerCase()})${await quantoHa(trx, ator!, item, d.area, tirado)}.`,
      );
    l.saida(item.id, q);
    await l.fechar();
    return { movimentoId: mov, repetido: false };
  });
}

const esquemaBloqueio = z
  .object(
    {
      chave: chave.optional(),
      ...referencia,
      quantidade,
      unidade: unidade.optional(),
      area,
      local,
      motivo: z.enum(MOTIVOS_DE_BLOQUEIO, { error: "Motivo do bloqueio inválido." }).optional(),
      observacao: textoLivre("Observação", 500).optional(),
      loteId: id("Lote não encontrado.").optional(),
    },
    { error: "Bloqueio em formato inválido." },
  )
  .refine(umItem, MSG_UM_ITEM);

/** Separa do livre (quarentena, suspeita). O bloqueado não vai para consumo nem para venda. */
export async function bloquear(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado> {
  return mudarSituacao(db, ator, dados, "bloqueio");
}

/** Devolve ao livre o que estava bloqueado. */
export async function desbloquear(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado> {
  return mudarSituacao(db, ator, dados, "desbloqueio");
}

async function mudarSituacao(db: Banco, ator: Ator | null, dados: unknown, tipo: "bloqueio" | "desbloqueio"): Promise<Lancado> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaBloqueio, dados);
  if (tipo === "bloqueio" && !d.motivo) throw new ErroDeRegra("dados_invalidos", "Escolha o motivo do bloqueio.");
  if (d.motivo === "outro" && !d.observacao) throw new ErroDeRegra("dados_invalidos", "Escreva o motivo na observação.");
  await exigirAreas(db, ator, [d.area]);
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar(tipo, d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) return ja;
    const [itemId] = await garantirItens(trx, [d]);
    const itens = await travarItens(trx, [itemId!]);
    const mov = await novoMovimento(trx, {
      tipo,
      autorId: ator!.usuarioId,
      motivo: d.motivo ?? null,
      observacao: d.observacao ?? null,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
    });
    const l = new Lancamento(trx, mov, itens);
    const item = l.item(itemId!);
    const q = await quantidadeNaBase(trx, item, d.quantidade, d.unidade);
    const partes = await pedacos(trx, item.id, { area: d.area, local: d.local, modo: tipo === "bloqueio" ? "vencido_e_livre" : "bloqueado", loteId: d.loteId });
    const { tirado, de } = await l.tirar(item.id, partes, q);
    if (tirado < q)
      throw new ErroDeRegra(
        "conflito",
        `Não há ${comUnidade(q, item)} de "${item.nome}" ${tipo === "bloqueio" ? "livre" : "bloqueado"} em ${nomeDaArea(d.area)} (${NOME_DO_LOCAL[d.local].toLowerCase()})${await quantoHa(trx, ator!, item, d.area, tirado)}.`,
      );
    for (const x of de) await l.mexer(item.id, x.p.loteId, d.area, d.local, tipo === "bloqueio", x.q);
    await l.fechar();
    return { movimentoId: mov, repetido: false };
  });
}

// ---------------------------------------------------------------- consumo (E11 usa)

export type ItemDoConsumo = Referencia & {
  /** Quanto gastar, na unidade do estoque. Fração exata (da ficha) ou decimal em texto. */
  quantidade: Fracao | string;
  /** Área de onde sai; sem ela, a área do item. */
  area?: AreaEstoque;
};

export type DadosDoConsumo = {
  autorId: number;
  itens: readonly ItemDoConsumo[];
  /** Venda autorizada sem saldo (só loja física, com autorização): registra o que faltou. */
  permitirFalta?: boolean;
  /**
   * Obrigatória: a baixa acontece UMA vez (RC-01). O pedido usa a dele (ex.: "pedido:123:r2"); o
   * mesmo consumo de novo devolve o já gravado, venha de quem vier.
   */
  chave: string;
  origemTipo?: string;
  origemId?: string;
  motivo?: string;
  observacao?: string;
};

const esquemaDoConsumo = z
  .object(
    {
      autorId: id("Autor do consumo inválido."),
      permitirFalta: z.boolean().optional(),
      chave,
      origemTipo: z.string().regex(/^[a-z_]{2,30}$/, "Origem do consumo inválida.").optional(),
      origemId: z.string().min(1, "Origem do consumo inválida.").max(60, "Origem do consumo inválida.").refine((v) => !/\p{Cc}/u.test(v), "Origem do consumo inválida.").optional(),
      motivo: z.string().trim().min(1, "Motivo inválido.").max(40, "Motivo com no máximo 40 letras.").refine((v) => !/\p{Cc}/u.test(v), "Motivo inválido.").optional(),
      observacao: textoLivre("Observação", 500).optional(),
    },
    { error: "Consumo em formato inválido." },
  )
  .refine((c) => (c.origemTipo === undefined) === (c.origemId === undefined), "Origem do consumo: tipo e número juntos.");

export type ResultadoDoConsumo = Lancado & {
  /** O que não havia (só com `permitirFalta`). */
  faltas: { itemId: number; nome: string; unidade: string; quantidade: string }[];
  /** Itens em que o consumo precisou trazer do guardado (aviso da E10). */
  usouGuardado: { itemId: number; nome: string; unidade: string; quantidade: string }[];
};

/**
 * Baixa de estoque DENTRO da transação de quem chama (o pedido da E11, na mesma transação do
 * pedido e do outbox). Sai primeiro do em uso; se faltar, traz do guardado sozinho (linhas
 * marcadas como automáticas: passagem, não consumo) e consome. Sem saldo: recusa, ou, com
 * `permitirFalta`, consome o que há e registra o que faltou (para a contagem).
 * Quem chama já conferiu a permissão. Lote vencido ou bloqueado nunca é consumido.
 */
export async function consumirNaTransacao(trx: Trx, dados: DadosDoConsumo): Promise<ResultadoDoConsumo> {
  const extra = validar(esquemaDoConsumo, { ...dados, itens: undefined });
  const d = { ...extra, itens: dados.itens };
  if (!Array.isArray(d.itens) || d.itens.length === 0) throw new ErroDeRegra("dados_invalidos", "Nada para consumir.");
  if (d.itens.length > ITENS_POR_LANCAMENTO) throw new ErroDeRegra("dados_invalidos", "Itens demais num consumo.");
  for (const i of d.itens) {
    if (!umItem(i)) throw new ErroDeRegra("dados_invalidos", MSG_UM_ITEM);
    validar(z.object({ ...referencia, area: area.optional() }, { error: "Item do consumo em formato inválido." }), { ingredienteId: i.ingredienteId, preparoId: i.preparoId, area: i.area });
  }
  // Fração exata por linha; o mesmo item (mesma área) soma exato e só então arredonda.
  const exatas = d.itens.map((i) => {
    const f = typeof i.quantidade === "string" ? (q4(i.quantidade) === null ? null : new Fracao(q4(i.quantidade)!, ESCALA)) : i.quantidade;
    if (f === null || f.n < 0n) throw new ErroDeRegra("dados_invalidos", "Quantidade do consumo inválida.");
    return f;
  });
  const assinatura = assinar("consumo", {
    itens: d.itens.map((i, k) => [i.ingredienteId ?? null, i.preparoId ?? null, i.area ?? null, `${exatas[k]!.n}/${exatas[k]!.d}`]),
    permitirFalta: d.permitirFalta ?? false,
    origem: [d.origemTipo ?? null, d.origemId ?? null],
  });
  const ja = await jaLancado(trx, d.chave, assinatura);
  if (ja) return { ...ja, ...(await resumoDoConsumo(trx, ja.movimentoId)) };
  const ids = await garantirItens(trx, d.itens);
  const itens = await travarItens(trx, ids);
  const mov = await novoMovimento(trx, {
    tipo: "consumo",
    autorId: d.autorId,
    motivo: d.motivo ?? null,
    observacao: d.observacao ?? null,
    chave: d.chave,
    assinatura,
    origemTipo: d.origemTipo ?? null,
    origemId: d.origemId ?? null,
  });
  const l = new Lancamento(trx, mov, itens);
  // Mesmo item em duas linhas (ex.: pão no lanche e no adicional): soma antes de baixar.
  const somas = new Map<string, { itemId: number; area: AreaEstoque; f: Fracao }>();
  d.itens.forEach((i, k) => {
    const item = l.item(ids[k]!);
    const ar = i.area ?? item.areaPadrao;
    const ch = `${item.id}:${ar}`;
    const atual = somas.get(ch);
    if (atual) atual.f = atual.f.mais(exatas[k]!);
    else somas.set(ch, { itemId: item.id, area: ar, f: exatas[k]! });
  });
  const pedidos = [...somas.values()].map((p) => {
    const q = q4DaFracao(p.f);
    if (q > QUANTIDADE_MAXIMA) throw new ErroDeRegra("dados_invalidos", "Quantidade do consumo grande demais.");
    return { itemId: p.itemId, area: p.area, q };
  });
  const faltas: ResultadoDoConsumo["faltas"] = [];
  const usouGuardado: ResultadoDoConsumo["usouGuardado"] = [];
  const semSaldo: string[] = [];
  for (const p of pedidos.sort((a, b) => a.itemId - b.itemId || a.area.localeCompare(b.area))) {
    if (p.q === 0n) continue;
    const item = l.item(p.itemId);
    const { falta, trazido } = await gastarDaArea(trx, l, item.id, p.area, p.q);
    if (trazido > 0n) usouGuardado.push({ itemId: item.id, nome: item.nome, unidade: item.unidade, quantidade: textoQ4(trazido) });
    if (falta > 0n) {
      if (!d.permitirFalta) {
        semSaldo.push(`"${item.nome}" (precisa ${comUnidade(p.q, item)}, há ${comUnidade(p.q - falta, item)} livre em ${nomeDaArea(p.area)})`);
        continue;
      }
      l.faltou(item.id, falta);
      faltas.push({ itemId: item.id, nome: item.nome, unidade: item.unidade, quantidade: textoQ4(falta) });
    }
    l.saida(item.id, p.q - falta);
  }
  if (semSaldo.length) throw new ErroDeRegra("conflito", `Sem saldo: ${semSaldo.join("; ")}.`);
  if (pedidos.every((p) => p.q === 0n)) throw new ErroDeRegra("dados_invalidos", "Nada para consumir (as quantidades deram zero).");
  await l.fechar();
  return { movimentoId: mov, repetido: false, faltas, usouGuardado };
}

/**
 * Gasta `q` do em uso livre da área (o que vence primeiro antes); se faltar, traz do guardado
 * (linhas automáticas) e gasta. Não mexe no valor. Devolve o que faltou e o que veio do guardado.
 */
async function gastarDaArea(trx: Trx, l: Lancamento, itemId: number, area: AreaEstoque, q: bigint): Promise<{ falta: bigint; trazido: bigint }> {
  const emUso = await pedacos(trx, itemId, { area, local: "em_uso", modo: "livre" });
  const r1 = await l.tirar(itemId, emUso, q);
  let falta = q - r1.tirado;
  let trazido = 0n;
  if (falta > 0n) {
    const guardado = await pedacos(trx, itemId, { area, local: "guardado", modo: "livre" });
    const r2 = await l.tirar(itemId, guardado, falta, true);
    for (const x of r2.de) {
      await l.mexer(itemId, x.p.loteId, area, "em_uso", false, x.q, true);
      await l.mexer(itemId, x.p.loteId, area, "em_uso", false, -x.q);
    }
    trazido = r2.tirado;
    falta -= r2.tirado;
  }
  return { falta, trazido };
}

async function resumoDoConsumo(trx: Trx, movimentoId: string): Promise<Pick<ResultadoDoConsumo, "faltas" | "usouGuardado">> {
  const r = await sql<{ item_id: number; nome: string; unidade: string; faltou: string; trazido: string }>`
    SELECT mi.item_id, coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade, mi.faltou::text AS faltou,
      coalesce((SELECT sum(-l.quantidade) FROM estoque_movimento_linha l
                 WHERE l.movimento_id = mi.movimento_id AND l.item_id = mi.item_id AND l.automatica AND l.local = 'guardado'), 0)::text AS trazido
    FROM estoque_movimento_item mi JOIN estoque_item e ON e.id = mi.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    WHERE mi.movimento_id = ${movimentoId}::bigint ORDER BY mi.item_id`.execute(trx);
  return {
    faltas: r.rows.filter((x) => q4DoBanco(x.faltou) > 0n).map((x) => ({ itemId: x.item_id, nome: x.nome, unidade: x.unidade, quantidade: textoQ4(q4DoBanco(x.faltou)) })),
    usouGuardado: r.rows.filter((x) => q4DoBanco(x.trazido) > 0n).map((x) => ({ itemId: x.item_id, nome: x.nome, unidade: x.unidade, quantidade: textoQ4(q4DoBanco(x.trazido)) })),
  };
}

// ---------------------------------------------------------------- consultas

/** Áreas que o cargo ativo pode ver. */
export function areasDoAtor(ator: Ator | null): AreaEstoque[] {
  if (!ator) return [];
  return AREAS_ESTOQUE.filter((a) => pode(ator.cargoAtivo, acaoDaArea(a)));
}

async function exigirAlgumaArea(db: Banco, ator: Ator | null): Promise<{ ator: Ator; areas: AreaEstoque[] }> {
  const areas = areasDoAtor(ator);
  if (!ator || areas.length === 0 || ator.segundoFator === "pendente") {
    await exigir(db, ator, "estoque.cozinha", { tipo: "estoque" });
  }
  return { ator: ator!, areas };
}

export type SaldoDaArea = {
  area: AreaEstoque;
  /** Quantidades: nulas enquanto há contagem aberta do item nesta área (contagem cega; só a gestão vê). */
  emUso: string | null;
  guardado: string | null;
  bloqueado: string | null;
  vencido: string | null;
  /** Livre para usar agora (sem bloqueado e sem vencido; o "a receber" não entra). A reserva entra na E11. */
  livre: string | null;
  /** Veio de outra área e espera quem recebe confirmar (não é livre nem é consumido). */
  aReceber: string | null;
  /** Há contagem aberta do item nesta área. */
  emContagem: boolean;
  /** Só com custos.ver: valor proporcional ao custo médio. */
  valorCentavos: string | null;
};

export type ItemDoPainel = {
  itemId: number | null;
  ingredienteId: number | null;
  preparoId: number | null;
  nome: string;
  unidade: string;
  areaPadrao: AreaEstoque;
  /** Nulo enquanto há contagem aberta do item numa área da pessoa (contagem cega). */
  total: string | null;
  valorCentavos: string | null;
  custoMedioCentavos: string | null;
  emContagem: boolean;
  /** Menor validade com saldo (para "vence logo"). */
  proximaValidade: string | null;
  areas: SaldoDaArea[];
};

type LinhaDoSaldo = { item_id: number; area: AreaEstoque; local: LocalDoSaldo; bloqueado: boolean; vencido: boolean; quantidade: string; validade: string | null };

async function saldosDosItens(db: Banco, itemIds: readonly number[]): Promise<LinhaDoSaldo[]> {
  if (itemIds.length === 0) return [];
  const r = await sql<LinhaDoSaldo>`
    SELECT s.item_id, s.area, s.local, s.bloqueado, coalesce(l.validade < hoje_na_loja(), false) AS vencido,
      s.quantidade::text AS quantidade, to_char(l.validade, 'YYYY-MM-DD') AS validade
    FROM estoque_saldo s JOIN estoque_lote l ON l.id = s.lote_id
    WHERE s.item_id = ANY(${[...itemIds]}::int[]) AND s.quantidade > 0`.execute(db);
  return r.rows;
}

function montarAreas(linhas: readonly LinhaDoSaldo[], areasVisiveis: readonly AreaEstoque[], qTotal: bigint, vTotal: bigint, comValor: boolean): SaldoDaArea[] {
  const porArea = new Map<AreaEstoque, { emUso: bigint; guardado: bigint; bloqueado: bigint; vencido: bigint; aReceber: bigint }>();
  for (const s of linhas) {
    if (!areasVisiveis.includes(s.area)) continue;
    const a = porArea.get(s.area) ?? { emUso: 0n, guardado: 0n, bloqueado: 0n, vencido: 0n, aReceber: 0n };
    const q = q4DoBanco(s.quantidade);
    porArea.set(s.area, a);
    // A receber: ainda não é da área (nem livre, nem bloqueado, nem vencido) até alguém confirmar.
    if (s.local === "a_receber") {
      a.aReceber += q;
      continue;
    }
    if (s.local === "em_uso") a.emUso += q;
    else a.guardado += q;
    if (s.bloqueado) a.bloqueado += q;
    else if (s.vencido) a.vencido += q;
  }
  return [...porArea.entries()]
    .sort((x, y) => AREAS_ESTOQUE.indexOf(x[0]) - AREAS_ESTOQUE.indexOf(y[0]))
    .map(([ar, a]) => ({
      area: ar,
      emUso: textoQ4(a.emUso),
      guardado: textoQ4(a.guardado),
      bloqueado: textoQ4(a.bloqueado),
      vencido: textoQ4(a.vencido),
      livre: textoQ4(a.emUso + a.guardado - a.bloqueado - a.vencido),
      aReceber: textoQ4(a.aReceber),
      valorCentavos: comValor ? valorDaSaida(qTotal, vTotal, a.emUso + a.guardado + a.aReceber).toString() : null,
      emContagem: false,
    }));
}

/**
 * Painel do estoque: todo ingrediente ativo e todo preparo ativo das áreas que a pessoa cuida
 * (mesmo zerados), mais os itens que têm saldo nessas áreas. Valores só com `custos.ver`.
 */
export async function painelDoEstoque(db: Banco, ator: Ator | null, filtro: unknown = {}): Promise<ItemDoPainel[]> {
  const f = validar(z.object({ area: area.optional() }, { error: "Filtro em formato inválido." }), filtro);
  const { ator: a, areas: visiveis } = await exigirAlgumaArea(db, ator);
  if (f.area && !visiveis.includes(f.area)) await exigir(db, ator, acaoDaArea(f.area), { tipo: "estoque_area", id: f.area });
  const areas = f.area ? [f.area] : visiveis;
  return esconderEmContagem(db, a, await carregarPainel(db, areas, pode(a.cargoAtivo, "custos.ver")));
}

async function carregarPainel(db: Banco, areas: readonly AreaEstoque[], comValor: boolean, ref?: Referencia): Promise<ItemDoPainel[]> {
  const candidatos = ref
    ? sql`SELECT ${ref.ingredienteId ?? null}::int AS ingrediente_id, ${ref.preparoId ?? null}::int AS preparo_id`
    : sql`
      SELECT i.id AS ingrediente_id, NULL::int AS preparo_id FROM ingrediente i WHERE i.ativo AND i.area_estoque = ANY(${areas}::text[])
      UNION
      SELECT NULL::int, f.id FROM ficha f
        LEFT JOIN estoque_item e ON e.preparo_id = f.id
        WHERE f.tipo = 'preparo' AND f.ativo AND coalesce(e.area_preparo, 'cozinha') = ANY(${areas}::text[])
      UNION
      SELECT e.ingrediente_id, e.preparo_id FROM estoque_item e
        WHERE EXISTS (SELECT 1 FROM estoque_saldo s WHERE s.item_id = e.id AND s.quantidade > 0 AND s.area = ANY(${areas}::text[]))`;
  const r = await sql<{ item_id: number | null; ingrediente_id: number | null; preparo_id: number | null; nome: string; unidade: string; area: AreaEstoque; quantidade: string; valor: string }>`
    WITH candidatos AS (${candidatos})
    SELECT e.id AS item_id, c.ingrediente_id, c.preparo_id, coalesce(i.nome, f.nome) AS nome,
      coalesce(i.unidade_base, f.unidade_rendimento) AS unidade, coalesce(i.area_estoque, e.area_preparo, 'cozinha') AS area,
      coalesce(e.quantidade, 0)::text AS quantidade, coalesce(e.valor_centavos, 0)::text AS valor
    FROM candidatos c
    LEFT JOIN ingrediente i ON i.id = c.ingrediente_id
    LEFT JOIN ficha f ON f.id = c.preparo_id AND f.tipo = 'preparo'
    LEFT JOIN estoque_item e ON (e.ingrediente_id = c.ingrediente_id OR e.preparo_id = c.preparo_id)
    WHERE i.id IS NOT NULL OR f.id IS NOT NULL
    ORDER BY lower(coalesce(i.nome, f.nome)), c.ingrediente_id NULLS LAST, c.preparo_id`.execute(db);
  const saldos = await saldosDosItens(
    db,
    r.rows.flatMap((x) => (x.item_id === null ? [] : [x.item_id])),
  );
  const porItem = new Map<number, LinhaDoSaldo[]>();
  for (const s of saldos) porItem.set(s.item_id, [...(porItem.get(s.item_id) ?? []), s]);
  return r.rows.map((x) => {
    const qT = q4DoBanco(x.quantidade);
    const vT = BigInt(x.valor);
    const linhas = x.item_id === null ? [] : (porItem.get(x.item_id) ?? []);
    const validades = linhas.filter((s) => s.validade !== null && areas.includes(s.area)).map((s) => s.validade!);
    // Só o que está nas áreas que a pessoa vê (o total das outras áreas não aparece).
    const qVisivel = linhas.filter((s) => areas.includes(s.area)).reduce((t, s) => t + q4DoBanco(s.quantidade), 0n);
    return {
      itemId: x.item_id,
      ingredienteId: x.ingrediente_id,
      preparoId: x.preparo_id,
      nome: x.nome,
      unidade: x.unidade,
      areaPadrao: x.area,
      total: textoQ4(qVisivel),
      valorCentavos: comValor ? valorDaSaida(qT, vT, qVisivel).toString() : null,
      custoMedioCentavos: comValor ? custoMedioPorUnidade(qT, vT) : null,
      proximaValidade: validades.length ? validades.sort()[0]! : null,
      emContagem: false,
      areas: montarAreas(linhas, areas, qT, vT, comValor),
    };
  });
}

/**
 * Contagem cega fora da tela da contagem: enquanto houver contagem aberta de um item numa área,
 * quem não é da gestão (sem `estoque.desfazer`) não vê as quantidades dele nessa área, no painel,
 * no item nem no histórico.
 */
async function esconderEmContagem<T extends ItemDoPainel>(db: Banco, ator: Ator, itens: T[]): Promise<T[]> {
  if (pode(ator.cargoAtivo, "estoque.desfazer")) return itens;
  const ids = itens.flatMap((i) => (i.itemId === null ? [] : [i.itemId]));
  if (!ids.length) return itens;
  const abertas = await sql<{ item_id: number; area: AreaEstoque }>`
    SELECT DISTINCT ci.item_id, c.area FROM estoque_contagem c JOIN estoque_contagem_item ci ON ci.contagem_id = c.id
    WHERE ci.item_id = ANY(${ids}::int[]) AND NOT EXISTS (SELECT 1 FROM estoque_contagem_fim f WHERE f.contagem_id = c.id)`.execute(db);
  if (!abertas.rows.length) return itens;
  const chaves = new Set(abertas.rows.map((x) => `${x.item_id}:${x.area}`));
  return itens.map((i) => {
    if (i.itemId === null) return i;
    const areas = i.areas.map((a) =>
      chaves.has(`${i.itemId}:${a.area}`) ? { ...a, emUso: null, guardado: null, bloqueado: null, vencido: null, livre: null, aReceber: null, valorCentavos: null, emContagem: true } : a,
    );
    const algum = areas.some((a) => a.emContagem) || chaves.has(`${i.itemId}:${i.areaPadrao}`);
    return algum ? { ...i, areas, total: null, valorCentavos: null, emContagem: true } : i;
  });
}

export type LoteDoItem = {
  loteId: number;
  validade: string | null;
  vencido: boolean;
  codigo: string | null;
  entrouEm: string;
  saldos: { area: AreaEstoque; local: LocalDoSaldo; bloqueado: boolean; quantidade: string | null }[];
};

export type EstoqueDoItem = ItemDoPainel & { lotes: LoteDoItem[] };

/**
 * Um item com os lotes e onde cada lote está. Vê quem cuida da área do item ou de uma área onde
 * ele tem saldo; mostra só o que está nas áreas da pessoa.
 */
export async function estoqueDoItem(db: Banco, ator: Ator | null, ref: unknown): Promise<EstoqueDoItem> {
  const r = validar(z.object(referencia, { error: "Item em formato inválido." }).refine(umItem, MSG_UM_ITEM), ref);
  const { ator: a, areas } = await exigirAlgumaArea(db, ator);
  const [item] = await carregarPainel(db, areas, pode(a.cargoAtivo, "custos.ver"), r);
  if (!item) throw new ErroDeRegra("nao_encontrado", "Item não encontrado.");
  if (!areas.includes(item.areaPadrao) && item.areas.length === 0 && item.itemId !== null) {
    // Sem saldo agora nas áreas da pessoa: ainda vê se já houve movimento nelas (o histórico não some).
    const teve = await sql<{ ok: boolean }>`SELECT EXISTS (SELECT 1 FROM estoque_movimento_linha WHERE item_id = ${item.itemId} AND area = ANY(${areas}::text[])) AS ok`.execute(db);
    if (!teve.rows[0]!.ok) await exigir(db, a, acaoDaArea(item.areaPadrao), { tipo: "estoque_area", id: item.areaPadrao });
  } else if (!areas.includes(item.areaPadrao) && item.areas.length === 0) await exigir(db, a, acaoDaArea(item.areaPadrao), { tipo: "estoque_area", id: item.areaPadrao });
  const lotes: LoteDoItem[] = [];
  if (item.itemId !== null) {
    const l = await sql<{ id: number; validade: string | null; vencido: boolean; codigo: string | null; entrou: string; area: AreaEstoque; local: LocalDoSaldo; bloqueado: boolean; quantidade: string }>`
      SELECT l.id, to_char(l.validade, 'YYYY-MM-DD') AS validade, coalesce(l.validade < hoje_na_loja(), false) AS vencido, l.codigo,
        to_char(l.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS entrou, s.area, s.local, s.bloqueado, s.quantidade::text AS quantidade
      FROM estoque_lote l JOIN estoque_saldo s ON s.lote_id = l.id
      WHERE l.item_id = ${item.itemId} AND s.quantidade > 0 AND s.area = ANY(${areas}::text[])
      ORDER BY l.validade ASC NULLS LAST, l.id, s.area, s.local, s.bloqueado`.execute(db);
    const porLote = new Map<number, LoteDoItem>();
    for (const x of l.rows) {
      let lote = porLote.get(x.id);
      if (!lote) {
        lote = { loteId: x.id, validade: x.validade, vencido: x.vencido, codigo: x.codigo, entrouEm: x.entrou, saldos: [] };
        porLote.set(x.id, lote);
        lotes.push(lote);
      }
      lote.saldos.push({ area: x.area, local: x.local, bloqueado: x.bloqueado, quantidade: textoQ4(q4DoBanco(x.quantidade)) });
    }
  }
  const [visto] = await esconderEmContagem(db, a, [item]);
  const escondidas = new Set(visto!.areas.filter((x) => x.emContagem).map((x) => x.area));
  return { ...visto!, lotes: lotes.map((l) => ({ ...l, saldos: l.saldos.map((x) => (escondidas.has(x.area) ? { ...x, quantidade: null } : x)) })) };
}

export type MovimentoDoHistorico = {
  movimentoId: string;
  tipo: string;
  motivo: string | null;
  observacao: string | null;
  quando: string;
  autor: string;
  /** A mudança (nas áreas que a pessoa vê). Nula durante contagem aberta do item (contagem cega). */
  quantidade: string | null;
  /** Total depois do movimento; nulo para quem não vê todas as áreas. */
  quantidadeDepois: string | null;
  valorCentavos: string | null;
  valorDepois: string | null;
  faltou: string;
  custoEstimado: boolean;
  usouGuardado: boolean;
  desfeitoPor: string | null;
  /**
   * Mudança entre áreas (migração 0024): a que mandou fica "a_receber", "confirmado" ou "recusado";
   * a que tirou do "a receber" é a "confirmacao" ou a "devolucao". Nenhuma delas se desfaz.
   */
  recebimento: "a_receber" | "confirmado" | "recusado" | "confirmacao" | "devolucao" | null;
};

/** Histórico do item (o mais novo primeiro), com o saldo depois de cada movimento. */
export async function historicoDoItem(db: Banco, ator: Ator | null, dados: unknown): Promise<MovimentoDoHistorico[]> {
  const d = validar(
    z
      .object(
        {
          ...referencia,
          antesDe: z.string().regex(/^\d{1,18}$/, "Página inválida.").optional(),
          limite: z.number({ error: "Limite inválido." }).int("Limite inválido.").min(1, "Limite inválido.").max(200, "Limite de no máximo 200.").optional(),
        },
        { error: "Consulta em formato inválido." },
      )
      .refine(umItem, MSG_UM_ITEM),
    dados,
  );
  const item = await estoqueDoItem(db, ator, { ingredienteId: d.ingredienteId, preparoId: d.preparoId });
  if (item.itemId === null) return [];
  // Contagem cega: com contagem aberta do item, quem conta não vê as quantidades no histórico.
  const cego = item.emContagem;
  const comValor = pode(ator!.cargoAtivo, "custos.ver");
  // Quem não vê todas as áreas vê só os movimentos com linha nas suas áreas, com a mudança só
  // delas e sem o "depois" (que é o total de todas as áreas).
  const areas = areasDoAtor(ator);
  const todas = areas.length === AREAS_ESTOQUE.length;
  const r = await sql<{
    id: string;
    tipo: string;
    motivo: string | null;
    observacao: string | null;
    quando: string;
    autor: string;
    quantidade: string;
    quantidade_depois: string;
    valor: string;
    valor_depois: string;
    faltou: string;
    custo_estimado: boolean;
    usou_guardado: boolean;
    desfeito_por: string | null;
    recebimento: MovimentoDoHistorico["recebimento"];
  }>`
    SELECT m.id::text AS id, m.tipo, m.motivo, m.observacao, to_char(m.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS quando,
      u.nome AS autor,
      (CASE WHEN ${todas} THEN mi.quantidade
            ELSE (SELECT coalesce(sum(l.quantidade), 0) FROM estoque_movimento_linha l
                  WHERE l.movimento_id = m.id AND l.item_id = mi.item_id AND l.area = ANY(${areas}::text[])) END)::text AS quantidade,
      mi.quantidade_depois::text AS quantidade_depois,
      mi.valor_centavos::text AS valor, mi.valor_depois::text AS valor_depois, mi.faltou::text AS faltou, mi.custo_estimado,
      EXISTS (SELECT 1 FROM estoque_movimento_linha l WHERE l.movimento_id = m.id AND l.item_id = mi.item_id AND l.automatica) AS usou_guardado,
      (SELECT e.id::text FROM estoque_movimento e WHERE e.estorno_de = m.id) AS desfeito_por,
      coalesce(
        (SELECT coalesce(f.situacao, 'a_receber') FROM estoque_recebimento r LEFT JOIN estoque_recebimento_fim f ON f.recebimento_id = r.id WHERE r.movimento_id = m.id),
        (SELECT CASE f.situacao WHEN 'confirmado' THEN 'confirmacao' ELSE 'devolucao' END FROM estoque_recebimento_fim f WHERE f.movimento_id = m.id)) AS recebimento
    FROM estoque_movimento_item mi JOIN estoque_movimento m ON m.id = mi.movimento_id JOIN usuario u ON u.id = m.autor_id
    WHERE mi.item_id = ${item.itemId} AND (${d.antesDe ?? null}::bigint IS NULL OR m.id < ${d.antesDe ?? null}::bigint)
      AND (${todas} OR EXISTS (SELECT 1 FROM estoque_movimento_linha l WHERE l.movimento_id = m.id AND l.item_id = mi.item_id AND l.area = ANY(${areas}::text[])))
    ORDER BY m.id DESC LIMIT ${d.limite ?? 50}`.execute(db);
  return r.rows.map((x) => ({
    movimentoId: x.id,
    tipo: x.tipo,
    motivo: x.motivo,
    observacao: x.observacao,
    quando: x.quando,
    autor: x.autor,
    quantidade: cego ? null : textoQ4(q4DoBanco(x.quantidade)),
    quantidadeDepois: todas && !cego ? textoQ4(q4DoBanco(x.quantidade_depois)) : null,
    valorCentavos: comValor && todas ? x.valor : null,
    valorDepois: comValor && todas ? x.valor_depois : null,
    faltou: textoQ4(q4DoBanco(x.faltou)),
    custoEstimado: x.custo_estimado,
    usouGuardado: x.usou_guardado,
    desfeitoPor: x.desfeito_por,
    recebimento: x.recebimento,
  }));
}

/**
 * Conferência de integridade (testes e diagnóstico): para cada item, a soma das linhas é o saldo,
 * o saldo somado é o total do item, e a soma dos movimentos fecha com total e valor.
 * Devolve a lista de diferenças (vazia = tudo certo).
 */
export async function conferirEstoque(db: Banco): Promise<string[]> {
  const r = await sql<{ problema: string }>`
    SELECT 'saldo ' || s.lote_id || '/' || s.area || '/' || s.local || '/' || s.bloqueado || ' difere das linhas' AS problema
    FROM estoque_saldo s
    LEFT JOIN (SELECT lote_id, area, local, bloqueado, sum(quantidade) AS q FROM estoque_movimento_linha GROUP BY 1, 2, 3, 4) l
      USING (lote_id, area, local, bloqueado)
    WHERE s.quantidade <> coalesce(l.q, 0)
    UNION ALL
    SELECT 'item ' || e.id || ' total difere dos saldos'
    FROM estoque_item e LEFT JOIN (SELECT item_id, sum(quantidade) AS q FROM estoque_saldo GROUP BY 1) s ON s.item_id = e.id
    WHERE e.quantidade <> coalesce(s.q, 0)
    UNION ALL
    SELECT 'item ' || e.id || ' difere da soma dos movimentos'
    FROM estoque_item e LEFT JOIN (SELECT item_id, sum(quantidade) AS q, sum(valor_centavos) AS v FROM estoque_movimento_item GROUP BY 1) m ON m.item_id = e.id
    WHERE e.quantidade <> coalesce(m.q, 0) OR e.valor_centavos <> coalesce(m.v, 0)
    UNION ALL
    SELECT 'movimento ' || mi.movimento_id || ' item ' || mi.item_id || ' difere das linhas'
    FROM estoque_movimento_item mi
    LEFT JOIN (SELECT movimento_id, item_id, sum(quantidade) AS q FROM estoque_movimento_linha GROUP BY 1, 2) l USING (movimento_id, item_id)
    WHERE mi.quantidade <> coalesce(l.q, 0)
    UNION ALL
    SELECT 'lote ' || l.id || ' de outro item' FROM estoque_movimento_linha x JOIN estoque_lote l ON l.id = x.lote_id WHERE l.item_id <> x.item_id
    UNION ALL
    -- O "a receber" de cada lote e área é a soma do que os recebimentos pendentes deixaram lá.
    SELECT 'a receber ' || coalesce(s.lote_id, p.lote_id) || '/' || coalesce(s.area, p.area) || ' difere dos recebimentos pendentes'
    FROM (SELECT lote_id, area, sum(quantidade) AS q FROM estoque_saldo WHERE local = 'a_receber' GROUP BY 1, 2 HAVING sum(quantidade) <> 0) s
    FULL JOIN (
      SELECT x.lote_id, x.area, sum(x.quantidade) AS q
      FROM estoque_recebimento r JOIN estoque_movimento_linha x
        ON x.movimento_id = r.movimento_id AND x.item_id = r.item_id AND x.area = r.area_destino AND x.local = 'a_receber'
      WHERE NOT EXISTS (SELECT 1 FROM estoque_recebimento_fim f WHERE f.recebimento_id = r.id)
      GROUP BY 1, 2
    ) p ON p.lote_id = s.lote_id AND p.area = s.area
    WHERE coalesce(s.q, 0) <> coalesce(p.q, 0)
    UNION ALL
    SELECT 'recebimento ' || r.id || ' difere das linhas a receber'
    FROM estoque_recebimento r
    LEFT JOIN (SELECT movimento_id, item_id, area, sum(quantidade) AS q FROM estoque_movimento_linha WHERE local = 'a_receber' AND quantidade > 0 GROUP BY 1, 2, 3) x
      ON x.movimento_id = r.movimento_id AND x.item_id = r.item_id AND x.area = r.area_destino
    WHERE r.quantidade <> coalesce(x.q, 0)`.execute(db);
  return r.rows.map((x) => x.problema);
}

// ---------------------------------------------------------------- compras: lista e correção de custo

/** Áreas tocadas por um movimento (pelas linhas). */
async function areasDoMovimento(db: Banco, movimentoId: string): Promise<AreaEstoque[]> {
  const r = await sql<{ area: AreaEstoque }>`SELECT DISTINCT area FROM estoque_movimento_linha WHERE movimento_id = ${movimentoId}::bigint ORDER BY area`.execute(db);
  return r.rows.map((x) => x.area);
}

/**
 * Quem cuida de alguma área tocada pela entrada pode vê-la (e anexar a foto da nota). Recusa com
 * "não encontrada" o que não é entrada; sem área em comum, recusa por cargo (auditado).
 */
export async function exigirEntradaVisivel(db: Banco, ator: Ator | null, movimentoId: string): Promise<{ ator: Ator; tipo: "entrada" | "saldo_inicial" }> {
  const { ator: a, areas } = await exigirAlgumaArea(db, ator);
  const m = await db.selectFrom("estoque_movimento").select("tipo").where("id", "=", movimentoId).executeTakeFirst();
  if (!m || (m.tipo !== "entrada" && m.tipo !== "saldo_inicial")) throw new ErroDeRegra("nao_encontrado", "Entrada não encontrada.");
  const tocadas = await areasDoMovimento(db, movimentoId);
  if (!tocadas.some((t) => areas.includes(t))) await exigir(db, a, acaoDaArea(tocadas[0] ?? "cozinha"), { tipo: "estoque_movimento", id: movimentoId });
  return { ator: a, tipo: m.tipo };
}

const idDoMovimento = z
  .union([z.string(), z.number()], { error: "Movimento não encontrado." })
  .transform((v) => String(v))
  .refine((v) => /^[1-9][0-9]{0,17}$/.test(v), "Movimento não encontrado.");

const esquemaCorrecaoDeCusto = z.object(
  {
    chave: chave.optional(),
    movimentoId: idDoMovimento,
    itens: z
      .array(
        z
          .object(
            {
              ...referencia,
              /** O valor total CERTO desta linha da entrada (o que foi pago), em centavos. */
              valorCentavos: z
                .number({ error: "Valor em centavos, um número inteiro." })
                .int("Valor em centavos, um número inteiro.")
                .min(0, "Valor não pode ser negativo.")
                .max(VALOR_MAXIMO_CENTAVOS, "Valor grande demais."),
            },
            { error: "Item em formato inválido." },
          )
          .refine(umItem, MSG_UM_ITEM),
        { error: "Itens em formato inválido." },
      )
      .min(1, "Informe ao menos um item.")
      .max(ITENS_POR_LANCAMENTO, "Itens demais."),
    observacao: textoLivre("Observação", 500).optional(),
  },
  { error: "Correção de custo em formato inválido." },
);

/**
 * Corrige o custo de uma entrada (preço que chegou depois, valor estimado, erro de digitação).
 * Só com `custos.ver`. A diferença entre o valor certo e o que a entrada vale hoje vai para o
 * estoque na proporção do que ainda resta dos lotes daquela entrada (o que já saiu saiu com o
 * custo da época). Nada se reescreve: nasce um movimento "custo" ligado à entrada.
 */
export async function corrigirCustoDaEntrada(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado & { aplicadoCentavos: string }> {
  const quem = await exigir(db, ator, "custos.ver", { tipo: "estoque_custo" });
  const d = validar(esquemaCorrecaoDeCusto, dados);
  // Além de ver custos, tem de cuidar de uma área da entrada (quem corrige vê o que corrige).
  await exigirEntradaVisivel(db, quem, d.movimentoId);
  // Conta pesada fora da trava (as vendas do item não esperam por ela).
  const previa = new Map<number, { fica: bigint; ultimo: string }>();
  for (const i of d.itens) {
    const e = await db.selectFrom("estoque_item").select("id").where(i.ingredienteId !== undefined ? "ingrediente_id" : "preparo_id", "=", (i.ingredienteId ?? i.preparoId)!).executeTakeFirst();
    if (e) previa.set(e.id, await quantoFicaDaEntrada(db, e.id, d.movimentoId, ESCALA_DA_FRACAO));
  }
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar("custo", d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) {
      const r = await trx.selectFrom("estoque_movimento_item").select(sql<string>`sum(valor_centavos)::text`.as("v")).where("movimento_id", "=", ja.movimentoId).executeTakeFirst();
      return { ...ja, aplicadoCentavos: r?.v ?? "0" };
    }
    // Mesma trava do desfazer: correção e desfazer da mesma entrada não passam juntos.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${"estoque_estorno:" + d.movimentoId}))`.execute(trx);
    const m = await trx.selectFrom("estoque_movimento").select(["id", "tipo"]).where("id", "=", d.movimentoId).executeTakeFirst();
    if (!m || (m.tipo !== "entrada" && m.tipo !== "saldo_inicial")) throw new ErroDeRegra("nao_encontrado", "Entrada não encontrada.");
    if (await trx.selectFrom("estoque_movimento").select("id").where("estorno_de", "=", d.movimentoId).executeTakeFirst())
      throw new ErroDeRegra("conflito", "Esta entrada foi desfeita: não há custo para corrigir.");
    const ids = await garantirItens(trx, d.itens);
    if (new Set(ids).size !== ids.length) throw new ErroDeRegra("dados_invalidos", "Cada item aparece uma vez só na correção.");
    const itens = await travarItens(trx, ids);
    const mov = await novoMovimento(trx, {
      tipo: "custo",
      autorId: quem.usuarioId,
      observacao: d.observacao ?? null,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
      corrigeCustoDe: d.movimentoId,
    });
    const l = new Lancamento(trx, mov, itens);
    let aplicado = 0n;
    for (const [k, linha] of d.itens.entries()) {
      const item = l.item(ids[k]!);
      const r = await sql<{ entrou: string | null; valor_atual: string | null; ultima: boolean }>`
        SELECT mi.quantidade::text AS entrou,
          mi.valor_centavos::text AS valor_atual,
          NOT EXISTS (SELECT 1 FROM estoque_movimento_item o JOIN estoque_movimento om ON om.id = o.movimento_id
                      WHERE o.item_id = mi.item_id AND om.tipo IN ('entrada', 'saldo_inicial') AND o.movimento_id > mi.movimento_id
                        AND (NOT o.custo_estimado OR EXISTS (
                          SELECT 1 FROM estoque_movimento c JOIN estoque_movimento_item ci ON ci.movimento_id = c.id
                          WHERE c.tipo = 'custo' AND c.corrige_custo_de = o.movimento_id AND ci.item_id = o.item_id))) AS ultima
        FROM estoque_movimento_item mi WHERE mi.movimento_id = ${d.movimentoId}::bigint AND mi.item_id = ${item.id}`.execute(trx);
      const x = r.rows[0];
      if (!x || x.entrou === null) throw new ErroDeRegra("dados_invalidos", `"${item.nome}" não está nesta entrada.`);
      // Valor que a entrada tem hoje: o da última correção, ou o original.
      const ultimaCorrecao = await trx
        .selectFrom("estoque_movimento_item as ci")
        .innerJoin("estoque_movimento as cm", "cm.id", "ci.movimento_id")
        .select("ci.valor_informado")
        .where("cm.tipo", "=", "custo")
        .where("cm.corrige_custo_de", "=", d.movimentoId)
        .where("ci.item_id", "=", item.id)
        .orderBy("ci.movimento_id", "desc")
        .limit(1)
        .executeTakeFirst();
      const atual = ultimaCorrecao?.valor_informado != null ? BigInt(ultimaCorrecao.valor_informado) : BigInt(x.valor_atual!);
      const entrou = q4DoBanco(x.entrou);
      const novo = BigInt(linha.valorCentavos);
      const diferenca = novo - atual;
      // Parte da diferença que ainda está no estoque, pelo custo médio: cada saída depois da
      // entrada leva "saída / quantidade antes" do valor que havia (lotes saem por validade, mas
      // o valor sai pela média; por isso a conta é pelas saídas, não pelos lotes).
      // O grosso foi contado antes da trava; aqui só as saídas que chegaram depois.
      const antes = previa.get(item.id) ?? { fica: ESCALA_DA_FRACAO, ultimo: d.movimentoId };
      const { fica } = await quantoFicaDaEntrada(trx, item.id, antes.ultimo, antes.fica);
      const parte = (diferenca * fica + (diferenca < 0n ? -ESCALA_DA_FRACAO / 2n : ESCALA_DA_FRACAO / 2n)) / ESCALA_DA_FRACAO;
      aplicado += l.ajustarValor(item.id, parte, novo, x.ultima ? { c: novo, q: entrou } : null);
    }
    await l.fechar();
    return { movimentoId: mov, repetido: false, aplicadoCentavos: aplicado.toString() };
  });
}

const ITENS_NA_LISTA = 50;

/** Escala da fração "quanto fica" (10^18): erro final bem abaixo de 1 centavo. */
const ESCALA_DA_FRACAO = 10n ** 18n;

/**
 * Quanto do valor de uma entrada ainda está no estoque, pelo custo médio: produto de
 * "depois / antes" das saídas do item depois de `desde` (movimentos em ordem, pois todo
 * lançamento trava o item antes de nascer). Inteiro com escala fixa, arredondado a cada passo;
 * para cedo quando zera. Devolve também o último movimento contado, para continuar dali.
 */
async function quantoFicaDaEntrada(db: Banco, itemId: number, desde: string, fica0: bigint): Promise<{ fica: bigint; ultimo: string }> {
  let fica = fica0;
  let ultimo = desde;
  for (;;) {
    if (fica === 0n) return { fica, ultimo };
    const r = await sql<{ id: string; q: string; depois: string }>`
      SELECT movimento_id::text AS id, quantidade::text AS q, quantidade_depois::text AS depois FROM estoque_movimento_item
      WHERE item_id = ${itemId} AND movimento_id > ${ultimo}::bigint AND quantidade < 0 ORDER BY movimento_id LIMIT 5000`.execute(db);
    for (const sd of r.rows) {
      const depois = q4DoBanco(sd.depois);
      const antes = depois - q4DoBanco(sd.q);
      fica = depois === 0n ? 0n : (fica * depois + antes / 2n) / antes;
      ultimo = sd.id;
      if (fica === 0n) break;
    }
    if (r.rows.length < 5000) return { fica, ultimo };
  }
}

export type EntradaDaLista = {
  movimentoId: string;
  tipo: "entrada" | "saldo_inicial";
  quando: string;
  autor: string;
  fornecedor: string | null;
  notaNumero: string | null;
  notaData: string | null;
  observacao: string | null;
  fotos: number[];
  /** Itens que não couberam na lista (vêm até 50 por entrada). */
  maisItens: number;
  itens: {
    itemId: number;
    ingredienteId: number | null;
    preparoId: number | null;
    nome: string;
    unidade: string;
    quantidade: string;
    /** Só com custos.ver: o valor que a entrada tem hoje (corrigido, se houve correção). */
    valorCentavos: string | null;
    estimado: boolean;
    corrigido: boolean;
  }[];
};

const esquemaListaDeEntradas = z.object(
  {
    desde: data.optional(),
    ate: data.optional(),
    fornecedorId: id("Fornecedor não encontrado.").optional(),
    /** Só as que têm custo estimado e ainda sem correção (para alguém pôr o preço). */
    soEstimadas: z.boolean({ error: "Só estimadas: sim ou não." }).optional(),
    antesDe: idDoMovimento.optional(),
    limite: z.number({ error: "Limite inválido." }).int().min(1).max(100).optional(),
  },
  { error: "Filtro em formato inválido." },
);

/** Entradas (compras e saldo inicial) das áreas da pessoa, a mais nova primeiro. */
export async function listarEntradas(db: Banco, ator: Ator | null, filtro: unknown = {}): Promise<EntradaDaLista[]> {
  const f = validar(esquemaListaDeEntradas, filtro);
  const { ator: a, areas } = await exigirAlgumaArea(db, ator);
  // Valor só para quem vê custos E todas as áreas (o valor da linha é do item inteiro).
  const comValor = pode(a.cargoAtivo, "custos.ver") && areas.length === AREAS_ESTOQUE.length;
  const movs = await sql<{
    id: string;
    tipo: "entrada" | "saldo_inicial";
    quando: string;
    autor: string;
    fornecedor: string | null;
    nota_numero: string | null;
    nota_data: string | null;
    observacao: string | null;
  }>`
    SELECT m.id::text AS id, m.tipo, to_char(m.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS quando, u.nome AS autor,
      fo.nome AS fornecedor, m.nota_numero, to_char(m.nota_data, 'YYYY-MM-DD') AS nota_data, m.observacao
    FROM estoque_movimento m JOIN usuario u ON u.id = m.autor_id LEFT JOIN fornecedor fo ON fo.id = m.fornecedor_id
    WHERE m.tipo IN ('entrada', 'saldo_inicial')
      AND EXISTS (SELECT 1 FROM estoque_movimento_linha l WHERE l.movimento_id = m.id AND l.area = ANY(${areas}::text[]))
      AND (${f.desde ?? null}::date IS NULL OR (m.criado_em AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date >= ${f.desde ?? null}::date)
      AND (${f.ate ?? null}::date IS NULL OR (m.criado_em AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date <= ${f.ate ?? null}::date)
      AND (${f.fornecedorId ?? null}::int IS NULL OR m.fornecedor_id = ${f.fornecedorId ?? null}::int)
      AND (${f.antesDe ?? null}::bigint IS NULL OR m.id < ${f.antesDe ?? null}::bigint)
      AND (NOT ${f.soEstimadas ?? false} OR EXISTS (
        SELECT 1 FROM estoque_movimento_item mi WHERE mi.movimento_id = m.id AND mi.custo_estimado
          AND NOT EXISTS (SELECT 1 FROM estoque_movimento c JOIN estoque_movimento_item ci ON ci.movimento_id = c.id
                          WHERE c.tipo = 'custo' AND c.corrige_custo_de = m.id AND ci.item_id = mi.item_id)))
    ORDER BY m.id DESC LIMIT ${f.limite ?? 30}`.execute(db);
  if (movs.rows.length === 0) return [];
  const ids = movs.rows.map((m) => m.id);
  const itens = await sql<{ movimento_id: string; item_id: number; ingrediente_id: number | null; preparo_id: number | null; nome: string; unidade: string; quantidade: string; valor: string; estimado: boolean; informado: string | null }>`
    SELECT mi.movimento_id::text AS movimento_id, mi.item_id, e.ingrediente_id, e.preparo_id, coalesce(i.nome, f.nome) AS nome, coalesce(i.unidade_base, f.unidade_rendimento) AS unidade,
      (SELECT sum(l.quantidade) FROM estoque_movimento_linha l WHERE l.movimento_id = mi.movimento_id AND l.item_id = mi.item_id AND l.area = ANY(${areas}::text[]))::text AS quantidade,
      mi.valor_centavos::text AS valor, mi.custo_estimado AS estimado,
      (SELECT ci.valor_informado::text FROM estoque_movimento c JOIN estoque_movimento_item ci ON ci.movimento_id = c.id
        WHERE c.tipo = 'custo' AND c.corrige_custo_de = mi.movimento_id AND ci.item_id = mi.item_id ORDER BY c.id DESC LIMIT 1) AS informado
    FROM estoque_movimento_item mi JOIN estoque_item e ON e.id = mi.item_id
    LEFT JOIN ingrediente i ON i.id = e.ingrediente_id LEFT JOIN ficha f ON f.id = e.preparo_id
    WHERE mi.movimento_id = ANY(${ids}::bigint[])
      AND EXISTS (SELECT 1 FROM estoque_movimento_linha l WHERE l.movimento_id = mi.movimento_id AND l.item_id = mi.item_id AND l.area = ANY(${areas}::text[]))
    ORDER BY lower(coalesce(i.nome, f.nome))`.execute(db);
  const fotos = await db.selectFrom("estoque_nota_foto").select(["id", "movimento_id"]).where("movimento_id", "in", ids).orderBy("id").execute();
  return movs.rows.map((m) => ({
    movimentoId: m.id,
    tipo: m.tipo,
    quando: m.quando,
    autor: m.autor,
    fornecedor: m.fornecedor,
    notaNumero: m.nota_numero,
    notaData: m.nota_data,
    observacao: m.observacao,
    fotos: fotos.filter((x) => String(x.movimento_id) === m.id).map((x) => x.id),
    // Até 50 itens por entrada na lista (o saldo inicial pode ter 2000); o resto, no histórico do item.
    maisItens: Math.max(0, itens.rows.filter((x) => x.movimento_id === m.id).length - ITENS_NA_LISTA),
    itens: itens.rows
      .filter((x) => x.movimento_id === m.id)
      .slice(0, ITENS_NA_LISTA)
      .map((x) => ({
        itemId: x.item_id,
        ingredienteId: x.ingrediente_id,
        preparoId: x.preparo_id,
        nome: x.nome,
        unidade: x.unidade,
        quantidade: textoQ4(q4DoBanco(x.quantidade)),
        valorCentavos: comValor ? (x.informado ?? x.valor) : null,
        estimado: x.estimado,
        corrigido: x.informado !== null,
      })),
  }));
}

// ---------------------------------------------------------------- produção de preparo

const esquemaProducao = z.object(
  {
    chave: chave.optional(),
    preparoId: id("Preparo não encontrado."),
    /** Quanto a receita manda fazer (na unidade do preparo): é por aqui que os ingredientes saem. */
    previsto: quantidade,
    /** Quanto saiu de verdade (pesado ou contado). Diferente do previsto: o custo se ajusta. */
    rendimento: quantidade,
    /** Rendeu mais que o dobro do previsto (ou menos de um décimo): só com esta confirmação. */
    confirmarRendimento: z.boolean({ error: "Confirmar rendimento: sim ou não." }).optional(),
    local: local.optional(),
    /** Sem ela, hoje + a validade da ficha (se a ficha tiver). */
    validade: data.optional(),
    lote: textoCurto("Código do lote", 60).optional(),
    observacao: textoLivre("Observação", 500).optional(),
  },
  { error: "Produção em formato inválido." },
);

export type ResultadoDaProducao = Lancado & {
  /** rendimento - previsto, na unidade do preparo (negativo = rendeu menos). */
  diferenca: string;
  /** Só com custos.ver: custo total da produção e de 1 unidade do preparo. */
  custoCentavos: string | null;
  custoPorUnidade: string | null;
};

/**
 * Produção de um preparo da casa (molho, massa, recheio): gasta o que a ficha manda para o
 * `previsto` (ingredientes e preparos de dentro, do em uso e, se faltar, do guardado da área do
 * preparo) e cria um lote do preparo com o `rendimento` real. O valor do lote é o valor do que
 * saiu: rendeu menos, cada grama fica mais cara. Sem saldo de algum item: recusa e diz quanto falta.
 */
export async function produzirPreparo(db: Banco, ator: Ator | null, dados: unknown): Promise<ResultadoDaProducao> {
  if (!ator) await exigir(db, ator, "estoque.cozinha");
  const d = validar(esquemaProducao, dados);
  const [qPrev, qRend] = [q4DoBanco(d.previsto), q4DoBanco(d.rendimento)];
  if (!d.confirmarRendimento && (qRend > 2n * qPrev || qRend * 10n < qPrev))
    throw new ErroDeRegra("dados_invalidos", `Rendeu ${d.rendimento} para ${d.previsto} previsto: confira o número (erro de digitação muda o custo do preparo). Se estiver certo, confirme.`);
  const [areaDoPreparo] = await areasPadrao(db, [{ preparoId: d.preparoId }]);
  const quem = await exigirAreas(db, ator, [areaDoPreparo!]);
  const comValor = pode(quem.cargoAtivo, "custos.ver");
  const ficha = await consumoDaFicha(db, d.preparoId);
  const versao = await db.selectFrom("ficha_versao").select(["validade_dias"]).where("id", "=", ficha.versaoId).executeTakeFirstOrThrow();
  const previsto = Fracao.decimal(d.previsto);
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar("producao", d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) return { ...ja, ...(await resumoDaProducao(trx, ja.movimentoId, d.preparoId, comValor)) };
    const gastos = ficha.consumo.map((c) => ({ ingredienteId: c.ingredienteId ?? undefined, preparoId: c.preparoId ?? undefined, q: q4DaFracao(fracaoDe(c.exata).vezes(previsto)) }));
    const refs: Referencia[] = [{ preparoId: d.preparoId }, ...gastos];
    const ids = await garantirItens(trx, refs);
    const itens = await travarItens(trx, ids);
    const dia = await hoje(trx);
    const validade = d.validade ?? (versao.validade_dias !== null ? somarDias(dia, versao.validade_dias) : null);
    if (validade !== null && validade < dia) throw new ErroDeRegra("dados_invalidos", "A validade já passou.");
    const mov = await novoMovimento(trx, {
      tipo: "producao",
      autorId: quem.usuarioId,
      observacao: d.observacao ?? null,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
      fichaVersaoId: ficha.versaoId,
      previsto: d.previsto,
    });
    const l = new Lancamento(trx, mov, itens);
    let valor = 0n;
    const semSaldo: string[] = [];
    for (const [k, g] of gastos.entries()) {
      if (g.q === 0n) continue;
      const item = l.item(ids[k + 1]!);
      if (item.id === ids[0]) throw new ErroDeRegra("conflito", "O preparo não pode gastar ele mesmo.");
      const { falta } = await gastarDaArea(trx, l, item.id, areaDoPreparo!, g.q);
      if (falta > 0n) {
        semSaldo.push(`"${item.nome}" (precisa ${comUnidade(g.q, item)}${await quantoHa(trx, quem, item, areaDoPreparo!, g.q - falta, ", há ")} livre em ${nomeDaArea(areaDoPreparo!)})`);
        continue;
      }
      valor += l.saida(item.id, g.q);
    }
    if (semSaldo.length) throw new ErroDeRegra("conflito", `Falta para produzir: ${semSaldo.join("; ")}.`);
    const prep = l.item(ids[0]!);
    const rendimento = q4DoBanco(d.rendimento);
    const lote = await l.novoLote(prep.id, validade, d.lote ?? null);
    await l.mexer(prep.id, lote, areaDoPreparo!, d.local ?? "em_uso", false, rendimento);
    l.entrada(prep.id, rendimento, valor, { ultimoCusto: true });
    await l.fechar();
    return {
      movimentoId: mov,
      repetido: false,
      diferenca: textoQ4(rendimento - q4DoBanco(d.previsto)),
      custoCentavos: comValor ? valor.toString() : null,
      custoPorUnidade: comValor ? custoMedioPorUnidade(rendimento, valor) : null,
    };
  });
}

/** "n/d" (fração exata da ficha) ou decimal -> fração exata. */
function fracaoDe(t: string): Fracao {
  const m = /^(-?\d+)\/(\d+)$/.exec(t);
  return m ? new Fracao(BigInt(m[1]!), BigInt(m[2]!)) : Fracao.decimal(t);
}

function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1, d! + dias));
  return dt.toISOString().slice(0, 10);
}

async function resumoDaProducao(trx: Trx, movimentoId: string, preparoId: number, comValor: boolean): Promise<Omit<ResultadoDaProducao, keyof Lancado>> {
  const r = await sql<{ quantidade: string; valor: string; previsto: string }>`
    SELECT mi.quantidade::text AS quantidade, mi.valor_centavos::text AS valor, m.previsto::text AS previsto
    FROM estoque_movimento m JOIN estoque_movimento_item mi ON mi.movimento_id = m.id JOIN estoque_item e ON e.id = mi.item_id
    WHERE m.id = ${movimentoId}::bigint AND e.preparo_id = ${preparoId}`.execute(trx);
  const x = r.rows[0]!;
  const q = q4DoBanco(x.quantidade);
  return {
    diferenca: textoQ4(q - q4DoBanco(x.previsto)),
    custoCentavos: comValor ? x.valor : null,
    custoPorUnidade: comValor ? custoMedioPorUnidade(q, BigInt(x.valor)) : null,
  };
}

// ---------------------------------------------------------------- desfazer (estorno)

const TIPOS_QUE_SE_DESFAZEM = ["entrada", "saldo_inicial", "transferencia", "perda", "bloqueio", "desbloqueio", "producao", "ajuste", "consumo"] as const;

const esquemaDesfazer = z.object(
  {
    chave: chave.optional(),
    movimentoId: z
      .union([z.string(), z.number()], { error: "Movimento não encontrado." })
      .transform((v) => String(v))
      .refine((v) => /^[1-9][0-9]{0,17}$/.test(v), "Movimento não encontrado."),
    /** Por que está desfazendo (obrigatório: fica no histórico). */
    observacao: z
      .string({ error: "Escreva por que está desfazendo." })
      .trim()
      .min(3, "Escreva por que está desfazendo.")
      .max(500, "Observação com no máximo 500 letras.")
      .refine((v) => !/[^\P{Cc}\n\r\t]/u.test(v), "Observação com caractere inválido."),
  },
  { error: "Pedido em formato inválido." },
);

/**
 * Desfaz um movimento lançado errado (`estoque.desfazer` e a área de cada linha): lança o
 * movimento contrário, linha por linha, no mesmo lote e lugar. O original fica no histórico,
 * marcado como desfeito. Cada movimento se desfaz uma vez só. Não se desfaz: correção de custo
 * (corrija de novo), estorno (lance de novo) e consumo de pedido (o cancelamento do pedido cuida).
 * Se parte do que entrou já foi usada (ou mudou de lugar), recusa e diz o quê.
 */
export async function desfazerMovimento(db: Banco, ator: Ator | null, dados: unknown): Promise<Lancado> {
  const quem = await exigir(db, ator, "estoque.desfazer", { tipo: "estoque_movimento" });
  const d = validar(esquemaDesfazer, dados);
  const m = await db.selectFrom("estoque_movimento").select(["id", "tipo", "origem_tipo"]).where("id", "=", d.movimentoId).executeTakeFirst();
  if (!m) throw new ErroDeRegra("nao_encontrado", "Movimento não encontrado.");
  if (!(TIPOS_QUE_SE_DESFAZEM as readonly string[]).includes(m.tipo))
    throw new ErroDeRegra("conflito", m.tipo === "custo" ? "Correção de custo não se desfaz: corrija o custo de novo." : "Este movimento já é um desfazer: lance de novo o que for preciso.");
  if (m.tipo === "consumo" && m.origem_tipo !== null) throw new ErroDeRegra("conflito", "Consumo de pedido não se desfaz aqui: cancele o pedido.");
  await exigirAreas(db, quem, await areasDoMovimento(db, d.movimentoId));
  if (m.tipo === "transferencia") await recusarDesfazerDeRecebimento(db, d.movimentoId);
  return db.transaction().execute(async (trx) => {
    const assinatura = assinar("estorno", d);
    const ja = await jaLancado(trx, d.chave, assinatura);
    if (ja) return ja;
    // Um desfazer por vez para o mesmo movimento (o UNIQUE de estorno_de também garante).
    await sql`SELECT pg_advisory_xact_lock(hashtext(${"estoque_estorno:" + d.movimentoId}))`.execute(trx);
    const antes = await trx.selectFrom("estoque_movimento").select("id").where("estorno_de", "=", d.movimentoId).executeTakeFirst();
    if (antes) throw new ErroDeRegra("conflito", "Este movimento já foi desfeito.");
    const resumo = await trx.selectFrom("estoque_movimento_item").select(["item_id", "quantidade", "valor_centavos"]).where("movimento_id", "=", d.movimentoId).execute();
    const linhas = await trx
      .selectFrom("estoque_movimento_linha")
      .select(["item_id", "lote_id", "area", "local", "bloqueado", "quantidade"])
      .where("movimento_id", "=", d.movimentoId)
      .orderBy("id", "desc")
      .execute();
    const itens = await travarItens(trx, resumo.map((r) => r.item_id));
    // Correções de custo de uma entrada desfeita saem junto (lidas já com a trava).
    const correcoes = await sql<{ id: string; item_id: number; v: string }>`
      SELECT c.id::text AS id, ci.item_id, ci.valor_centavos::text AS v FROM estoque_movimento c JOIN estoque_movimento_item ci ON ci.movimento_id = c.id
      WHERE c.tipo = 'custo' AND c.corrige_custo_de = ${d.movimentoId}::bigint ORDER BY c.id`.execute(trx);
    const mov = await novoMovimento(trx, {
      tipo: "estorno",
      autorId: quem.usuarioId,
      observacao: d.observacao,
      estornoDe: d.movimentoId,
      chave: d.chave ?? null,
      assinatura: d.chave ? assinatura : null,
    });
    const l = new Lancamento(trx, mov, itens);
    // Junta por pedaço de saldo (o mesmo pedaço pode ter várias linhas) e confere antes de mexer.
    const porPedaco = new Map<string, { item_id: number; lote_id: number; area: AreaEstoque; local: LocalDoSaldo; bloqueado: boolean; q: bigint }>();
    for (const x of linhas) {
      const k = `${x.lote_id}|${x.area}|${x.local}|${x.bloqueado}`;
      const atual = porPedaco.get(k);
      if (atual) atual.q += q4DoBanco(x.quantidade);
      else porPedaco.set(k, { item_id: x.item_id, lote_id: x.lote_id, area: x.area, local: x.local, bloqueado: x.bloqueado, q: q4DoBanco(x.quantidade) });
    }
    const faltando: string[] = [];
    for (const p of porPedaco.values()) {
      if (p.q <= 0n) continue;
      const r = await trx
        .selectFrom("estoque_saldo")
        .select("quantidade")
        .where("lote_id", "=", p.lote_id)
        .where("area", "=", p.area)
        .where("local", "=", p.local)
        .where("bloqueado", "=", p.bloqueado)
        .executeTakeFirst();
      const tem = r ? q4DoBanco(r.quantidade) : 0n;
      if (tem < p.q) {
        const item = l.item(p.item_id);
        faltando.push(`"${item.nome}" em ${nomeDaArea(p.area)} (${NOME_DO_LOCAL_DO_SALDO[p.local].toLowerCase()}${p.bloqueado ? ", bloqueado" : ""}): precisa ${comUnidade(p.q, item)}, há ${comUnidade(tem, item)}`);
      }
    }
    if (faltando.length) throw new ErroDeRegra("conflito", `Não dá para desfazer: parte já foi usada ou mudou de lugar. ${faltando.join("; ")}. Lance uma perda ou um ajuste no lugar.`);
    // Primeiro o que sai (o que tinha entrado), depois o que volta.
    const ordem = [...porPedaco.values()].filter((p) => p.q !== 0n).sort((a, b) => Number(b.q > 0n) - Number(a.q > 0n));
    for (const p of ordem) await l.mexer(p.item_id, p.lote_id, p.area, p.local, p.bloqueado, -p.q);
    for (const r of resumo) {
      // O que entrou com valor sai pela parte que ainda resta pelo custo médio (as saídas
      // depois dele já levaram a parte delas); cada correção de custo, pela parte que resta
      // desde ELA (o que ela aplicou já era só o que restava na época). O que saiu volta com o
      // valor com que saiu.
      const original = BigInt(r.valor_centavos);
      const restaDesde = async (desde: string, v: bigint) => {
        if (v === 0n) return 0n;
        const { fica } = await quantoFicaDaEntrada(trx, r.item_id, desde, ESCALA_DA_FRACAO);
        return new Fracao(v * fica, ESCALA_DA_FRACAO).arredondado();
      };
      let dv: bigint;
      if (original > 0n || correcoes.rows.some((c) => c.item_id === r.item_id)) {
        dv = -(original > 0n ? await restaDesde(d.movimentoId, original) : original);
        for (const c of correcoes.rows.filter((x) => x.item_id === r.item_id)) dv -= await restaDesde(c.id, BigInt(c.v));
      } else dv = -original;
      l.desfazer(r.item_id, -q4DoBanco(r.quantidade), dv);
    }
    await l.fechar();
    // O último custo volta para a entrada válida mais recente (o desfeito pode ter preço errado).
    for (const r of resumo) {
      if (q4DoBanco(r.quantidade) <= 0n) continue;
      const u = await sql<{ c: string; q: string }>`
        SELECT coalesce((SELECT ci.valor_informado FROM estoque_movimento c JOIN estoque_movimento_item ci ON ci.movimento_id = c.id
                         WHERE c.tipo = 'custo' AND c.corrige_custo_de = o.movimento_id AND ci.item_id = o.item_id ORDER BY c.id DESC LIMIT 1),
                        o.valor_centavos)::text AS c, o.quantidade::text AS q
        FROM estoque_movimento_item o JOIN estoque_movimento om ON om.id = o.movimento_id
        WHERE o.item_id = ${r.item_id} AND om.tipo IN ('entrada', 'saldo_inicial', 'producao') AND o.quantidade > 0
          AND NOT EXISTS (SELECT 1 FROM estoque_movimento x WHERE x.estorno_de = om.id)
          AND (NOT o.custo_estimado OR EXISTS (SELECT 1 FROM estoque_movimento c JOIN estoque_movimento_item ci ON ci.movimento_id = c.id
                                               WHERE c.tipo = 'custo' AND c.corrige_custo_de = o.movimento_id AND ci.item_id = o.item_id))
        ORDER BY o.movimento_id DESC LIMIT 1`.execute(trx);
      const x = u.rows[0];
      await trx
        .updateTable("estoque_item")
        .set(x ? { ultimo_custo_centavos: x.c, ultimo_custo_quantidade: x.q } : { ultimo_custo_centavos: null, ultimo_custo_quantidade: null })
        .where("id", "=", r.item_id)
        .execute();
    }
    return { movimentoId: mov, repetido: false };
  });
}

/**
 * Mudança entre áreas (com recebimento) não se desfaz: enquanto pendente, quem recebe recusa e o
 * item volta para a origem; depois de confirmada ou recusada, muda-se de lugar de novo. Assim o
 * recebimento nunca fica pendente sem nada "a receber" (nem o contrário). O vínculo não muda depois
 * de gravado, então a conferência fora da transação basta.
 */
async function recusarDesfazerDeRecebimento(db: Banco, movimentoId: string): Promise<void> {
  const r = await sql<{ origem: boolean; pendente: boolean; fim: boolean }>`
    SELECT EXISTS (SELECT 1 FROM estoque_recebimento WHERE movimento_id = ${movimentoId}::bigint) AS origem,
      EXISTS (SELECT 1 FROM estoque_recebimento r WHERE r.movimento_id = ${movimentoId}::bigint
              AND NOT EXISTS (SELECT 1 FROM estoque_recebimento_fim f WHERE f.recebimento_id = r.id)) AS pendente,
      EXISTS (SELECT 1 FROM estoque_recebimento_fim WHERE movimento_id = ${movimentoId}::bigint) AS fim`.execute(db);
  const x = r.rows[0]!;
  if (x.pendente) throw new ErroDeRegra("conflito", "Esta mudança entre áreas ainda espera quem recebe: peça para recusar o recebimento (o item volta para onde estava).");
  if (x.origem || x.fim) throw new ErroDeRegra("conflito", "Mudança entre áreas já recebida (ou recusada) não se desfaz: mude de lugar de novo.");
}

/**
 * Peças internas do estoque para os outros arquivos do domínio (contagem). Não use fora de
 * packages/dominio: quem chama confere a permissão e trava os itens antes de mexer.
 */
export const motorDoEstoque = {
  Lancamento,
  garantirItens,
  travarItens,
  pedacos,
  novoMovimento,
  jaLancado,
  assinar,
  exigirAreas,
  exigirAlgumaArea,
  hoje,
  quantidadeNaBase,
};

/**
 * Quem pode receber numa área (para a transferência entre áreas): pessoas ativas com um cargo que
 * cuida da área de destino, menos quem pergunta (quem manda não recebe). Só para quem cuida de
 * alguma área; devolve só id e nome.
 */
export async function quemRecebeNaArea(db: Banco, ator: Ator | null, dados: unknown): Promise<{ usuarioId: number; nome: string }[]> {
  const { ator: a } = await exigirAlgumaArea(db, ator);
  const d = validar(z.object({ area }, { error: "Área de estoque inválida." }), dados);
  const r = await db
    .selectFrom("usuario as u")
    .innerJoin("usuario_perfil as up", "up.usuario_id", "u.id")
    .select(["u.id", "u.nome", "up.perfil_codigo"])
    .where("u.ativo", "=", true)
    .where("up.removido_em", "is", null)
    .where("u.id", "<>", a.usuarioId)
    .orderBy("u.nome")
    .execute();
  const vistos = new Map<number, string>();
  for (const x of r) if (pode(x.perfil_codigo, acaoDaArea(d.area))) vistos.set(x.id, x.nome);
  return [...vistos.entries()].map(([usuarioId, nome]) => ({ usuarioId, nome }));
}
