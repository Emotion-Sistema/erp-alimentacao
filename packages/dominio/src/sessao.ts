import { createHash, randomBytes } from "node:crypto";
import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { conferirSenha, hashParaTempoConstante } from "./senha";
import { CARGOS, exigeSegundoFator, pode, type Acao } from "./permissoes";

export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000; // um turno longo
export const SENHA_MAX_ERROS = 5;
export const SENHA_BLOQUEIO_MIN = 15;

/** Ações que, feitas na estação da cozinha, pedem o código pessoal de novo (RC-12, item 7). */
export const ACOES_QUE_PEDEM_CODIGO: readonly Acao[] = ["producao.sensivel"];

/** Quem está fazendo a ação, sempre obtido no servidor (sessão ou estação). */
export interface Ator {
  usuarioId: number;
  nome: string;
  login: string;
  /** Todos os cargos vigentes da pessoa. */
  cargos: string[];
  /** O cargo com que ela está agindo agora. A permissão vem SÓ dele. */
  cargoAtivo: string | null;
  unidadeId: number | null;
  sessaoId: string | null;
  estacaoId: number | null;
  segundoFator: "nao_exige" | "pendente" | "ok";
  segundoFatorConfigurado: boolean;
  /** Na estação: a pessoa redigitou o código nesta ação. */
  codigoConfirmado: boolean;
  ip: string | null;
}

export const dadosEntrada = z.object({
  login: z.string().trim().min(1).max(100),
  senha: z.string().min(1).max(200),
});

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const novoToken = () => randomBytes(32).toString("base64url");

/** Cargos vigentes (não removidos), na ordem do catálogo, com a unidade de cada um. */
export async function cargosVigentes(db: Banco, usuarioId: number): Promise<{ cargo: string; unidadeId: number }[]> {
  const linhas = await db
    .selectFrom("usuario_perfil")
    .select(["perfil_codigo", "unidade_id"])
    .where("usuario_id", "=", usuarioId)
    .where("removido_em", "is", null)
    .execute();
  const ordem = (c: string) => {
    const i = (CARGOS as readonly string[]).indexOf(c);
    return i < 0 ? 999 : i;
  };
  return linhas.map((l) => ({ cargo: l.perfil_codigo, unidadeId: l.unidade_id })).sort((a, b) => ordem(a.cargo) - ordem(b.cargo));
}

