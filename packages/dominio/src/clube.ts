/**
 * Base do Clube E-MOTION na gestão (RC-21 seção 2; migração 0018; decisão 0024).
 * Só as regras que a equipe configura: desconto do aplicativo (percentual, categorias, teto e
 * horários), pontos por real, catálogo de prêmios, presentes automáticos e campanhas.
 * Quem vê: `clube.ver`. Quem muda: `clube.gerenciar`. Nada se apaga (prêmio sai = inativo;
 * campanha desiste = cancelada com motivo) e tudo vai para a auditoria com antes e depois.
 * Nenhum dado de cliente passa por aqui: a conta do cliente e o envio vêm na E26 e depois.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import {
  BENEFICIOS,
  MODOS_DO_HORARIO,
  PB_MAXIMO_DO_DESCONTO,
  PONTOS_DO_PREMIO_MAXIMO,
  PONTOS_POR_REAL_MAXIMO,
  PUBLICOS,
  TETO_MAXIMO_CENTAVOS,
  TIPOS_DE_PRESENTE,
  type Campanha,
  type Premio,
  type Presente,
  type RegrasDoClube,
} from "./clube-comum";
import { ErroDeRegra } from "./erros";
import { horaValida } from "./horarios-comum";
import { exigir, type Ator } from "./sessao";

const MAIOR_ID = 2_147_483_647;
const id = (msg: string) => z.number({ error: msg }).int(msg).positive(msg).max(MAIOR_ID, msg);
const inteiro = (rotulo: string, min: number, max: number) =>
  z
    .number({ error: `${rotulo}: um número inteiro.` })
    .int(`${rotulo}: um número inteiro.`)
    .min(min, `${rotulo} de pelo menos ${min}.`)
    .max(max, `${rotulo} de no máximo ${max}.`);
const texto = (rotulo: string, min: number, max: number) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(min, min > 1 ? `${rotulo} com pelo menos ${min} letras.` : `Informe ${rotulo}.`)
        .max(max, `${rotulo} com no máximo ${max} letras.`)
        .refine((v) => !/\p{Cc}/u.test(v), `${rotulo} com caractere inválido.`),
    );
const opcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .max(max, `${rotulo} com no máximo ${max} letras.`)
        .refine((v) => !/\p{Cc}/u.test(v), `${rotulo} com caractere inválido.`),
    )
    .transform((v) => (v === "" ? null : v))
    .nullable();
const hora = (rotulo: string) =>
  z.string({ error: `${rotulo}: hora no formato 00:00.` }).refine((v) => horaValida(v), `${rotulo}: hora no formato 00:00.`);

const esquemaHorario = z.object(
  {
    dia: inteiro("Dia da semana", 1, 7),
    modo: z.enum(MODOS_DO_HORARIO, { error: "Horário do desconto: escolha uma das opções." }),
    inicio: hora("Início do desconto").nullable().optional(),
    fim: hora("Fim do desconto").nullable().optional(),
  },
  { error: "Horário do desconto em formato inválido." },
);

const esquemaRegras = z.object(
  {
    ligado: z.boolean({ error: "Clube ligado: sim ou não." }).optional(),
    descontoPb: inteiro("Desconto do aplicativo (em centésimos de %)", 0, PB_MAXIMO_DO_DESCONTO).optional(),
    todasAsCategorias: z.boolean({ error: "Todas as categorias: sim ou não." }).optional(),
    /** Lista completa das categorias que participam: a que não vier sai. */
    categorias: z.array(id("Categoria não encontrada."), { error: "Categorias em formato inválido." }).max(200).optional(),
    tetoDescontoCentavos: inteiro("Teto do desconto (em centavos)", 1, TETO_MAXIMO_CENTAVOS).nullable().optional(),
    pontosPorReal: inteiro("Pontos por real", 0, PONTOS_POR_REAL_MAXIMO).optional(),
    campanhasPorSemana: inteiro("Campanhas por semana", 1, 7).optional(),
    /** Os 7 dias juntos. */
    horarios: z.array(esquemaHorario, { error: "Horários do desconto em formato inválido." }).length(7, "Mande os 7 dias da semana.").optional(),
  },
  { error: "Regras do Clube em formato inválido." },
);

