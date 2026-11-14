import type { Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { CARGOS, podeAtribuir } from "./permissoes";
import { hashSenha, SENHA_MINIMO } from "./senha";
import { cargosVigentes, exigir, type Ator } from "./sessao";

export interface UsuarioResumo {
  id: number;
  nome: string;
  login: string;
  ativo: boolean;
  cargos: string[];
  codigoDefinido: boolean;
  codigoBloqueado: boolean;
  segundoFatorConfigurado: boolean;
}

export async function listarUsuarios(db: Banco, ator: Ator | null): Promise<UsuarioResumo[]> {
  await exigir(db, ator, "usuarios.ver", { tipo: "usuario" });
  const usuarios = await db
    .selectFrom("usuario")
    .select(["id", "nome", "login", "ativo", "codigo_hash", "codigo_bloqueado_em", "totp_segredo"])
    .orderBy("nome")
    .execute();
  const perfis = await db.selectFrom("usuario_perfil").select(["usuario_id", "perfil_codigo"]).where("removido_em", "is", null).execute();
  // Nenhum hash ou segredo sai daqui: só se existe ou não.
  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    login: u.login,
    ativo: u.ativo,
    cargos: perfis.filter((p) => p.usuario_id === u.id).map((p) => p.perfil_codigo),
    codigoDefinido: !!u.codigo_hash,
    codigoBloqueado: !!u.codigo_bloqueado_em,
    segundoFatorConfigurado: !!u.totp_segredo,
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
  unidadeId: z.number().int().positive().optional(),
});

/** Recusa registrada na auditoria, com a mesma forma para todas as operações de pessoas. */
async function recusar(db: Banco, quem: Ator, operacao: string, alvoId: number | undefined, motivo: string, mensagem: string): Promise<never> {
  await auditar(db, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "recusado", alvoTipo: "usuario", alvoId, detalhes: { operacao, motivo }, ip: quem.ip });
  throw new ErroDeRegra("sem_permissao", mensagem);
}

export async function criarUsuario(db: Banco, ator: Ator | null, dados: unknown): Promise<UsuarioResumo> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario" });
  const parse = dadosNovoUsuario.safeParse(dados);
  if (!parse.success) {
    throw new ErroDeRegra("dados_invalidos", parse.error.issues.map((i) => i.message).join(" "));
  }
  const d = parse.data;
  // Cada cargo só pode ser dado por quem está na lista QUEM_ATRIBUI (ex.: gerente geral
  // não cria financeiro, dono nem administrador).
  if (!podeAtribuir(quem.cargoAtivo, [d.cargo])) await recusar(db, quem, "criar", undefined, `cargo_${d.cargo}`, "Seu cargo não pode criar um usuário com esse cargo.");
  const unidadeId = d.unidadeId ?? quem.unidadeId;
  if (!unidadeId) throw new ErroDeRegra("dados_invalidos", "Informe a unidade.");
  const senhaHash = await hashSenha(d.senha);
  try {
    return await db.transaction().execute(async (trx) => {
      const u = await trx
        .insertInto("usuario")
        .values({ nome: d.nome, login: d.login, senha_hash: senhaHash })
        .returning(["id", "nome", "login", "ativo"])
        .executeTakeFirstOrThrow();
      await trx.insertInto("usuario_perfil").values({ usuario_id: u.id, perfil_codigo: d.cargo, unidade_id: unidadeId, criado_por: quem.usuarioId }).execute();
      await auditar(trx, {
        usuarioId: quem.usuarioId,
        acao: "usuarios.gerenciar",
        resultado: "permitido",
        alvoTipo: "usuario",
        alvoId: u.id,
        detalhes: { operacao: "criar", login: d.login, cargo: d.cargo },
        ip: quem.ip,
      });
      return { ...u, cargos: [d.cargo], codigoDefinido: false, codigoBloqueado: false, segundoFatorConfigurado: false };
    });
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    if (codigo === "23505") throw new ErroDeRegra("conflito", "Já existe um usuário com esse login.");
    if (codigo === "23503") throw new ErroDeRegra("dados_invalidos", "Unidade não encontrada.");
    throw e;
  }
}

/**
 * Para mexer em alguém, quem age precisa poder atribuir TODOS os cargos atuais da pessoa
 * (e o cargo mexido). Ninguém mexe nos próprios cargos.
 */
