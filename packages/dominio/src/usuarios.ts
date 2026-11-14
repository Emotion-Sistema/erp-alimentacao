import type { Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { CARGOS } from "./permissoes";
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
  // Ninguém cria um cargo com mais poder que os seus (ex.: gerente geral não cria dono).
  if (["dono", "administrador"].includes(d.cargo) && !quem.cargos.some((c) => c === "dono" || c === "administrador")) {
    await auditar(db, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "recusado", alvoTipo: "usuario", detalhes: { cargo: d.cargo }, ip: quem.ip });
    throw new ErroDeRegra("sem_permissao", "Só o dono ou o administrador cria esse cargo.");
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
