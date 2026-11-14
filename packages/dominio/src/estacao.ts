/**
 * Estação da cozinha (RC-12, "quem está nesta tela"). O tablet é cadastrado uma vez e
 * guarda um token. A pessoa toca na própria foto e digita o código pessoal de 4 dígitos
 * no início do turno; depois um toque na foto basta para ela assumir a tela. Código
 * errado 3 vezes bloqueia o código e avisa o supervisor.
 */
import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { CARGOS_DA_ESTACAO, podeAtribuir } from "./permissoes";
import { conferirSenha, hashParaTempoConstante, hashSenha } from "./senha";
import { cargosVigentes, exigir, hashToken, novoToken, type Ator } from "./sessao";

export const CODIGO_MAX_ERROS = 3;
/** Presença na estação nunca passa disto, mesmo entrando depois do fim do turno. */
const PRESENCA_MAX_HORAS = 16;

const ehDaEstacao = (c: string) => (CARGOS_DA_ESTACAO as readonly string[]).includes(c);

// ---------- código pessoal ----------

const codigoValido = z
  .string()
  .regex(/^[0-9]{4}$/, "O código tem 4 números.")
  .refine((c) => !/^(\d)\1{3}$/.test(c), "Não use 4 números iguais.")
  .refine((c) => !"0123456789".includes(c) && !"9876543210".includes(c), "Não use sequência (1234, 4321...).");

/**
 * Define o código de 4 dígitos. A própria pessoa pode definir o seu; para outra pessoa,
 * é preciso poder gerenciar usuários e poder atribuir todos os cargos dela.
 */
export async function definirCodigo(db: Banco, ator: Ator | null, usuarioId: number, dados: unknown): Promise<void> {
  if (!ator) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  const proprio = usuarioId === ator.usuarioId && ator.estacaoId === null;
  const quem = proprio ? ator : await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario", id: usuarioId });
  if (proprio && ator.segundoFator === "pendente") throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
  const parse = z.object({ codigo: codigoValido }).safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", parse.error.issues.map((i) => i.message).join(" "));
  const cargosAlvo = (await cargosVigentes(db, usuarioId)).map((c) => c.cargo);
  if (!proprio && !podeAtribuir(quem.cargoAtivo, cargosAlvo)) {
    await auditar(db, { usuarioId: quem.usuarioId, acao: "codigo.definir", resultado: "recusado", alvoTipo: "usuario", alvoId: usuarioId, ip: quem.ip });
    throw new ErroDeRegra("sem_permissao", "Seu cargo não pode mexer nesse usuário.");
  }
  if (!cargosAlvo.some(ehDaEstacao)) throw new ErroDeRegra("dados_invalidos", "Só quem trabalha na cozinha usa código pessoal.");
  const h = await hashSenha(parse.data.codigo);
  // A própria pessoa troca o código, mas não se desbloqueia: isso é do supervisor (0011, item 4).
  let q = db.updateTable("usuario").set(proprio ? { codigo_hash: h } : { codigo_hash: h, codigo_erros: 0, codigo_bloqueado_em: null }).where("id", "=", usuarioId).where("ativo", "=", true);
  if (proprio) q = q.where("codigo_bloqueado_em", "is", null);
  const r = await q.executeTakeFirst();
  if (r.numUpdatedRows === 0n) {
    if (proprio) {
      await auditar(db, { usuarioId: quem.usuarioId, acao: "codigo.definir", resultado: "recusado", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { motivo: "codigo_bloqueado" }, ip: quem.ip });
      throw new ErroDeRegra("bloqueado", "Seu código está bloqueado. Peça ao supervisor para desbloquear.");
    }
    throw new ErroDeRegra("nao_encontrado", "Usuário não encontrado.");
  }
  // O código nunca vai para a auditoria.
  await auditar(db, { usuarioId: quem.usuarioId, acao: "codigo.definir", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, ip: quem.ip });
}

