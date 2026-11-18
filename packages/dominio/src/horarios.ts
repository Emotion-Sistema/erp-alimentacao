/**
 * Categorias e horários de venda (RC-09 seção 2a; migração 0010; decisão 0016).
 * Três camadas: unidade (abre, último pedido da cozinha, fecha) > canal (loja, delivery) >
 * categoria em cada canal. A semana é o padrão; data especial troca um dia; pausa tira de venda.
 * Quem vê: `cadastros.ver`. Quem muda horário, data especial e pausa: `horarios.gerenciar`
 * (só gerente geral, dono e administrador). Categoria: `cadastros.gerenciar`.
 * Tudo na auditoria com antes e depois; nada se apaga (data especial e pausa se encerram).
 * "Pode vender agora" é decidido só pelo banco (`situacao_de_venda`).
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { CANAIS, horaValida, type Canal, type MotivoFechado } from "./horarios-comum";
import { pode } from "./permissoes";
import { reposicionar } from "./posicao";
import { exigir, type Ator } from "./sessao";

export * from "./horarios-comum";

// ---------- tipos que a tela recebe ----------
export type Categoria = { id: number; nome: string; descricao: string | null; ordem: number; ativo: boolean };
export type DiaDaUnidade = { dia: number; aberta: boolean; abre: string | null; ultimoPedido: string | null; fecha: string | null };
export type DataDaUnidade = DiaDaUnidade & { id: number; data: string; motivo: string };
export type ModoDoDia = "segue" | "fechado" | "aberto";
export type JanelaDeVenda = { canal: Canal; categoriaId: number | null; dia: number; modo: ModoDoDia; inicio: string | null; fim: string | null };
export type DataDeVenda = {
  id: number;
  canal: Canal;
  categoriaId: number | null;
  data: string;
  modo: "fechado" | "aberto";
  inicio: string | null;
  fim: string | null;
  motivo: string;
};
export type Pausa = {
  id: number;
  canal: Canal | null;
  categoriaId: number | null;
  inicio: string;
  ate: string | null;
  motivo: string;
  criadaPor: string;
};
export type SituacaoDeVenda = { aberta: boolean; motivo: MotivoFechado | null; abreAs: string | null };
export type SituacaoAgora = {
  canais: Record<Canal, SituacaoDeVenda>;
  categorias: { categoriaId: number; loja: SituacaoDeVenda; delivery: SituacaoDeVenda }[];
};
export type Horarios = {
  fuso: string;
  /** Data local da unidade, "AAAA-MM-DD". */
  hoje: string;
  podeMudar: boolean;
  semana: DiaDaUnidade[];
  /** Só os dias que não seguem a camada de fora. */
  venda: JanelaDeVenda[];
  /** Datas especiais ativas de hoje em diante. */
  datas: DataDaUnidade[];
  datasVenda: DataDeVenda[];
  /** Pausas ainda valendo (ou marcadas para começar). */
  pausas: Pausa[];
  agora: SituacaoAgora;
};

// ---------- validação ----------
function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

const hora = (rotulo: string, podeSer24 = false) =>
  z.string({ error: `Informe ${rotulo}.` }).trim().refine((v) => horaValida(v, podeSer24), `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)}: use o formato 11:00.`);
const horaOuNada = (rotulo: string, podeSer24 = false) => hora(rotulo, podeSer24).nullish().transform((v) => v ?? null);
const canal = z.enum(CANAIS, { error: "Canal: loja ou delivery." });
const idCategoria = z.number().int().positive().nullish().transform((v) => v ?? null);
const motivo = (max: number) =>
  z
    .string({ error: "Escreva o motivo (ex.: feriado)." })
    .trim()
    .min(2, "Escreva o motivo (ex.: feriado).")
    .max(max, `Motivo com no máximo ${max} letras.`)
    .refine((v) => !/\p{Cc}/u.test(v), "Motivo com caractere inválido.");
