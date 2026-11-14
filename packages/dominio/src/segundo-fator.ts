/**
 * Segundo fator (código de 6 dígitos de um aplicativo autenticador, padrão TOTP) para os
 * cargos de CARGOS_COM_SEGUNDO_FATOR. Biblioteca mantida (otpauth); o segredo fica
 * cifrado no banco (segredos.ts). Sem o segundo fator confirmado, `exigir` recusa tudo.
 */
import { sql, type Banco } from "@erp/banco";
import { Secret, TOTP } from "otpauth";
import { z } from "zod";
import { auditar } from "./auditoria";
import { ErroDeRegra } from "./erros";
import { podeAtribuir } from "./permissoes";
import { cifrar, decifrar } from "./segredos";
import { cargosVigentes, exigir, type Ator } from "./sessao";

export const SEGUNDO_FATOR_MAX_ERROS = 5;
export const SEGUNDO_FATOR_BLOQUEIO_MIN = 15;
const EMISSOR = "ERP Alimentação";

function totp(segredoBase32: string, login: string) {
  return new TOTP({ issuer: EMISSOR, label: login, secret: Secret.fromBase32(segredoBase32), digits: 6, period: 30, algorithm: "SHA1" });
}

/** Começa a configuração: gera o segredo (pendente até a pessoa confirmar um código). */
export async function iniciarSegundoFator(db: Banco, ator: Ator | null): Promise<{ uri: string; segredo: string }> {
  if (!ator?.sessaoId) {
    await auditar(db, { usuarioId: null, acao: "segundo_fator.iniciar", resultado: "recusado", detalhes: { motivo: "sem_sessao" } });
    throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  }
  if (ator.segundoFatorConfigurado) {
    throw new ErroDeRegra("conflito", "O segundo fator já está configurado. Para trocar de celular, peça a outro administrador para reiniciá-lo.");
  }
  const segredo = new Secret({ size: 20 }).base32;
  await db.updateTable("usuario").set({ totp_pendente: cifrar(segredo) }).where("id", "=", ator.usuarioId).execute();
  await auditar(db, { usuarioId: ator.usuarioId, acao: "segundo_fator.iniciar", resultado: "permitido", ip: ator.ip });
  return { uri: totp(segredo, ator.login).toString(), segredo };
}

/**
 * Confere o código. Se a pessoa estava configurando, o segredo pendente passa a valer.
 * Um código já usado não vale de novo. Os erros contam por PESSOA (todas as sessões): a
 * tentativa é reservada antes da conferência e 5 erros bloqueiam por 15 minutos e
 * encerram a sessão. Assim nem rajada nem entrar de novo com a senha dão mais chances.
 */
