/**
 * Cardápio para lançar pedido (GET /api/cardapio, tela Novo pedido) contra PostgreSQL real:
 * só quem tem pedidos.lancar; só produtos ativos de categorias ativas; nenhum custo nem dado interno.
 * Chama as mesmas funções que o Next usa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOTP } from "otpauth";
import { criarBanco, type Banco } from "@erp/banco";
import { contasDaComanda, semear, SENHA_DE_TESTE, type ItemDoCardapio } from "@erp/dominio";
import * as r from "../src/servidor/rotas";

const BASE = "http://gestao.teste";
let db: Banco;
const S = Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "k");

function req(caminho: string, metodo: string, cookie?: string, corpo?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

async function entrarComo(login: string): Promise<string> {
  const e = await r.entrarNaSessao(req("/api/sessao", "POST", undefined, { login, senha: SENHA_DE_TESTE }));
  expect(e.status, login).toBe(200);
  const cookie = (e.headers.get("set-cookie") ?? "").split(";")[0]!;
  const corpo = (await e.json()) as { segundoFator: string; id: number };
  if (corpo.segundoFator !== "pendente") return cookie;
  await db.updateTable("usuario").set({ totp_segredo: null, totp_pendente: null, totp_ultimo_passo: null }).where("id", "=", corpo.id).execute();
  const { segredo } = (await (await r.novoSegundoFator(req("/api/segundo-fator", "POST", cookie, {}))).json()) as { segredo: string };
  const codigo = TOTP.generate({ secret: new TOTP({ secret: segredo }).secret });
  expect((await r.confirmarSegundo(req("/api/sessao/segundo-fator", "POST", cookie, { codigo }))).status).toBe(200);
  return cookie;
}

let categoriaAtiva: number;
let categoriaInativa: number;

beforeAll(async () => {
  db = criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 3);
  r.usarBanco(() => db);
  await semear(db);
  // Dados inventados só deste teste (nome com sufixo aleatório).
  categoriaAtiva = (await db.insertInto("categoria").values({ nome: `Cardápio ativo ${S}`, descricao: null, ordem: 9000 }).returning("id").executeTakeFirstOrThrow()).id;
  categoriaInativa = (await db.insertInto("categoria").values({ nome: `Cardápio parado ${S}`, descricao: null, ordem: 9001, ativo: false }).returning("id").executeTakeFirstOrThrow()).id;
  await db
    .insertInto("produto")
    .values([
      { nome: `Prato à venda ${S}`, descricao: "interno", categoria_id: categoriaAtiva, tipo_producao_id: null, preco_centavos: 1990, tempo_preparo_min: null, preco_delivery_centavos: 2490, ordem: 10 },
      { nome: `Prato desativado ${S}`, descricao: null, categoria_id: categoriaAtiva, tipo_producao_id: null, preco_centavos: 1000, tempo_preparo_min: null, ordem: 20, ativo: false },
      { nome: `Prato em categoria parada ${S}`, descricao: null, categoria_id: categoriaInativa, tipo_producao_id: null, preco_centavos: 1500, tempo_preparo_min: null, ordem: 10 },
    ])
    .execute();
});
afterAll(() => db.destroy());

describe("GET /api/cardapio", () => {
  it("sem sessão: 401", async () => {
    expect((await r.verCardapio(req("/api/cardapio", "GET"))).status).toBe(401);
  });

  it.each(["caixa", "cozinheira", "motoboy"])("%s (sem pedidos.lancar): 403 e a recusa fica na auditoria", async (login) => {
    const cookie = await entrarComo(login);
    const antes = Number((await db.selectFrom("auditoria").select((e) => e.fn.countAll().as("n")).where("acao", "=", "pedidos.lancar").where("resultado", "=", "recusado").executeTakeFirstOrThrow()).n);
    const resp = await r.verCardapio(req("/api/cardapio", "GET", cookie));
    expect(resp.status).toBe(403);
    const corpo = await resp.text();
    expect(corpo).not.toContain("precoCentavos");
    const depois = Number((await db.selectFrom("auditoria").select((e) => e.fn.countAll().as("n")).where("acao", "=", "pedidos.lancar").where("resultado", "=", "recusado").executeTakeFirstOrThrow()).n);
    expect(depois).toBe(antes + 1);
  });

  it("atendente: 200, só ativos de categorias ativas, com os campos combinados e nada interno", async () => {
    const cookie = await entrarComo("atendente");
    const resp = await r.verCardapio(req("/api/cardapio", "GET", cookie));
    expect(resp.status).toBe(200);
    const lista = (await resp.json()) as ItemDoCardapio[];
    const nomes = lista.map((i) => i.nome);
    expect(nomes).toContain(`Prato à venda ${S}`);
    expect(nomes).not.toContain(`Prato desativado ${S}`);
    expect(nomes).not.toContain(`Prato em categoria parada ${S}`);

    const meu = lista.find((i) => i.nome === `Prato à venda ${S}`)!;
    expect(meu).toEqual({
      id: expect.any(Number),
      nome: `Prato à venda ${S}`,
      categoria: { id: categoriaAtiva, nome: `Cardápio ativo ${S}`, ordem: 9000 },
      precoCentavos: 1990,
      fotoId: null,
      tempoPreparoMin: null,
    });
    // Toda linha com exatamente estes campos; preço em centavos inteiros.
    for (const i of lista) {
      expect(Object.keys(i).sort()).toEqual(["categoria", "fotoId", "id", "nome", "precoCentavos", "tempoPreparoMin"]);
      expect(Object.keys(i.categoria).sort()).toEqual(["id", "nome", "ordem"]);
      expect(Number.isSafeInteger(i.precoCentavos)).toBe(true);
    }
    // Nada de custo, delivery, descrição interna, ficha ou combo na resposta.
    const texto = JSON.stringify(lista);
    for (const proibido of ["custo", "Custo", "delivery", "Delivery", "descricao", "ficha", "ativo", "combo"]) expect(texto).not.toContain(`"${proibido}`);

    // Produto da semente (inventado) com o preço da loja.
    const cafe = lista.find((i) => i.nome === "Café expresso");
    expect(cafe).toMatchObject({ precoCentavos: 600, tempoPreparoMin: 3, categoria: { nome: "Cafeteria" } });
    // Ordem do cardápio: pela ordem da categoria.
    const ordens = lista.map((i) => i.categoria.ordem);
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens);
  });

  it("supervisor e gerente geral também lançam pedido (200)", async () => {
    for (const login of ["supervisor", "gerente.geral"]) {
      const resp = await r.verCardapio(req("/api/cardapio", "GET", await entrarComo(login)));
      expect(resp.status, login).toBe(200);
    }
  });
});

describe("contas da comanda (centavos inteiros)", () => {
  it("itens, serviço (0 por padrão, opcional) arredondado ao centavo e total", () => {
    expect(contasDaComanda([])).toEqual({ itens: 0, quantidade: 0, servico: 0, total: 0 });
    // Sem serviço por padrão (a casa não cobra, 25/11/2026); com 10% ligado, arredonda ao centavo.
    expect(contasDaComanda([{ precoCentavos: 600, quantidade: 2 }, { precoCentavos: 650, quantidade: 1 }])).toEqual({ itens: 1850, quantidade: 3, servico: 0, total: 1850 });
    expect(contasDaComanda([{ precoCentavos: 600, quantidade: 2 }, { precoCentavos: 650, quantidade: 1 }], 10)).toEqual({ itens: 1850, quantidade: 3, servico: 185, total: 2035 });
    for (const ruim of [10.5, -1, 101, Number.NaN]) expect(() => contasDaComanda([], ruim), String(ruim)).toThrow();
    expect(contasDaComanda([{ precoCentavos: 1000, quantidade: 1 }], 0).servico).toBe(0);
    expect(contasDaComanda([{ precoCentavos: 1000, quantidade: 1 }], 100).servico).toBe(1000);
    // 10% de 1.995 = 199,5 -> 200 (arredonda ao centavo mais perto).
    expect(contasDaComanda([{ precoCentavos: 1995, quantidade: 1 }], 10)).toEqual({ itens: 1995, quantidade: 1, servico: 200, total: 2195 });
    expect(contasDaComanda([{ precoCentavos: 1994, quantidade: 1 }], 10).servico).toBe(199);
  });
  it("recusa preço ou quantidade que não seja inteiro", () => {
    expect(() => contasDaComanda([{ precoCentavos: 10.5, quantidade: 1 }])).toThrow();
    expect(() => contasDaComanda([{ precoCentavos: 100, quantidade: -1 }])).toThrow();
  });
});