const data = z.string({ error: "Informe a data." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.");
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

const horarioDaUnidade = z
  .object({
    aberta: z.boolean({ error: "Diga se abre ou não." }),
    abre: horaOuNada("a hora em que abre"),
    ultimoPedido: horaOuNada("o último pedido da cozinha", true),
    fecha: horaOuNada("a hora em que fecha", true),
  })
  .transform((d) => (d.aberta ? d : { ...d, abre: null, ultimoPedido: null, fecha: null }))
  .refine((d) => !d.aberta || (d.abre && d.ultimoPedido && d.fecha), "Dia aberto precisa de abertura, último pedido e fechamento.")
  .refine(
    (d) => !d.aberta || !d.abre || !d.ultimoPedido || !d.fecha || (minutos(d.abre) < minutos(d.ultimoPedido) && minutos(d.ultimoPedido) <= minutos(d.fecha)),
    "A ordem é: abre, depois o último pedido da cozinha, depois fecha (no mesmo dia).",
  );

const janela = z
  .object({ modo: z.enum(["segue", "fechado", "aberto"], { error: "Escolha: segue, fechado ou aberto." }), inicio: horaOuNada("o início"), fim: horaOuNada("o fim", true) })
  .transform((d) => (d.modo === "aberto" ? d : { ...d, inicio: null, fim: null }))
  .refine((d) => d.modo !== "aberto" || (d.inicio && d.fim), "Horário aberto precisa de início e fim.")
  .refine((d) => d.modo !== "aberto" || !d.inicio || !d.fim || minutos(d.inicio) < minutos(d.fim), "O início precisa ser antes do fim (no mesmo dia).");

const semanaCompleta = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.object({ dia: z.number().int().min(1).max(7) }).and(item), { error: "Mande os 7 dias da semana." })
    .length(7, "Mande os 7 dias da semana.")
    .refine((dias) => new Set(dias.map((d) => d.dia)).size === 7, "Cada dia da semana uma vez só.");

const esquemaSemanaDaUnidade = z.object({ dias: semanaCompleta(horarioDaUnidade) });
const esquemaSemanaDeVenda = z.object({ canal, categoriaId: idCategoria, dias: semanaCompleta(janela) });
const esquemaDataDaUnidade = z.object({ data, motivo: motivo(80) }).and(horarioDaUnidade);
const esquemaDataDeVenda = z
  .object({ canal, categoriaId: idCategoria, data, motivo: motivo(80), modo: z.enum(["fechado", "aberto"], { error: "Escolha: fechado ou aberto." }) })
  .and(z.object({ inicio: horaOuNada("o início"), fim: horaOuNada("o fim", true) }))
  .transform((d) => (d.modo === "aberto" ? d : { ...d, inicio: null, fim: null }))
  .refine((d) => d.modo !== "aberto" || (d.inicio && d.fim), "Horário aberto precisa de início e fim.")
  .refine((d) => d.modo !== "aberto" || !d.inicio || !d.fim || minutos(d.inicio) < minutos(d.fim), "O início precisa ser antes do fim (no mesmo dia).");
const esquemaCancelarData = z.object({ tipo: z.enum(["unidade", "venda"]), id: z.number().int().positive() });
const esquemaPausa = z.object({
  canal: canal.nullish().transform((v) => v ?? null),
  categoriaId: idCategoria,
  /** Por quantos minutos; sem ele, até alguém retomar. */
  minutos: z.number().int().min(5, "Pausa de pelo menos 5 minutos.").max(24 * 60, "Pausa de até 24 horas; para mais, use uma data especial.").nullish().transform((v) => v ?? null),
  motivo: motivo(120),
});
const esquemaRetomar = z.object({ id: z.number().int().positive() });
const esquemaCategoria = z.object({
  id: z.number().int().positive().optional(),
  nome: z
    .string({ error: "Informe o nome da categoria." })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Nome com pelo menos 2 letras.").max(40, "Nome com no máximo 40 letras.").refine((v) => !/\p{Cc}/u.test(v), "Nome com caractere inválido.")),
  descricao: z
    .string()
    .trim()
    .max(300, "Descrição com no máximo 300 letras.")
    .nullish()
    // Sem o campo, fica como está; nulo ou vazio limpa.
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
  ordem: z.number().int().min(0).max(9999).optional(),
  /** Lugar na lista (1 = primeiro) entre as ativas; o sistema renumera a ordem. Vence `ordem`. */
  posicao: z.number({ error: "Posição: um número inteiro." }).int("Posição: um número inteiro.").min(1, "Posição de 1 em diante.").max(9999).optional(),
  ativo: z.boolean().optional(),
});

// ---------- leitura ----------
const H = (col: string) => sql<string | null>`to_char(${sql.ref(col)}, 'HH24:MI')`;

function unidadeDo(quem: Ator): number {
  if (!quem.unidadeId) throw new ErroDeRegra("dados_invalidos", "Seu cargo ativo não tem unidade.");
  return quem.unidadeId;
}

export async function listarCategorias(db: Banco, ator: Ator | null): Promise<Categoria[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "categoria" });
  return db
    .selectFrom("categoria")
    .select(["id", "nome", "descricao", "ordem", "ativo"])
    .orderBy("ativo", "desc")
    .orderBy("ordem")
    .orderBy("nome")
    .execute();
}