const esquemaPremio = z.object(
  {
    id: id("Prêmio não encontrado.").optional(),
    nome: texto("o nome do prêmio", 2, 60).optional(),
    descricao: opcional("Descrição do prêmio", 200).optional(),
    pontos: inteiro("Pontos do prêmio", 1, PONTOS_DO_PREMIO_MAXIMO).optional(),
    produtoId: id("Produto não encontrado.").nullable().optional(),
    ativo: z.boolean({ error: "Ativo: sim ou não." }).optional(),
  },
  { error: "Prêmio em formato inválido." },
);

const esquemaPresente = z.object(
  {
    tipo: z.enum(TIPOS_DE_PRESENTE, { error: "Presente desconhecido." }),
    ligado: z.boolean({ error: "Ligado: sim ou não." }).optional(),
    beneficio: z.enum(BENEFICIOS, { error: "Benefício: escolha uma das opções." }).optional(),
    valor: inteiro("Valor do presente", 1, TETO_MAXIMO_CENTAVOS).nullable().optional(),
    produtoId: id("Produto não encontrado.").nullable().optional(),
    diasSemPedir: inteiro("Dias sem pedir", 7, 365).nullable().optional(),
    validadeDias: inteiro("Validade do presente (dias)", 1, 90).optional(),
    mensagem: opcional("Mensagem do presente", 140).optional(),
  },
  { error: "Presente em formato inválido." },
);

const DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const dataHoraLocal = z.string({ error: "Dia e hora do envio: AAAA-MM-DDTHH:MM." }).refine((v) => {
  const m = DATA_HORA.exec(v);
  if (!m) return false;
  const [a, me, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const t = new Date(Date.UTC(a, me - 1, d, h, mi));
  return a >= 2000 && a <= 2999 && t.getUTCMonth() === me - 1 && t.getUTCDate() === d && h < 24 && mi < 60;
}, "Dia e hora do envio inválidos.");

const esquemaCampanha = z.object(
  {
    id: id("Campanha não encontrada.").optional(),
    unidadeId: id("Unidade não encontrada."),
    titulo: texto("o título da campanha", 2, 50),
    texto: texto("o texto da campanha", 2, 180),
    publico: z.enum(PUBLICOS, { error: "Público: escolha uma das opções." }),
    /** Hora local da unidade. */
    enviarEm: dataHoraLocal,
  },
  { error: "Campanha em formato inválido." },
);

const esquemaCancelar = z.object(
  { id: id("Campanha não encontrada."), motivo: texto("o motivo do cancelamento", 2, 120) },
  { error: "Cancelamento em formato inválido." },
);

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success)
    throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

/** Envio de campanha: pelo menos 5 minutos à frente e no máximo 90 dias. */
export const CAMPANHA_ANTECEDENCIA_MINUTOS = 5;
export const CAMPANHA_PRAZO_DIAS = 90;

const horaCurta = (v: string | null) => (v ? v.slice(0, 5) : null);

async function carregarRegras(db: Banco): Promise<RegrasDoClube> {
  const r = await db.selectFrom("clube_regras").selectAll().where("id", "=", 1).executeTakeFirstOrThrow();
  const categorias = await db
    .selectFrom("clube_categoria")
    .select("categoria_id")
    .where("ativo", "=", true)
    .orderBy("categoria_id")
    .execute();
  const horarios = await db.selectFrom("clube_horario_desconto").selectAll().orderBy("dia").execute();
  return {
    ligado: r.ligado,
    descontoPb: r.desconto_pb,
    todasAsCategorias: r.todas_as_categorias,
    categorias: categorias.map((c) => c.categoria_id),
    tetoDescontoCentavos: r.teto_desconto_centavos,
    pontosPorReal: r.pontos_por_real,
    campanhasPorSemana: r.campanhas_por_semana,
    horarios: horarios.map((h) => ({ dia: h.dia, modo: h.modo, inicio: horaCurta(h.inicio), fim: horaCurta(h.fim) })),
    atualizadoEm: new Date(r.atualizado_em).toISOString(),
  };
}

/** Regras do Clube relidas do banco (para o pedido, na E26; quem chama já conferiu a permissão). */
export async function regrasDoClube(db: Banco): Promise<RegrasDoClube> {
  return carregarRegras(db);
}

async function carregarPremios(db: Banco, ids?: number[]): Promise<Premio[]> {
  let q = db
    .selectFrom("clube_premio")
    .select(["id", "nome", "descricao", "pontos", "produto_id as produtoId", "ativo"]);
  if (ids) q = q.where("id", "in", ids);
  return q.orderBy("ativo", "desc").orderBy("pontos").orderBy("nome").orderBy("id").execute();
}