export async function entrar(
  db: Banco,
  dados: unknown,
  origem: { ip: string | null; agente: string | null },
): Promise<{ token: string; expiraEm: Date; ator: Ator }> {
  const parse = dadosEntrada.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Informe usuário e senha.");
  const { login, senha } = parse.data;

  const usuario = await db
    .selectFrom("usuario")
    .select(["id", "nome", "login", "senha_hash", "ativo", "senha_bloqueada_ate"])
    .where((eb) => eb(eb.fn("lower", ["login"]), "=", login.toLowerCase()))
    .executeTakeFirst();

  const mensagemBloqueio = `Muitas tentativas erradas. Tente de novo em ${SENHA_BLOQUEIO_MIN} minutos ou peça ajuda ao gerente.`;
  const contavel = !!(usuario?.ativo && usuario.senha_hash);

  // Reserva a tentativa ANTES de conferir a senha, de forma atômica: com rajada de pedidos
  // simultâneos, no máximo SENHA_MAX_ERROS conferências acontecem até o bloqueio.
  if (contavel) {
    const reserva = await sql<{ id: number }>`
      UPDATE usuario SET senha_erros = senha_erros + 1
      WHERE id = ${usuario!.id} AND senha_erros < ${SENHA_MAX_ERROS}
        AND (senha_bloqueada_ate IS NULL OR senha_bloqueada_ate <= now())
      RETURNING id`.execute(db);
    if (reserva.rows.length === 0) {
      await auditar(db, { usuarioId: usuario!.id, acao: "sessao.entrar", resultado: "recusado", detalhes: { login: usuario!.login, motivo: "bloqueado" }, ip: origem.ip });
      throw new ErroDeRegra("bloqueado", mensagemBloqueio);
    }
  }

  const hashGravado = usuario?.senha_hash ?? (await hashParaTempoConstante());
  const senhaCerta = await conferirSenha(hashGravado, senha);

  if (!usuario || !usuario.senha_hash || !usuario.ativo || !senhaCerta) {
    let bloqueou = false;
    if (contavel) {
      // Chegou ao limite: bloqueia por 15 minutos (uma vez só, mesmo com rajada).
      const r = await sql<{ id: number }>`
        UPDATE usuario SET senha_erros = 0, senha_bloqueada_ate = now() + make_interval(mins => ${SENHA_BLOQUEIO_MIN})
        WHERE id = ${usuario!.id} AND senha_erros >= ${SENHA_MAX_ERROS}
        RETURNING id`.execute(db);
      bloqueou = r.rows.length > 0;
    }
    await auditar(db, {
      usuarioId: usuario?.id ?? null,
      acao: "sessao.entrar",
      resultado: "falhou",
      // Login inexistente: não grava o texto digitado (pode ser uma senha no campo errado).
      detalhes: usuario
        ? { login: usuario.login, motivo: !usuario.ativo ? "desligado" : "senha", bloqueou }
        : { motivo: "login_inexistente", tamanho: login.length },
      ip: origem.ip,
    });
    if (bloqueou) throw new ErroDeRegra("bloqueado", mensagemBloqueio);
    // Mesma mensagem nos outros casos: não revela se o usuário existe.
    throw new ErroDeRegra("nao_autenticado", "Usuário ou senha incorretos.");
  }

  // Senha certa: zera a contagem, mas só se ninguém bloqueou no meio do caminho.
  const liberado = await sql<{ id: number }>`
    UPDATE usuario SET senha_erros = 0
    WHERE id = ${usuario.id} AND (senha_bloqueada_ate IS NULL OR senha_bloqueada_ate <= now())
    RETURNING id`.execute(db);
  if (liberado.rows.length === 0) {
    await auditar(db, { usuarioId: usuario.id, acao: "sessao.entrar", resultado: "recusado", detalhes: { login: usuario.login, motivo: "bloqueado" }, ip: origem.ip });
    throw new ErroDeRegra("bloqueado", mensagemBloqueio);
  }

  const cargos = await cargosVigentes(db, usuario.id);
  const token = novoToken();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("sessao")
      .values({
        id: hashToken(token),
        usuario_id: usuario.id,
        expira_em: expiraEm,
        ip: origem.ip,
        agente: origem.agente?.slice(0, 300) ?? null,
        cargo_ativo: cargos[0]?.cargo ?? null,
      })
      .execute();
    await auditar(trx, { usuarioId: usuario.id, acao: "sessao.entrar", resultado: "permitido", detalhes: { cargoAtivo: cargos[0]?.cargo ?? null }, ip: origem.ip });
  });

  const ator = await atorDaSessao(db, token, origem.ip);
  if (!ator) throw new Error("Sessão recém-criada não encontrada.");
  return { token, expiraEm, ator };
}

/** Devolve o ator de um token válido, ou null (expirado, revogado, usuário desligado). */
export async function atorDaSessao(db: Banco, token: string | undefined | null, ip: string | null = null): Promise<Ator | null> {
  if (!token || token.length > 200) return null;
  const linha = await db
    .selectFrom("sessao")
    .innerJoin("usuario", "usuario.id", "sessao.usuario_id")
    .select([
      "sessao.id as sessaoId",
      "sessao.cargo_ativo",
      "sessao.segundo_fator_ok",
      "usuario.id as usuarioId",
      "usuario.nome",
      "usuario.login",
      "usuario.totp_segredo",
    ])
    .where("sessao.id", "=", hashToken(token))
    .where("sessao.revogada_em", "is", null)
    .where("sessao.expira_em", ">", new Date())
    .where("usuario.ativo", "=", true)
    .executeTakeFirst();
  if (!linha) return null;
  const vigentes = await cargosVigentes(db, linha.usuarioId);
  const cargos = vigentes.map((c) => c.cargo);
  // Cargo tirado enquanto a pessoa estava dentro: fica sem poder até escolher outro.
  const ativo = vigentes.find((c) => c.cargo === linha.cargo_ativo) ?? null;
  return {
    usuarioId: linha.usuarioId,
    nome: linha.nome,
    login: linha.login,
    cargos,
    cargoAtivo: ativo?.cargo ?? null,
    unidadeId: ativo?.unidadeId ?? vigentes[0]?.unidadeId ?? null,
    sessaoId: linha.sessaoId,
    estacaoId: null,
    segundoFator: exigeSegundoFator(cargos) ? (linha.segundo_fator_ok ? "ok" : "pendente") : "nao_exige",
    segundoFatorConfigurado: !!linha.totp_segredo,
    codigoConfirmado: false,
    ip,
  };
}