type LinhaSituacao = { aberta: boolean; motivo: MotivoFechado | null; abre_as: string | null };
const situacao = (l: LinhaSituacao | undefined): SituacaoDeVenda => ({ aberta: !!l?.aberta, motivo: l?.motivo ?? null, abreAs: l?.abre_as ?? null });

async function situacaoAgora(db: Banco, unidadeId: number): Promise<SituacaoAgora> {
  const r = await sql<LinhaSituacao & { canal: Canal; categoria_id: number | null }>`
    SELECT k.canal, c.id AS categoria_id, s.aberta, s.motivo, to_char(s.abre_as AT TIME ZONE u.fuso_horario, 'HH24:MI') AS abre_as
    FROM unidade u
    CROSS JOIN (VALUES ('loja'), ('delivery')) AS k (canal)
    CROSS JOIN (SELECT NULL::integer AS id UNION ALL SELECT id FROM categoria WHERE ativo) c
    CROSS JOIN LATERAL situacao_de_venda(u.id, k.canal, c.id, now()) s
    WHERE u.id = ${unidadeId}`.execute(db);
  const de = (canal: Canal, cat: number | null) => situacao(r.rows.find((l) => l.canal === canal && l.categoria_id === cat));
  const cats = [...new Set(r.rows.map((l) => l.categoria_id).filter((c): c is number => c !== null))];
  return {
    canais: { loja: de("loja", null), delivery: de("delivery", null) },
    categorias: cats.map((c) => ({ categoriaId: c, loja: de("loja", c), delivery: de("delivery", c) })),
  };
}