async function conferirAlvo(db: Banco, quem: Ator, usuarioId: number, operacao: string, cargoMexido?: string) {
  if (usuarioId === quem.usuarioId) await recusar(db, quem, operacao, usuarioId, "proprio_usuario", "Você não pode mexer nos seus próprios cargos nem se desligar.");
  const alvo = await db.selectFrom("usuario").select(["id", "ativo"]).where("id", "=", usuarioId).executeTakeFirst();
  if (!alvo) throw new ErroDeRegra("nao_encontrado", "Usuário não encontrado.");
  const cargosAlvo = (await cargosVigentes(db, usuarioId)).map((c) => c.cargo);
  if (!podeAtribuir(quem.cargoAtivo, [...cargosAlvo, ...(cargoMexido ? [cargoMexido] : [])])) {
    await recusar(db, quem, operacao, usuarioId, "cargo_acima", "Seu cargo não pode mexer nesse usuário ou nesse cargo.");
  }
  return { ativo: alvo.ativo, cargosAlvo };
}

const dadosCargo = z.object({ cargo: z.enum(CARGOS), unidadeId: z.number().int().positive().optional() });

/** Dá mais um cargo a alguém (uma pessoa pode ter mais de um). */
export async function darCargo(db: Banco, ator: Ator | null, usuarioId: number, dados: unknown): Promise<void> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario", id: usuarioId });
  const parse = dadosCargo.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Cargo inválido.");
  const { cargo } = parse.data;
  const unidadeId = parse.data.unidadeId ?? quem.unidadeId;
  if (!unidadeId) throw new ErroDeRegra("dados_invalidos", "Informe a unidade.");
  const alvo = await conferirAlvo(db, quem, usuarioId, "dar_cargo", cargo);
  if (!alvo.ativo) throw new ErroDeRegra("conflito", "Este usuário está desligado.");
  try {
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("usuario_perfil").values({ usuario_id: usuarioId, perfil_codigo: cargo, unidade_id: unidadeId, criado_por: quem.usuarioId }).execute();
      await auditar(trx, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { operacao: "dar_cargo", cargo }, ip: quem.ip });
    });
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    if (codigo === "23505") throw new ErroDeRegra("conflito", "Essa pessoa já tem esse cargo.");
    if (codigo === "23503") throw new ErroDeRegra("dados_invalidos", "Unidade não encontrada.");
    throw e;
  }
}

/** Tira um cargo (fica no histórico com data e autor). O último cargo não sai: use desligar. */
export async function tirarCargo(db: Banco, ator: Ator | null, usuarioId: number, dados: unknown): Promise<void> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario", id: usuarioId });
  const parse = dadosCargo.safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Cargo inválido.");
  const { cargo } = parse.data;
  const alvo = await conferirAlvo(db, quem, usuarioId, "tirar_cargo", cargo);
  if (!alvo.cargosAlvo.includes(cargo)) throw new ErroDeRegra("conflito", "Essa pessoa não tem esse cargo.");
  if (alvo.cargosAlvo.length === 1) throw new ErroDeRegra("conflito", "Este é o único cargo da pessoa. Para tirar o acesso, desligue o usuário.");
  await db.transaction().execute(async (trx) => {
    const agora = new Date();
    await trx
      .updateTable("usuario_perfil")
      .set({ removido_em: agora, removido_por: quem.usuarioId })
      .where("usuario_id", "=", usuarioId)
      .where("perfil_codigo", "=", cargo)
      .where("removido_em", "is", null)
      .execute();
    // Se ela estava na estação com esse cargo, sai na hora.
    await trx
      .updateTable("estacao_presenca")
      .set({ saiu_em: agora, motivo_saida: "saiu", ativa_desde: null })
      .where("usuario_id", "=", usuarioId)
      .where("cargo", "=", cargo)
      .where("saiu_em", "is", null)
      .execute();
    await auditar(trx, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { operacao: "tirar_cargo", cargo }, ip: quem.ip });
  });
}

/**
 * Desliga o funcionário: corta o acesso na hora (sessões abertas revogadas e saída de
 * qualquer estação) e registra. Nada é apagado.
 */
export async function desligarUsuario(db: Banco, ator: Ator | null, usuarioId: number): Promise<void> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario", id: usuarioId });
  await conferirAlvo(db, quem, usuarioId, "desligar");
  await db.transaction().execute(async (trx) => {
    const agora = new Date();
    const r = await trx.updateTable("usuario").set({ ativo: false, desligado_em: agora }).where("id", "=", usuarioId).where("ativo", "=", true).executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("conflito", "Este usuário já está desligado.");
    await trx.updateTable("sessao").set({ revogada_em: agora }).where("usuario_id", "=", usuarioId).where("revogada_em", "is", null).execute();
    await trx
      .updateTable("estacao_presenca")
      .set({ saiu_em: agora, motivo_saida: "desligado", ativa_desde: null })
      .where("usuario_id", "=", usuarioId)
      .where("saiu_em", "is", null)
      .execute();
    await auditar(trx, { usuarioId: quem.usuarioId, acao: "usuarios.gerenciar", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, detalhes: { operacao: "desligar" }, ip: quem.ip });
  });
}
