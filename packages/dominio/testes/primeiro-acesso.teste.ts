// Primeiro acesso de um servidor novo: só com o banco vazio de pessoas, uma única vez,
// e o dono criado entra com a própria senha (e passa pelo segundo fator).
import { criarBanco, sql, type Banco } from "@erp/banco";
import { recriarBancoDeTeste } from "../../../packages/banco/src/migrar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { entrar, prepararPrimeiroAcesso } from "../src/index";

const base = process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste";
const url = base.replace(/\/([a-z0-9_]+?)(_teste)?$/, "/$1_primeiro_teste");
let db: Banco;

const dados = { empresa: "Empresa Fictícia", unidade: "Loja fictícia", nome: "Dona Fictícia", login: "dona.ficticia", senha: "uma-senha-bem-longa-1" };

beforeAll(async () => {
  await recriarBancoDeTeste(url);
  db = criarBanco(url, 6);
});
afterAll(async () => {
  await db.destroy();
});

describe("primeiro acesso do servidor", () => {
  it("recusa dados inválidos sem gravar nada", async () => {
    await expect(prepararPrimeiroAcesso(db, { ...dados, senha: "curta" })).rejects.toMatchObject({ codigo: "dados_invalidos" });
    await expect(prepararPrimeiroAcesso(db, { ...dados, login: "Com Espaço" })).rejects.toMatchObject({ codigo: "dados_invalidos" });
    const n = await db.selectFrom("usuario").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
    expect(n.n).toBe(0);
  });

  it("dois ao mesmo tempo criam um dono só; depois disso é sempre recusado", async () => {
    const r = await Promise.allSettled([prepararPrimeiroAcesso(db, dados), prepararPrimeiroAcesso(db, { ...dados, login: "outra.pessoa" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const recusa = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(recusa.reason).toMatchObject({ codigo: "conflito" });
    await expect(prepararPrimeiroAcesso(db, { ...dados, login: "mais.uma" })).rejects.toMatchObject({ codigo: "conflito" });

    const pessoas = await db.selectFrom("usuario_perfil").select(["perfil_codigo"]).execute();
    expect(pessoas).toEqual([{ perfil_codigo: "dono" }]);
    const empresas = await db.selectFrom("empresa").select("id").execute();
    expect(empresas).toHaveLength(1);
  });

  it("cria os turnos da equipe, os setores e a auditoria; a senha só como hash", async () => {
    const turnos = await db.selectFrom("turno").select(["nome", "inicio", "fim"]).orderBy("inicio").execute();
    expect(turnos.map((t) => [t.nome, String(t.inicio).slice(0, 5), String(t.fim).slice(0, 5)])).toEqual([
      ["Turno 1", "08:00", "15:30"],
      ["Turno 2", "15:30", "23:30"],
    ]);
    const setores = await db.selectFrom("setor").select("nome").execute();
    expect(setores).toHaveLength(4);
    const u = await db.selectFrom("usuario").select(["senha_hash", "totp_segredo"]).executeTakeFirstOrThrow();
    expect(u.senha_hash).not.toContain(dados.senha);
    expect(u.totp_segredo).toBeNull();
    const audit = await db.selectFrom("auditoria").select(["acao", "detalhes"]).execute();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]?.detalhes)).toContain("primeiro_acesso");
    expect(JSON.stringify(audit)).not.toContain(dados.senha);
  });

  it("o dono entra com a própria senha e ainda precisa configurar o segundo fator", async () => {
    const { login } = await db.selectFrom("usuario").select("login").executeTakeFirstOrThrow();
    const r = await entrar(db, { login, senha: dados.senha }, { ip: null, agente: "teste" });
    expect(r.ator.cargos).toEqual(["dono"]);
    expect(r.ator.segundoFator).toBe("pendente");
    await expect(entrar(db, { login, senha: "senha-errada-1234" }, { ip: null, agente: "teste" })).rejects.toBeTruthy();
  });
});