export async function verHorarios(db: Banco, ator: Ator | null): Promise<Horarios> {
  const quem = await exigir(db, ator, "cadastros.ver", { tipo: "horario" });
  const unidadeId = unidadeDo(quem);
  const u = await sql<{ fuso: string; hoje: string }>`
    SELECT fuso_horario AS fuso, to_char((now() AT TIME ZONE fuso_horario)::date, 'YYYY-MM-DD') AS hoje FROM unidade WHERE id = ${unidadeId}`.execute(db);
  const { fuso, hoje } = u.rows[0]!;
  const semana = await db
    .selectFrom("horario_unidade")
    .select(["dia", "aberta", H("abre").as("abre"), H("ultimo_pedido").as("ultimoPedido"), H("fecha").as("fecha")])
    .where("unidade_id", "=", unidadeId)
    .orderBy("dia")
    .execute();
  const venda = await db
    .selectFrom("horario_venda")
    .select(["canal", "categoria_id as categoriaId", "dia", "modo", H("inicio").as("inicio"), H("fim").as("fim")])
    .where("unidade_id", "=", unidadeId)
    .where("modo", "<>", "segue")
    .orderBy("canal")
    .orderBy("categoria_id")
    .orderBy("dia")
    .execute();
  const datas = await db
    .selectFrom("horario_unidade_data")
    .select(["id", sql<string>`to_char(data, 'YYYY-MM-DD')`.as("data"), "aberta", H("abre").as("abre"), H("ultimo_pedido").as("ultimoPedido"), H("fecha").as("fecha"), "motivo"])
    .select(sql<number>`extract(isodow FROM data)::int`.as("dia"))
    .where("unidade_id", "=", unidadeId)
    .where("ativo", "=", true)
    .where(sql<boolean>`data >= ${hoje}::date`)
    .orderBy("data")
    .execute();
  const datasVenda = await db
    .selectFrom("horario_venda_data")
    .select(["id", "canal", "categoria_id as categoriaId", sql<string>`to_char(data, 'YYYY-MM-DD')`.as("data"), "modo", H("inicio").as("inicio"), H("fim").as("fim"), "motivo"])
    .where("unidade_id", "=", unidadeId)
    .where("ativo", "=", true)
    .where(sql<boolean>`data >= ${hoje}::date`)
    .orderBy("data")
    .orderBy("canal")
    .execute();
  const pausas = await db
    .selectFrom("pausa_venda as p")
    .innerJoin("usuario as us", "us.id", "p.criada_por")
    .select(["p.id", "p.canal", "p.categoria_id as categoriaId", "p.inicio", "p.ate", "p.motivo", "us.nome as criadaPor"])
    .where("p.unidade_id", "=", unidadeId)
    .where("p.encerrada_em", "is", null)
    .where((eb) => eb.or([eb("p.ate", "is", null), eb("p.ate", ">", sql<Date>`now()`)]))
    .orderBy("p.inicio")
    .execute();
  return {
    fuso,
    hoje,
    podeMudar: pode(quem.cargoAtivo, "horarios.gerenciar"),
    semana,
    venda: venda as JanelaDeVenda[],
    datas,
    datasVenda: datasVenda as DataDeVenda[],
    pausas: pausas.map((p) => ({ ...p, inicio: new Date(p.inicio).toISOString(), ate: p.ate ? new Date(p.ate).toISOString() : null })),
    agora: await situacaoAgora(db, unidadeId),
  };
}

// ---------- escrita ----------
type Trx = Parameters<Parameters<ReturnType<Banco["transaction"]>["execute"]>[0]>[0];

/** Uma mudança de horário por vez em cada unidade: o "antes" da auditoria é sempre o certo. */
async function travarUnidade(trx: Trx, unidadeId: number): Promise<void> {
  await sql`SELECT 1 FROM unidade WHERE id = ${unidadeId} FOR NO KEY UPDATE`.execute(trx);
}

async function conferirCategoria(trx: Trx, categoriaId: number | null): Promise<void> {
  if (categoriaId === null) return;
  const c = await trx.selectFrom("categoria").select("ativo").where("id", "=", categoriaId).forShare().executeTakeFirst();
  if (!c) throw new ErroDeRegra("dados_invalidos", "Categoria não encontrada.");
  if (!c.ativo) throw new ErroDeRegra("dados_invalidos", "Essa categoria está desativada.");
}

/** Data que existe no calendário ("2026-02-30" não). */
function dataExiste(d: string): boolean {
  const [a, m, dia] = d.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, dia));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === dia;
}

async function conferirData(trx: Trx, unidadeId: number, d: string): Promise<void> {
  if (!dataExiste(d)) throw new ErroDeRegra("dados_invalidos", "Data inválida.");
  const r = await sql<{ ok: boolean }>`
    SELECT ${d}::date BETWEEN (now() AT TIME ZONE fuso_horario)::date AND (now() AT TIME ZONE fuso_horario)::date + 366 AS ok
    FROM unidade WHERE id = ${unidadeId}`.execute(trx);
  if (!r.rows[0]?.ok) throw new ErroDeRegra("dados_invalidos", "A data especial precisa ser de hoje até daqui a um ano.");
}