export async function confirmarSegundoFator(db: Banco, ator: Ator | null, dados: unknown): Promise<Ator> {
  if (!ator?.sessaoId) {
    await auditar(db, { usuarioId: null, acao: "segundo_fator.confirmar", resultado: "recusado", detalhes: { motivo: "sem_sessao" } });
    throw new ErroDeRegra("nao_autenticado", "Entre com seu usuário para continuar.");
  }
  const parse = z.object({ codigo: z.string().trim().regex(/^[0-9]{6}$/) }).safeParse(dados);
  if (!parse.success) throw new ErroDeRegra("dados_invalidos", "Digite os 6 números do aplicativo autenticador.");
  if (ator.segundoFator === "ok") return ator;
  const sessaoId = ator.sessaoId;
  const mensagemBloqueio = `Muitos códigos errados. Espere ${SEGUNDO_FATOR_BLOQUEIO_MIN} minutos e entre de novo com sua senha.`;

  // Contagem presa no limite sem bloqueio marcado (pedido que caiu no meio): bloqueia agora.
  await sql`
    UPDATE usuario SET totp_erros = 0, totp_bloqueado_ate = now() + make_interval(mins => ${SEGUNDO_FATOR_BLOQUEIO_MIN})
    WHERE id = ${ator.usuarioId} AND totp_erros >= ${SEGUNDO_FATOR_MAX_ERROS}
      AND (totp_bloqueado_ate IS NULL OR totp_bloqueado_ate <= now())`.execute(db);
  const reserva = await sql<{ totp_segredo: string | null; totp_pendente: string | null; totp_ultimo_passo: string | null }>`
    UPDATE usuario SET totp_erros = totp_erros + 1
    WHERE id = ${ator.usuarioId} AND totp_erros < ${SEGUNDO_FATOR_MAX_ERROS}
      AND (totp_bloqueado_ate IS NULL OR totp_bloqueado_ate <= now())
    RETURNING totp_segredo, totp_pendente, totp_ultimo_passo`.execute(db);
  const u = reserva.rows[0];
  if (!u) {
    await db.updateTable("sessao").set({ revogada_em: new Date() }).where("id", "=", sessaoId).where("revogada_em", "is", null).execute();
    await auditar(db, { usuarioId: ator.usuarioId, acao: "segundo_fator.confirmar", resultado: "recusado", detalhes: { motivo: "bloqueado" }, ip: ator.ip });
    throw new ErroDeRegra("bloqueado", mensagemBloqueio);
  }
  const guardado = u.totp_segredo ?? u.totp_pendente;
  if (!guardado) {
    await db.updateTable("usuario").set((eb) => ({ totp_erros: eb("totp_erros", "-", 1) })).where("id", "=", ator.usuarioId).where("totp_erros", ">", 0).execute();
    throw new ErroDeRegra("dados_invalidos", "Configure o segundo fator primeiro.");
  }
  const configurando = !u.totp_segredo;

  const t = totp(decifrar(guardado), ator.login);
  const delta = t.validate({ token: parse.data.codigo, window: 1 });
  const passo = delta === null ? null : TOTP.counter() + delta;
  const repetido = passo !== null && u.totp_ultimo_passo !== null && passo <= Number(u.totp_ultimo_passo);

  if (passo === null || repetido) {
    const bloqueio = await sql<{ id: number }>`
      UPDATE usuario SET totp_erros = 0, totp_bloqueado_ate = now() + make_interval(mins => ${SEGUNDO_FATOR_BLOQUEIO_MIN})
      WHERE id = ${ator.usuarioId} AND totp_erros >= ${SEGUNDO_FATOR_MAX_ERROS}
      RETURNING id`.execute(db);
    const bloqueou = bloqueio.rows.length > 0;
    // Encerra só as sessões que ainda não passaram pelo segundo fator: quem só tem a senha
    // não consegue derrubar o administrador que já está dentro.
    if (bloqueou) await db.updateTable("sessao").set({ revogada_em: new Date() }).where("usuario_id", "=", ator.usuarioId).where("revogada_em", "is", null).where("segundo_fator_ok", "=", false).execute();
    await auditar(db, {
      usuarioId: ator.usuarioId,
      acao: "segundo_fator.confirmar",
      resultado: "falhou",
      detalhes: { motivo: repetido ? "codigo_repetido" : "codigo_errado", bloqueou },
      ip: ator.ip,
    });
    if (bloqueou) throw new ErroDeRegra("bloqueado", mensagemBloqueio);
    throw new ErroDeRegra("dados_invalidos", "Código errado ou já usado. Espere o próximo código e tente de novo.");
  }

  await db.transaction().execute(async (trx) => {
    // O "passo" só avança (dois pedidos com o mesmo código não passam os dois) e nada vale
    // se a pessoa foi bloqueada no meio do caminho.
    const r = await trx
      .updateTable("usuario")
      .set({
        totp_ultimo_passo: passo,
        totp_erros: 0,
        ...(configurando ? { totp_segredo: guardado, totp_pendente: null } : {}),
      })
      .where("id", "=", ator.usuarioId)
      .where((eb) => eb.or([eb("totp_ultimo_passo", "is", null), eb("totp_ultimo_passo", "<", String(passo))]))
      .where((eb) => eb.or([eb("totp_bloqueado_ate", "is", null), eb("totp_bloqueado_ate", "<=", new Date())]))
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("dados_invalidos", "Código já usado. Espere o próximo código.");
    const s = await trx.updateTable("sessao").set({ segundo_fator_ok: true }).where("id", "=", sessaoId).where("revogada_em", "is", null).executeTakeFirst();
    if (s.numUpdatedRows === 0n) throw new ErroDeRegra("nao_autenticado", "Sua sessão foi encerrada. Entre de novo com sua senha.");
    await auditar(trx, {
      usuarioId: ator.usuarioId,
      acao: configurando ? "segundo_fator.configurar" : "segundo_fator.confirmar",
      resultado: "permitido",
      ip: ator.ip,
    });
  });
  return { ...ator, segundoFator: "ok", segundoFatorConfigurado: true };
}

/** Outro gestor apaga o segundo fator de alguém (celular perdido). Encerra as sessões dele. */
export async function reiniciarSegundoFator(db: Banco, ator: Ator | null, usuarioId: number): Promise<void> {
  const quem = await exigir(db, ator, "usuarios.gerenciar", { tipo: "usuario", id: usuarioId });
  const cargosAlvo = (await cargosVigentes(db, usuarioId)).map((c) => c.cargo);
  if (usuarioId === quem.usuarioId || !podeAtribuir(quem.cargoAtivo, cargosAlvo)) {
    await auditar(db, { usuarioId: quem.usuarioId, acao: "segundo_fator.reiniciar", resultado: "recusado", alvoTipo: "usuario", alvoId: usuarioId, ip: quem.ip });
    throw new ErroDeRegra("sem_permissao", usuarioId === quem.usuarioId ? "Peça a outro administrador." : "Seu cargo não pode mexer nesse usuário.");
  }
  await db.transaction().execute(async (trx) => {
    const r = await trx
      .updateTable("usuario")
      .set({ totp_segredo: null, totp_pendente: null, totp_ultimo_passo: null, totp_erros: 0, totp_bloqueado_ate: null })
      .where("id", "=", usuarioId)
      .executeTakeFirst();
    if (r.numUpdatedRows === 0n) throw new ErroDeRegra("nao_encontrado", "Usuário não encontrado.");
    await trx.updateTable("sessao").set({ revogada_em: new Date() }).where("usuario_id", "=", usuarioId).where("revogada_em", "is", null).execute();
    await auditar(trx, { usuarioId: quem.usuarioId, acao: "segundo_fator.reiniciar", resultado: "permitido", alvoTipo: "usuario", alvoId: usuarioId, ip: quem.ip });
  });
}
