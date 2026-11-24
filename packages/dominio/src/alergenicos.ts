/**
 * Alergênicos (S1; RC-07; migração 0020; decisão 0026). Informação de SAÚDE do cliente: na dúvida
 * o sistema nunca diz "não contém", diz "em conferência".
 * - Catálogo editável: ver = `cadastros.ver`; adicionar, editar, desativar e reativar =
 *   `cadastros.gerenciar`. Nada se apaga (RC-17).
 * - Ingrediente: quem gerencia cadastros marca o que ele contém ou pode conter em traços e, ao
 *   gravar, fica "conferido" com quem e quando. Auditoria com o antes e o depois.
 * - A conta do prato é a regra única `alergenicosDasFichas` (fichas-comum); aqui só se carrega o
 *   que ela precisa e se põem os nomes. Alergênico desativado no catálogo continua contando.
 */
import { z } from "zod";
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import {
  CODIGO_DE_ALERGENICO,
  type AlergenicosCalculados,
  type IngredienteParaAlergenicos,
  type TipoDeAlergenico,
} from "./fichas-comum";
import { exigir, type Ator } from "./sessao";

const MAIOR_ID = 2_147_483_647;
const ALERGENICOS_POR_INGREDIENTE = 60;

const texto = (rotulo: string, min: number, max: number) =>
  z
    .string({ error: `${rotulo} em formato inválido.` })
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(min, `${rotulo} com pelo menos ${min} letras.`)
        .max(max, `${rotulo} com no máximo ${max} letras.`)
        .refine((v) => !/\p{Cc}/u.test(v), `${rotulo} com caractere inválido.`),
    );
const codigo = z
  .string({ error: "Código do alergênico em formato inválido." })
  .refine((v) => CODIGO_DE_ALERGENICO.test(v), "Código do alergênico: só letras minúsculas e _, de 2 a 40, começando por letra.");

const esquemaAlergenico = z.object(
  {
    codigo,
    /** true = criar um novo (recusa se o código já existe); senão altera o que existe. */
    novo: z.boolean({ error: "Novo: sim ou não." }).optional(),
    nome: texto("Nome do alergênico", 2, 60).optional(),
    descricao: z
      .union([texto("Descrição", 0, 300), z.null()])
      .optional()
      .transform((v) => (v === "" ? null : v)),
    ativo: z.boolean({ error: "Ativo: sim ou não." }).optional(),
  },
  { error: "Alergênico em formato inválido." },
);

const listaDeCodigos = z.array(codigo, { error: "Lista de alergênicos em formato inválido." }).max(ALERGENICOS_POR_INGREDIENTE, "Alergênicos demais.");
const esquemaDoIngrediente = z.object(
  {
    ingredienteId: z.number({ error: "Ingrediente não encontrado." }).int("Ingrediente não encontrado.").positive("Ingrediente não encontrado.").max(MAIOR_ID, "Ingrediente não encontrado."),
    contem: listaDeCodigos,
    tracos: listaDeCodigos,
    /**
     * A conferência que a tela viu (`conferidoEm`; nulo se nunca conferido). Se mudou desde então
     * (outra pessoa gravou, ou a conferência foi zerada), recusa: ninguém grava por cima sem ver.
     */
    /**
     * Os códigos que a tela mostrou. Se a lista ganhou um alergênico ativo que a pessoa não viu
     * (cadastrado ou reativado enquanto ela conferia), recusa: ninguém confere o que não viu.
     */
    catalogoVisto: z.array(codigo, { error: "Falta a lista de alergênicos que a tela mostrou. Abra o ingrediente de novo." }).max(500, "Lista de alergênicos grande demais."),
    conferidoEmVisto: z.union([z.iso.datetime({ offset: true, error: "Data da conferência em formato inválido." }), z.null()], {
      error: "Falta a conferência que a tela viu. Abra o ingrediente de novo.",
    }),
  },
  { error: "Alergênicos do ingrediente em formato inválido." },
);