export async function desbloquearCodigo(db: Banco, ator: Ator | null, usuarioId: number): Promise<void> {
  const quem = await exigir(db, ator, "codigos.desbloquear", { tipo: "usuario", id: usuarioId });
  if (!(await cargosVigentes(db, usuarioId)).some((c) => c.unidadeId === quem.unidadeId)) {
    await auditar(db, { usuarioId: quem.usuarioId, acao: "codigos.desbloquear", resultado: "recusado", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { motivo: "fora_da_unidade" }, ip: quem.ip });
    throw new ErroDeRegra("nao_encontrado", "Pessoa não encontrada na sua unidade.");
  }
  const r = await db
    .updateTable("usuario")
    .set({ codigo_erros: 0, codigo_bloqueado_em: null })
    .where("id", "=", usuarioId)
    .where("codigo_bloqueado_em", "is not", null)
    .executeTakeFirst();
  if (r.numUpdatedRows === 0n) throw new ErroDeRegra("conflito", "O código desta pessoa não está bloqueado.");
  await auditar(db, { usuarioId: quem.usuarioId, acao: "codigos.desbloquear", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, ip: quem.ip });
}

/**
 * Confere o código. Erro conta de forma atômica; no 3º seguido bloqueia, registra e avisa
 * supervisor e gerente da unidade (uma vez só, mesmo com tentativas simultâneas).
 */
async function conferirCodigo(db: Banco, usuarioId: number, codigo: string, contexto: { estacaoId: number; unidadeId: number; acao: string }): Promise<void> {
  const u = await db
    .selectFrom("usuario")
    .select(["nome", "codigo_hash", "codigo_bloqueado_em", "ativo"])
    .where("id", "=", usuarioId)
    .executeTakeFirst();
  if (!u?.ativo) throw new ErroDeRegra("nao_encontrado", "Pessoa não encontrada nesta estação.");
  if (u.codigo_bloqueado_em) {
    await auditar(db, { usuarioId, acao: contexto.acao, resultado: "recusado", detalhes: { motivo: "codigo_bloqueado", estacaoId: contexto.estacaoId } });
    throw new ErroDeRegra("bloqueado", "Seu código está bloqueado. Chame o supervisor.");
  }
  if (!u.codigo_hash) {
    await hashParaTempoConstante();
    throw new ErroDeRegra("dados_invalidos", "Você ainda não tem código. Peça ao gerente para definir.");
  }
  if (await conferirSenha(u.codigo_hash, codigo)) {
    // Zera os erros, mas só se ninguém bloqueou o código no meio do caminho.
    const r = await db.updateTable("usuario").set({ codigo_erros: 0 }).where("id", "=", usuarioId).where("codigo_bloqueado_em", "is", null).executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("bloqueado", "Seu código está bloqueado. Chame o supervisor.");
    return;
  }
  // Erro, bloqueio, registro e aviso juntos: ou tudo fica gravado, ou nada.
  const r = await db.transaction().execute(async (trx) => {
    const r = await sql<{ bloqueou: boolean; erros: number }>`
      UPDATE usuario SET
        codigo_erros = CASE WHEN codigo_erros + 1 >= ${CODIGO_MAX_ERROS} THEN 0 ELSE codigo_erros + 1 END,
        codigo_bloqueado_em = CASE WHEN codigo_erros + 1 >= ${CODIGO_MAX_ERROS} THEN now() ELSE NULL END
      WHERE id = ${usuarioId} AND codigo_bloqueado_em IS NULL
      RETURNING (codigo_bloqueado_em IS NOT NULL) AS bloqueou, codigo_erros AS erros`.execute(trx);
    const bloqueou = !!r.rows[0]?.bloqueou;
    await auditar(trx, { usuarioId, acao: contexto.acao, resultado: "falhou", detalhes: { motivo: "codigo_errado", estacaoId: contexto.estacaoId, bloqueou } });
    if (bloqueou) {
      await auditar(trx, { usuarioId, acao: "codigo.bloqueado", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { estacaoId: contexto.estacaoId } });
      await trx
        .insertInto("aviso")
        .values({
          unidade_id: contexto.unidadeId,
          para_cargos: sql<string[]>`ARRAY['supervisor','gerente_geral']::text[]`,
          tipo: "codigo_bloqueado",
          texto: `O código de ${u.nome} foi bloqueado depois de ${CODIGO_MAX_ERROS} erros. Desbloqueie em Funcionários.`,
          dados: JSON.stringify({ usuarioId, estacaoId: contexto.estacaoId }),
        })
        .execute();
    }
    return r;
  });
  if (r.rows[0]?.bloqueou) throw new ErroDeRegra("bloqueado", "Código errado 3 vezes. Seu código foi bloqueado e o supervisor foi avisado.");
  if (r.rows.length === 0) throw new ErroDeRegra("bloqueado", "Seu código está bloqueado. Chame o supervisor.");
  const restam = CODIGO_MAX_ERROS - (r.rows[0]?.erros ?? 0);
  throw new ErroDeRegra("nao_autenticado", `Código errado. Restam ${restam} tentativa${restam === 1 ? "" : "s"}.`);
}