async function carregarPresentes(db: Banco): Promise<Presente[]> {
  const linhas = await db.selectFrom("clube_presente").selectAll().execute();
  const ordem = (t: string) => TIPOS_DE_PRESENTE.indexOf(t as (typeof TIPOS_DE_PRESENTE)[number]);
  return linhas
    .sort((a, b) => ordem(a.tipo) - ordem(b.tipo))
    .map((p) => ({
      tipo: p.tipo,
      ligado: p.ligado,
      beneficio: p.beneficio,
      valor: p.valor,
      produtoId: p.produto_id,
      diasSemPedir: p.dias_sem_pedir,
      validadeDias: p.validade_dias,
      mensagem: p.mensagem,
    }));
}

async function carregarCampanhas(db: Banco, ids?: number[]): Promise<Campanha[]> {
  let q = db
    .selectFrom("clube_campanha as c")
    .innerJoin("unidade as u", "u.id", "c.unidade_id")
    .innerJoin("usuario as p", "p.id", "c.criada_por")
    .select([
      "c.id",
      "c.unidade_id as unidadeId",
      "c.titulo",
      "c.texto",
      "c.publico",
      sql<string>`to_char(c.enviar_em AT TIME ZONE u.fuso_horario, 'YYYY-MM-DD"T"HH24:MI')`.as("enviarEm"),
      "c.situacao",
      "p.nome as criadaPor",
      "c.criada_em as criadaEm",
      "c.motivo_cancelamento as motivoCancelamento",
      "c.destinatarios",
    ]);
  if (ids) q = q.where("c.id", "in", ids);
  else
    q = q.where((w) =>
      w.or([w("c.situacao", "=", "agendada"), w("c.enviar_em", ">", sql<Date>`now() - interval '120 days'`)]),
    );
  const linhas = await q.orderBy("c.enviar_em", "desc").orderBy("c.id", "desc").limit(200).execute();
  return linhas.map((c) => ({ ...c, criadaEm: new Date(c.criadaEm).toISOString() }));
}

export type PainelDoClube = {
  regras: RegrasDoClube;
  premios: Premio[];
  presentes: Presente[];
  campanhas: Campanha[];
  categorias: { id: number; nome: string; ativo: boolean }[];
  produtos: { id: number; nome: string; ativo: boolean }[];
  unidades: { id: number; nome: string }[];
};

/** Tudo o que a tela do Clube mostra. */
export async function verClube(db: Banco, ator: Ator | null): Promise<PainelDoClube> {
  await exigir(db, ator, "clube.ver", { tipo: "clube" });
  const [regras, premios, presentes, campanhas, categorias, produtos, unidades] = await Promise.all([
    carregarRegras(db),
    carregarPremios(db),
    carregarPresentes(db),
    carregarCampanhas(db),
    db.selectFrom("categoria").select(["id", "nome", "ativo"]).orderBy("ativo", "desc").orderBy("ordem").orderBy("nome").execute(),
    db.selectFrom("produto").select(["id", "nome", "ativo"]).orderBy("ativo", "desc").orderBy("nome").orderBy("id").execute(),
    db.selectFrom("unidade").select(["id", "nome"]).orderBy("id").execute(),
  ]);
  return { regras, premios, presentes, campanhas, categorias, produtos, unidades };
}

function traduzirErro(e: unknown): never {
  if (e instanceof ErroDeRegra) throw e;
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === "23505")
    throw new ErroDeRegra("conflito", constraint === "clube_premio_nome" ? "Já existe um prêmio ativo com esse nome." : "Já existe um igual.");
  if (code === "23514" || code === "22008" || code === "22007")
    throw new ErroDeRegra("dados_invalidos", "Algum campo está fora do permitido. Confira os campos.");
  if (code === "23503") throw new ErroDeRegra("nao_encontrado", "Algum item escolhido não existe mais.");
  throw e;
}

/**
 * Muda as regras gerais (campo ausente fica como está). Regras: horário em janela com início
 * antes do fim; Clube ligado e só algumas categorias precisa de pelo menos uma categoria ativa.
 */
