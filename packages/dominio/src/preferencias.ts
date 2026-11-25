import type { Banco } from "@erp/banco";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { LETRAS, PREFERENCIAS_PADRAO, TEMAS, type Preferencias } from "./preferencias-comum";
import { hashToken, type Ator } from "./sessao";

/**
 * Tema e letra de quem está com a sessão aberta neste aparelho (decisão 0030). Sem sessão válida
 * (tela de entrada, sessão vencida ou revogada, pessoa desligada): o padrão, claro e letra normal.
 * Só lê; não confere permissão porque não revela nada além da escolha da própria pessoa.
 */
export async function preferenciasDaSessao(db: Banco, token: string | undefined | null): Promise<Preferencias> {
  if (!token || token.length > 200) return PREFERENCIAS_PADRAO;
  const linha = await db
    .selectFrom("sessao")
    .innerJoin("usuario", "usuario.id", "sessao.usuario_id")
    .select(["usuario.tema", "usuario.letra"])
    .where("sessao.id", "=", hashToken(token))
    .where("sessao.revogada_em", "is", null)
    .where("sessao.expira_em", ">", new Date())
    .where("usuario.ativo", "=", true)
    .executeTakeFirst();
  return linha ? { tema: linha.tema, letra: linha.letra } : PREFERENCIAS_PADRAO;
}

const esquema = z
  .object({ tema: z.enum(TEMAS).optional(), letra: z.enum(LETRAS).optional() })
  .strict()
  .refine((d) => d.tema !== undefined || d.letra !== undefined);

/**
 * A pessoa muda o próprio tema ou a própria letra. Vale para qualquer cargo (é só a aparência da
 * tela dela); exige sessão aberta e o segundo fator em dia. Fica na auditoria, com o antes e o depois.
 */
export async function mudarPreferencias(db: Banco, ator: Ator | null, dados: unknown): Promise<Preferencias> {
  if (!ator?.sessaoId) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  if (ator.segundoFator === "pendente") throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
  const lido = esquema.safeParse(dados);
  if (!lido.success) throw new ErroDeRegra("dados_invalidos", "Escolha tema claro ou escuro, ou letra normal ou grande.");
  const antes = await db.selectFrom("usuario").select(["tema", "letra"]).where("id", "=", ator.usuarioId).executeTakeFirstOrThrow();
  const depois: Preferencias = { tema: lido.data.tema ?? antes.tema, letra: lido.data.letra ?? antes.letra };
  await db.updateTable("usuario").set(depois).where("id", "=", ator.usuarioId).execute();
  await auditar(db, { usuarioId: ator.usuarioId, acao: "sessao.preferencias", resultado: "permitido", detalhes: { de: antes, para: depois }, ip: ator.ip });
  return depois;
}
