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
    expect(await r.json()).toEqual({ ok: true, versao: "desenvolvimento" });
  });

  it("saúde mostra a versão só quando é um commit (nada inventado pelo ambiente)", async () => {
    const antes = process.env.ERP_VERSAO;
    try {
      process.env.ERP_VERSAO = "a".repeat(40);
      expect(await (await saude(req("/api/saude"))).json()).toEqual({ ok: true, versao: "a".repeat(40) });
      process.env.ERP_VERSAO = "<script>";
      expect(await (await saude(req("/api/saude"))).json()).toEqual({ ok: true, versao: "desenvolvimento" });
    } finally {
      if (antes === undefined) delete process.env.ERP_VERSAO;
      else process.env.ERP_VERSAO = antes;
    }
  });

  it("sem sessão: 401 em todas as rotas protegidas", async () => {
    expect((await quemSouEu(req("/api/eu"))).status).toBe(401);
    expect((await verUsuarios(req("/api/usuarios"))).status).toBe(401);
    expect((await novoUsuario(req("/api/usuarios", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("cookie inventado ou malformado: 401, nunca 500", async () => {
    expect((await verUsuarios(req("/api/usuarios", { cookie: "erp_sessao=inventado" }))).status).toBe(401);
    expect((await verUsuarios(req("/api/usuarios", { cookie: "erp_sessao=%E0%A4%A" }))).status).toBe(401);
  });

  it("Origin \"null\" ou inválido: 403, nunca 500", async () => {
    for (const origin of ["null", "não é url"]) {
      const r = await entrarNaSessao(req("/api/sessao", { method: "POST", headers: { origin }, body: JSON.stringify({ login: "caixa", senha: SENHA_DE_TESTE }) }));
      expect(r.status).toBe(403);
    }
  });

  it("atrás do proxy vale o Host pedido pelo navegador, não o endereço interno", async () => {
    // O Next vê o endereço interno; o Caddy repassa o Host público.
    const pedir = (origin: string) =>
      entrarNaSessao(
        new Request("http://localhost:3000/api/sessao", {
          method: "POST",
          headers: { host: "gestao.187-53-114-38.sslip.io", origin, "content-type": "application/json" },
          body: JSON.stringify({ login: "caixa", senha: SENHA_DE_TESTE }),
        }),
      );
    expect((await pedir("https://gestao.187-53-114-38.sslip.io")).status).toBe(200);
    expect((await pedir("https://GESTAO.187-53-114-38.sslip.io")).status).toBe(200);
    expect((await pedir("https://loja.187-53-114-38.sslip.io")).status).toBe(403);
    expect((await pedir("http://localhost:3000")).status).toBe(403);
  });

  it("IP enviado pelo cliente em x-forwarded-for não é aceito sem proxy confiável", async () => {
    await entrarNaSessao(req("/api/sessao", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify({ login: "caixa", senha: "nada-disso" }) }));
    const a = await db.selectFrom("auditoria").select("ip").orderBy("id", "desc").executeTakeFirstOrThrow();
    expect(a.ip).toBeNull();
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

  it("gerente geral lista e cria atendente, mas não cria dono nem financeiro", async () => {
    const cookie = await entrarComo("gerente.geral");
    const lista = await verUsuarios(req("/api/usuarios", { cookie }));
    expect(lista.status).toBe(200);
    const corpo = (await lista.json()) as Array<Record<string, unknown>>;
    expect(corpo[0]).not.toHaveProperty("senha_hash"); // nenhum dado sensível sai

    const ok = await novoUsuario(req("/api/usuarios", { method: "POST", cookie, body: JSON.stringify({ nome: "Nova Atendente", login: "nova.atendente", senha: "uma-senha-longa", cargo: "atendente", unidadeId }) }));
    expect(ok.status).toBe(201);
    for (const cargo of ["dono", "financeiro"]) {
      const login = `api.${cargo}`;
      const r = await novoUsuario(req("/api/usuarios", { method: "POST", cookie, body: JSON.stringify({ nome: "Tentativa", login, senha: "uma-senha-longa", cargo, unidadeId }) }));
      expect(r.status).toBe(403);
      expect(await db.selectFrom("usuario").select("id").where("login", "=", login).executeTakeFirst()).toBeUndefined();
    }
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
