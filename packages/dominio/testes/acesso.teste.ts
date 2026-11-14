import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  atorDaSessao, criarUsuario, entrar, ErroDeRegra, listarUsuarios, pode, sair, SENHA_DE_TESTE, CARGOS, PERMISSOES,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let unidadeId: number;
const origem = { ip: "127.0.0.1", agente: "teste" };

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

const ultimaAuditoria = (acao: string) =>
  db.selectFrom("auditoria").selectAll().where("acao", "=", acao).orderBy("id", "desc").executeTakeFirstOrThrow();

describe("matriz de cargos (base da E02)", () => {
  it("caixa e gerente geral não acessam o financeiro; dono, administrador e financeiro acessam", () => {
    expect(pode(["caixa"], "financeiro.ver")).toBe(false);
    expect(pode(["gerente_geral"], "financeiro.ver")).toBe(false);
    for (const c of ["dono", "administrador", "financeiro"]) expect(pode([c], "financeiro.ver")).toBe(true);
  });
  it("cargo desconhecido ou lista vazia não dá permissão nenhuma", () => {
    expect(pode(["hacker"], "usuarios.ver")).toBe(false);
    expect(pode([], "usuarios.ver")).toBe(false);
  });
  it("todo cargo tem entrada na matriz", () => {
    for (const c of CARGOS) expect(PERMISSOES[c]).toBeDefined();
  });
});

describe("entrar e sair", () => {
  it("senha certa cria sessão; o token não é gravado no banco", async () => {
    const r = await entrar(db, { login: "caixa", senha: SENHA_DE_TESTE }, origem);
    expect(r.ator.cargos).toEqual(["caixa"]);
    const gravado = await db.selectFrom("sessao").select("id").where("id", "=", r.token).executeTakeFirst();
    expect(gravado).toBeUndefined();
    expect(await atorDaSessao(db, r.token)).not.toBeNull();
  });

  it("senha errada e login inexistente dão a mesma mensagem e ficam registrados", async () => {
    const e1 = await erroDe(entrar(db, { login: "caixa", senha: "errada-errada" }, origem));
    const e2 = await erroDe(entrar(db, { login: "ninguem", senha: "errada-errada" }, origem));
    expect(e1.codigo).toBe("nao_autenticado");
    expect(e2.message).toBe(e1.message);
    const a = await ultimaAuditoria("sessao.entrar");
    expect(a.resultado).toBe("falhou");
  });

  it("sair revoga a sessão", async () => {
    const r = await entrar(db, { login: "atendente", senha: SENHA_DE_TESTE }, origem);
    await sair(db, r.ator);
    expect(await atorDaSessao(db, r.token)).toBeNull();
  });

  it("sessão expirada não vale", async () => {
    const r = await entrar(db, { login: "atendente", senha: SENHA_DE_TESTE }, origem);
    await db.updateTable("sessao").set({ expira_em: new Date(Date.now() - 1000) }).where("id", "=", r.ator.sessaoId).execute();
    expect(await atorDaSessao(db, r.token)).toBeNull();
  });

  it("funcionário desligado perde o acesso na hora, inclusive sessão já aberta", async () => {
    const adm = await atorDoCargo(db, "administrador");
    await criarUsuario(db, adm, { nome: "Pessoa Desligada", login: "desligada", senha: "uma-senha-longa", cargo: "atendente", unidadeId });
    const r = await entrar(db, { login: "desligada", senha: "uma-senha-longa" }, origem);
    await db.updateTable("usuario").set({ ativo: false, desligado_em: new Date() }).where("login", "=", "desligada").execute();
    expect(await atorDaSessao(db, r.token)).toBeNull();
    expect((await erroDe(entrar(db, { login: "desligada", senha: "uma-senha-longa" }, origem))).codigo).toBe("nao_autenticado");
  });
});

describe("permissão conferida no servidor", () => {
  it("sem sessão: recusado", async () => {
    expect((await erroDe(listarUsuarios(db, null))).codigo).toBe("nao_autenticado");
  });

  it("atendente não lista usuários, e a recusa fica na auditoria", async () => {
    const atendente = await atorDoCargo(db, "atendente");
    expect((await erroDe(listarUsuarios(db, atendente))).codigo).toBe("sem_permissao");
    const a = await ultimaAuditoria("usuarios.ver");
    expect(a.resultado).toBe("recusado");
    expect(a.usuario_id).toBe(atendente.usuarioId);
  });

  it("gerente geral lista usuários", async () => {
    const lista = await listarUsuarios(db, await atorDoCargo(db, "gerente_geral"));
    expect(lista.length).toBeGreaterThanOrEqual(CARGOS.length);
  });

  it("gerente geral não cria dono nem administrador", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral");
    const e = await erroDe(criarUsuario(db, gerente, { nome: "Outro Dono", login: "outro.dono", senha: "uma-senha-longa", cargo: "dono", unidadeId }));
    expect(e.codigo).toBe("sem_permissao");
  });

  it("login repetido é recusado e senha curta é recusada", async () => {
    const adm = await atorDoCargo(db, "administrador");
    expect((await erroDe(criarUsuario(db, adm, { nome: "Repetido", login: "CAIXA", senha: "uma-senha-longa", cargo: "caixa", unidadeId }))).codigo).toBe("conflito");
    expect((await erroDe(criarUsuario(db, adm, { nome: "Curta", login: "curta", senha: "123", cargo: "caixa", unidadeId }))).codigo).toBe("dados_invalidos");
  });
});

describe("auditoria só de inserção (RC-17)", () => {
  it("alterar ou apagar um registro é recusado pelo banco", async () => {
    const a = await ultimaAuditoria("sessao.entrar");
    await expect(sql`UPDATE auditoria SET acao = 'x' WHERE id = ${a.id}`.execute(db)).rejects.toThrow(/não pode ser alterado/);
    await expect(sql`DELETE FROM auditoria WHERE id = ${a.id}`.execute(db)).rejects.toThrow(/não pode ser alterado/);
    await expect(sql`TRUNCATE auditoria`.execute(db)).rejects.toThrow(/não pode ser alterado/);
  });
});