function traduzir(e: unknown): never {
  if (e instanceof ErroDeRegra) throw e;
  const erro = e as { code?: string };
  if (erro.code === "23505") throw new ErroDeRegra("conflito", "Já existe uma data especial para esse dia. Altere a que existe.");
  if (erro.code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum horário está fora do permitido. Confira os campos.");
  if (erro.code === "22003") throw new ErroDeRegra("nao_encontrado", "Cadastro não encontrado.");
  if (erro.code === "22008" || erro.code === "22007") throw new ErroDeRegra("dados_invalidos", "Data ou hora inválida.");
  throw e;
}

/** Grava a semana da unidade (os 7 dias de uma vez). */
export async function salvarSemanaDaUnidade(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "horario" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaSemanaDaUnidade, dados);
  try {
    await db.transaction().execute(async (trx) => {
      await travarUnidade(trx, unidadeId);
      const antes = await trx
        .selectFrom("horario_unidade")
        .select(["dia", "aberta", H("abre").as("abre"), H("ultimo_pedido").as("ultimoPedido"), H("fecha").as("fecha")])
        .where("unidade_id", "=", unidadeId)
        .orderBy("dia")
        .execute();
      const depois = [...d.dias].sort((a, b) => a.dia - b.dia);
      for (const x of depois) {
        await trx
          .insertInto("horario_unidade")
          .values({ unidade_id: unidadeId, dia: x.dia, aberta: x.aberta, abre: x.abre, ultimo_pedido: x.ultimoPedido, fecha: x.fecha })
          .onConflict((oc) =>
            oc.columns(["unidade_id", "dia"]).doUpdateSet({ aberta: x.aberta, abre: x.abre, ultimo_pedido: x.ultimoPedido, fecha: x.fecha, atualizado_em: sql`now()` }),
          )
          .execute();
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "horario_unidade",
        alvoId: unidadeId,
        detalhes: { operacao: "semana", antes, depois },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Grava a semana de um canal (categoria nula) ou de uma categoria num canal. */
export async function salvarSemanaDeVenda(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "horario" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaSemanaDeVenda, dados);
  try {
    await db.transaction().execute(async (trx) => {
      await travarUnidade(trx, unidadeId);
      await conferirCategoria(trx, d.categoriaId);
      const doAlvo = trx
        .selectFrom("horario_venda")
        .select(["dia", "modo", H("inicio").as("inicio"), H("fim").as("fim")])
        .where("unidade_id", "=", unidadeId)
        .where("canal", "=", d.canal)
        .where("categoria_id", d.categoriaId === null ? "is" : "=", d.categoriaId)
        .orderBy("dia");
      const antes = await doAlvo.execute();
      for (const x of d.dias) {
        // Upsert pela chave única (com categoria nula igual a nula: NULLS NOT DISTINCT).
        await sql`
          INSERT INTO horario_venda (unidade_id, canal, categoria_id, dia, modo, inicio, fim)
          VALUES (${unidadeId}, ${d.canal}, ${d.categoriaId}, ${x.dia}, ${x.modo}, ${x.inicio}, ${x.fim})
          ON CONFLICT ON CONSTRAINT horario_venda_unico
          DO UPDATE SET modo = EXCLUDED.modo, inicio = EXCLUDED.inicio, fim = EXCLUDED.fim, atualizado_em = now()`.execute(trx);
      }
      const depois = await doAlvo.execute();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "horario_venda",
        alvoId: `${d.canal}:${d.categoriaId ?? "canal"}`,
        detalhes: { operacao: "semana", canal: d.canal, categoriaId: d.categoriaId, antes, depois },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Cria ou troca a data especial da unidade (feriado, evento). Uma por data. */
export async function salvarDataDaUnidade(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "horario" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaDataDaUnidade, dados);
  try {
    await db.transaction().execute(async (trx) => {
      await travarUnidade(trx, unidadeId);
      await conferirData(trx, unidadeId, d.data);
      const cols = ["id", sql<string>`to_char(data, 'YYYY-MM-DD')`.as("data"), "aberta", H("abre").as("abre"), H("ultimo_pedido").as("ultimoPedido"), H("fecha").as("fecha"), "motivo"] as const;
      const antes = await trx
        .selectFrom("horario_unidade_data")
        .select(cols)
        .where("unidade_id", "=", unidadeId)
        .where(sql<boolean>`data = ${d.data}::date`)
        .where("ativo", "=", true)
        .executeTakeFirst();
      const valores = { aberta: d.aberta, abre: d.abre, ultimo_pedido: d.ultimoPedido, fecha: d.fecha, motivo: d.motivo };
      const id = antes
        ? (await trx.updateTable("horario_unidade_data").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", antes.id).returning("id").executeTakeFirstOrThrow()).id
        : (await trx.insertInto("horario_unidade_data").values({ unidade_id: unidadeId, data: d.data, ...valores }).returning("id").executeTakeFirstOrThrow()).id;
      const depois = await trx.selectFrom("horario_unidade_data").select(cols).where("id", "=", id).executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "horario_unidade_data",
        alvoId: id,
        detalhes: { operacao: antes ? "alterar" : "criar", antes: antes ?? null, depois },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Cria ou troca a data especial de um canal ou de uma categoria num canal. */
export async function salvarDataDeVenda(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "horario" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaDataDeVenda, dados);
  try {
    await db.transaction().execute(async (trx) => {
      await travarUnidade(trx, unidadeId);
      await conferirData(trx, unidadeId, d.data);
      await conferirCategoria(trx, d.categoriaId);
      const cols = ["id", "canal", "categoria_id as categoriaId", sql<string>`to_char(data, 'YYYY-MM-DD')`.as("data"), "modo", H("inicio").as("inicio"), H("fim").as("fim"), "motivo"] as const;
      const antes = await trx
        .selectFrom("horario_venda_data")
        .select(cols)
        .where("unidade_id", "=", unidadeId)
        .where("canal", "=", d.canal)
        .where("categoria_id", d.categoriaId === null ? "is" : "=", d.categoriaId)
        .where(sql<boolean>`data = ${d.data}::date`)
        .where("ativo", "=", true)
        .executeTakeFirst();
      const valores = { modo: d.modo, inicio: d.inicio, fim: d.fim, motivo: d.motivo };
      const id = antes
        ? (await trx.updateTable("horario_venda_data").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", antes.id).returning("id").executeTakeFirstOrThrow()).id
        : (
            await trx
              .insertInto("horario_venda_data")
              .values({ unidade_id: unidadeId, canal: d.canal, categoria_id: d.categoriaId, data: d.data, ...valores })
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id;
      const depois = await trx.selectFrom("horario_venda_data").select(cols).where("id", "=", id).executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "horario_venda_data",
        alvoId: id,
        detalhes: { operacao: antes ? "alterar" : "criar", antes: antes ?? null, depois },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Cancela uma data especial (fica guardada, desativada). */
export async function cancelarDataEspecial(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "horario" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaCancelarData, dados);
  const tabela = d.tipo === "unidade" ? "horario_unidade_data" : "horario_venda_data";
  try {
    await db.transaction().execute(async (trx) => {
      await travarUnidade(trx, unidadeId);
      const r = await sql<Record<string, unknown>>`
        UPDATE ${sql.table(tabela)} SET ativo = false, atualizado_em = now()
        WHERE id = ${d.id} AND unidade_id = ${unidadeId} AND ativo RETURNING *`.execute(trx);
      const linha = r.rows[0];
      if (!linha) throw new ErroDeRegra("nao_encontrado", "Data especial não encontrada (ou já cancelada).");
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: tabela,
        alvoId: d.id,
        detalhes: { operacao: "cancelar", antes: { ...linha, ativo: true }, depois: linha },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Pausa a venda de um canal (ou de todos) ou de uma categoria, por um tempo ou até retomar. */
export async function pausarVenda(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "pausa_venda" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaPausa, dados);
  try {
    await db.transaction().execute(async (trx) => {
      await travarUnidade(trx, unidadeId);
      await conferirCategoria(trx, d.categoriaId);
      const salvo = await trx
        .insertInto("pausa_venda")
        .values({
          unidade_id: unidadeId,
          canal: d.canal,
          categoria_id: d.categoriaId,
          ate: d.minutos === null ? null : sql<Date>`now() + make_interval(mins => ${d.minutos})`,
          motivo: d.motivo,
          criada_por: quem.usuarioId,
        })
        .returning(["id", "canal", "categoria_id", "inicio", "ate", "motivo"])
        .executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "pausa_venda",
        alvoId: salvo.id,
        detalhes: { operacao: "pausar", antes: null, depois: salvo },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Retoma a venda (encerra a pausa, com quem e quando). */
export async function retomarVenda(db: Banco, ator: Ator | null, dados: unknown): Promise<Horarios> {
  const quem = await exigir(db, ator, "horarios.gerenciar", { tipo: "pausa_venda" });
  const unidadeId = unidadeDo(quem);
  const d = validar(esquemaRetomar, dados);
  // Sem trava na unidade: o UPDATE com "encerrada_em IS NULL" já garante uma retomada só.
  try {
    await db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable("pausa_venda")
        .set({ encerrada_em: sql<Date>`now()`, encerrada_por: quem.usuarioId })
        .where("id", "=", d.id)
        .where("unidade_id", "=", unidadeId)
        .where("encerrada_em", "is", null)
        .returning(["id", "encerrada_em"])
        .executeTakeFirst();
      if (!r) throw new ErroDeRegra("nao_encontrado", "Pausa não encontrada (ou já retomada).");
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "horarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "pausa_venda",
        alvoId: d.id,
        detalhes: { operacao: "retomar", antes: { encerrada_em: null }, depois: { encerrada_em: r.encerrada_em } },
        ip: quem.ip,
      });
    });
  } catch (e) {
    traduzir(e);
  }
  return verHorarios(db, quem);
}

/** Cria (sem id) ou altera (com id) uma categoria. */
export async function salvarCategoria(db: Banco, ator: Ator | null, dados: unknown): Promise<Categoria> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "categoria" });
  const d = validar(esquemaCategoria, dados);
  const colunas = ["id", "nome", "descricao", "ordem", "ativo"] as const;
  try {
    const salvo = await db.transaction().execute(async (trx) => {
      const valores = { nome: d.nome, ...(d.descricao === undefined ? {} : { descricao: d.descricao }), ...(d.ordem === undefined ? {} : { ordem: d.ordem }), ...(d.ativo === undefined ? {} : { ativo: d.ativo }) };
      let antes: Categoria | undefined;
      let s: Categoria;
      if (d.id) {
        antes = await trx.selectFrom("categoria").select(colunas).where("id", "=", d.id).forUpdate().executeTakeFirst();
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Categoria não encontrada.");
        s = await trx.updateTable("categoria").set({ ...valores, atualizado_em: sql`now()` }).where("id", "=", d.id).returning(colunas).executeTakeFirstOrThrow();
      } else {
        s = await trx.insertInto("categoria").values(valores).returning(colunas).executeTakeFirstOrThrow();
      }
      const reordenados = d.posicao === undefined ? [] : await reposicionar(trx, "categoria", s.id, d.posicao);
      if (reordenados.length) s = await trx.selectFrom("categoria").select(colunas).where("id", "=", s.id).executeTakeFirstOrThrow();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "categoria",
        alvoId: s.id,
        detalhes: { operacao: d.id ? "alterar" : "criar", antes: antes ?? null, depois: s, ...(reordenados.length ? { reordenados } : {}) },
        ip: quem.ip,
      });
      return s;
    });
    return salvo;
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    if ((e as { code?: string }).code === "23505") throw new ErroDeRegra("conflito", "Já existe uma categoria ativa com esse nome.");
    return traduzir(e);
  }
}