// ---------- cadastro da estação (gestor) ----------

const dadosEstacao = z.object({ nome: z.string().trim().min(2).max(60) });

export async function cadastrarEstacao(db: Banco, ator: Ator | null, dados: unknown): Promise<{ id: number; nome: string; token: string }> {
  const quem = await exigir(db, ator, "estacoes.gerenciar", { tipo: "estacao" });
  const parse = dadosEstacao.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Dê um nome à estação (ex.: Chapa, Fritura).");
  if (quem.unidadeId === null) throw new ErroDeRegra("dados_invalidos", "Seu usuário não tem unidade.");
  const token = novoToken();
  try {
    const e = await db
      .insertInto("estacao")
      .values({ unidade_id: quem.unidadeId, nome: parse.data.nome, token_hash: hashToken(token), criada_por: quem.usuarioId })
      .returning(["id", "nome"])
      .executeTakeFirstOrThrow();
    await auditar(db, { usuarioId: quem.usuarioId, acao: "estacoes.gerenciar", resultado: "permitido", alvoTipo: "estacao", alvoId: e.id, detalhes: { operacao: "cadastrar", nome: e.nome }, ip: quem.ip });
    return { ...e, token };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ErroDeRegra("conflito", "Já existe uma estação com esse nome.");
    throw e;
  }
}

export async function revogarEstacao(db: Banco, ator: Ator | null, estacaoId: number): Promise<void> {
  const quem = await exigir(db, ator, "estacoes.gerenciar", { tipo: "estacao", id: estacaoId });
  await db.transaction().execute(async (trx) => {
    const agora = new Date();
    const r = await trx
      .updateTable("estacao")
      .set({ revogada_em: agora, revogada_por: quem.usuarioId })
      .where("id", "=", estacaoId)
      .where("unidade_id", "=", quem.unidadeId)
      .where("revogada_em", "is", null)
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("nao_encontrado", "Estação não encontrada ou já desligada.");
    await trx.updateTable("estacao_presenca").set({ saiu_em: agora, motivo_saida: "estacao_revogada" }).where("estacao_id", "=", estacaoId).where("saiu_em", "is", null).execute();
    await auditar(trx, { usuarioId: quem.usuarioId, acao: "estacoes.gerenciar", resultado: "permitido", alvoTipo: "estacao", alvoId: estacaoId, detalhes: { operacao: "revogar" }, ip: quem.ip });
  });
}

/** Tela Geral: estações da unidade e quem está em cada uma. */
export async function listarEstacoes(db: Banco, ator: Ator | null) {
  const quem = await exigir(db, ator, "estacoes.ver", { tipo: "estacao" });
  await fecharVencidas(db);
  const estacoes = await db
    .selectFrom("estacao")
    .select(["id", "nome", "criada_em"])
    .where("unidade_id", "=", quem.unidadeId)
    .where("revogada_em", "is", null)
    .orderBy("nome")
    .execute();
  const presencas = await db
    .selectFrom("estacao_presenca")
    .innerJoin("usuario", "usuario.id", "estacao_presenca.usuario_id")
    .select(["estacao_presenca.estacao_id", "usuario.id", "usuario.nome", "estacao_presenca.cargo", "estacao_presenca.entrou_em", "estacao_presenca.ativa_desde"])
    .where("estacao_presenca.saiu_em", "is", null)
    .execute();
  return estacoes.map((e) => ({
    ...e,
    pessoas: presencas.filter((p) => p.estacao_id === e.id).map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo, entrouEm: p.entrou_em, ativa: !!p.ativa_desde })),
  }));
}

