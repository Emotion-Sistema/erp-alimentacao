/**
 * Primeiro acesso de um servidor novo (homologação na E06; produção na E23): cria a empresa,
 * a primeira unidade com os turnos da equipe e o login do dono. Só funciona com o banco
 * VAZIO de pessoas: depois disso, todo cadastro passa pela tela, com permissão e auditoria.
 * Roda no terminal do servidor (scripts/primeiro-acesso.ts); a senha é digitada lá e nunca
 * passa por chat, Git ou log.
 */
import { sql, type Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { dadosNovoUsuario } from "./usuarios";
import { hashSenha } from "./senha";

/** Turnos da equipe (resposta do responsável, 14/11/2026; decisão 0013). */
export const TURNOS_PADRAO = [
  { nome: "Turno 1", inicio: "08:00", fim: "15:30" },
  { nome: "Turno 2", inicio: "15:30", fim: "23:30" },
] as const;

/** Setores iniciais (os mesmos dos dados de exemplo); mudam com os cadastros da E07. */
export const SETORES_PADRAO = ["Cozinha", "Cafeteria", "Salão", "Caixa"] as const;

export const dadosPrimeiroAcesso = z.object({
  empresa: z.string().trim().min(2).max(120),
  unidade: z.string().trim().min(2).max(120),
  nome: dadosNovoUsuario.shape.nome,
  login: dadosNovoUsuario.shape.login,
  senha: dadosNovoUsuario.shape.senha,
});

export async function prepararPrimeiroAcesso(db: Banco, dados: unknown): Promise<{ usuarioId: number; unidadeId: number }> {
  const parse = dadosPrimeiroAcesso.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", parse.error.issues.map((i) => i.message).join(" "));
  const d = parse.data;
  const senhaHash = await hashSenha(d.senha);
  return db.transaction().execute(async (trx) => {
    // Trava a tabela de pessoas: dois primeiros acessos ao mesmo tempo não criam dois donos.
    await sql`LOCK TABLE usuario IN SHARE ROW EXCLUSIVE MODE`.execute(trx);
    const jaTem = await trx.selectFrom("usuario").select("id").limit(1).executeTakeFirst();
    if (jaTem) throw new ErroDeRegra("conflito", "Este servidor já tem pessoas cadastradas. Cadastre novas pessoas pela tela Funcionários.");
    const empresa = await trx.insertInto("empresa").values({ razao_social: d.empresa, nome_fantasia: d.empresa, cnpj: null }).returning("id").executeTakeFirstOrThrow();
    const unidade = await trx.insertInto("unidade").values({ empresa_id: empresa.id, nome: d.unidade }).returning("id").executeTakeFirstOrThrow();
    await trx
      .insertInto("turno")
      .values(TURNOS_PADRAO.map((t) => ({ unidade_id: unidade.id, ...t })))
      .execute();
    await trx
      .insertInto("setor")
      .values(SETORES_PADRAO.map((nome) => ({ unidade_id: unidade.id, nome })))
      .execute();
    const u = await trx.insertInto("usuario").values({ nome: d.nome, login: d.login, senha_hash: senhaHash }).returning("id").executeTakeFirstOrThrow();
    await trx.insertInto("usuario_perfil").values({ usuario_id: u.id, perfil_codigo: "dono", unidade_id: unidade.id }).execute();
    await auditar(trx, {
      usuarioId: null,
      acao: "usuarios.gerenciar",
      resultado: "permitido",
      alvoTipo: "usuario",
      alvoId: u.id,
      detalhes: { operacao: "primeiro_acesso", login: d.login, cargo: "dono", origem: "terminal do servidor" },
    });
    return { usuarioId: u.id, unidadeId: unidade.id };
  });
}