export async function salvarRegrasDoClube(db: Banco, ator: Ator | null, dados: unknown): Promise<RegrasDoClube> {
  const quem = await exigir(db, ator, "clube.gerenciar", { tipo: "clube_regras" });
  const d = validar(esquemaRegras, dados);
  if (d.horarios) {
    const dias = new Set(d.horarios.map((h) => h.dia));
    if (dias.size !== 7) throw new ErroDeRegra("dados_invalidos", "Mande cada dia da semana uma vez.");
    for (const h of d.horarios) {
      if (h.modo !== "janela") continue;
      if (!h.inicio || !h.fim || h.inicio >= h.fim)
        throw new ErroDeRegra("dados_invalidos", "No horário do desconto, o início precisa ser antes do fim.");
    }
  }
  if (d.categorias && new Set(d.categorias).size !== d.categorias.length)
    throw new ErroDeRegra("dados_invalidos", "A mesma categoria veio duas vezes.");
  try {
    return await db.transaction().execute(async (trx) => {
      // FOR UPDATE: quem agenda campanha lê o limite com FOR SHARE e espera esta gravação.
      await trx.selectFrom("clube_regras").select("id").where("id", "=", 1).forUpdate().executeTakeFirstOrThrow();
      const antes = await carregarRegras(trx);
      const valores = {
        ...(d.ligado === undefined ? {} : { ligado: d.ligado }),
        ...(d.descontoPb === undefined ? {} : { desconto_pb: d.descontoPb }),
        ...(d.todasAsCategorias === undefined ? {} : { todas_as_categorias: d.todasAsCategorias }),
        ...(d.tetoDescontoCentavos === undefined ? {} : { teto_desconto_centavos: d.tetoDescontoCentavos }),
        ...(d.pontosPorReal === undefined ? {} : { pontos_por_real: d.pontosPorReal }),
        ...(d.campanhasPorSemana === undefined ? {} : { campanhas_por_semana: d.campanhasPorSemana }),
      };
      await trx
        .updateTable("clube_regras")
        .set({ ...valores, atualizado_em: sql`now()`, atualizado_por: quem.usuarioId })
        .where("id", "=", 1)
        .execute();

      if (d.categorias) {
        const novas = d.categorias.filter((c) => !antes.categorias.includes(c));
        if (novas.length) {
          // FOR SHARE: a categoria não é desativada no meio desta gravação.
          const ativas = await trx
            .selectFrom("categoria")
            .select("id")
            .where("id", "in", novas)
            .where("ativo", "=", true)
            .forShare()
            .execute();
          if (ativas.length !== novas.length) throw new ErroDeRegra("nao_encontrado", "Categoria não encontrada ou desativada.");
        }
        const saem = antes.categorias.filter((c) => !d.categorias!.includes(c));
        if (saem.length)
          await trx
            .updateTable("clube_categoria")
            .set({ ativo: false, atualizado_em: sql`now()` })
            .where("categoria_id", "in", saem)
            .execute();
        for (const c of novas)
          await trx
            .insertInto("clube_categoria")
            .values({ categoria_id: c, ativo: true })
            .onConflict((oc) => oc.column("categoria_id").doUpdateSet({ ativo: true, atualizado_em: sql`now()` }))
            .execute();
      }

      if (d.horarios)
        for (const h of d.horarios)
          await trx
            .updateTable("clube_horario_desconto")
            .set({
              modo: h.modo,
              inicio: h.modo === "janela" ? h.inicio! : null,
              fim: h.modo === "janela" ? h.fim! : null,
              atualizado_em: sql`now()`,
            })
            .where("dia", "=", h.dia)
            .execute();

      const depois = await carregarRegras(trx);
      if (depois.ligado && !depois.todasAsCategorias) {
        const ativas = await trx
          .selectFrom("clube_categoria as cc")
          .innerJoin("categoria as c", "c.id", "cc.categoria_id")
          .select("c.id")
          .where("cc.ativo", "=", true)
          .where("c.ativo", "=", true)
          .execute();
        if (!ativas.length)
          throw new ErroDeRegra("dados_invalidos", "Escolha pelo menos uma categoria que participa, ou marque todas.");
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "clube.gerenciar",
        resultado: "permitido",
        alvoTipo: "clube_regras",
        alvoId: 1,
        detalhes: { operacao: "alterar", antes, depois },
        ip: quem.ip,
      });
      return depois;
    });
  } catch (e) {
    traduzirErro(e);
  }
}