export async function sair(db: Banco, ator: Ator): Promise<void> {
  if (!ator.sessaoId) return;
  await db.updateTable("sessao").set({ revogada_em: new Date() }).where("id", "=", ator.sessaoId).execute();
  await auditar(db, { usuarioId: ator.usuarioId, acao: "sessao.sair", resultado: "permitido", ip: ator.ip });
}

/** Troca o cargo com que a pessoa está agindo (só entre os cargos dela). Fica registrado. */
export async function trocarCargoAtivo(db: Banco, ator: Ator | null, dados: unknown): Promise<Ator> {
  if (!ator?.sessaoId) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  const cargo = z.object({ cargo: z.string().max(40) }).safeParse(dados);
  if (!cargo.success) throw new ErroDeRegra("dados_invalidos", "Informe o cargo.");
  if (ator.segundoFator === "pendente") throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
  if (!ator.cargos.includes(cargo.data.cargo)) {
    await auditar(db, { usuarioId: ator.usuarioId, acao: "sessao.trocar_cargo", resultado: "recusado", detalhes: { cargo: cargo.data.cargo }, ip: ator.ip });
    throw new ErroDeRegra("sem_permissao", "Você não tem esse cargo.");
  }
  await db.updateTable("sessao").set({ cargo_ativo: cargo.data.cargo }).where("id", "=", ator.sessaoId).execute();
  await auditar(db, { usuarioId: ator.usuarioId, acao: "sessao.trocar_cargo", resultado: "permitido", detalhes: { de: ator.cargoAtivo, para: cargo.data.cargo }, ip: ator.ip });
  return { ...ator, cargoAtivo: cargo.data.cargo };
}

/**
 * Confere a permissão no servidor. Sem permissão: registra a recusa na auditoria e lança erro.
 * Toda ação protegida começa por aqui. Ordem: tem sessão -> segundo fator -> cargo ativo
 * permite -> (na estação) código redigitado, se a ação pedir.
 */
export async function exigir(db: Banco, ator: Ator | null, acao: Acao, alvo?: { tipo: string; id?: string | number }): Promise<Ator> {
  const recusar = async (motivo: string, detalhes: Record<string, unknown> = {}) =>
    auditar(db, {
      usuarioId: ator?.usuarioId ?? null,
      acao,
      resultado: "recusado",
      alvoTipo: alvo?.tipo,
      alvoId: alvo?.id,
      detalhes: { motivo, ...detalhes },
      ip: ator?.ip ?? null,
    });
  if (!ator) {
    // Limite de requisições (E06) impede que isso vire enchente de registros.
    await recusar("sem_sessao");
    throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  }
  if (ator.segundoFator === "pendente") {
    await recusar("segundo_fator_pendente");
    throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
  }
  if (!pode(ator.cargoAtivo, acao)) {
    await recusar("cargo", { cargoAtivo: ator.cargoAtivo, cargos: ator.cargos, estacaoId: ator.estacaoId });
    throw new ErroDeRegra("sem_permissao", "Seu cargo não permite esta ação.");
  }
  if (ator.estacaoId !== null && ACOES_QUE_PEDEM_CODIGO.includes(acao) && !ator.codigoConfirmado) {
    await recusar("codigo_nao_confirmado", { estacaoId: ator.estacaoId });
    throw new ErroDeRegra("confirmar_codigo", "Digite seu código para confirmar.");
  }
  return ator;
}