/**
 * Trava da LISTA de alergênicos. Quem muda a lista (criar, reativar) pega a trava exclusiva; quem
 * confere um ingrediente pega a compartilhada. Assim, ou a conferência vê o alergênico novo (e
 * recusa, se a tela não o mostrou), ou o alergênico entra depois da conferência (e a reabre).
 */
async function travarLista(trx: Banco, modo: "mudar" | "conferir"): Promise<void> {
  if (modo === "mudar") await sql`SELECT pg_advisory_xact_lock(hashtext('alergenicos:lista'))`.execute(trx);
  else await sql`SELECT pg_advisory_xact_lock_shared(hashtext('alergenicos:lista'))`.execute(trx);
}

function validar<T>(esquema: z.ZodType<T>, dados: unknown): T {
  const p = esquema.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", [...new Set(p.error.issues.map((i) => i.message))].join(" "));
  return p.data;
}

// ---------------------------------------------------------------- catálogo

export type Alergenico = { codigo: string; nome: string; descricao: string | null; ordem: number; ativo: boolean };

/** O catálogo inteiro, ativos e desativados, na ordem de mostrar. Quem chama já conferiu a permissão. */
export async function catalogoDeAlergenicos(db: Banco): Promise<Alergenico[]> {
  return db.selectFrom("alergenico").select(["codigo", "nome", "descricao", "ordem", "ativo"]).orderBy("ordem").orderBy("nome").execute();
}

export async function listarAlergenicos(db: Banco, ator: Ator | null): Promise<Alergenico[]> {
  await exigir(db, ator, "cadastros.ver", { tipo: "alergenico" });
  return catalogoDeAlergenicos(db);
}

/**
 * Cria (`novo: true`, com código e nome) ou altera (nome, descrição, ativo) um alergênico do
 * catálogo. O código não muda depois de criado (é o que fica gravado nos ingredientes).
 */
export async function salvarAlergenico(db: Banco, ator: Ator | null, dados: unknown): Promise<Alergenico> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "alergenico" });
  const d = validar(esquemaAlergenico, dados);
  try {
    return await db.transaction().execute(async (trx) => {
      await travarLista(trx, "mudar");
      const antes = await trx
        .selectFrom("alergenico")
        .select(["codigo", "nome", "descricao", "ordem", "ativo"])
        .where("codigo", "=", d.codigo)
        .forUpdate()
        .executeTakeFirst();
      let depois: Alergenico;
      if (d.novo) {
        if (antes) throw new ErroDeRegra("conflito", "Já existe um alergênico com esse código.");
        if (!d.nome) throw new ErroDeRegra("dados_invalidos", "Informe o nome do alergênico.");
        const ultima = await trx.selectFrom("alergenico").select((e) => e.fn.max("ordem").as("m")).executeTakeFirst();
        depois = await trx
          .insertInto("alergenico")
          .values({
            codigo: d.codigo,
            nome: d.nome,
            descricao: d.descricao ?? null,
            ordem: Math.min(9999, (ultima?.m ?? 0) + 10),
            ativo: d.ativo ?? true,
            // Hora do relógio (não a do início da transação): vem depois de qualquer conferência já feita.
            na_lista_desde: sql<Date>`clock_timestamp()`,
          })
          .returning(["codigo", "nome", "descricao", "ordem", "ativo"])
          .executeTakeFirstOrThrow();
      } else {
        if (!antes) throw new ErroDeRegra("nao_encontrado", "Alergênico não encontrado.");
        const mudancas = {
          ...(d.nome === undefined ? {} : { nome: d.nome }),
          ...(d.descricao === undefined ? {} : { descricao: d.descricao }),
          ...(d.ativo === undefined ? {} : { ativo: d.ativo }),
        };
        if (!Object.keys(mudancas).length) throw new ErroDeRegra("dados_invalidos", "Nada para mudar.");
        // Voltou para a lista: a conferência de antes não cobre ele (reabre os ingredientes).
        const voltou = d.ativo === true && !antes.ativo;
        depois = await trx
          .updateTable("alergenico")
          .set({ ...mudancas, ...(voltou ? { na_lista_desde: sql<Date>`clock_timestamp()` } : {}), atualizado_em: sql`now()` })
          .where("codigo", "=", d.codigo)
          .returning(["codigo", "nome", "descricao", "ordem", "ativo"])
          .executeTakeFirstOrThrow();
      }
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "alergenico",
        alvoId: d.codigo,
        detalhes: { operacao: d.novo ? "criar" : "alterar", antes: antes ?? null, depois },
        ip: quem.ip,
      });
      return depois;
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === "23505")
      throw new ErroDeRegra("conflito", constraint === "alergenico_pkey" ? "Já existe um alergênico com esse código." : "Já existe um alergênico com esse nome.");
    if (code === "23514") throw new ErroDeRegra("dados_invalidos", "Algum campo está fora do permitido. Confira os campos.");
    throw e;
  }
}