async function conferirProduto(trx: Banco, produtoId: number): Promise<void> {
  // FOR SHARE: o produto não é desativado no meio desta gravação.
  const p = await trx.selectFrom("produto").select("id").where("id", "=", produtoId).where("ativo", "=", true).forShare().executeTakeFirst();
  if (!p) throw new ErroDeRegra("nao_encontrado", "Produto não encontrado ou desativado.");
}

/** Cria (sem id; nome e pontos obrigatórios) ou altera (com id) um prêmio do catálogo. */
export async function salvarPremio(db: Banco, ator: Ator | null, dados: unknown): Promise<Premio> {
  const quem = await exigir(db, ator, "clube.gerenciar", { tipo: "clube_premio" });
  const d = validar(esquemaPremio, dados);
  if (!d.id && (d.nome === undefined || d.pontos === undefined))
    throw new ErroDeRegra("dados_invalidos", "Informe o nome e os pontos do prêmio.");
  try {
    return await db.transaction().execute(async (trx) => {
      let antes: Premio | undefined;
      if (d.id) {
        const linha = await trx.selectFrom("clube_premio").select("id").where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!linha) throw new ErroDeRegra("nao_encontrado", "Prêmio não encontrado.");
        [antes] = await carregarPremios(trx, [d.id]);
      }
      const produtoId = d.produtoId === undefined ? (antes?.produtoId ?? null) : d.produtoId;
      const ativo = d.ativo ?? antes?.ativo ?? true;
      // Ligar a um produto (ou reativar um prêmio ligado) pede um produto ativo.
      if (produtoId !== null && ativo && (produtoId !== antes?.produtoId || !antes?.ativo)) await conferirProduto(trx, produtoId);
      const valores = {
        ...(d.nome === undefined ? {} : { nome: d.nome }),
        ...(d.descricao === undefined ? {} : { descricao: d.descricao }),
        ...(d.pontos === undefined ? {} : { pontos: d.pontos }),
        produto_id: produtoId,
        ativo,
      };
      const premioId = antes
        ? (
            await trx
              .updateTable("clube_premio")
              .set({ ...valores, atualizado_em: sql`now()` })
              .where("id", "=", antes.id)
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id
        : (
            await trx
              .insertInto("clube_premio")
              .values({ ...valores, nome: d.nome!, pontos: d.pontos! })
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id;
      const [depois] = await carregarPremios(trx, [premioId]);
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "clube.gerenciar",
        resultado: "permitido",
        alvoTipo: "clube_premio",
        alvoId: premioId,
        detalhes: { operacao: antes ? "alterar" : "criar", antes: antes ?? null, depois },
        ip: quem.ip,
      });
      return depois!;
    });
  } catch (e) {
    traduzirErro(e);
  }
}

/**
 * Muda um presente automático (campo ausente fica como está). O benefício decide o que vale:
 * desconto em % (valor em centésimos de %, até 100%), desconto em R$ (centavos), pontos, ou um
 * produto grátis (produto ativo). Só o "sentimos sua falta" tem dias sem pedir.
 */
