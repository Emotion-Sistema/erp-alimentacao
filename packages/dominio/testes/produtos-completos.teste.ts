/**
 * Produtos completos, parte 1 (migração 0015; decisão 0021): preço do delivery, tamanhos, grupos de
 * adicionais e o preço do item. Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import {
  calcularPrecoDoItem,
  ErroDeRegra,
  listarGruposDeAdicionais,
  listarProdutos,
  nomeComparavel,
  precoDoItem,
  salvarCategoria,
  salvarGrupoDeAdicionais,
  salvarProduto,
  salvarTipoDeProducao,
  type Ator,
  type GrupoDeAdicionais,
  type Produto,
} from "../src/index";
import { sql } from "@erp/banco";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let atendente: Ator;
let cozinheira: Ator;
let cat: number;
let tipo: number;
const sufixo = randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!);
let n = 0;
const nomeNovo = (base: string) => `${base} ${sufixo} ${String.fromCharCode(97 + (n++ % 26))}${Math.floor(n / 26)}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  atendente = await atorDoCargo(db, "atendente");
  cozinheira = await atorDoCargo(db, "cozinheira");
  cat = (await salvarCategoria(db, gerente, { nome: `Lanches PC ${sufixo}` })).id;
  tipo = (await salvarTipoDeProducao(db, gerente, { nome: `Chapa PC ${sufixo}`, area: "cozinha" })).id;
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

const novoProduto = (extra: Record<string, unknown> = {}) =>
  salvarProduto(db, gerente, { nome: nomeNovo("Lanche"), categoriaId: cat, precoCentavos: 2000, tipoProducaoId: tipo, tempoPreparoMin: 10, ...extra });

const ultimaAuditoria = (alvoTipo: string, alvoId: number) =>
  db
    .selectFrom("auditoria")
    .select(["detalhes", "usuario_id"])
    .where("alvo_tipo", "=", alvoTipo)
    .where("alvo_id", "=", String(alvoId))
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();

describe("preço do delivery", () => {
  it("nulo = igual ao da loja; com valor próprio, o delivery usa o dele; limpar volta a ser igual", async () => {
    const p = await novoProduto();
    expect(p.precoDeliveryCentavos).toBeNull();
    expect((await calcularPrecoDoItem(db, p.id, "delivery", {})).unitarioCentavos).toBe(2000);
    const q = await salvarProduto(db, gerente, { id: p.id, precoDeliveryCentavos: 2350 });
    expect(q.precoDeliveryCentavos).toBe(2350);
    expect(q.precoCentavos).toBe(2000);
    expect((await calcularPrecoDoItem(db, p.id, "loja", {})).unitarioCentavos).toBe(2000);
    expect((await calcularPrecoDoItem(db, p.id, "delivery", {})).unitarioCentavos).toBe(2350);
    // Alterar outro campo não mexe no preço do delivery.
    expect((await salvarProduto(db, gerente, { id: p.id, nome: nomeNovo("Lanche") })).precoDeliveryCentavos).toBe(2350);
    expect((await salvarProduto(db, gerente, { id: p.id, precoDeliveryCentavos: null })).precoDeliveryCentavos).toBeNull();
    const a = await ultimaAuditoria("produto", p.id);
    expect((a.detalhes as { antes: Produto }).antes.precoDeliveryCentavos).toBe(2350);
  });

  it("recusa zero, negativo, fração e acima do limite (também no banco)", async () => {
    const p = await novoProduto();
    for (const v of [0, -1, 12.5, 1_000_000, "12"]) {
      expect((await erroDe(salvarProduto(db, gerente, { id: p.id, precoDeliveryCentavos: v }))).codigo).toBe("dados_invalidos");
    }
    await expect(db.updateTable("produto").set({ preco_delivery_centavos: 0 }).where("id", "=", p.id).execute()).rejects.toMatchObject({ code: "23514" });
  });
});

describe("tamanhos", () => {
  it("cria na ordem, preço = produto + acréscimo do canal; obrigatório escolher", async () => {
    const p = await novoProduto({
      precoDeliveryCentavos: 2200,
      tamanhos: [
        { nome: "Pequeno", acrescimoCentavos: 0 },
        { nome: "Grande", acrescimoCentavos: 500, acrescimoDeliveryCentavos: 700 },
      ],
    });
    expect(p.tamanhos.map((t) => [t.nome, t.acrescimoCentavos, t.acrescimoDeliveryCentavos])).toEqual([
      ["Pequeno", 0, null],
      ["Grande", 500, 700],
    ]);
    const [pq, gr] = p.tamanhos;
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", {}))).message).toContain("escolha o tamanho");
    expect((await calcularPrecoDoItem(db, p.id, "loja", { tamanhoId: pq!.id })).unitarioCentavos).toBe(2000);
    expect((await calcularPrecoDoItem(db, p.id, "loja", { tamanhoId: gr!.id })).unitarioCentavos).toBe(2500);
    expect((await calcularPrecoDoItem(db, p.id, "delivery", { tamanhoId: pq!.id })).unitarioCentavos).toBe(2200);
    expect((await calcularPrecoDoItem(db, p.id, "delivery", { tamanhoId: gr!.id })).unitarioCentavos).toBe(2900);
    // Tamanho de outro produto não vale.
    const outro = await novoProduto({ tamanhos: [{ nome: "Único", acrescimoCentavos: 0 }] });
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", { tamanhoId: outro.tamanhos[0]!.id }))).message).toContain("tamanho não encontrado");
    // Produto sem tamanho recusa tamanho.
    const sem = await novoProduto();
    expect((await erroDe(calcularPrecoDoItem(db, sem.id, "loja", { tamanhoId: pq!.id }))).message).toContain("não tem tamanhos");
  });

  it("lista completa: reordena, renomeia trocando nomes, tira (fica inativo) e traz de volta", async () => {
    const p = await novoProduto({ tamanhos: [{ nome: "P", acrescimoCentavos: 0 }, { nome: "M", acrescimoCentavos: 300 }, { nome: "G", acrescimoCentavos: 600 }] });
    const [P, M, G] = p.tamanhos;
    // Troca os nomes de P e G na mesma gravação e muda a ordem.
    const q = await salvarProduto(db, gerente, {
      id: p.id,
      tamanhos: [
        { id: G!.id, nome: "P", acrescimoCentavos: 0 },
        { id: P!.id, nome: "G", acrescimoCentavos: 600 },
      ],
    });
    expect(q.tamanhos.map((t) => [t.id, t.nome])).toEqual([
      [G!.id, "P"],
      [P!.id, "G"],
    ]);
    const m = await db.selectFrom("produto_tamanho").select(["ativo"]).where("id", "=", M!.id).executeTakeFirstOrThrow();
    expect(m.ativo).toBe(false);
    // Tamanho tirado não vende.
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", { tamanhoId: M!.id }))).message).toContain("tamanho não encontrado");
    // Volta com o mesmo id.
    const r = await salvarProduto(db, gerente, { id: p.id, tamanhos: [...q.tamanhos.map((t) => ({ id: t.id, nome: t.nome, acrescimoCentavos: t.acrescimoCentavos })), { id: M!.id, nome: "M", acrescimoCentavos: 300 }] });
    expect(r.tamanhos.map((t) => t.nome)).toEqual(["P", "G", "M"]);
    // Lista vazia: produto volta a não ter tamanho.
    const s = await salvarProduto(db, gerente, { id: p.id, tamanhos: [] });
    expect(s.tamanhos).toEqual([]);
    expect((await calcularPrecoDoItem(db, p.id, "loja", {})).unitarioCentavos).toBe(2000);
    const a = await ultimaAuditoria("produto", p.id);
    expect((a.detalhes as { antes: Produto }).antes.tamanhos).toHaveLength(3);
  });

  it("recusa nome repetido (como o banco compara), id de outro produto, id repetido, acréscimo inválido e mais de 10", async () => {
    const p = await novoProduto();
    expect(nomeComparavel("300ml")).toBe(nomeComparavel("300 ML"));
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, tamanhos: [{ nome: "300ml", acrescimoCentavos: 0 }, { nome: "300 ML", acrescimoCentavos: 100 }] }))).message).toContain("repetido");
    const outro = await novoProduto({ tamanhos: [{ nome: "X", acrescimoCentavos: 0 }] });
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, tamanhos: [{ id: outro.tamanhos[0]!.id, nome: "X", acrescimoCentavos: 0 }] }))).codigo).toBe("nao_encontrado");
    const q = await salvarProduto(db, gerente, { id: p.id, tamanhos: [{ nome: "A", acrescimoCentavos: 0 }] });
    const t = q.tamanhos[0]!.id;
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, tamanhos: [{ id: t, nome: "A", acrescimoCentavos: 0 }, { id: t, nome: "B", acrescimoCentavos: 0 }] }))).message).toContain("duas vezes");
    for (const v of [-1, 1.5, 1_000_000, null])
      expect((await erroDe(salvarProduto(db, gerente, { id: p.id, tamanhos: [{ nome: "Z", acrescimoCentavos: v }] }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, tamanhos: Array.from({ length: 11 }, (_, i) => ({ nome: `T${i}`, acrescimoCentavos: 0 })) }))).message).toContain("No máximo 10");
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, tamanhos: [{ nome: "a\u0007", acrescimoCentavos: 0 }] }))).message).toContain("caractere inválido");
    // Nada mudou depois das recusas (tudo numa transação).
    expect((await listarProdutos(db, gerente)).find((x) => x.id === p.id)!.tamanhos.map((x) => x.nome)).toEqual(["A"]);
  });
});

describe("grupos de adicionais", () => {
  it("cria, lista, altera itens (lista completa) e audita; cozinheira só vê; atendente nem vê", async () => {
    const g = await salvarGrupoDeAdicionais(db, gerente, {
      nome: nomeNovo("Molhos"),
      minimo: 0,
      maximo: 3,
      itens: [
        { nome: "Barbecue", precoCentavos: 0 },
        { nome: "Cheddar", precoCentavos: 400, precoDeliveryCentavos: 500, maximoPorItem: 2 },
      ],
    });
    expect(g.itens.map((i) => [i.nome, i.precoCentavos, i.precoDeliveryCentavos, i.maximoPorItem, i.ativo])).toEqual([
      ["Barbecue", 0, null, 1, true],
      ["Cheddar", 400, 500, 2, true],
    ]);
    expect((await listarGruposDeAdicionais(db, cozinheira)).some((x) => x.id === g.id)).toBe(true);
    expect((await erroDe(listarGruposDeAdicionais(db, atendente))).codigo).toBe("sem_permissao");
    expect((await erroDe(salvarGrupoDeAdicionais(db, cozinheira, { id: g.id, nome: "Outro" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(listarGruposDeAdicionais(db, null))).codigo).toBe("nao_autenticado");
    const [bbq, ched] = g.itens;
    const h = await salvarGrupoDeAdicionais(db, gerente, { id: g.id, itens: [{ id: ched!.id, nome: "Cheddar cremoso", precoCentavos: 450, maximoPorItem: 2 }, { nome: "Maionese verde", precoCentavos: 200 }] });
    expect(h.itens.filter((i) => i.ativo).map((i) => i.nome)).toEqual(["Cheddar cremoso", "Maionese verde"]);
    expect(h.itens.find((i) => i.id === bbq!.id)!.ativo).toBe(false);
    expect(h.minimo).toBe(0);
    expect(h.maximo).toBe(3);
    const a = await ultimaAuditoria("grupo_adicional", g.id);
    expect((a.detalhes as { antes: GrupoDeAdicionais }).antes.itens.map((i) => i.nome)).toEqual(["Barbecue", "Cheddar"]);
  });

  it("recusa mínimo acima do máximo, obrigatório sem itens bastantes, nomes repetidos e item de outro grupo", async () => {
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("G"), minimo: 2, maximo: 1, itens: [] }))).message).toContain("mínimo");
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Ponto"), minimo: 1, maximo: 1, itens: [] }))).message).toContain("pelo menos um adicional");
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("G"), minimo: 3, maximo: 3, itens: [{ nome: "A", precoCentavos: 0, maximoPorItem: 2 }] }))).message).toContain("não bastam");
    // Mínimo 3 com um item que vale 3 vezes basta.
    await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("G"), minimo: 3, maximo: 3, itens: [{ nome: "A", precoCentavos: 0, maximoPorItem: 3 }] });
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("G"), itens: [{ nome: "Bacon", precoCentavos: 0 }, { nome: "bacón", precoCentavos: 0 }] }))).message).toContain("repetido");
    const um = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("G"), itens: [{ nome: "A", precoCentavos: 0 }] });
    const dois = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("G"), itens: [{ nome: "B", precoCentavos: 0 }] });
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { id: dois.id, itens: [{ id: um.itens[0]!.id, nome: "A", precoCentavos: 0 }] }))).codigo).toBe("nao_encontrado");
    // Grupo com nome repetido entre os ativos.
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { nome: um.nome.toUpperCase() }))).codigo).toBe("conflito");
    for (const v of [-1, 0.5, 1_000_000])
      expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { id: um.id, itens: [{ nome: "A", precoCentavos: v }] }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { id: um.id, itens: [{ nome: "A", precoCentavos: 0, maximoPorItem: 11 }] }))).codigo).toBe("dados_invalidos");
    // Tirar o último item de um grupo obrigatório é recusado; desativar o grupo pode.
    const ob = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Ob"), minimo: 1, maximo: 1, itens: [{ nome: "Mal passado", precoCentavos: 0 }] });
    expect((await erroDe(salvarGrupoDeAdicionais(db, gerente, { id: ob.id, itens: [] }))).message).toContain("pelo menos um adicional");
    expect((await salvarGrupoDeAdicionais(db, gerente, { id: ob.id, ativo: false })).ativo).toBe(false);
  });
});

describe("preço do item com adicionais", () => {
  async function montar() {
    const ponto = await salvarGrupoDeAdicionais(db, gerente, {
      nome: nomeNovo("Ponto"),
      minimo: 1,
      maximo: 1,
      itens: [{ nome: "Ao ponto", precoCentavos: 0 }, { nome: "Bem passado", precoCentavos: 0 }],
    });
    const extras = await salvarGrupoDeAdicionais(db, gerente, {
      nome: nomeNovo("Extras"),
      minimo: 0,
      maximo: 4,
      itens: [
        { nome: "Bacon", precoCentavos: 500, precoDeliveryCentavos: 600, maximoPorItem: 3 },
        { nome: "Ovo", precoCentavos: 250 },
      ],
    });
    const p = await novoProduto({ precoDeliveryCentavos: 2300, gruposAdicionais: [ponto.id, extras.id] });
    return { p, ponto, extras };
  }

  it("soma produto + adicionais x quantidade, no preço de cada canal", async () => {
    const { p, ponto, extras } = await montar();
    expect(p.gruposAdicionais).toEqual([ponto.id, extras.id]);
    const [ao] = ponto.itens;
    const [bacon, ovo] = extras.itens;
    const escolha = { adicionais: [{ id: ao!.id, quantidade: 1 }, { id: bacon!.id, quantidade: 2 }, { id: ovo!.id, quantidade: 1 }] };
    const loja = await calcularPrecoDoItem(db, p.id, "loja", escolha);
    expect(loja.unitarioCentavos).toBe(2000 + 0 + 2 * 500 + 250);
    expect(loja.adicionais.find((a) => a.id === bacon!.id)).toMatchObject({ quantidade: 2, unitarioCentavos: 500, totalCentavos: 1000 });
    const deli = await calcularPrecoDoItem(db, p.id, "delivery", escolha);
    expect(deli.unitarioCentavos).toBe(2300 + 0 + 2 * 600 + 250);
    expect(deli.baseCentavos).toBe(2300);
  });

  it("confere mínimo, máximo, vezes por item, repetidos, formato e adicional de grupo que o produto não oferece", async () => {
    const { p, ponto, extras } = await montar();
    const [ao, bem] = ponto.itens;
    const [bacon, ovo] = extras.itens;
    const msg = async (adicionais: unknown) => (await erroDe(calcularPrecoDoItem(db, p.id, "loja", { adicionais } as never))).message;
    expect(await msg([])).toContain("escolha uma opção");
    expect(await msg([{ id: ao!.id, quantidade: 1 }, { id: bem!.id, quantidade: 1 }])).toContain("só uma opção");
    expect(await msg([{ id: ao!.id, quantidade: 2 }])).toContain("1 vez");
    expect(await msg([{ id: ao!.id, quantidade: 1 }, { id: bacon!.id, quantidade: 4 }])).toContain("3 vezes");
    expect(await msg([{ id: ao!.id, quantidade: 1 }, { id: bacon!.id, quantidade: 3 }, { id: ovo!.id, quantidade: 1 }, { id: ovo!.id, quantidade: 1 }])).toContain("duas vezes");
    for (const ruim of [[{ id: ao!.id, quantidade: 0 }], [{ id: ao!.id, quantidade: -1 }], [{ id: ao!.id, quantidade: 1.5 }], [{ id: "1", quantidade: 1 }], [null], "x"])
      expect(await msg(ruim)).toMatch(/formato inválido/);
    const fora = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Fora"), itens: [{ nome: "Fora", precoCentavos: 100 }] });
    expect(await msg([{ id: ao!.id, quantidade: 1 }, { id: fora.itens[0]!.id, quantidade: 1 }])).toContain("não disponível");
  });

  it("aceita até o máximo do grupo e recusa acima", async () => {
    const { p, ponto, extras } = await montar();
    const [ao] = ponto.itens;
    const [bacon, ovo] = extras.itens;
    const ok = await calcularPrecoDoItem(db, p.id, "loja", { adicionais: [{ id: ao!.id, quantidade: 1 }, { id: bacon!.id, quantidade: 3 }, { id: ovo!.id, quantidade: 1 }] });
    expect(ok.unitarioCentavos).toBe(2000 + 1500 + 250);
    const g = await salvarGrupoDeAdicionais(db, gerente, { id: extras.id, maximo: 3 });
    expect(g.maximo).toBe(3);
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", { adicionais: [{ id: ao!.id, quantidade: 1 }, { id: bacon!.id, quantidade: 3 }, { id: ovo!.id, quantidade: 1 }] }))).message).toContain("no máximo 3");
  });

  it("item, grupo e ligação inativos não contam; produto inativo não vende; o preço da tela nunca entra", async () => {
    const { p, ponto, extras } = await montar();
    const [ao] = ponto.itens;
    const [bacon, ovo] = extras.itens;
    await salvarGrupoDeAdicionais(db, gerente, { id: extras.id, itens: [{ id: ovo!.id, nome: "Ovo", precoCentavos: 250 }] });
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", { adicionais: [{ id: ao!.id, quantidade: 1 }, { id: bacon!.id, quantidade: 1 }] }))).message).toContain("não disponível");
    // Grupo obrigatório desativado: deixa de ser exigido.
    await salvarGrupoDeAdicionais(db, gerente, { id: ponto.id, ativo: false });
    expect((await calcularPrecoDoItem(db, p.id, "loja", { precoCentavos: 1, adicionais: [] } as never)).unitarioCentavos).toBe(2000);
    // Tirar o grupo do produto.
    const q = await salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [] });
    expect(q.gruposAdicionais).toEqual([]);
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", { adicionais: [{ id: ovo!.id, quantidade: 1 }] }))).message).toContain("não disponível");
    await salvarProduto(db, gerente, { id: p.id, ativo: false });
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", {}))).message).toContain("fora de venda");
    expect((await erroDe(calcularPrecoDoItem(db, 2_147_483_647, "loja", {}))).codigo).toBe("nao_encontrado");
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "ifood" as never, {}))).message).toContain("Canal");
  });

  it("ligar grupo: recusa desativado, inexistente e repetido; religar reativa a mesma ligação na nova ordem", async () => {
    const { p, ponto, extras } = await montar();
    const off = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Off"), ativo: false });
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [off.id] }))).message).toContain("desativado");
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [2_147_483_000] }))).message).toContain("desativado");
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [ponto.id, ponto.id] }))).message).toContain("duas vezes");
    await salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [extras.id] });
    const r = await salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [extras.id, ponto.id] });
    expect(r.gruposAdicionais).toEqual([extras.id, ponto.id]);
    const linhas = await db.selectFrom("produto_grupo_adicional").selectAll().where("produto_id", "=", p.id).execute();
    expect(linhas).toHaveLength(2);
    // Já ligado e depois desativado: continua na lista do produto, mas não conta no preço.
    await salvarGrupoDeAdicionais(db, gerente, { id: ponto.id, ativo: false });
    expect((await salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [extras.id, ponto.id] })).gruposAdicionais).toEqual([extras.id, ponto.id]);
  });

  it("concorrência: desativar o grupo enquanto outro o liga a um produto termina consistente", async () => {
    for (let k = 0; k < 5; k++) {
      const g = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Corrida"), itens: [{ nome: "A", precoCentavos: 0 }] });
      const p = await novoProduto();
      const [liga, desliga] = await Promise.allSettled([
        salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [g.id] }),
        salvarGrupoDeAdicionais(db, gerente, { id: g.id, ativo: false }),
      ]);
      expect(desliga.status).toBe("fulfilled");
      // Ou ligou antes de desativar, ou foi recusado por estar desativado. Nunca erro de banco.
      if (liga.status === "rejected") expect(liga.reason).toBeInstanceOf(ErroDeRegra);
    }
  });
});

describe("ajustes da revisão", () => {
  it("concorrência determinística: ligar espera a trava do grupo e é recusado se ele foi desativado", async () => {
    const g = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Trava"), itens: [{ nome: "A", precoCentavos: 0 }] });
    const p = await novoProduto();
    const outra = bancoDeTeste();
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      let travou!: () => void;
      const travado = new Promise<void>((r) => (travou = r));
      const segura = outra.transaction().execute(async (trx) => {
        await sql`SELECT id FROM grupo_adicional WHERE id = ${g.id} FOR UPDATE`.execute(trx);
        travou();
        await solto;
        await trx.updateTable("grupo_adicional").set({ ativo: false }).where("id", "=", g.id).execute();
      });
      await travado;
      let terminou = false;
      const liga = salvarProduto(db, gerente, { id: p.id, gruposAdicionais: [g.id] }).finally(() => (terminou = true));
      liga.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(terminou).toBe(false); // esperando a trava
      soltar();
      await segura;
      expect((await erroDe(liga)).message).toContain("desativado");
      const ativas = await db.selectFrom("produto_grupo_adicional").select("grupo_id").where("produto_id", "=", p.id).where("ativo", "=", true).execute();
      expect(ativas).toEqual([]);
    } finally {
      await outra.destroy();
    }
  });

  it("escolha nula ou que não é objeto vira formato inválido (nunca erro interno)", async () => {
    const p = await novoProduto();
    for (const e of [null, "x", 1, []]) expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", e as never))).message).toContain("formato inválido");
  });

  it("campo ausente num item ou tamanho existente fica como está; null limpa", async () => {
    const g = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Aus"), maximo: 3, itens: [{ nome: "Bacon", precoCentavos: 500, precoDeliveryCentavos: 600, maximoPorItem: 3 }] });
    const id = g.itens[0]!.id;
    const h = await salvarGrupoDeAdicionais(db, gerente, { id: g.id, itens: [{ id, nome: "Bacon", precoCentavos: 550 }] });
    expect(h.itens[0]).toMatchObject({ precoCentavos: 550, precoDeliveryCentavos: 600, maximoPorItem: 3 });
    const k = await salvarGrupoDeAdicionais(db, gerente, { id: g.id, itens: [{ id, nome: "Bacon", precoCentavos: 550, precoDeliveryCentavos: null }] });
    expect(k.itens[0]!.precoDeliveryCentavos).toBeNull();
    const p = await novoProduto({ tamanhos: [{ nome: "G", acrescimoCentavos: 500, acrescimoDeliveryCentavos: 700 }] });
    const t = p.tamanhos[0]!.id;
    expect((await salvarProduto(db, gerente, { id: p.id, tamanhos: [{ id: t, nome: "Grande", acrescimoCentavos: 400 }] })).tamanhos[0]).toMatchObject({ acrescimoCentavos: 400, acrescimoDeliveryCentavos: 700 });
    expect((await salvarProduto(db, gerente, { id: p.id, tamanhos: [{ id: t, nome: "Grande", acrescimoCentavos: 400, acrescimoDeliveryCentavos: null }] })).tamanhos[0]!.acrescimoDeliveryCentavos).toBeNull();
  });

  it("nome comparado igual ao banco, também com letra fora da lista de acentos", async () => {
    for (const nome of ["Mý", "300ml", "Pão ÇÑ", "1 litro", "Café-com-leite"]) {
      const r = await sql<{ n: string }>`SELECT nome_de_unidade(${nome}) AS n`.execute(db);
      expect(nomeComparavel(nome)).toBe(r.rows[0]!.n);
    }
  });

  it("limites: mínimo 2 com itens que somam exatamente 2 vezes passa; tamanho tirado não vende", async () => {
    const g = await salvarGrupoDeAdicionais(db, gerente, { nome: nomeNovo("Dois"), minimo: 2, maximo: 2, itens: [{ nome: "A", precoCentavos: 0 }, { nome: "B", precoCentavos: 0 }] });
    expect(g.minimo).toBe(2);
    const p = await novoProduto({ tamanhos: [{ nome: "P", acrescimoCentavos: 0 }, { nome: "G", acrescimoCentavos: 100 }] });
    const tirado = p.tamanhos[1]!.id;
    await salvarProduto(db, gerente, { id: p.id, tamanhos: [{ id: p.tamanhos[0]!.id, nome: "P", acrescimoCentavos: 0 }] });
    expect((await erroDe(calcularPrecoDoItem(db, p.id, "loja", { tamanhoId: tirado }))).message).toContain("tamanho não encontrado");
  });
});

describe("precoDoItem (regra pura, a mesma da tela)", () => {
  const produto: Produto = {
    id: 1,
    nome: "Açaí",
    descricao: null,
    categoriaId: 1,
    tipoProducaoId: null,
    precoCentavos: 1500,
    tempoPreparoMin: null,
    precoDeliveryCentavos: null,
    ordem: 10,
    ativo: true,
    tamanhos: [
      { id: 1, nome: "300 ml", acrescimoCentavos: 0, acrescimoDeliveryCentavos: null, ordem: 10 },
      { id: 2, nome: "500 ml", acrescimoCentavos: 500, acrescimoDeliveryCentavos: null, ordem: 20 },
    ],
    gruposAdicionais: [7, 8],
    fotoId: null,
    combo: null,
  };
  const grupos: GrupoDeAdicionais[] = [
    { id: 7, nome: "Coberturas", minimo: 0, maximo: 2, ativo: true, itens: [{ id: 70, nome: "Granola", precoCentavos: 200, precoDeliveryCentavos: null, maximoPorItem: 2, ordem: 10, ativo: true }] },
    { id: 9, nome: "De outro produto", minimo: 1, maximo: 1, ativo: true, itens: [{ id: 90, nome: "X", precoCentavos: 1, precoDeliveryCentavos: null, maximoPorItem: 1, ordem: 10, ativo: true }] },
  ];
  it("grupo ligado que não veio (ou inativo) é ignorado; grupo de fora não é exigido", () => {
    const r = precoDoItem(produto, grupos, "delivery", { tamanhoId: 2, adicionais: [{ id: 70, quantidade: 2 }] });
    expect(r).toMatchObject({ ok: true, unitarioCentavos: 1500 + 500 + 400 });
  });
  it("nunca devolve número quebrado: tudo inteiro", () => {
    const r = precoDoItem(produto, grupos, "loja", { tamanhoId: 1 });
    expect(r.ok && Number.isInteger(r.unitarioCentavos)).toBe(true);
  });
});
