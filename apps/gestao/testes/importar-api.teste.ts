/**
 * Importação de planilha pela API (decisão 0020): limite de tamanho do pedido (pelo cabeçalho e
 * contando os bytes), permissão conferida antes de ler o arquivo, modelo para baixar e o fluxo
 * conferir -> gravar -> clique repetido, chamando as mesmas funções que o Next usa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOTP } from "otpauth";
import { criarBanco, type Banco } from "@erp/banco";
import { semear, SENHA_DE_TESTE } from "@erp/dominio";
import * as r from "../src/servidor/rotas";

const BASE = "http://gestao.teste";
let db: Banco;
const S = Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "k");

function req(caminho: string, metodo: string, cookie?: string, corpo?: string, cabecalhos: Record<string, string> = {}) {
  const headers = new Headers(cabecalhos);
  if (cookie) headers.set("cookie", cookie);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { method: metodo, headers, body: corpo });
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

const corpo = (csv: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ tipo: "produtos", arquivo: { nome: "cardapio.csv", conteudo: Buffer.from(csv).toString("base64") }, ...extra });

let gerente: string;
let supervisor: string;

beforeAll(async () => {
  db = criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
  r.usarBanco(() => db);
  await semear(db);
  gerente = await entrarComo("gerente.geral");
  supervisor = await entrarComo("supervisor");
});
afterAll(() => db.destroy());

describe("importar planilha pela API", () => {
  it("conferir -> gravar -> clique repetido: 200, 201 e 200 com o mesmo resultado", async () => {
    const csv = `Nome;Categoria;Preço\nApi ${S} 1;Bebidas;4,00\nApi ${S} 2;Hambúrgueres;30,00\n`;
    const c = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", gerente, corpo(csv)));
    expect(c.status).toBe(200);
    const conf = (await c.json()) as { chave: string; resumo: { prontas: number } };
    expect(conf.resumo.prontas).toBe(2);
    const g1 = await r.gravarImportacao(req("/api/cadastros/importar/gravar", "POST", gerente, corpo(csv, { chave: conf.chave })));
    expect(g1.status).toBe(201);
    const g2 = await r.gravarImportacao(req("/api/cadastros/importar/gravar", "POST", gerente, corpo(csv, { chave: conf.chave })));
    expect(g2.status).toBe(200);
    expect(await g2.json()).toMatchObject({ criados: 2, repetida: true });
    expect(await db.selectFrom("produto").select("id").where("nome", "like", `Api ${S}%`).execute()).toHaveLength(2);
  });

  it("pedido maior que o limite: recusado pelo cabeçalho e também quando o cabeçalho mente", async () => {
    // Maior que o pedido inteiro (arquivo de 2 MB + folga das correções do painel).
    const grande = corpo("x".repeat(4 * 1024 * 1024));
    const pelo = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", gerente, grande));
    expect(pelo.status).toBe(400);
    expect(((await pelo.json()) as { mensagem: string }).mensagem).toContain("máximo é 2 MB");
    const mentindo = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", gerente, grande, { "content-length": "10" }));
    expect(mentindo.status).toBe(400);
    // Arquivo de 2 MB + 1 byte (cabe no pedido, mas não no limite do arquivo).
    const justo = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", gerente, corpo("y".repeat(2 * 1024 * 1024 + 1))));
    expect(justo.status).toBe(400);
    expect(((await justo.json()) as { mensagem: string }).mensagem).toContain("máximo é 2 MB");
  });

  it("correções do painel: a folga cabe 2.000; passou do pedido, a mensagem fala das correções (não do arquivo)", async () => {
    const csv = `Nome;Categoria;Preço\nFolga ${S};Bebidas;4,00\n`;
    const cheias = Array.from({ length: 2000 }, () => ({ linha: 2, coluna: 0, valor: `Folga ${S}`.padEnd(500, "x") }));
    const cabe = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", gerente, corpo(csv, { correcoes: cheias })));
    expect(cabe.status).toBe(200);
    const demais = corpo(csv, { correcoes: Array.from({ length: 8000 }, () => ({ linha: 2, coluna: 0, valor: "x".repeat(500) })) });
    for (const cab of [{}, { "content-length": "10" }] as Record<string, string>[]) {
      const x = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", gerente, demais, cab));
      expect(x.status).toBe(400);
      expect(((await x.json()) as { mensagem: string }).mensagem).toContain("Correções demais de uma vez");
    }
    const fichas = await r.importarFichasDaPlanilha(req("/api/fichas/importar", "POST", gerente, JSON.stringify({ arquivo: { nome: "f.csv", conteudo: "eA==" }, aplicar: false, correcoes: JSON.parse(demais).correcoes })));
    expect(fichas.status).toBe(400);
    expect(((await fichas.json()) as { mensagem: string }).mensagem).toContain("Correções demais de uma vez");
  });

  it("supervisor recebe 403 antes de o arquivo ser lido; outro site é recusado", async () => {
    const s = await r.conferirImportacao(req("/api/cadastros/importar/conferir", "POST", supervisor, "isto nem é json"));
    expect(s.status).toBe(403);
    expect((await r.baixarModeloDePlanilha(req("/api/cadastros/importar/modelo?tipo=produtos&formato=xlsx", "GET", supervisor))).status).toBe(403);
    const fora = await r.gravarImportacao(req("/api/cadastros/importar/gravar", "POST", gerente, corpo("Nome\nA\n"), { origin: "https://outro.site" }));
    expect(fora.status).toBe(403);
  });

  it("modelo para baixar: .xlsx e .csv como anexo", async () => {
    const x = await r.baixarModeloDePlanilha(req("/api/cadastros/importar/modelo?tipo=produtos&formato=xlsx", "GET", gerente));
    expect(x.status).toBe(200);
    expect(x.headers.get("content-type")).toContain("spreadsheetml");
    expect(x.headers.get("content-disposition")).toBe('attachment; filename="modelo-produtos.xlsx"');
    const bytes = new Uint8Array(await x.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const c = await r.baixarModeloDePlanilha(req("/api/cadastros/importar/modelo?tipo=ingredientes&formato=csv", "GET", gerente));
    // Com a marca do UTF-8 no começo (o Excel no Windows abre com os acentos certos).
    const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await c.arrayBuffer());
    expect(texto).toMatch(/^\ufeffNome;Unidade do estoque;Área;Fornecedor;Embalagens\r\n/);
    expect((await r.baixarModeloDePlanilha(req("/api/cadastros/importar/modelo?tipo=x&formato=pdf", "GET", gerente))).status).toBe(400);
  });
});