export async function salvarPresente(db: Banco, ator: Ator | null, dados: unknown): Promise<Presente> {
  const quem = await exigir(db, ator, "clube.gerenciar", { tipo: "clube_presente" });
  const d = validar(esquemaPresente, dados);
  try {
    return await db.transaction().execute(async (trx) => {
      await trx.selectFrom("clube_presente").select("tipo").where("tipo", "=", d.tipo).forUpdate().executeTakeFirstOrThrow();
      const antes = (await carregarPresentes(trx)).find((p) => p.tipo === d.tipo)!;
      const beneficio = d.beneficio ?? antes.beneficio;
      const trocouBeneficio = beneficio !== antes.beneficio;
      let valor = d.valor === undefined ? (trocouBeneficio ? null : antes.valor) : d.valor;
      let produtoId = d.produtoId === undefined ? (trocouBeneficio ? null : antes.produtoId) : d.produtoId;
      if (beneficio === "produto") {
        valor = null;
        if (produtoId === null) throw new ErroDeRegra("dados_invalidos", "Escolha o produto do presente.");
      } else {
        produtoId = null;
        if (valor === null) throw new ErroDeRegra("dados_invalidos", "Informe o valor do presente.");
        if (beneficio === "desconto_percentual" && valor > 10_000)
          throw new ErroDeRegra("dados_invalidos", "Desconto do presente de no máximo 100%.");
        if (beneficio === "pontos" && valor > PONTOS_DO_PREMIO_MAXIMO)
          throw new ErroDeRegra("dados_invalidos", `Pontos do presente de no máximo ${PONTOS_DO_PREMIO_MAXIMO}.`);
      }
      const diasSemPedir =
        d.tipo === "sentimos_falta" ? (d.diasSemPedir === undefined ? antes.diasSemPedir : d.diasSemPedir) : null;
      if (d.tipo === "sentimos_falta" && diasSemPedir === null)
        throw new ErroDeRegra("dados_invalidos", "Informe depois de quantos dias sem pedir o presente vale.");
      if (d.tipo !== "sentimos_falta" && d.diasSemPedir != null)
        throw new ErroDeRegra("dados_invalidos", "Dias sem pedir só vale no presente \"Sentimos sua falta\".");
      const ligado = d.ligado ?? antes.ligado;
      if (produtoId !== null && ligado && (produtoId !== antes.produtoId || !antes.ligado)) await conferirProduto(trx, produtoId);
      await trx
        .updateTable("clube_presente")
        .set({
          ligado,
          beneficio,
          valor,
          produto_id: produtoId,
          dias_sem_pedir: diasSemPedir,
          ...(d.validadeDias === undefined ? {} : { validade_dias: d.validadeDias }),
          ...(d.mensagem === undefined ? {} : { mensagem: d.mensagem }),
          atualizado_em: sql`now()`,
          atualizado_por: quem.usuarioId,
        })
        .where("tipo", "=", d.tipo)
        .execute();
      const depois = (await carregarPresentes(trx)).find((p) => p.tipo === d.tipo)!;
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "clube.gerenciar",
        resultado: "permitido",
        alvoTipo: "clube_presente",
        alvoId: d.tipo,
        detalhes: { operacao: "alterar", antes, depois },
        ip: quem.ip,
      });
      return depois;
    });
  } catch (e) {
    traduzirErro(e);
  }
}