// ---------- uso no tablet (token da estação) ----------

async function estacaoDoToken(db: Banco, token: string | null | undefined) {
  if (!token || token.length > 200) return null;
  return (
    (await db
      .selectFrom("estacao")
      .select(["id", "nome", "unidade_id"])
      .where("token_hash", "=", hashToken(token))
      .where("revogada_em", "is", null)
      .executeTakeFirst()) ?? null
  );
}

async function exigirEstacao(db: Banco, token: string | null | undefined) {
  const e = await estacaoDoToken(db, token);
  if (!e) {
    // Limite de requisições (E06) impede que isso vire enchente de registros.
    await auditar(db, { usuarioId: null, acao: "estacao.acesso", resultado: "recusado", detalhes: { motivo: token ? "token_invalido" : "sem_token" } });
    throw new ErroDeRegra("nao_autenticado", "Este aparelho não está cadastrado como estação.");
  }
  return e;
}

/** Fim do turno saiu sozinho: fecha presenças vencidas. */
async function fecharVencidas(db: Banco) {
  await db.transaction().execute(async (trx) => {
    const fechadas = await trx
      .updateTable("estacao_presenca")
      .set({ saiu_em: sql`expira_em`, motivo_saida: "expirou" })
      .where("saiu_em", "is", null)
      .where("expira_em", "<=", new Date())
      .returning("estacao_id")
      .execute();
    await ajustarAtivas(trx, fechadas.map((f) => f.estacao_id));
  });
}

/** Trava a estação (e a pessoa) até o fim da transação: mudanças na mesma tela entram em fila. */
async function travar(db: Banco, estacaoId: number, usuarioId?: number) {
  await sql`SELECT id FROM estacao WHERE id = ${estacaoId} FOR UPDATE`.execute(db);
  if (usuarioId !== undefined) await sql`SELECT id FROM usuario WHERE id = ${usuarioId} FOR UPDATE`.execute(db);
}

/**
 * Nas estações indicadas, se só uma pessoa ficou na tela, ela passa a ser a ativa (todo
 * toque sai em nome dela). Chamar, dentro da transação, depois de qualquer saída: sair,
 * trocar de estação, desligar, tirar cargo, fim do turno. Trava as estações (em ordem, para
 * não haver impasse) antes de mexer.
 */
export async function ajustarAtivas(trx: Banco, estacaoIds: readonly number[]) {
  const ids = [...new Set(estacaoIds)].sort((a, b) => a - b);
  for (const id of ids) {
    await sql`SELECT id FROM estacao WHERE id = ${id} FOR UPDATE`.execute(trx);
    await sql`
      UPDATE estacao_presenca p SET ativa_desde = now()
      WHERE p.estacao_id = ${id} AND p.saiu_em IS NULL AND p.ativa_desde IS NULL
        AND (SELECT count(*) FROM estacao_presenca q WHERE q.estacao_id = ${id} AND q.saiu_em IS NULL) = 1`.execute(trx);
  }
}

/** O que o tablet mostra: a estação e as pessoas da cozinha (fotos), com quem está e quem é a ativa. */
export async function telaDaEstacao(db: Banco, token: string | null | undefined) {
  const e = await exigirEstacao(db, token);
  await fecharVencidas(db);
  const pessoas = await db
    .selectFrom("usuario")
    .innerJoin("usuario_perfil", "usuario_perfil.usuario_id", "usuario.id")
    .leftJoin("estacao_presenca", (j) => j.onRef("estacao_presenca.usuario_id", "=", "usuario.id").on("estacao_presenca.saiu_em", "is", null))
    .select([
      "usuario.id",
      "usuario.nome",
      "usuario_perfil.perfil_codigo as cargo",
      "usuario.codigo_bloqueado_em",
      "estacao_presenca.estacao_id",
      "estacao_presenca.ativa_desde",
    ])
    .where("usuario.ativo", "=", true)
    .where("usuario_perfil.removido_em", "is", null)
    .where("usuario_perfil.unidade_id", "=", e.unidade_id)
    .where("usuario_perfil.perfil_codigo", "in", [...CARGOS_DA_ESTACAO])
    .orderBy("usuario.nome")
    .execute();
  const vistos = new Set<number>();
  return {
    estacao: { id: e.id, nome: e.nome },
    pessoas: pessoas
      .filter((p) => !vistos.has(p.id) && vistos.add(p.id))
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        cargo: p.cargo,
        bloqueado: !!p.codigo_bloqueado_em,
        aqui: p.estacao_id === e.id,
        emOutraEstacao: p.estacao_id !== null && p.estacao_id !== e.id,
        ativa: p.estacao_id === e.id && !!p.ativa_desde,
      })),
  };
}

