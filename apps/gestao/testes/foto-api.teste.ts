/**
 * Foto do produto pela API (decisão 0022): permissão antes de ler o arquivo, limite do pedido,
 * cabeçalhos da imagem e id inválido sem sessão. Chama as mesmas funções que o Next usa.
 */
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOTP } from "otpauth";
import { criarBanco, type Banco } from "@erp/banco";
import { semear, SENHA_DE_TESTE } from "@erp/dominio";
import * as r from "../src/servidor/rotas";

const BASE = "http://gestao.teste";
let db: Banco;
const S = Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "k");

function req(caminho: string, metodo: string, cookie?: string, corpo?: BodyInit, cabecalhos: Record<string, string> = {}) {
  const headers = new Headers(cabecalhos);
  if (cookie) headers.set("cookie", cookie);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { method: metodo, headers, body: corpo, ...(corpo instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
}

async function entrarComo(login: string): Promise<string> {
  const e = await r.entrarNaSessao(req("/api/sessao", "POST", undefined, JSON.stringify({ login, senha: SENHA_DE_TESTE })));
  expect(e.status).toBe(200);
  const cookie = (e.headers.get("set-cookie") ?? "").split(";")[0]!;
  const corpo = (await e.json()) as { segundoFator: string; id: number };
  if (corpo.segundoFator !== "pendente") return cookie;
  await db.updateTable("usuario").set({ totp_segredo: null, totp_pendente: null, totp_ultimo_passo: null }).where("id", "=", corpo.id).execute();
  const { segredo } = (await (await r.novoSegundoFator(req("/api/segundo-fator", "POST", cookie, "{}"))).json()) as { segredo: string };
  const codigo = TOTP.generate({ secret: new TOTP({ secret: segredo }).secret });
  expect((await r.confirmarSegundo(req("/api/sessao/segundo-fator", "POST", cookie, JSON.stringify({ codigo })))).status).toBe(200);
  return cookie;
}

/** PNG liso gerado aqui (sem foto real). */
function png(w: number, h: number): Buffer {
  const crcTab = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTab[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo), dados]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)]);
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(cru)), bloco("IEND", Buffer.alloc(0))]);
}

/** Corpo sem fim: conta quantos bytes a rota chegou a ler. */
function corpoSemFim() {
  const lido = { bytes: 0 };
  const pedaco = new Uint8Array(64 * 1024).fill(65);
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      lido.bytes += pedaco.length;
      if (lido.bytes > 64 * 1024 * 1024) c.close();
      else c.enqueue(pedaco);
    },
  });
  return { stream, lido };
}

let gerente: string;
let cozinheira: string;
let produtoId: number;

beforeAll(async () => {
  db = criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
  r.usarBanco(() => db);
  await semear(db);
  gerente = await entrarComo("gerente.geral");
  cozinheira = await entrarComo("cozinheira");
  const cat = await db.selectFrom("categoria").select("id").where("ativo", "=", true).executeTakeFirstOrThrow();
  produtoId = (await db.insertInto("produto").values({ nome: `Foto API ${S}`, categoria_id: cat.id, preco_centavos: 100 }).returning("id").executeTakeFirstOrThrow()).id;
});
afterAll(() => db.destroy());

describe("foto do produto pela API", () => {
  it("quem não pode enviar recebe 403 sem a rota ler o arquivo inteiro; sem sessão, 401", async () => {
    const { stream, lido } = corpoSemFim();
    const resp = await r.enviarFotoDoProduto(req("/api/cadastros/produtos/foto", "POST", cozinheira, stream));
    expect(resp.status).toBe(403);
    expect(lido.bytes).toBeLessThan(2 * 1024 * 1024);
    expect((await r.enviarFotoDoProduto(req("/api/cadastros/produtos/foto", "POST", undefined, "{}"))).status).toBe(401);
  });

  it("pedido acima do limite: 400 pelo cabeçalho e contando os bytes", async () => {
    const grande = await r.enviarFotoDoProduto(req("/api/cadastros/produtos/foto", "POST", gerente, "{}", { "content-length": String(50 * 1024 * 1024) }));
    expect(grande.status).toBe(400);
    const { stream, lido } = corpoSemFim();
    const resp = await r.enviarFotoDoProduto(req("/api/cadastros/produtos/foto", "POST", gerente, stream));
    expect(resp.status).toBe(400);
    expect(((await resp.json()) as { mensagem: string }).mensagem).toContain("8 MB");
    expect(lido.bytes).toBeLessThan(13 * 1024 * 1024);
  });

  it("envia e serve a imagem com os cabeçalhos de segurança; id inválido sem sessão dá 401", async () => {
    const jpg = png(600, 400);
    const env = await r.enviarFotoDoProduto(req("/api/cadastros/produtos/foto", "POST", gerente, JSON.stringify({ produtoId, arquivo: jpg.toString("base64") })));
    expect(env.status).toBe(201);
    const { id, sha256 } = (await env.json()) as { id: number; sha256: string };
    const ver = await r.verFotoDoProduto(req(`/api/cadastros/produtos/foto/${id}`, "GET", cozinheira), { id: String(id) });
    expect(ver.status).toBe(200);
    expect(ver.headers.get("content-type")).toBe("image/webp");
    expect(ver.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ver.headers.get("content-security-policy")).toContain("sandbox");
    expect(ver.headers.get("cache-control")).toContain("private");
    expect(ver.headers.get("etag")).toBe(`"${sha256}"`);
    expect((await r.verFotoDoProduto(req("/api/cadastros/produtos/foto/abc", "GET"), { id: "abc" })).status).toBe(401);
    expect((await r.verFotoDoProduto(req("/api/cadastros/produtos/foto/0x1", "GET", gerente), { id: "0x1" })).status).toBe(404);
  });
});