// ---------------------------------------------------------------- ingrediente

export type AlergenicosDoIngrediente = {
  ingredienteId: number;
  contem: string[];
  tracos: string[];
  /** Nulo = ainda não conferido. */
  conferidoEm: string | null;
  conferidoPor: string | null;
};

async function lerDoIngrediente(db: Banco, ingredienteId: number): Promise<AlergenicosDoIngrediente> {
  const ing = await db
    .selectFrom("ingrediente as i")
    .leftJoin("usuario as u", "u.id", "i.alergenicos_conferidos_por")
    .select(["i.id", "i.alergenicos_conferidos_em as em", "u.nome as por"])
    .where("i.id", "=", ingredienteId)
    .executeTakeFirst();
  if (!ing) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
  const linhas = await db
    .selectFrom("ingrediente_alergenico")
    .select(["alergenico_codigo as codigo", "tipo"])
    .where("ingrediente_id", "=", ingredienteId)
    .where("ativo", "=", true)
    .orderBy("alergenico_codigo")
    .execute();
  return {
    ingredienteId,
    contem: linhas.filter((l) => l.tipo === "contem").map((l) => l.codigo),
    tracos: linhas.filter((l) => l.tipo === "tracos").map((l) => l.codigo),
    conferidoEm: ing.em ? new Date(ing.em).toISOString() : null,
    conferidoPor: ing.em ? ing.por : null,
  };
}

/**
 * Grava o que o ingrediente contém e pode conter em traços (a lista inteira: o que não vier passa a
 * "não contém") e marca o ingrediente como conferido por quem gravou, agora. Lista vazia nas duas =
 * "conferido: não contém nenhum". Um código não pode estar nas duas listas; só códigos do catálogo
 * ativo (um desativado que o ingrediente JÁ tem pode continuar: aviso de saúde não some por
 * desativar o catálogo).
 */
