import type { Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { CARGOS, cabeNoPoderDe } from "./permissoes";
import { hashSenha, SENHA_MINIMO } from "./senha";
import { exigir, type Ator } from "./sessao";

export interface UsuarioResumo {
  id: number;
  nome: string;
  login: string;
  ativo: boolean;
  cargos: string[];
}

export async function listarUsuarios(db: Banco, ator: Ator | null): Promise<UsuarioResumo[]> {
  await exigir(db, ator, "usuarios.ver", { tipo: "usuario" });
  const usuarios = await db.selectFrom("usuario").select(["id", "nome", "login", "ativo"]).orderBy("nome").execute();
  const perfis = await db.selectFrom("usuario_perfil").select(["usuario_id", "perfil_codigo"]).execute();
  return usuarios.map((u) => ({
    ...u,
    cargos: perfis.filter((p) => p.usuario_id === u.id).map((p) => p.perfil_codigo),
  }));
}

export const dadosNovoUsuario = z.object({
  nome: z.string().trim().min(2).max(120),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado."),
  senha: z.string().min(SENHA_MINIMO, `A senha precisa de pelo menos ${SENHA_MINIMO} caracteres.`).max(200),
  cargo: z.enum(CARGOS),
  unidadeId: z.number().int().positive(),
});

export async function criarUsuario(db: Banco, ator: Ator | null, dados: unknown): Promise<UsuarioResumo> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario" });
  const parse = dadosNovoUsuario.safeParse(dados);
  if (!parse.success) {
    throw new ErroDeRegra("dados_invalidos", parse.error.issues.map((i) => i.message).join(" "));
  }
  const d = parse.data;
  // Ninguém dá a outro um cargo com poder que não tem (ex.: gerente geral não cria
  // financeiro, dono nem administrador).
  if (!cabeNoPoderDe(quem.cargos, [d.cargo])) {
    await auditar(db, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "recusado", alvoTipo: "usuario", detalhes: { operacao: "criar", cargo: d.cargo }, ip: quem.ip });
    throw new ErroDeRegra("sem_permissao", "Seu cargo não pode criar um usuário com esse cargo.");
  }
  const senhaHash = await hashSenha(d.senha);
  try {
    return await db.transaction().execute(async (trx) => {
      const u = await trx
        .insertInto("usuario")
        .values({ nome: d.nome, login: d.login, senha_hash: senhaHash })
        .returning(["id", "nome", "login", "ativo"])
        .executeTakeFirstOrThrow();
      await trx.insertInto("usuario_perfil").values({ usuario_id: u.id, perfil_codigo: d.cargo, unidade_id: d.unidadeId }).execute();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "usuarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "usuario",
        alvoId: u.id,
        detalhes: { operacao: "criar", login: d.login, cargo: d.cargo },
        ip: quem.ip,
      });
      return { ...u, cargos: [d.cargo] };
    });
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    if (codigo === "23505") throw new ErroDeRegra("conflito", "Já existe um usuário com esse login.");
    if (codigo === "23503") throw new ErroDeRegra("dados_invalidos", "Unidade não encontrada.");
    throw e;
  }
}

/**
 * Desliga o funcionário: corta o acesso na hora (todas as sessões abertas são
 * revogadas) e registra. Nada é apagado.
 */
export async function desligarUsuario(db: Banco, ator: Ator | null, usuarioId: number): Promise<void> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario", id: usuarioId });
  const recusar = async (motivo: string, mensagem: string) => {
    await auditar(db, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "recusado", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { operacao: "desligar", motivo }, ip: quem.ip });
    throw new ErroDeRegra("sem_permissao", mensagem);
  };
  if (usuarioId === quem.usuarioId) await recusar("proprio_usuario", "Você não pode desligar a si mesmo.");
  const alvo = await db.selectFrom("usuario").select(["id", "ativo"]).where("id", "=", usuarioId).executeTakeFirst();
  if (!alvo) throw new ErroDeRegra("nao_encontrado", "Usuário não encontrado.");
  const cargosAlvo = (await db.selectFrom("usuario_perfil").select("perfil_codigo").where("usuario_id", "=", usuarioId).execute()).map((c) => c.perfil_codigo);
  if (!cabeNoPoderDe(quem.cargos, cargosAlvo)) await recusar("cargo_acima", "Seu cargo não pode desligar esse usuário.");
  await db.transaction().execute(async (trx) => {
    const agora = new Date();
    const r = await trx.updateTable("usuario").set({ ativo: false, desligado_em: agora }).where("id", "=", usuarioId).where("ativo", "=", true).executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("conflito", "Este usuário já está desligado.");
    await trx.updateTable("sessao").set({ revogada_em: agora }).where("usuario_id", "=", usuarioId).where("revogada_em", "is", null).execute();
    await auditar(trx, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { operacao: "desligar" }, ip: quem.ip });
  });
}
