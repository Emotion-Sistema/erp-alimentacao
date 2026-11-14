import { createHash, randomBytes } from "node:crypto";
import type { Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { conferirSenha, hashParaTempoConstante } from "./senha";
import { pode, type Acao } from "./permissoes";

export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000; // um turno longo

/** Quem está fazendo a ação, sempre obtido no servidor a partir da sessão. */
export interface Ator {
  usuarioId: number;
  nome: string;
  login: string;
  cargos: string[];
  sessaoId: string;
  ip: string | null;
}

export const dadosEntrada = z.object({
  login: z.string().trim().min(1).max(100),
  senha: z.string().min(1).max(200),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

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
    .select(["id", "nome", "login", "senha_hash", "ativo"])
    .where((eb) => eb(eb.fn("lower", ["login"]), "=", login.toLowerCase()))
    .executeTakeFirst();

  const hashGravado = usuario?.senha_hash ?? (await hashParaTempoConstante());
  const senhaCerta = await conferirSenha(hashGravado, senha);

  if (!usuario || !usuario.senha_hash || !usuario.ativo || !senhaCerta) {
    await auditar(db, {
      usuarioId: usuario?.id ?? null,
      acao: "sessao.entrar",
      resultado: "falhou",
      detalhes: { login, motivo: !usuario ? "login_inexistente" : !usuario.ativo ? "desligado" : "senha" },
      ip: origem.ip,
    });
    // Mesma mensagem em todos os casos: não revela se o usuário existe.
    throw new ErroDeRegra("nao_autenticado", "Usuário ou senha incorretos.");
  }

  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  const sessaoId = hashToken(token);
  await db
    .insertInto("sessao")
    .values({ id: sessaoId, usuario_id: usuario.id, expira_em: expiraEm, ip: origem.ip, agente: origem.agente?.slice(0, 300) ?? null })
    .execute();
  await auditar(db, { usuarioId: usuario.id, acao: "sessao.entrar", resultado: "permitido", ip: origem.ip });

  const ator = await atorDaSessao(db, token, origem.ip);
  if (!ator) throw new Error("Sessão recém-criada não encontrada.");
  return { token, expiraEm, ator };
}

/** Devolve o ator de um token válido, ou null (expirado, revogado, usuário desligado). */
export async function atorDaSessao(db: Banco, token: string | undefined | null, ip: string | null = null): Promise<Ator | null> {
  if (!token || token.length > 200) return null;
  const sessaoId = hashToken(token);
  const linha = await db
    .selectFrom("sessao")
    .innerJoin("usuario", "usuario.id", "sessao.usuario_id")
    .select(["sessao.id as sessaoId", "usuario.id as usuarioId", "usuario.nome", "usuario.login"])
    .where("sessao.id", "=", sessaoId)
    .where("sessao.revogada_em", "is", null)
    .where("sessao.expira_em", ">", new Date())
    .where("usuario.ativo", "=", true)
    .executeTakeFirst();
  if (!linha) return null;
  const cargos = await db
    .selectFrom("usuario_perfil")
    .select("perfil_codigo")
    .where("usuario_id", "=", linha.usuarioId)
    .execute();
  return { ...linha, cargos: cargos.map((c) => c.perfil_codigo), ip };
}

export async function sair(db: Banco, ator: Ator): Promise<void> {
  await db.updateTable("sessao").set({ revogada_em: new Date() }).where("id", "=", ator.sessaoId).execute();
  await auditar(db, { usuarioId: ator.usuarioId, acao: "sessao.sair", resultado: "permitido", ip: ator.ip });
}

/**
 * Confere a permissão no servidor. Sem permissão: registra a recusa na auditoria e lança erro.
 * Toda ação protegida começa por aqui.
 */
export async function exigir(db: Banco, ator: Ator | null, acao: Acao, alvo?: { tipo: string; id?: string | number }): Promise<Ator> {
  if (!ator) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  if (!pode(ator.cargos, acao)) {
    await auditar(db, {
      usuarioId: ator.usuarioId,
      acao,
      resultado: "recusado",
      alvoTipo: alvo?.tipo,
      alvoId: alvo?.id,
      detalhes: { cargos: ator.cargos },
      ip: ator.ip,
    });
    throw new ErroDeRegra("sem_permissao", "Seu cargo não permite esta ação.");
  }
  return ator;
}
