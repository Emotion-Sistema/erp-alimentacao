/**
 * Preferências de tela por pessoa (decisão 0030) contra PostgreSQL real: tema claro ou escuro e
 * letra normal ou grande, guardados no usuário; valem em qualquer aparelho; ficam na auditoria;
 * sem sessão válida, o padrão (claro, letra normal).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Banco } from "@erp/banco";
import {
  atorDaSessao, criarUsuario, entrar, ErroDeRegra, mudarPreferencias, PREFERENCIAS_PADRAO, preferenciasDaSessao,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

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
async function pessoaDentro(cargo = "atendente") {
  const adm = await atorDoCargo(db, "administrador");
  const login = `pref.${cargo}.${++n}`;
  const u = await criarUsuario(db, adm, { nome: `Pessoa ${login}`, login, senha: SENHA, cargo, unidadeId });
  const { token } = await entrar(db, { login, senha: SENHA }, origem);
  return { id: u.id, login, token, ator: (await atorDaSessao(db, token))! };
}

describe("preferências de tela (decisão 0030)", () => {
  it("quem nunca escolheu fica no claro com letra normal; sem sessão também", async () => {
    const p = await pessoaDentro();
    expect(await preferenciasDaSessao(db, p.token)).toEqual(PREFERENCIAS_PADRAO);
    expect(await preferenciasDaSessao(db, undefined)).toEqual({ tema: "claro", letra: "normal" });
    expect(await preferenciasDaSessao(db, "token-que-nao-existe")).toEqual(PREFERENCIAS_PADRAO);
    expect(await preferenciasDaSessao(db, "x".repeat(201))).toEqual(PREFERENCIAS_PADRAO);
  });

  it("a pessoa muda só o tema, depois só a letra; vale numa sessão nova (outro aparelho); tudo na auditoria", async () => {
    const p = await pessoaDentro("cozinheira");
    expect(await mudarPreferencias(db, p.ator, { tema: "escuro" })).toEqual({ tema: "escuro", letra: "normal" });
    expect(await mudarPreferencias(db, p.ator, { letra: "grande" })).toEqual({ tema: "escuro", letra: "grande" });
    expect(await preferenciasDaSessao(db, p.token)).toEqual({ tema: "escuro", letra: "grande" });
    const { token: outro } = await entrar(db, { login: p.login, senha: SENHA }, origem);
    expect(await preferenciasDaSessao(db, outro)).toEqual({ tema: "escuro", letra: "grande" });
    const regs = await db.selectFrom("auditoria").select(["resultado", "detalhes"]).where("usuario_id", "=", p.id).where("acao", "=", "sessao.preferencias").orderBy("id").execute();
    expect(regs.map((r) => [r.resultado, r.detalhes.de, r.detalhes.para])).toEqual([
      ["permitido", { tema: "claro", letra: "normal" }, { tema: "escuro", letra: "normal" }],
      ["permitido", { tema: "escuro", letra: "normal" }, { tema: "escuro", letra: "grande" }],
    ]);
  });

  it("a escolha de uma pessoa não muda a de outra", async () => {
    const a = await pessoaDentro();
    const b = await pessoaDentro();
    await mudarPreferencias(db, a.ator, { tema: "escuro" });
    expect(await preferenciasDaSessao(db, b.token)).toEqual(PREFERENCIAS_PADRAO);
  });

  it("recusa valor fora da lista, campo a mais, corpo vazio e quem não está dentro", async () => {
    const p = await pessoaDentro();
    for (const ruim of [{}, { tema: "azul" }, { letra: "enorme" }, { tema: "escuro", cor: "x" }, null, "escuro", { tema: "escuro", usuarioId: 1 }])
      expect((await erroDe(mudarPreferencias(db, p.ator, ruim))).codigo, JSON.stringify(ruim)).toBe("dados_invalidos");
    expect((await erroDe(mudarPreferencias(db, null, { tema: "escuro" }))).codigo).toBe("nao_autenticado");
    expect((await erroDe(mudarPreferencias(db, { ...p.ator, sessaoId: null }, { tema: "escuro" }))).codigo).toBe("nao_autenticado");
    expect((await erroDe(mudarPreferencias(db, { ...p.ator, segundoFator: "pendente" }, { tema: "escuro" }))).codigo).toBe("segundo_fator");
    expect(await preferenciasDaSessao(db, p.token)).toEqual(PREFERENCIAS_PADRAO);
  });

  it("sessão encerrada ou pessoa desligada: a tela volta ao padrão", async () => {
    const p = await pessoaDentro();
    await mudarPreferencias(db, p.ator, { tema: "escuro", letra: "grande" });
    await db.updateTable("sessao").set({ revogada_em: new Date() }).where("usuario_id", "=", p.id).execute();
    expect(await preferenciasDaSessao(db, p.token)).toEqual(PREFERENCIAS_PADRAO);
    const q = await pessoaDentro();
    await mudarPreferencias(db, q.ator, { tema: "escuro" });
    await db.updateTable("usuario").set({ ativo: false, desligado_em: new Date() }).where("id", "=", q.id).execute();
    expect(await preferenciasDaSessao(db, q.token)).toEqual(PREFERENCIAS_PADRAO);
  });

  it("o banco só aceita os valores da lista", async () => {
    const p = await pessoaDentro();
    await expect(db.updateTable("usuario").set({ tema: "roxo" as "claro" }).where("id", "=", p.id).execute()).rejects.toThrow();
    await expect(db.updateTable("usuario").set({ letra: "mini" as "normal" }).where("id", "=", p.id).execute()).rejects.toThrow();
  });
});