const dadosEntrar = z.object({ usuarioId: z.number().int().positive(), codigo: z.string().max(10) });

/** Início do turno: toca na foto e digita o código. Sai de outra estação, se estava. */
export async function entrarNaEstacao(db: Banco, token: string | null | undefined, dados: unknown): Promise<void> {
  const e = await exigirEstacao(db, token);
  const parse = dadosEntrar.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Toque na sua foto e digite o código.");
  const { usuarioId, codigo } = parse.data;
  const cargo = (await cargosVigentes(db, usuarioId)).find((c) => ehDaEstacao(c.cargo) && c.unidadeId === e.unidade_id)?.cargo;
  if (!cargo) throw new ErroDeRegra("nao_encontrado", "Pessoa não encontrada nesta estação.");
  await conferirCodigo(db, usuarioId, codigo, { estacaoId: e.id, unidadeId: e.unidade_id, acao: "estacao.entrar" });

  await db.transaction().execute(async (trx) => {
    await travar(trx, e.id, usuarioId);
    const agora = new Date();
    const anteriores = await trx
      .updateTable("estacao_presenca")
      .set({ saiu_em: agora, motivo_saida: "outra_estacao", ativa_desde: null })
      .where("usuario_id", "=", usuarioId)
      .where("saiu_em", "is", null)
      .returning("estacao_id")
      .execute();
    await trx.updateTable("estacao_presenca").set({ ativa_desde: null }).where("estacao_id", "=", e.id).where("saiu_em", "is", null).execute();
    await sql`
      INSERT INTO estacao_presenca (estacao_id, usuario_id, cargo, expira_em, ativa_desde)
      SELECT ${e.id}, ${usuarioId}, ${cargo}, LEAST(
        (CASE WHEN fim_local > agora_local THEN fim_local ELSE fim_local + interval '1 day' END) AT TIME ZONE fuso,
        now() + make_interval(hours => ${PRESENCA_MAX_HORAS})), now()
      FROM (SELECT date_trunc('day', now() AT TIME ZONE fuso_horario) + fim_turno AS fim_local,
                   now() AT TIME ZONE fuso_horario AS agora_local, fuso_horario AS fuso
            FROM unidade WHERE id = ${e.unidade_id}) t`.execute(trx);
    // a estação de onde ela saiu pode ter ficado com uma pessoa só
    await ajustarAtivas(trx, anteriores.map((a) => a.estacao_id).filter((id) => id !== e.id));
    await auditar(trx, { usuarioId, acao: "estacao.entrar", resultado: "permitido", alvoTipo: "estacao", alvoId: e.id, detalhes: { cargo } });
  });
}

const dadosPessoa = z.object({ usuarioId: z.number().int().positive() });

async function presencaAqui(db: Banco, estacaoId: number, usuarioId: number) {
  return db
    .selectFrom("estacao_presenca")
    .select(["id"])
    .where("estacao_id", "=", estacaoId)
    .where("usuario_id", "=", usuarioId)
    .where("saiu_em", "is", null)
    .where("expira_em", ">", new Date())
    .executeTakeFirst();
}