/** Trava das campanhas: duas gravações ao mesmo tempo não passam juntas do limite da semana. */
async function travarCampanhas(trx: Banco): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('clube:campanhas'))`.execute(trx);
}

/**
 * Agenda (sem id) ou muda (com id, só se ainda agendada) uma campanha. O dia e a hora vêm na
 * hora local da unidade. Regras, conferidas sob trava: pelo menos 5 minutos à frente e no máximo
 * 90 dias; dentro do horário da casa (unidade aberta); no máximo N campanhas na mesma semana
 * (segunda a domingo, contando agendadas e enviadas), com N das regras do Clube.
 * Nada é enviado aqui: o envio (só para quem aceitou ofertas) entra com o aplicativo do cliente.
 */
export async function agendarCampanha(db: Banco, ator: Ator | null, dados: unknown): Promise<Campanha> {
  const quem = await exigir(db, ator, "clube.gerenciar", { tipo: "clube_campanha" });
  const d = validar(esquemaCampanha, dados);
  try {
    return await db.transaction().execute(async (trx) => {
      await travarCampanhas(trx);
      // FOR SHARE: espera quem está mudando o limite por semana.
      const regras = await trx
        .selectFrom("clube_regras")
        .select("campanhas_por_semana")
        .where("id", "=", 1)
        .forShare()
        .executeTakeFirstOrThrow();
      let antes: Campanha | undefined;
      if (d.id) {
        const linha = await trx
          .selectFrom("clube_campanha")
          .select(["id", "situacao"])
          .where("id", "=", d.id)
          .forUpdate()
          .executeTakeFirst();
        if (!linha) throw new ErroDeRegra("nao_encontrado", "Campanha não encontrada.");
        if (linha.situacao !== "agendada")
          throw new ErroDeRegra("conflito", "Só dá para mudar uma campanha que ainda está agendada.");
        [antes] = await carregarCampanhas(trx, [d.id]);
      }
      const unidade = await trx.selectFrom("unidade").select(["id", "fuso_horario"]).where("id", "=", d.unidadeId).executeTakeFirst();
      if (!unidade) throw new ErroDeRegra("nao_encontrado", "Unidade não encontrada.");

      const conferencia = await sql<{ instante: Date; cedo: boolean; longe: boolean; aberta: boolean; naSemana: number }>`
        WITH x AS (SELECT (${d.enviarEm}::timestamp AT TIME ZONE ${unidade.fuso_horario}) AS instante)
        SELECT x.instante,
               x.instante < now() + make_interval(mins => ${CAMPANHA_ANTECEDENCIA_MINUTOS}) AS cedo,
               x.instante > now() + make_interval(days => ${CAMPANHA_PRAZO_DIAS}) AS longe,
               unidade_aberta_em(${unidade.id}, x.instante) AS aberta,
               (SELECT count(*)::int FROM clube_campanha c
                 WHERE c.situacao <> 'cancelada'
                   AND c.id IS DISTINCT FROM ${d.id ?? null}::int
                   AND date_trunc('week', c.enviar_em AT TIME ZONE ${unidade.fuso_horario})
                     = date_trunc('week', x.instante AT TIME ZONE ${unidade.fuso_horario})) AS "naSemana"
        FROM x`.execute(trx);
      const c = conferencia.rows[0]!;
      if (c.cedo)
        throw new ErroDeRegra("dados_invalidos", `Agende com pelo menos ${CAMPANHA_ANTECEDENCIA_MINUTOS} minutos de antecedência.`);
      if (c.longe) throw new ErroDeRegra("dados_invalidos", `Agende para no máximo ${CAMPANHA_PRAZO_DIAS} dias à frente.`);
      if (!c.aberta)
        throw new ErroDeRegra("dados_invalidos", "Esse horário está fora do horário da casa. Campanha só sai com a casa aberta.");
      if (c.naSemana >= regras.campanhas_por_semana)
        throw new ErroDeRegra(
          "conflito",
          `Essa semana já tem ${c.naSemana} campanha${c.naSemana === 1 ? "" : "s"} e o limite é ${regras.campanhas_por_semana} por semana. Escolha outra semana ou mude o limite.`,
        );

      const valores = {
        unidade_id: unidade.id,
        titulo: d.titulo,
        texto: d.texto,
        publico: d.publico,
        enviar_em: c.instante,
      };
      const campanhaId = antes
        ? (
            await trx
              .updateTable("clube_campanha")
              .set({ ...valores, atualizada_em: sql`now()` })
              .where("id", "=", antes.id)
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id
        : (
            await trx
              .insertInto("clube_campanha")
              .values({ ...valores, criada_por: quem.usuarioId })
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id;
      const [depois] = await carregarCampanhas(trx, [campanhaId]);
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "clube.gerenciar",
        resultado: "permitido",
        alvoTipo: "clube_campanha",
        alvoId: campanhaId,
        detalhes: { operacao: antes ? "alterar" : "agendar", antes: antes ?? null, depois },
        ip: quem.ip,
      });
      return depois!;
    });
  } catch (e) {
    traduzirErro(e);
  }
}

/** Cancela uma campanha agendada, com motivo (nada se apaga). */
export async function cancelarCampanha(db: Banco, ator: Ator | null, dados: unknown): Promise<Campanha> {
  const quem = await exigir(db, ator, "clube.gerenciar", { tipo: "clube_campanha" });
  const d = validar(esquemaCancelar, dados);
  try {
    return await db.transaction().execute(async (trx) => {
      await travarCampanhas(trx);
      const linha = await trx.selectFrom("clube_campanha").select(["id", "situacao"]).where("id", "=", d.id).forUpdate().executeTakeFirst();
      if (!linha) throw new ErroDeRegra("nao_encontrado", "Campanha não encontrada.");
      if (linha.situacao !== "agendada") throw new ErroDeRegra("conflito", "Só dá para cancelar uma campanha agendada.");
      const [antes] = await carregarCampanhas(trx, [d.id]);
      await trx
        .updateTable("clube_campanha")
        .set({
          situacao: "cancelada",
          cancelada_por: quem.usuarioId,
          cancelada_em: sql<Date>`now()`,
          motivo_cancelamento: d.motivo,
          atualizada_em: sql`now()`,
        })
        .where("id", "=", d.id)
        .execute();
      const [depois] = await carregarCampanhas(trx, [d.id]);
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "clube.gerenciar",
        resultado: "permitido",
        alvoTipo: "clube_campanha",
        alvoId: d.id,
        detalhes: { operacao: "cancelar", antes, depois },
        ip: quem.ip,
      });
      return depois!;
    });
  } catch (e) {
    traduzirErro(e);
  }
}

