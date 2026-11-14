/**
 * Prova, chamando a API diretamente (sem tela), que o servidor bloqueia quem não tem
 * alçada. Mesmas funções que o Next usa em app/api/.../route.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBanco, type Banco } from "@erp/banco";
import { semear, SENHA_DE_TESTE } from "@erp/dominio";
import { entrarNaSessao, novoUsuario, quemSouEu, sairDaSessao, saude, usarBanco, verUsuarios } from "../src/servidor/rotas";

const BASE = "http://gestao.teste";
let db: Banco;
let unidadeId: number;

beforeAll(async () => {
  db = criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
  usarBanco(() => db);
  ({ unidadeId } = await semear(db));
});
afterAll(() => db.destroy());

function req(caminho: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { ...init, headers });
}

async function entrarComo(login: string): Promise<string> {
  const r = await entrarNaSessao(req("/api/sessao", { method: "POST", body: JSON.stringify({ login, senha: SENHA_DE_TESTE }) }));
  expect(r.status).toBe(200);
  const setCookie = r.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Lax/);
  return setCookie.split(";")[0]!;
}

describe("API da gestão", () => {
  it("saúde responde sem dado interno", async () => {
    const r = await saude(req("/api/saude"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("sem sessão: 401 em todas as rotas protegidas", async () => {
    expect((await quemSouEu(req("/api/eu"))).status).toBe(401);
    expect((await verUsuarios(req("/api/usuarios"))).status).toBe(401);
    expect((await novoUsuario(req("/api/usuarios", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("cookie inventado não vale", async () => {
    expect((await verUsuarios(req("/api/usuarios", { cookie: "erp_sessao=inventado" }))).status).toBe(401);
  });

  it("senha errada: 401 com mensagem genérica", async () => {
    const r = await entrarNaSessao(req("/api/sessao", { method: "POST", body: JSON.stringify({ login: "caixa", senha: "nada-disso" }) }));
    expect(r.status).toBe(401);
    expect((await r.json()).mensagem).toBe("Usuário ou senha incorretos.");
  });

  it("atendente e caixa chamando a API direto: 403 ao listar e ao criar usuário", async () => {
    for (const login of ["atendente", "caixa", "cozinheira", "motoboy"]) {
      const cookie = await entrarComo(login);
      expect((await verUsuarios(req("/api/usuarios", { cookie }))).status).toBe(403);
      const criar = await novoUsuario(
        req("/api/usuarios", { method: "POST", cookie, body: JSON.stringify({ nome: "Intruso", login: "intruso", senha: "uma-senha-longa", cargo: "dono", unidadeId }) }),
      );
      expect(criar.status).toBe(403);
    }
    const criado = await db.selectFrom("usuario").select("id").where("login", "=", "intruso").executeTakeFirst();
    expect(criado).toBeUndefined();
  });

  it("gerente geral lista e cria atendente, mas não cria dono", async () => {
    const cookie = await entrarComo("gerente.geral");
    const lista = await verUsuarios(req("/api/usuarios", { cookie }));
    expect(lista.status).toBe(200);
    const corpo = (await lista.json()) as Array<Record<string, unknown>>;
    expect(corpo[0]).not.toHaveProperty("senha_hash"); // nenhum dado sensível sai

    const ok = await novoUsuario(req("/api/usuarios", { method: "POST", cookie, body: JSON.stringify({ nome: "Nova Atendente", login: "nova.atendente", senha: "uma-senha-longa", cargo: "atendente", unidadeId }) }));
    expect(ok.status).toBe(201);
    const dono = await novoUsuario(req("/api/usuarios", { method: "POST", cookie, body: JSON.stringify({ nome: "Dono 2", login: "dono2", senha: "uma-senha-longa", cargo: "dono", unidadeId }) }));
    expect(dono.status).toBe(403);
  });

  it("requisição de outro site é recusada mesmo com sessão válida", async () => {
    const cookie = await entrarComo("administrador");
    const r = await novoUsuario(
      req("/api/usuarios", { method: "POST", cookie, headers: { origin: "https://site-malicioso.exemplo" }, body: JSON.stringify({ nome: "X", login: "via.outro.site", senha: "uma-senha-longa", cargo: "caixa", unidadeId }) }),
    );
    expect(r.status).toBe(403);
  });

  it("sair invalida o cookie no servidor", async () => {
    const cookie = await entrarComo("supervisor");
    expect((await quemSouEu(req("/api/eu", { cookie }))).status).toBe(200);
    await sairDaSessao(req("/api/sessao", { method: "DELETE", cookie }));
    expect((await quemSouEu(req("/api/eu", { cookie }))).status).toBe(401);
  });

  it("corpo inválido: 400, não 500", async () => {
    const cookie = await entrarComo("administrador");
    const r = await novoUsuario(req("/api/usuarios", { method: "POST", cookie, body: "{nao-e-json" }));
    expect(r.status).toBe(400);
  });
});