export async function salvarAlergenicosDoIngrediente(db: Banco, ator: Ator | null, dados: unknown): Promise<AlergenicosDoIngrediente> {
  const quem = await exigir(db, ator, "cadastros.gerenciar", { tipo: "ingrediente_alergenico" });
  const d = validar(esquemaDoIngrediente, dados);
  const contem = [...new Set(d.contem)];
  const tracos = [...new Set(d.tracos)];
  if (contem.length !== d.contem.length || tracos.length !== d.tracos.length) throw new ErroDeRegra("dados_invalidos", "Alergênico repetido na lista.");
  const nosDois = contem.filter((c) => tracos.includes(c));
  if (nosDois.length) throw new ErroDeRegra("dados_invalidos", "Cada alergênico é Contém OU Pode conter traços, não os dois.");
  try {
    return await db.transaction().execute(async (trx) => {
      await travarLista(trx, "conferir");
      const ing = await trx.selectFrom("ingrediente").select("id").where("id", "=", d.ingredienteId).forUpdate().executeTakeFirst();
      if (!ing) throw new ErroDeRegra("nao_encontrado", "Ingrediente não encontrado.");
      // A lista inteira, travada até o fim: ninguém desativa nem reativa enquanto isto grava.
      const lista = await trx.selectFrom("alergenico").select(["codigo", "ativo"]).forShare().execute();
      const vistos = new Set(d.catalogoVisto);
      if (lista.some((a) => a.ativo && !vistos.has(a.codigo)))
        throw new ErroDeRegra("conflito", "A lista de alergênicos mudou enquanto você conferia. Abra de novo.");
      const antes = await lerDoIngrediente(trx, d.ingredienteId);
      const visto = d.conferidoEmVisto === null ? null : new Date(d.conferidoEmVisto).toISOString();
      if (visto !== antes.conferidoEm) throw new ErroDeRegra("conflito", "Outra pessoa mudou os alergênicos deste ingrediente. Abra de novo.");
      const pedidos = [...contem, ...tracos];
      if (pedidos.length) {
        // FOR SHARE: ninguém desativa o alergênico enquanto ele é marcado aqui.
        const cat = await trx.selectFrom("alergenico").select(["codigo", "ativo"]).where("codigo", "in", pedidos).forShare().execute();
        const ativo = new Map(cat.map((c) => [c.codigo, c.ativo]));
        const jaTem = new Set([...antes.contem, ...antes.tracos]);
        const ruins = pedidos.filter((c) => !ativo.has(c) || (!ativo.get(c) && !jaTem.has(c)));
        if (ruins.length) throw new ErroDeRegra("dados_invalidos", "Alergênico não encontrado ou desativado no catálogo.");
        await trx
          .insertInto("ingrediente_alergenico")
          .values(pedidos.map((c) => ({ ingrediente_id: d.ingredienteId, alergenico_codigo: c, tipo: (contem.includes(c) ? "contem" : "tracos") as TipoDeAlergenico })))
          .onConflict((oc) =>
            oc
              .columns(["ingrediente_id", "alergenico_codigo"])
              .doUpdateSet({ tipo: (e) => e.ref("excluded.tipo"), ativo: true, atualizado_em: sql`now()` })
              .where((w) => w.or([w("ingrediente_alergenico.tipo", "<>", w.ref("excluded.tipo")), w("ingrediente_alergenico.ativo", "=", false)])),
          )
          .execute();
      }
      // O que saiu da lista passa a "não contém" (linha inativa; nada se apaga).
      let tirar = trx
        .updateTable("ingrediente_alergenico")
        .set({ ativo: false, atualizado_em: sql`now()` })
        .where("ingrediente_id", "=", d.ingredienteId)
        .where("ativo", "=", true);
      if (pedidos.length) tirar = tirar.where("alergenico_codigo", "not in", pedidos);
      await tirar.execute();
      await trx
        .updateTable("ingrediente")
        .set({ alergenicos_conferidos_em: sql`clock_timestamp()`, alergenicos_conferidos_por: quem.usuarioId })
        .where("id", "=", d.ingredienteId)
        .execute();
      const depois = await lerDoIngrediente(trx, d.ingredienteId);
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "cadastros.gerenciar",
        resultado: "permitido",
        alvoTipo: "ingrediente_alergenico",
        alvoId: d.ingredienteId,
        detalhes: { antes, depois },
        ip: quem.ip,
      });
      return depois;
    });
  } catch (e) {
    if (e instanceof ErroDeRegra) throw e;
    const { code } = e as { code?: string };
    if (code === "23503") throw new ErroDeRegra("nao_encontrado", "Ingrediente ou alergênico não encontrado.");
    throw e;
  }
}

// ---------------------------------------------------------------- para a conta e para mostrar

/**
 * Alergênicos ativos que entraram (ou voltaram) na lista DEPOIS da conferência do ingrediente.
 * Conta no banco, com a precisão dele. Vazio se nunca conferido (aí o motivo é outro).
 */
