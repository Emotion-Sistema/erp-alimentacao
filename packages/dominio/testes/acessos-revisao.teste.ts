/**
 * Achados da revisão independente da E03 (14/11/2026), cada um com o teste que o prova:
 * rajadas de senha e de segundo fator, código repetido ao mesmo tempo, fuso do fim do turno,
 * unidade, a própria pessoa não se desbloqueia, quem sobra na tela fica ativa, corrida ao
 * tirar cargo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  atorDaEstacao, cadastrarEstacao, confirmarSegundoFator, criarUsuario, darCargo, definirCodigo, desbloquearCodigo, desligarUsuario,
  entrar, entrarNaEstacao, ErroDeRegra, iniciarSegundoFator, listarUsuarios, tirarCargo,
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
  if (unidade !== unidadeId) {
    // administrador da semente só tem cargo na unidade principal: dá a ele um cargo na outra
    await sql`INSERT INTO usuario_perfil (usuario_id, perfil_codigo, unidade_id) SELECT ${adm.usuarioId}, 'administrador', ${unidade}
              WHERE NOT EXISTS (SELECT 1 FROM usuario_perfil WHERE usuario_id = ${adm.usuarioId} AND unidade_id = ${unidade} AND removido_em IS NULL)`.execute(db);
  }
  const u = await criarUsuario(db, adm, { nome: `Pessoa ${login}`, login, senha: SENHA, cargo, unidadeId: unidade });
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
    const tentativas = Array.from({ length: 40 }, (_, i) => entrar(db, { login: p.login, senha: i === 39 ? SENHA : "errada-errada" }, origem));
    await Promise.allSettled(tentativas);
    expect(await avaliacoes(p.id, "sessao.entrar")).toBeLessThanOrEqual(5);
    const u = await db.selectFrom("usuario").select("senha_bloqueada_ate").where("id", "=", p.id).executeTakeFirstOrThrow();
    if (u.senha_bloqueada_ate) expect((await erroDe(entrar(db, { login: p.login, senha: SENHA }, origem))).codigo).toBe("bloqueado");
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