/** Um toque na própria foto: os próximos toques passam a ser dela (sem código). */
export async function ativarNaEstacao(db: Banco, token: string | null | undefined, dados: unknown): Promise<void> {
  const e = await exigirEstacao(db, token);
  const parse = dadosPessoa.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Toque na sua foto.");
  const p = await presencaAqui(db, e.id, parse.data.usuarioId);
  if (!p) {
    await auditar(db, { usuarioId: parse.data.usuarioId, acao: "estacao.ativar", resultado: "recusado", alvoTipo: "estacao", alvoId: e.id, detalhes: { motivo: "nao_entrou" } });
    throw new ErroDeRegra("nao_autenticado", "Entre com seu código primeiro.");
  }
  await db.transaction().execute(async (trx) => {
    await travar(trx, e.id);
    await trx.updateTable("estacao_presenca").set({ ativa_desde: null }).where("estacao_id", "=", e.id).where("saiu_em", "is", null).execute();
    const r = await trx.updateTable("estacao_presenca").set({ ativa_desde: new Date() }).where("id", "=", p.id).where("saiu_em", "is", null).executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("nao_autenticado", "Entre com seu código primeiro.");
    await auditar(trx, { usuarioId: parse.data.usuarioId, acao: "estacao.ativar", resultado: "permitido", alvoTipo: "estacao", alvoId: e.id });
  });
}

/** Um toque no nome e "Sair" (intervalo, troca de estação). */
export async function sairDaEstacao(db: Banco, token: string | null | undefined, dados: unknown): Promise<void> {
  const e = await exigirEstacao(db, token);
  const parse = dadosPessoa.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Toque no seu nome.");
  await db.transaction().execute(async (trx) => {
    await travar(trx, e.id);
    const r = await trx
      .updateTable("estacao_presenca")
      .set({ saiu_em: new Date(), motivo_saida: "saiu", ativa_desde: null })
      .where("estacao_id", "=", e.id)
      .where("usuario_id", "=", parse.data.usuarioId)
      .where("saiu_em", "is", null)
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("nao_encontrado", "Esta pessoa não está nesta estação.");
    await ajustarAtivas(trx, [e.id]);
    await auditar(trx, { usuarioId: parse.data.usuarioId, acao: "estacao.sair", resultado: "permitido", alvoTipo: "estacao", alvoId: e.id });
  });
}

/**
 * Quem age pela estação: a pessoa ativa na tela, com o cargo com que entrou.
 * Se a ação for sensível, passe o código digitado; ele é conferido (e conta erro).
 */
export async function atorDaEstacao(db: Banco, token: string | null | undefined, opcoes: { codigo?: string; ip?: string | null } = {}): Promise<Ator | null> {
  const e = await estacaoDoToken(db, token);
  if (!e) return null;
  await fecharVencidas(db);
  const p = await db
    .selectFrom("estacao_presenca")
    .innerJoin("usuario", "usuario.id", "estacao_presenca.usuario_id")
    .select(["usuario.id", "usuario.nome", "usuario.login", "estacao_presenca.cargo"])
    .where("estacao_presenca.estacao_id", "=", e.id)
    .where("estacao_presenca.saiu_em", "is", null)
    .where("estacao_presenca.expira_em", ">", new Date())
    .where("estacao_presenca.ativa_desde", "is not", null)
    .where("usuario.ativo", "=", true)
    .executeTakeFirst();
  if (!p) return null;
  const vigentes = await cargosVigentes(db, p.id);
  // Cargo tirado depois que ela entrou: não age mais pela estação.
  if (!vigentes.some((c) => c.cargo === p.cargo && c.unidadeId === e.unidade_id)) return null;
  let codigoConfirmado = false;
  if (opcoes.codigo !== undefined) {
    await conferirCodigo(db, p.id, opcoes.codigo, { estacaoId: e.id, unidadeId: e.unidade_id, acao: "estacao.confirmar_codigo" });
    codigoConfirmado = true;
  }
  return {
    usuarioId: p.id,
    nome: p.nome,
    login: p.login,
    cargos: vigentes.map((c) => c.cargo),
    cargoAtivo: p.cargo,
    unidadeId: e.unidade_id,
    sessaoId: null,
    estacaoId: e.id,
    segundoFator: "nao_exige",
    segundoFatorConfigurado: false,
    codigoConfirmado,
    ip: opcoes.ip ?? null,
  };
}
