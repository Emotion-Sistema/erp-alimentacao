/**
 * Central de avisos (RC-18, decisão 0013).
 *
 * Quem recebe: a pessoa com o cargo ATIVO certo, na unidade certa e no turno. "Estar no
 * turno" é ter entrado (sessão válida); a sessão some no fim do turno. A entrega é feita
 * quando a pessoa abre o aplicativo (e a cada consulta da caixa de avisos):
 * - aviso operacional: só enquanto vale, até o fim do turno em que nasceu. Quem entra
 *   depois disso (outro dia, outro turno) não recebe;
 * - comunicado da gerência: para quem tem o cargo, até confirmar a leitura (ou só no turno
 *   de hoje, se quem mandou escolheu assim).
 * Cada pessoa tem a própria situação: novo, visto, resolvido. Nada é apagado.
 */
import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { CARGOS, NOME_DO_CARGO, type Cargo } from "./permissoes";
import { exigir, type Ator } from "./sessao";

type Executor = Banco; // uma transação também serve

export const PRIORIDADES = ["urgente", "normal", "informativo"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export type SituacaoDoAviso = "novo" | "visto" | "resolvido";

export const TEXTO_MAX = 500;

/** Aviso operacional (nasce de um fato do sistema). Vale até o fim do turno de hoje. */
export async function criarAviso(
  db: Executor,
  a: {
    unidadeId: number;
    paraCargos: readonly Cargo[];
    tipo: string;
    texto: string;
    prioridade?: Prioridade;
    paraUsuarioId?: number;
    dados?: Record<string, unknown>;
  },
): Promise<string> {
  if (a.paraCargos.length === 0) throw new Error("Aviso sem cargo de destino.");
  const r = await db
    .insertInto("aviso")
    .values({
      unidade_id: a.unidadeId,
      para_cargos: sql<string[]>`${sql.val([...a.paraCargos])}::text[]`,
      tipo: a.tipo,
      texto: a.texto.slice(0, TEXTO_MAX),
      prioridade: a.prioridade ?? "normal",
      natureza: "operacional",
      para_usuario_id: a.paraUsuarioId ?? null,
      expira_em: sql<Date>`fim_do_turno(${a.unidadeId}, now())`,
      dados: JSON.stringify(a.dados ?? {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return r.id;
}

function exigirEntrada(ator: Ator | null): asserts ator is Ator {
  if (!ator) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  if (ator.segundoFator === "pendente") throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
}

async function recusarSemEntrada(db: Banco, ator: Ator | null, acao: string) {
  if (ator && ator.segundoFator !== "pendente") return;
  await auditar(db, {
    usuarioId: ator?.usuarioId ?? null,
    acao,
    resultado: "recusado",
    detalhes: { motivo: ator ? "segundo_fator_pendente" : "sem_sessao" },
    ip: ator?.ip ?? null,
  });
  exigirEntrada(ator);
}

/**
 * Entrega à pessoa os avisos que valem para ela AGORA. Pode rodar muitas vezes ao mesmo
 * tempo: cada pessoa recebe cada aviso uma vez só.
 *
 * O turno da pessoa vai da entrada até o fim do turno da unidade contado a partir da hora
 * em que ela entrou (`fim_do_turno(unidade, sessao.criada_em)`). A sessão pode durar mais
 * (12 h), mas depois desse horário a pessoa está FORA do turno: não recebe aviso
 * operacional nem comunicado "só no turno de hoje". Comunicado "até confirmar" chega a
 * quem já tinha o cargo quando ele foi enviado.
 */
async function entregar(db: Banco, ator: Ator & { cargoAtivo: string; unidadeId: number }) {
  if (!ator.sessaoId) return; // estação da cozinha: avisos na tela de produção (E14)
  await sql`
    WITH turno AS (
      SELECT now() < fim_do_turno(${ator.unidadeId}, s.criada_em) AS dentro
      FROM sessao s WHERE s.id = ${ator.sessaoId}
    )
    INSERT INTO aviso_destino (aviso_id, usuario_id, cargo)
    SELECT a.id, ${ator.usuarioId}, ${ator.cargoAtivo}
    FROM aviso a, turno t
    WHERE a.unidade_id = ${ator.unidadeId}
      AND ${ator.cargoAtivo} = ANY (a.para_cargos)
      AND (a.para_usuario_id IS NULL OR a.para_usuario_id = ${ator.usuarioId})
      AND (
        -- Do turno (operacional ou comunicado "só hoje"): ainda vale e a pessoa está no turno.
        (a.expira_em IS NOT NULL AND a.expira_em > now() AND t.dentro)
        -- Comunicado "até confirmar": quem já tinha o cargo quando ele foi enviado.
        OR (a.natureza = 'comunicado' AND a.expira_em IS NULL AND EXISTS (
              SELECT 1 FROM usuario_perfil up
              WHERE up.usuario_id = ${ator.usuarioId} AND up.perfil_codigo = ${ator.cargoAtivo}
                AND up.unidade_id = a.unidade_id AND up.removido_em IS NULL AND up.criado_em <= a.criado_em))
      )
      AND NOT EXISTS (SELECT 1 FROM aviso_destino d WHERE d.aviso_id = a.id AND d.usuario_id = ${ator.usuarioId})
    ON CONFLICT (aviso_id, usuario_id) DO NOTHING`.execute(db);
}

export type AvisoDaCaixa = {
  id: string;
  criadoEm: Date;
  tipo: string;
  texto: string;
  prioridade: Prioridade;
  natureza: "operacional" | "comunicado";
  autorNome: string | null;
  situacao: SituacaoDoAviso;
  vistoEm: Date | null;
  resolvidoEm: Date | null;
};

/**
 * Caixa de avisos da pessoa, para o cargo ativo dela (o histórico fica). Fora do turno
 * (sem sessão) não há caixa. Sem cargo ativo: vazia.
 */
/** Caixa de avisos. `antesDe`: id do último aviso da página anterior (para ver mais). */
export async function caixaDeAvisos(db: Banco, ator: Ator | null, filtro: { antesDe?: unknown } = {}): Promise<AvisoDaCaixa[]> {
  await recusarSemEntrada(db, ator, "avisos.ver");
  exigirEntrada(ator);
  if (!ator.cargoAtivo || !ator.unidadeId) return [];
  const pagina = z.object({ antesDe: z.coerce.number().int().positive().optional() }).safeParse(filtro);
  if (!pagina.success) throw new ErroDeRegra("dados_invalidos", "Página inválida.");
  const antesDe = pagina.data.antesDe;
  const quem = { ...ator, cargoAtivo: ator.cargoAtivo, unidadeId: ator.unidadeId };
  if (antesDe === undefined) await entregar(db, quem);
  const linhas = await db
    .selectFrom("aviso_destino as d")
    .innerJoin("aviso as a", "a.id", "d.aviso_id")
    .leftJoin("usuario as autor", "autor.id", "a.autor_id")
    .select([
      "a.id",
      "a.criado_em as criadoEm",
      "a.tipo",
      "a.texto",
      "a.prioridade",
      "a.natureza",
      "autor.nome as autorNome",
      "d.visto_em as vistoEm",
      "d.resolvido_em as resolvidoEm",
    ])
    .where("d.usuario_id", "=", ator.usuarioId)
    .where("a.unidade_id", "=", quem.unidadeId)
    .where((eb) => eb(eb.val(quem.cargoAtivo), "=", eb.fn.any("a.para_cargos")))
    .$if(antesDe !== undefined, (q) => q.where("a.id", "<", String(antesDe)))
    .orderBy("a.id", "desc")
    .limit(50)
    .execute();
  return linhas.map((l) => ({
    ...l,
    situacao: l.resolvidoEm ? "resolvido" : l.vistoEm ? "visto" : "novo",
  }));
}

/** Compatível com a E03 (lançador e testes antigos): a mesma caixa de avisos. */
export const avisosDoCargo = (db: Banco, ator: Ator | null) => caixaDeAvisos(db, ator);

/** Avisos do cargo ativo e da unidade: a pessoa só mexe no que vê na caixa daquele cargo. */
const doCargoAtivo = (db: Banco, cargo: string, unidadeId: number) =>
  db
    .selectFrom("aviso")
    .select("id")
    .where("unidade_id", "=", unidadeId)
    .where((eb) => eb(eb.val(cargo), "=", eb.fn.any("para_cargos")));

const listaDeIds = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(100) });

/** A pessoa viu estes avisos (só os dela; data gravada uma vez). */
export async function marcarVistos(db: Banco, ator: Ator | null, dados: unknown): Promise<number> {
  await recusarSemEntrada(db, ator, "avisos.ver");
  exigirEntrada(ator);
  const p = listaDeIds.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", "Informe os avisos.");
  if (!ator.cargoAtivo || !ator.unidadeId) return 0;
  const r = await db
    .updateTable("aviso_destino")
    .set({ visto_em: sql<Date>`now()` })
    .where("usuario_id", "=", ator.usuarioId)
    .where("aviso_id", "in", p.data.ids.map(String))
    .where("visto_em", "is", null)
    .where("aviso_id", "in", doCargoAtivo(db, ator.cargoAtivo, ator.unidadeId))
    .executeTakeFirst();
  return Number(r.numUpdatedRows);
}

/**
 * Resolve um aviso da pessoa (no comunicado: "Li e entendi"). Repetir não muda nada.
 * Aviso que não é dela: "não encontrado", sem dizer se existe.
 */
export async function resolverAviso(db: Banco, ator: Ator | null, avisoId: number): Promise<void> {
  await recusarSemEntrada(db, ator, "avisos.resolver");
  exigirEntrada(ator);
  const linha =
    ator.cargoAtivo && ator.unidadeId
      ? await db
          .selectFrom("aviso_destino")
          .select(["resolvido_em"])
          .where("usuario_id", "=", ator.usuarioId)
          .where("aviso_id", "=", String(avisoId))
          .where("aviso_id", "in", doCargoAtivo(db, ator.cargoAtivo, ator.unidadeId))
          .executeTakeFirst()
      : undefined;
  if (!linha) throw new ErroDeRegra("nao_encontrado", "Aviso não encontrado.");
  if (linha.resolvido_em) return;
  await db
    .updateTable("aviso_destino")
    .set({ visto_em: sql<Date>`coalesce(visto_em, now())`, resolvido_em: sql<Date>`now()` })
    .where("usuario_id", "=", ator.usuarioId)
    .where("aviso_id", "=", String(avisoId))
    .where("resolvido_em", "is", null)
    .execute();
}

// ---------- comunicados da gerência ----------

const dadosComunicado = z.object({
  texto: z.string().trim().min(3).max(TEXTO_MAX),
  cargos: z
    .array(z.enum(CARGOS))
    .min(1)
    .max(CARGOS.length)
    .refine((l) => new Set(l).size === l.length, "Cargo repetido."),
  prioridade: z.enum(PRIORIDADES).default("normal"),
  /** "turno": só para quem entrar até o fim do turno de hoje; "ate_ler": fica até cada um confirmar. */
  validade: z.enum(["turno", "ate_ler"]).default("ate_ler"),
});

export async function enviarComunicado(db: Banco, ator: Ator | null, dados: unknown): Promise<{ id: string }> {
  const quem = await exigir(db, ator, "comunicados.enviar", { tipo: "comunicado" });
  const p = dadosComunicado.safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", "Escreva o recado (3 a 500 letras) e escolha pelo menos um cargo.");
  if (!quem.unidadeId) throw new ErroDeRegra("dados_invalidos", "Seu cargo ativo não tem unidade.");
  const unidadeId = quem.unidadeId;
  const d = p.data;
  return db.transaction().execute(async (trx) => {
    const r = await trx
      .insertInto("aviso")
      .values({
        unidade_id: unidadeId,
        para_cargos: sql<string[]>`${sql.val(d.cargos)}::text[]`,
        tipo: "comunicado",
        texto: d.texto,
        prioridade: d.prioridade,
        natureza: "comunicado",
        autor_id: quem.usuarioId,
        expira_em: d.validade === "turno" ? sql<Date>`fim_do_turno(${unidadeId}, now())` : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await auditar(trx, {
      usuarioId: quem.usuarioId,
      acao: "comunicados.enviar",
      resultado: "permitido",
      alvoTipo: "aviso",
      alvoId: r.id,
      detalhes: { cargos: d.cargos, prioridade: d.prioridade, validade: d.validade },
      ip: quem.ip,
    });
    return { id: r.id };
  });
}

export type LeituraDoComunicado = {
  usuarioId: number;
  nome: string;
  situacao: "nao_recebeu" | SituacaoDoAviso;
  quando: Date | null;
};

export type ComunicadoEnviado = {
  id: string;
  criadoEm: Date;
  texto: string;
  prioridade: Prioridade;
  cargos: { codigo: string; nome: string }[];
  validade: "turno" | "ate_ler";
  expiraEm: Date | null;
  autorNome: string | null;
  confirmaram: number;
  total: number;
  pessoas: LeituraDoComunicado[];
};

/**
 * Comunicados da unidade, com quem leu e quem ainda não leu. "Quem deve ler" é quem já
 * tinha um dos cargos na unidade quando o comunicado foi enviado e ainda tem, mais quem
 * recebeu e depois perdeu o cargo.
 */
export async function listarComunicados(db: Banco, ator: Ator | null): Promise<ComunicadoEnviado[]> {
  const quem = await exigir(db, ator, "comunicados.enviar", { tipo: "comunicado" });
  if (!quem.unidadeId) return [];
  const comunicados = await db
    .selectFrom("aviso as a")
    .leftJoin("usuario as autor", "autor.id", "a.autor_id")
    .select(["a.id", "a.criado_em as criadoEm", "a.texto", "a.prioridade", "a.para_cargos as paraCargos", "a.expira_em as expiraEm", "autor.nome as autorNome"])
    .where("a.unidade_id", "=", quem.unidadeId)
    .where("a.natureza", "=", "comunicado")
    .orderBy("a.id", "desc")
    .limit(30)
    .execute();
  if (comunicados.length === 0) return [];
  const leituras = await sql<{ avisoId: string; usuarioId: number; nome: string; vistoEm: Date | null; resolvidoEm: Date | null; recebeu: boolean }>`
    WITH c AS (
      SELECT id, para_cargos, criado_em FROM aviso WHERE id IN (${sql.join(comunicados.map((c) => c.id))})
    ),
    deve AS (
      SELECT DISTINCT c.id AS aviso_id, up.usuario_id
      FROM c
      JOIN usuario_perfil up ON up.perfil_codigo = ANY (c.para_cargos)
        AND up.unidade_id = ${quem.unidadeId} AND up.removido_em IS NULL AND up.criado_em <= c.criado_em
      JOIN usuario u ON u.id = up.usuario_id AND u.ativo
      UNION
      SELECT d.aviso_id, d.usuario_id FROM aviso_destino d JOIN c ON c.id = d.aviso_id
    )
    SELECT deve.aviso_id AS "avisoId", u.id AS "usuarioId", u.nome,
           d.visto_em AS "vistoEm", d.resolvido_em AS "resolvidoEm", (d.aviso_id IS NOT NULL) AS recebeu
    FROM deve
    JOIN usuario u ON u.id = deve.usuario_id
    LEFT JOIN aviso_destino d ON d.aviso_id = deve.aviso_id AND d.usuario_id = deve.usuario_id
    ORDER BY u.nome`.execute(db);
  const porAviso = new Map<string, LeituraDoComunicado[]>();
  for (const l of leituras.rows) {
    const lista = porAviso.get(String(l.avisoId)) ?? [];
    lista.push({
      usuarioId: l.usuarioId,
      nome: l.nome,
      situacao: l.resolvidoEm ? "resolvido" : l.vistoEm ? "visto" : l.recebeu ? "novo" : "nao_recebeu",
      quando: l.resolvidoEm ?? l.vistoEm ?? null,
    });
    porAviso.set(String(l.avisoId), lista);
  }
  return comunicados.map((c) => {
    const pessoas = porAviso.get(String(c.id)) ?? [];
    return {
      id: c.id,
      criadoEm: c.criadoEm,
      texto: c.texto,
      prioridade: c.prioridade,
      cargos: c.paraCargos.map((codigo) => ({ codigo, nome: (NOME_DO_CARGO as Record<string, string>)[codigo] ?? codigo })),
      validade: c.expiraEm ? "turno" : "ate_ler",
      expiraEm: c.expiraEm,
      autorNome: c.autorNome,
      confirmaram: pessoas.filter((p) => p.situacao === "resolvido").length,
      total: pessoas.length,
      pessoas,
    };
  });
}
