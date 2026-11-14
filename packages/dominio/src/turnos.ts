/**
 * Turno de quem entrou (decisão 0013, item 1). Cada pessoa tem o próprio login, mesmo no
 * celular dividido: no fim do turno ela sai e a próxima entra. A pessoa fica no turno em
 * que entrou; se esquecer de sair, para de receber avisos e a tela pede para sair. Num
 * imprevisto, toca em "Continuo no turno" (vale até o fim do turno em andamento; registrado).
 */
import { sql, type Banco } from "@erp/banco";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import type { Ator } from "./sessao";

export type SituacaoDoTurno = {
  /** Está no turno agora (recebe avisos do turno). */
  noTurno: boolean;
  /** Turno em andamento na unidade, se houver. */
  turnoAtual: { nome: string; fim: Date } | null;
  /** O turno em que a pessoa entrou já acabou: a tela pede para ela sair. */
  turnoAcabou: boolean;
  /** Fora do turno com turno em andamento: pode tocar em "Continuo no turno". */
  podeContinuar: boolean;
};

function exigirSessao(ator: Ator | null): asserts ator is Ator & { sessaoId: string } {
  if (!ator?.sessaoId) throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  if (ator.segundoFator === "pendente") throw new ErroDeRegra("segundo_fator", "Confirme o código do aplicativo autenticador.");
}

export async function situacaoDoTurno(db: Banco, ator: Ator | null): Promise<SituacaoDoTurno> {
  exigirSessao(ator);
  if (!ator.unidadeId) return { noTurno: false, turnoAtual: null, turnoAcabou: false, podeContinuar: false };
  const r = await sql<{ noTurno: boolean; acabou: boolean; nome: string | null; fim: Date | null }>`
    SELECT pessoa_no_turno(${ator.unidadeId}, s.criada_em, s.turno_ate, now()) AS "noTurno",
           now() >= greatest(fim_do_turno_da_entrada(${ator.unidadeId}, s.criada_em), coalesce(s.turno_ate, '-infinity')) AS acabou,
           t.nome, t.fim
    FROM sessao s
    LEFT JOIN LATERAL turno_em(${ator.unidadeId}, now()) t ON true
    WHERE s.id = ${ator.sessaoId}`.execute(db);
  const l = r.rows[0];
  const noTurno = !!l?.noTurno;
  const turnoAtual = l?.nome && l.fim ? { nome: l.nome, fim: l.fim } : null;
  return { noTurno, turnoAtual, turnoAcabou: !!l?.acabou, podeContinuar: !noTurno && !!turnoAtual };
}

/** "Continuo no turno" (imprevisto): a sessão passa a valer até o fim do turno em andamento. */
export async function continuarNoTurno(db: Banco, ator: Ator | null): Promise<SituacaoDoTurno> {
  exigirSessao(ator);
  if (!ator.unidadeId) throw new ErroDeRegra("dados_invalidos", "Seu cargo ativo não tem unidade.");
  const r = await sql<{ fim: Date; nome: string }>`
    UPDATE sessao s SET turno_ate = t.fim
    FROM turno_em(${ator.unidadeId}, now()) t
    WHERE s.id = ${ator.sessaoId}
    RETURNING t.fim, t.nome`.execute(db);
  const t = r.rows[0];
  if (!t) throw new ErroDeRegra("dados_invalidos", "Agora não há turno em andamento.");
  await auditar(db, { usuarioId: ator.usuarioId, acao: "turno.continuar", resultado: "permitido", detalhes: { turno: t.nome, ate: t.fim.toISOString() }, ip: ator.ip });
  return situacaoDoTurno(db, ator);
}