export const novosNaListaDepoisDaConferencia = sql<string[]>`ARRAY(
  SELECT a.nome FROM alergenico a
  WHERE a.ativo AND ingrediente.alergenicos_conferidos_em IS NOT NULL AND a.na_lista_desde > ingrediente.alergenicos_conferidos_em
  ORDER BY a.ordem, a.nome)`;

export const motivoDosNovos = (novos: string[]) => `conferido antes de ${novos.join(", ")} entrar na lista`;

/**
 * O que a regra precisa de cada ingrediente (conferido e marcas ativas). Conferido só vale se nenhum
 * alergênico ativo entrou na lista depois (decisão 0026).
 */
export async function alergenicosDosIngredientes(db: Banco, ids: number[]): Promise<Map<number, IngredienteParaAlergenicos>> {
  const saida = new Map<number, IngredienteParaAlergenicos>();
  if (!ids.length) return saida;
  const ings = await db
    .selectFrom("ingrediente")
    .select(["id", "nome", "ativo", "alergenicos_conferidos_em as em", novosNaListaDepoisDaConferencia.as("novos")])
    .where("id", "in", ids)
    .execute();
  const linhas = await db
    .selectFrom("ingrediente_alergenico")
    .select(["ingrediente_id as ingredienteId", "alergenico_codigo as codigo", "tipo"])
    .where("ingrediente_id", "in", ids)
    .where("ativo", "=", true)
    .execute();
  for (const g of ings)
    saida.set(g.id, {
      id: g.id,
      nome: g.nome,
      ativo: g.ativo,
      conferido: g.em !== null && g.novos.length === 0,
      motivo: g.em === null ? "ainda não conferido" : g.novos.length ? motivoDosNovos(g.novos) : null,
      alergenicos: [],
    });
  for (const l of linhas) saida.get(l.ingredienteId)?.alergenicos.push({ codigo: l.codigo, tipo: l.tipo });
  return saida;
}

export type AlergenicoComNome = { codigo: string; nome: string; ativoNoCatalogo: boolean };
export type AlergenicosDaFicha = {
  situacao: AlergenicosCalculados["situacao"];
  contem: AlergenicoComNome[];
  tracos: AlergenicoComNome[];
  /** "Contém se pedir X": só vêm de itens opcionais. */
  opcionais: (AlergenicoComNome & { tipo: TipoDeAlergenico; itens: string[] })[];
  emConferencia: AlergenicosCalculados["emConferencia"];
  pendencias: string[];
};

/** Põe os nomes do catálogo (mesmo de alergênico desativado) e a ordem de mostrar. */
export function comNomes(a: AlergenicosCalculados, catalogo: readonly Alergenico[]): AlergenicosDaFicha {
  const porCodigo = new Map(catalogo.map((c) => [c.codigo, c]));
  const ordem = (x: { codigo: string }, y: { codigo: string }) =>
    (porCodigo.get(x.codigo)?.ordem ?? 99_999) - (porCodigo.get(y.codigo)?.ordem ?? 99_999) || x.codigo.localeCompare(y.codigo);
  const nome = (codigo: string): AlergenicoComNome => {
    const c = porCodigo.get(codigo);
    return { codigo, nome: c?.nome ?? codigo, ativoNoCatalogo: c?.ativo ?? false };
  };
  return {
    situacao: a.situacao,
    contem: a.contem.map(nome).sort(ordem),
    tracos: a.tracos.map(nome).sort(ordem),
    opcionais: a.opcionais.map((o) => ({ ...nome(o.codigo), tipo: o.tipo, itens: o.itens })).sort((x, y) => ordem(x, y) || x.tipo.localeCompare(y.tipo)),
    emConferencia: a.emConferencia,
    pendencias: a.pendencias,
  };
}

/** Sem ficha (ou sem nada para conferir): em conferência, nunca "não contém". */
export function alergenicosSemFicha(motivo: string): AlergenicosDaFicha {
  return { situacao: "em_conferencia", contem: [], tracos: [], opcionais: [], emConferencia: [], pendencias: [motivo] };
}
