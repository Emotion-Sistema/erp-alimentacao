/**
 * Turno de quem entrou (decisão 0013, item 1). Cada pessoa tem o próprio login, mesmo no
 * celular dividido: no fim do turno ela sai e a próxima entra. A pessoa fica no turno em
 * que entrou; se esquecer de sair, para de receber avisos e a tela pede para sair. Num
 * imprevisto, toca em "Continuo no turno" (vale até o fim do turno em andamento; registrado).
 */
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { z } from "zod";
import { atorDaSessao, entrar, hashToken, type Ator } from "./sessao";

export type SituacaoDoTurno = {
  /** Está no turno agora (recebe avisos do turno). */
  noTurno: boolean;
  /** Turno em andamento na unidade, se houver. */
  turnoAtual: { nome: string; fim: Date } | null;
  /** O turno em que a pessoa entrou já acabou: a tela pede para ela sair. */
  turnoAcabou: boolean;
  /** Até quando ainda recebe avisos (fim do turno + margem de troca), se estiver em turno. */
  recebeAte: Date | null;
  /** Fora do turno com turno em andamento: pode tocar em "Continuo no turno". */
  podeContinuar: boolean;
};

function exigirSessao(ator: Ator | null): asserts ator is Ator & { sessaoId: string } {
  if (!ator?.sessaoId) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  if (ator.segundoFator === "pendente") throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
}

export async function situacaoDoTurno(db: Banco, ator: Ator | null): Promise<SituacaoDoTurno> {
  exigirSessao(ator);
  if (!ator.unidadeId) return { noTurno: false, turnoAtual: null, turnoAcabou: false, recebeAte: null, podeContinuar: false };
  const r = await sql<{ noTurno: boolean; fimDele: Date | null; margem: string; recebeAte: Date | null; nome: string | null; fim: Date | null }>`
    SELECT pessoa_no_turno(${ator.unidadeId}, s.criada_em, s.turno_ate, now()) AS "noTurno",
           greatest(fim_do_turno_da_entrada(${ator.unidadeId}, s.criada_em), s.turno_ate) AS "fimDele",
           greatest(fim_do_turno_da_entrada(${ator.unidadeId}, s.criada_em), s.turno_ate) + u.margem_troca_turno AS "recebeAte",
           u.margem_troca_turno::text AS margem,
           t.nome, t.fim
    FROM sessao s
    JOIN unidade u ON u.id = ${ator.unidadeId}
    LEFT JOIN LATERAL turno_em(${ator.unidadeId}, now()) t ON true
    WHERE s.id = ${ator.sessaoId}`.execute(db);
  const l = r.rows[0];
  const noTurno = !!l?.noTurno;
  const turnoAtual = l?.nome && l.fim ? { nome: l.nome, fim: l.fim } : null;
  const turnoAcabou = !l?.fimDele || l.fimDele.getTime() <= Date.now();
  // "Continuo" só quando o turno dele acabou e há outro turno em andamento que ainda não é o dele.
  const podeContinuar = turnoAcabou && !!turnoAtual && (!l?.fimDele || turnoAtual.fim.getTime() > l.fimDele.getTime());
  return { noTurno, turnoAtual, turnoAcabou, recebeAte: noTurno ? (l?.recebeAte ?? null) : null, podeContinuar };
}

/**
 * "Continuo no turno" (imprevisto). Pede a SENHA da própria pessoa: no celular dividido, quem
 * pegou o aparelho com a sessão de outra pessoa não continua no nome dela. Na prática é uma
 * nova entrada (mesmas travas de tentativas erradas do login): a sessão antiga é encerrada e
 * a nova vale até o fim do turno em andamento (mais a margem). Tudo na auditoria.
 */
export async function continuarNoTurno(
  db: Banco,
  ator: Ator | null,
  dados: unknown,
  origem: { ip: string | null; agente: string | null },
): Promise<{ token: string; expiraEm: Date; ator: Ator }> {
  exigirSessao(ator);
  if (!ator.unidadeId) throw new ErroDeRegra("dados_invalidos", "Seu cargo ativo não tem unidade.");
  const unidadeId = ator.unidadeId;
  const p = z.object({ senha: z.string().min(1).max(200) }).safeParse(dados);
  if (!p.success) throw new ErroDeRegra("dados_invalidos", "Digite sua senha para continuar no turno.");
  const agora = await sql<{ nome: string; fim: Date }>`SELECT nome, fim FROM turno_em(${unidadeId}, now())`.execute(db);
  if (!agora.rows[0]) throw new ErroDeRegra("dados_invalidos", "Agora não há turno em andamento.");
  // Confere a senha como no login (bloqueio por tentativas, registro de erro).
  const novo = await entrar(db, { login: ator.login, senha: p.data.senha }, origem);
  const sessaoNova = hashToken(novo.token);
  await db.transaction().execute(async (trx) => {
    const r = await sql<{ fim: Date; nome: string }>`
      UPDATE sessao s SET turno_ate = t.fim, cargo_ativo = antiga.cargo_ativo, segundo_fator_ok = antiga.segundo_fator_ok
      FROM turno_em(${unidadeId}, now()) t, sessao antiga
      WHERE s.id = ${sessaoNova} AND antiga.id = ${ator.sessaoId}
      RETURNING t.fim, t.nome`.execute(trx);
    await trx.updateTable("sessao").set({ revogada_em: new Date() }).where("id", "=", ator.sessaoId).where("revogada_em", "is", null).execute();
    const linha = r.rows[0];
    if (!linha) throw new ErroDeRegra("dados_invalidos", "Agora não há turno em andamento.");
    await auditar(trx, { usuarioId: ator.usuarioId, acao: "turno.continuar", resultado: "permitido", detalhes: { turno: linha.nome, ate: linha.fim.toISOString() }, ip: ator.ip });
  });
  const atorNovo = await atorDaSessao(db, novo.token, ator.ip);
  if (!atorNovo) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  return { token: novo.token, expiraEm: novo.expiraEm, ator: atorNovo };
}
