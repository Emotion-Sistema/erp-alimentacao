/**
 * Achados da revisão independente da E03 (14/11/2026), cada um com o teste que o prova:
 * rajadas de senha e de segundo fator, código repetido ao mesmo tempo, fuso do fim do turno,
 * unidade, a própria pessoa não se desbloqueia, quem sobra na tela fica ativa, corrida ao
 * tirar cargo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  atorDaEstacao, atorDaSessao, cadastrarEstacao, confirmarSegundoFator, criarUsuario, darCargo, definirCodigo, desbloquearCodigo, desligarUsuario,
  entrar, entrarNaEstacao, ErroDeRegra, estenderTurno, telaDaEstacao, iniciarSegundoFator, listarUsuarios, tirarCargo,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, codigoAgora, prepararDados } from "./apoio";

let db: Banco;
let unidadeId: number;
const origem = { ip: "127.0.0.1", agente: "teste" };
const SENHA = "uma-senha-longa";

beforeAll(async () => {
  db = bancoDeTeste();
  ({ unidadeId } = await prepararDados(db));
});
afterAll(() => db.destroy());

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

let n = 0;
async function pessoa(cargo: string, codigo?: string, unidade = unidadeId) {
  const adm = await atorDoCargo(db, "administrador");
  const login = `rev.${cargo.replace("_", ".")}.${++n}`;
  const u = await criarUsuario(db, adm, { nome: `Pessoa ${login}`, login, senha: SENHA, cargo, unidadeId });
  if (unidade !== unidadeId) {
    // move a pessoa para a outra unidade direto no banco (só no teste)
    await db.updateTable("usuario_perfil").set({ unidade_id: unidade }).where("usuario_id", "=", u.id).execute();
  }
  if (codigo) await definirCodigo(db, adm, u.id, { codigo });
  return { ...u, login };
}

const avaliacoes = (usuarioId: number, acao: string) =>
  db
    .selectFrom("auditoria")
    .select("id")
    .where("usuario_id", "=", usuarioId)
    .where("acao", "in", acao === "sessao.entrar" ? ["sessao.entrar"] : [acao, "segundo_fator.configurar"])
    .where("resultado", "in", ["falhou", "permitido"])
    .execute()
    .then((r) => r.length);

describe("rajadas não furam os limites", () => {
  it("40 senhas ao mesmo tempo: no máximo 5 são conferidas, e depois do bloqueio nem a certa entra", async () => {
    const p = await pessoa("atendente");
    await Promise.allSettled(Array.from({ length: 40 }, () => entrar(db, { login: p.login, senha: "errada-errada" }, origem)));
    expect(await avaliacoes(p.id, "sessao.entrar")).toBe(5);
    expect((await erroDe(entrar(db, { login: p.login, senha: SENHA }, origem))).codigo).toBe("bloqueado");
  });

  it("30 códigos do autenticador ao mesmo tempo: no máximo 5 são conferidos", async () => {
    const adm = await atorDoCargo(db, "administrador");
    await criarUsuario(db, adm, { nome: "Rajada Adm", login: "rev.rajada.adm", senha: SENHA, cargo: "administrador", unidadeId });
    const a = (await entrar(db, { login: "rev.rajada.adm", senha: SENHA }, origem)).ator;
    await iniciarSegundoFator(db, a);
    await Promise.allSettled(Array.from({ length: 30 }, () => confirmarSegundoFator(db, a, { codigo: "000000" })));
    expect(await avaliacoes(a.usuarioId, "segundo_fator.confirmar")).toBeLessThanOrEqual(5);
    const u = await db.selectFrom("usuario").select("totp_bloqueado_ate").where("id", "=", a.usuarioId).executeTakeFirstOrThrow();
    expect(u.totp_bloqueado_ate).not.toBeNull();
  });

  it("contagem presa no limite sem bloqueio marcado (pedido que caiu no meio) vira bloqueio, não trava para sempre", async () => {
    const p = await pessoa("atendente");
    await db.updateTable("usuario").set({ senha_erros: 5, senha_bloqueada_ate: null }).where("id", "=", p.id).execute();
    expect((await erroDe(entrar(db, { login: p.login, senha: SENHA }, origem))).codigo).toBe("bloqueado");
    await db.updateTable("usuario").set({ senha_bloqueada_ate: new Date(Date.now() - 1000) }).where("id", "=", p.id).execute();
    await entrar(db, { login: p.login, senha: SENHA }, origem); // passado o tempo, entra
  });

  it("bloqueio do segundo fator não derruba quem já confirmou", async () => {
    const adm = await atorDoCargo(db, "administrador");
    await criarUsuario(db, adm, { nome: "Dentro Adm", login: "rev.dentro.adm", senha: SENHA, cargo: "administrador", unidadeId });
    const dentro = (await entrar(db, { login: "rev.dentro.adm", senha: SENHA }, origem));
    const { segredo } = await iniciarSegundoFator(db, dentro.ator);
    await confirmarSegundoFator(db, dentro.ator, { codigo: codigoAgora(segredo) });
    const intruso = (await entrar(db, { login: "rev.dentro.adm", senha: SENHA }, origem)).ator;
    for (let i = 0; i < 5; i++) await erroDe(confirmarSegundoFator(db, intruso, { codigo: "000000" }));
    expect((await atorDaSessao(db, dentro.token))?.segundoFator).toBe("ok");
  });

  it("o mesmo código do autenticador em duas sessões ao mesmo tempo: só uma passa", async () => {
    const adm = await atorDoCargo(db, "administrador");
    await criarUsuario(db, adm, { nome: "Dupla Adm", login: "rev.dupla.adm", senha: SENHA, cargo: "administrador", unidadeId });
    const primeira = (await entrar(db, { login: "rev.dupla.adm", senha: SENHA }, origem)).ator;
    const { segredo } = await iniciarSegundoFator(db, primeira);
    await confirmarSegundoFator(db, primeira, { codigo: codigoAgora(segredo) });
    await db.updateTable("usuario").set({ totp_ultimo_passo: null }).where("id", "=", primeira.usuarioId).execute();
    const s1 = (await entrar(db, { login: "rev.dupla.adm", senha: SENHA }, origem)).ator;
    const s2 = (await entrar(db, { login: "rev.dupla.adm", senha: SENHA }, origem)).ator;
    const codigo = codigoAgora(segredo);
    const r = await Promise.allSettled([confirmarSegundoFator(db, s1, { codigo }), confirmarSegundoFator(db, s2, { codigo })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
});

describe("fim do turno no horário da unidade", () => {
  it("unidade em outro fuso: a saída automática cai no horário local dela", async () => {
    const fuso = "Asia/Tokyo"; // 9 h à frente de UTC: um erro de fuso daria diferença de horas
    const daqui3h = new Date(Date.now() + 3 * 3600_000);
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(daqui3h);
    const antes = await db.selectFrom("unidade").select(["fuso_horario", "fim_turno"]).where("id", "=", unidadeId).executeTakeFirstOrThrow();
    await db.updateTable("unidade").set({ fuso_horario: fuso, fim_turno: hhmm }).where("id", "=", unidadeId).execute();
    try {
      const e = await cadastrarEstacao(db, await atorDoCargo(db, "gerente_geral"), { nome: "Fuso" });
      const p = await pessoa("cozinheira", "3816");
      await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "3816" });
      const pres = await db.selectFrom("estacao_presenca").select("expira_em").where("usuario_id", "=", p.id).where("saiu_em", "is", null).executeTakeFirstOrThrow();
      const diferencaMin = Math.abs(new Date(pres.expira_em).getTime() - daqui3h.getTime()) / 60_000;
      expect(diferencaMin).toBeLessThan(2); // arredondado ao minuto
    } finally {
      await db.updateTable("unidade").set({ fuso_horario: antes.fuso_horario, fim_turno: antes.fim_turno }).where("id", "=", unidadeId).execute();
    }
  });
});

describe("unidade", () => {
  it("gerente de uma unidade não cria, não promove, não lista e não desbloqueia gente de outra", async () => {
    const emp = await db.selectFrom("unidade").select("empresa_id").where("id", "=", unidadeId).executeTakeFirstOrThrow();
    const outra = await db.insertInto("unidade").values({ empresa_id: emp.empresa_id, nome: "Loja 2 (fictícia)" }).returning("id").executeTakeFirstOrThrow();
    const gerente = await atorDoCargo(db, "gerente_geral");
    const supervisor = await atorDoCargo(db, "supervisor");
    const deLa = await pessoa("cozinheira", "7259", outra.id);

    expect((await erroDe(criarUsuario(db, gerente, { nome: "Fora", login: "rev.fora", senha: SENHA, cargo: "caixa", unidadeId: outra.id }))).codigo).toBe("sem_permissao");
    expect((await erroDe(darCargo(db, gerente, deLa.id, { cargo: "caixa", unidadeId: outra.id }))).codigo).toBe("sem_permissao");
    expect((await erroDe(desligarUsuario(db, gerente, deLa.id))).codigo).toBe("sem_permissao");
    expect((await listarUsuarios(db, gerente)).some((u) => u.id === deLa.id)).toBe(false);
    await db.updateTable("usuario").set({ codigo_bloqueado_em: new Date() }).where("id", "=", deLa.id).execute();
    expect((await erroDe(desbloquearCodigo(db, supervisor, deLa.id))).codigo).toBe("nao_encontrado");
  });
});

describe("código e estação", () => {
  it("a própria pessoa troca o código, mas não se desbloqueia trocando o código", async () => {
    const p = await pessoa("cozinheira", "6031");
    const ela = (await entrar(db, { login: p.login, senha: SENHA }, origem)).ator;
    await db.updateTable("usuario").set({ codigo_bloqueado_em: new Date() }).where("id", "=", p.id).execute();
    expect((await erroDe(definirCodigo(db, ela, p.id, { codigo: "9047" }))).codigo).toBe("bloqueado");
    const u = await db.selectFrom("usuario").select("codigo_bloqueado_em").where("id", "=", p.id).executeTakeFirstOrThrow();
    expect(u.codigo_bloqueado_em).not.toBeNull();
  });

  it("a ativa sai por troca de estação, desligamento ou cargo tirado: quem sobrou sozinha vira ativa", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral");
    const adm = await atorDoCargo(db, "administrador");
    const a = await cadastrarEstacao(db, gerente, { nome: "Sobra A" });
    const b = await cadastrarEstacao(db, gerente, { nome: "Sobra B" });
    const fica = await pessoa("auxiliar_cozinha", "1593");
    const sai = await pessoa("cozinheira", "1593");

    // troca de estação
    await entrarNaEstacao(db, a.token, { usuarioId: fica.id, codigo: "1593" });
    await entrarNaEstacao(db, a.token, { usuarioId: sai.id, codigo: "1593" }); // ela fica ativa
    await entrarNaEstacao(db, b.token, { usuarioId: sai.id, codigo: "1593" });
    expect((await atorDaEstacao(db, a.token))?.usuarioId).toBe(fica.id);

    // cargo tirado
    await entrarNaEstacao(db, a.token, { usuarioId: sai.id, codigo: "1593" });
    await darCargo(db, adm, sai.id, { cargo: "atendente" });
    await tirarCargo(db, adm, sai.id, { cargo: "cozinheira" });
    expect((await atorDaEstacao(db, a.token))?.usuarioId).toBe(fica.id);

    // desligamento
    const outra = await pessoa("cozinheira", "1593");
    await entrarNaEstacao(db, a.token, { usuarioId: outra.id, codigo: "1593" });
    await desligarUsuario(db, adm, outra.id);
    expect((await atorDaEstacao(db, a.token))?.usuarioId).toBe(fica.id);
  });

  it("duas retiradas de cargo ao mesmo tempo não deixam a pessoa sem cargo", async () => {
    const adm = await atorDoCargo(db, "administrador");
    const p = await pessoa("atendente");
    await darCargo(db, adm, p.id, { cargo: "caixa" });
    await Promise.allSettled([tirarCargo(db, adm, p.id, { cargo: "atendente" }), tirarCargo(db, adm, p.id, { cargo: "caixa" })]);
    const vigentes = await db.selectFrom("usuario_perfil").select("perfil_codigo").where("usuario_id", "=", p.id).where("removido_em", "is", null).execute();
    expect(vigentes).toHaveLength(1);
  });
});

describe("turno do tablet: desliga às 00h30 e a cozinha pode estender", () => {
  it("padrão da unidade é 00h30", async () => {
    const u = await db.selectFrom("unidade").select("fim_turno").where("id", "=", unidadeId).executeTakeFirstOrThrow();
    expect(u.fim_turno).toBe("00:30:00");
  });

  it("quem está ativa estende 30 min para todos na tela, até 4 vezes; tudo registrado; sem ninguém na tela é recusado", async () => {
    const e = await cadastrarEstacao(db, await atorDoCargo(db, "gerente_geral"), { nome: "Prorroga" });
    expect((await erroDe(estenderTurno(db, e.token))).codigo).toBe("nao_autenticado");
    const a = await pessoa("cozinheira", "8352");
    const b = await pessoa("auxiliar_cozinha", "8352");
    await entrarNaEstacao(db, e.token, { usuarioId: a.id, codigo: "8352" });
    await entrarNaEstacao(db, e.token, { usuarioId: b.id, codigo: "8352" });
    const antes = await db.selectFrom("estacao_presenca").select(["usuario_id", "expira_em"]).where("estacao_id", "=", (await telaDaEstacao(db, e.token)).estacao.id).where("saiu_em", "is", null).execute();
    await estenderTurno(db, e.token);
    const depois = await db.selectFrom("estacao_presenca").select(["usuario_id", "expira_em"]).where("saiu_em", "is", null).where("usuario_id", "in", [a.id, b.id]).execute();
    for (const d of depois) {
      const x = antes.find((y) => y.usuario_id === d.usuario_id)!;
      expect(new Date(d.expira_em).getTime() - new Date(x.expira_em).getTime()).toBe(30 * 60_000);
    }
    for (let i = 0; i < 3; i++) await estenderTurno(db, e.token);
    expect((await telaDaEstacao(db, e.token)).turno.prorrogacoesRestantes).toBe(0);
    expect((await erroDe(estenderTurno(db, e.token))).codigo).toBe("conflito");
    const regs = await db.selectFrom("auditoria").select("resultado").orderBy("id").where("acao", "=", "estacao.estender").where("alvo_id", "=", String((await telaDaEstacao(db, e.token)).estacao.id)).execute();
    expect(regs.map((r) => r.resultado)).toEqual(["recusado", "permitido", "permitido", "permitido", "permitido", "recusado"]);
  });

  it("a tela informa quando o tablet desliga e quando começar a avisar", async () => {
    const e = await cadastrarEstacao(db, await atorDoCargo(db, "gerente_geral"), { nome: "Aviso" });
    expect((await telaDaEstacao(db, e.token)).turno.fimEm).toBeNull();
    const p = await pessoa("cozinheira", "8352");
    await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "8352" });
    const t = (await telaDaEstacao(db, e.token)).turno;
    expect(t.fimEm).not.toBeNull();
    expect([t.prorrogacoesRestantes, t.prorrogacaoMin, t.avisoMin]).toEqual([4, 30, 15]);
  });
});

describe("horário de saída do tablet (função fim_do_turno, horas fixas, fuso de São Paulo, 00h30)", () => {
  const fim = async (agora: string) =>
    (await sql<{ fim: Date }>`SELECT fim_do_turno(${unidadeId}, ${agora}::timestamptz) AS fim`.execute(db)).rows[0]!.fim.toISOString();
  it.each([
    ["entrar às 18h: sai às 00h30 do dia seguinte", "2026-11-14T18:00:00-03:00", "2026-11-15T03:30:00.000Z"],
    ["entrar às 00h10: sai às 00h30 do mesmo dia", "2026-11-15T00:10:00-03:00", "2026-11-15T03:30:00.000Z"],
    ["entrar às 7h: sai às 00h30 (17h30 depois)", "2026-11-15T07:00:00-03:00", "2026-11-16T03:30:00.000Z"],
    ["entrar de madrugada (00h40): só 30 min, nada de ficar até a noite", "2026-11-15T00:40:00-03:00", "2026-11-15T04:10:00.000Z"],
    ["entrar às 3h: só 30 min", "2026-11-15T03:00:00-03:00", "2026-11-15T06:30:00.000Z"],
  ])("%s", async (_nome, agora, esperado) => {
    expect(await fim(agora)).toBe(esperado);
  });
});

describe("prorrogação do turno sob concorrência", () => {
  it("6 pedidos de estender ao mesmo tempo: 4 passam, 2 são recusados; quem entra depois herda a contagem", async () => {
    const e = await cadastrarEstacao(db, await atorDoCargo(db, "gerente_geral"), { nome: "Corrida" });
    const p = await pessoa("cozinheira", "4718");
    await entrarNaEstacao(db, e.token, { usuarioId: p.id, codigo: "4718" });
    const r = await Promise.allSettled(Array.from({ length: 6 }, () => estenderTurno(db, e.token)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(4);
    const pres = await db.selectFrom("estacao_presenca").select("prorrogacoes").where("usuario_id", "=", p.id).where("saiu_em", "is", null).executeTakeFirstOrThrow();
    expect(pres.prorrogacoes).toBe(4);
    const q = await pessoa("auxiliar_cozinha", "4718");
    await entrarNaEstacao(db, e.token, { usuarioId: q.id, codigo: "4718" });
    expect((await telaDaEstacao(db, e.token)).turno.prorrogacoesRestantes).toBe(0);
    expect((await erroDe(estenderTurno(db, e.token))).codigo).toBe("conflito");
    // e sai junto com quem já estava (não às 00h30)
    const ambos = await db.selectFrom("estacao_presenca").select("expira_em").where("usuario_id", "in", [p.id, q.id]).where("saiu_em", "is", null).execute();
    expect(new Set(ambos.map((x) => new Date(x.expira_em).getTime())).size).toBe(1);
  });
});
