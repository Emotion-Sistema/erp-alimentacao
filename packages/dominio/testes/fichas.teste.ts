/**
 * Fichas técnicas (E08; migração 0019; decisão 0025). Contra PostgreSQL real. Receitas inventadas
 * (nenhuma ficha real da casa entra em teste). O custo é conferido com conta feita à mão.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  compararVersoes,
  consumoDaFicha,
  custoSobrePreco,
  ErroDeRegra,
  escalarQuantidade,
  Fracao,
  nomesParecidos,
  painelDeFichas,
  salvarCategoria,
  salvarCustoDeReferencia,
  salvarFicha,
  salvarGrupoDeAdicionais,
  salvarIngrediente,
  salvarLimiteDeCusto,
  salvarProduto,
  verFicha,
  verVersaoDaFicha,
  type Ator,
  type VersaoDaFicha,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let atendente: Ator;
let financeiro: Ator;
let cat: number;
const sufixo = randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${String.fromCharCode(97 + (n++ % 26))}${Math.floor(n / 26)}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  atendente = await atorDoCargo(db, "atendente");
  financeiro = await atorDoCargo(db, "financeiro");
  cat = (await salvarCategoria(db, gerente, { nome: `Fichas ${sufixo}` })).id;
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

async function ingrediente(base: string, unidadeBase: "g" | "ml" | "un", custo?: [number, string]): Promise<number> {
  const id = (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase, area: "cozinha" })).id;
  if (custo) await salvarCustoDeReferencia(db, gerente, { ingredienteId: id, custoCentavos: custo[0], quantidade: custo[1] });
  return id;
}
const produto = async (preco = 2000, extra: Record<string, unknown> = {}) =>
  salvarProduto(db, gerente, { nome: nome("Lanche"), categoriaId: cat, precoCentavos: preco, ...extra });

type Item = { ingredienteId?: number; preparoId?: number; quantidade: string | null; opcional?: boolean; medidaCaseira?: string };
const receita = (itens: Item[], rende: string | null = "1", extra: Record<string, unknown> = {}) => ({ rende, itens, ...extra });

/** Cenário da conta à mão: bacon (preparo) e um cheese com pão, queijo e bacon pronto. */
async function cenarioCheese() {
  const baconCru = await ingrediente("Bacon cru", "g", [4590, "1000"]); // R$ 45,90 o kg
  const pao = await ingrediente("Pão", "un", [1200, "10"]); // R$ 12,00 os 10
  const queijo = await ingrediente("Queijo", "g", [5000, "1000"]); // R$ 50,00 o kg
  const bacon = await salvarFicha(db, gerente, {
    tipo: "preparo",
    nome: nome("Bacon fatiado"),
    unidadeRendimento: "g",
    receita: receita([{ ingredienteId: baconCru, quantidade: "291" }], "138"),
  });
  const p = await produto(2000);
  const cheese = await salvarFicha(db, gerente, {
    tipo: "produto",
    produtoId: p.id,
    receita: receita([
      { ingredienteId: pao, quantidade: "1" },
      { ingredienteId: queijo, quantidade: "20" },
      { preparoId: bacon.resumo.id, quantidade: "28" },
    ]),
  });
  return { baconCru, pao, queijo, bacon, p, cheese };
}

describe("conta exata (sem banco)", () => {
  it("frações: decimal, arredondamento e texto", () => {
    expect(Fracao.decimal("12.3400").texto()).toBe("12.34");
    expect(Fracao.decimal("0,5").vezes(Fracao.decimal("3")).texto()).toBe("1.5");
    expect(Fracao.inteiro(1).dividido(Fracao.inteiro(3)).texto(4)).toBe("0.3333");
    expect(Fracao.inteiro(2).dividido(Fracao.inteiro(3)).texto(4)).toBe("0.6667");
    expect(new Fracao(5n, 2n).arredondado()).toBe(3n);
    expect(new Fracao(-5n, 2n).arredondado()).toBe(-3n);
    expect(new Fracao(49n, 10n).arredondado()).toBe(5n);
    expect(() => Fracao.decimal("1e3")).toThrow();
    expect(escalarQuantidade("20.5", "3")).toBe("61.5");
    expect(custoSobrePreco(491, 2000)).toBe(2455);
    expect(custoSobrePreco(491, null)).toBeNull();
    expect(custoSobrePreco(null, 2000)).toBeNull();
  });

  it("comparar versões: entrou, saiu, mudou e pendência resolvida", () => {
    const base: VersaoDaFicha = {
      id: 1,
      numero: 1,
      rende: "1",
      porcaoQuantidade: null,
      porcaoUnidade: null,
      tempoMin: 10,
      validadeDias: null,
      etapas: [],
      equipamentos: [],
      observacoes: null,
      motivo: null,
      criadaPor: "x",
      criadaEm: "",
      itens: [
        { ordem: 1, ingredienteId: 1, preparoId: null, nome: "Queijo", unidade: "g", quantidade: "20", opcional: false, medidaCaseira: null, observacao: null },
        { ordem: 2, ingredienteId: 2, preparoId: null, nome: "Sal", unidade: "g", quantidade: null, opcional: false, medidaCaseira: "pitada", observacao: null },
      ],
      pendencias: ["Sal a gosto"],
    };
    const depois: VersaoDaFicha = {
      ...base,
      id: 2,
      numero: 2,
      tempoMin: 12,
      itens: [
        { ...base.itens[0]!, quantidade: "25.0" },
        { ordem: 2, ingredienteId: 3, preparoId: null, nome: "Tomate", unidade: "g", quantidade: "16", opcional: true, medidaCaseira: null, observacao: null },
      ],
      pendencias: [],
    };
    const m = compararVersoes(base, depois).map((x) => `${x.tipo}: ${x.texto}`);
    expect(m).toContain("mudou: Queijo: 20 g → 25 g");
    expect(m).toContain("entrou: Tomate: 16 g (opcional)");
    expect(m).toContain("saiu: Sal (sem quantidade)");
    expect(m).toContain("mudou: Tempo (min): 10 → 12");
    expect(m).toContain("saiu: Pendência resolvida: Sal a gosto");
    expect(compararVersoes(base, base)).toEqual([]);
  });

  it("nomes parecidos: um nome contém o outro, palavra por palavra", () => {
    const p = nomesParecidos([
      { id: 1, nome: "Frango" },
      { id: 2, nome: "Peito de frango" },
      { id: 3, nome: "Óleo" },
      { id: 4, nome: "Óleo de algodão" },
      { id: 5, nome: "Morango" },
    ]);
    expect(p.map((x) => [x.a.id, x.b.id])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("custo e consumo conferidos à mão", () => {
  it("preparo dentro do produto: custo 491 centavos e consumo de bacon cru 59,0435 g", async () => {
    const { cheese, bacon, baconCru, pao, queijo } = await cenarioCheese();
    // Bacon: 291 g a R$ 45,90/kg = 1335,69 centavos, rende 138 g -> 9,6789 c/g.
    // Cheese: pão 120 + queijo 100 + 28 g de bacon (28 x 1335,69 / 138 = 271,0096) = 491,0096 -> 491.
    expect(cheese.resumo.custoCentavos).toBe(491);
    expect(cheese.resumo.custoParcial).toBe(false);
    expect(cheese.resumo.completa).toBe(true);
    expect(cheese.resumo.custoPbLoja).toBe(2455); // 491 / 2000
    expect(cheese.custoDosItens).toEqual([120, 100, 271]);
    expect(bacon.resumo.custoCentavos).toBe(10); // 9,6789 c por grama, arredondado
    const consumo = Object.fromEntries(cheese.consumo.map((c) => [c.ingredienteId, c.quantidade]));
    expect(consumo).toEqual({ [pao]: "1", [queijo]: "20", [baconCru]: "59.0435" }); // 28 x 291 / 138
    // O estoque baixa o PREPARO (bacon fatiado), nunca o bacon cru de novo (RC-01), em fração exata.
    const c = await consumoDaFicha(db, cheese.resumo.id);
    expect(c.versaoId).toBe(cheese.versao!.id);
    expect(c.consumo.map((x) => [x.ingredienteId, x.preparoId, x.exata])).toEqual([
      [pao, null, "1/1"],
      [queijo, null, "20/1"],
      [null, bacon.resumo.id, "28/1"],
    ]);
    const cb = await consumoDaFicha(db, bacon.resumo.id); // produzir 1 g de bacon pronto tira 291/138 g de cru
    expect(cb.consumo).toEqual([{ ingredienteId: baconCru, preparoId: null, nome: expect.any(String), quantidade: "2.1087", exata: "97/46" }]);
    expect(cheese.consumo.find((x) => x.ingredienteId === baconCru)!.exata).toBe("1358/23"); // 28 x 291 / 138
    expect(bacon.usadoEm).toEqual([]);
    expect((await verFicha(db, gerente, bacon.resumo.id)).usadoEm.map((u) => u.id)).toEqual([cheese.resumo.id]);
  });

  it("receita em lote: 5 kg de arroz rendem 80 pratos = 62,5 g por prato; custo por prato", async () => {
    const arroz = await ingrediente("Arroz", "g", [2500, "5000"]); // R$ 25,00 os 5 kg
    const oleo = await ingrediente("Óleo", "ml", [900, "900"]); // R$ 9,00 a lata de 900 ml
    const p = await produto(1800);
    const f = await salvarFicha(db, gerente, {
      tipo: "produto",
      produtoId: p.id,
      receita: receita(
        [
          { ingredienteId: arroz, quantidade: "5000" },
          { ingredienteId: oleo, quantidade: "200" },
        ],
        "80",
      ),
    });
    // (2500 + 200) / 80 = 33,75 -> 34 centavos.
    expect(f.resumo.custoCentavos).toBe(34);
    expect(Object.fromEntries(f.consumo.map((c) => [c.ingredienteId, c.quantidade]))).toEqual({ [arroz]: "62.5", [oleo]: "2.5" });
  });

  it("tamanho e adicional têm ficha própria e margem pelo preço deles", async () => {
    const batata = await ingrediente("Batata", "g", [1000, "1000"]); // 1 c/g
    const p = await produto(1500, { tamanhos: [{ nome: "Meia", acrescimoCentavos: 0 }, { nome: "Inteira", acrescimoCentavos: 1000, acrescimoDeliveryCentavos: 1500 }] });
    const inteira = p.tamanhos[1]!.id;
    const f = await salvarFicha(db, gerente, { tipo: "tamanho", tamanhoId: inteira, receita: receita([{ ingredienteId: batata, quantidade: "400" }]) });
    expect(f.resumo.custoCentavos).toBe(400);
    expect(f.resumo.custoPbLoja).toBe(1600); // 400 / 2500
    expect(f.resumo.custoPbDelivery).toBe(1333); // 400 / 3000
    const g = await salvarGrupoDeAdicionais(db, gerente, { nome: nome("Extras"), maximo: 3, itens: [{ nome: "Bacon extra", precoCentavos: 500 }] });
    const a = await salvarFicha(db, gerente, { tipo: "adicional", adicionalId: g.itens[0]!.id, receita: receita([{ ingredienteId: batata, quantidade: "15" }]) });
    expect(a.resumo).toMatchObject({ tipo: "adicional", custoCentavos: 15, custoPbLoja: 300 });
    expect(a.resumo.nome).toContain("Bacon extra");
  });
});

describe("pendências", () => {
  it("item sem quantidade e pendência anotada deixam incompleta; sem preço deixa o custo parcial", async () => {
    const sal = await ingrediente("Sal", "g"); // sem custo
    const carne = await ingrediente("Carne", "g", [4000, "1000"]);
    const p = await produto(3000);
    const f = await salvarFicha(db, gerente, {
      tipo: "produto",
      produtoId: p.id,
      receita: receita([
        { ingredienteId: carne, quantidade: "150" },
        { ingredienteId: sal, quantidade: null, medidaCaseira: "a gosto" },
      ], "1", { pendencias: ["Peso do prato não informado"] }),
    });
    expect(f.resumo.completa).toBe(false);
    expect(f.pendencias.map((x) => x.tipo).sort()).toEqual(["anotada", "item_sem_quantidade"]);
    expect(f.pendencias.find((x) => x.tipo === "item_sem_quantidade")!.texto).toContain('"a gosto"');
    expect(f.consumo).toEqual([]);
    expect(f.resumo.custoCentavos).toBe(600);
    expect(f.resumo.custoParcial).toBe(true);
    expect((await erroDe(consumoDaFicha(db, f.resumo.id))).codigo).toBe("conflito"); // incompleta não baixa
    // Resolvendo: quantidade e sem pendência; o sal sem preço só deixa o custo parcial.
    const g = await salvarFicha(db, gerente, {
      id: f.resumo.id,
      versaoBase: 1,
      receita: receita([
        { ingredienteId: carne, quantidade: "150" },
        { ingredienteId: sal, quantidade: "2" },
      ], "1", { motivo: "Pesei o sal" }),
    });
    expect(g.resumo).toMatchObject({ completa: true, versao: 2, custoCentavos: 600, custoParcial: true });
    expect(g.semCusto.map((s) => s.ingredienteId)).toEqual([sal]);
    await salvarCustoDeReferencia(db, gerente, { ingredienteId: sal, custoCentavos: 300, quantidade: "1000" });
    expect((await verFicha(db, gerente, f.resumo.id)).resumo).toMatchObject({ custoCentavos: 601, custoParcial: false });
  });

  it("sem rendimento, sem itens e preparo incompleto propagam", async () => {
    const x = await ingrediente("Farinha", "g", [500, "1000"]);
    const prep = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: nome("Massa"),
      unidadeRendimento: "g",
      receita: receita([{ ingredienteId: x, quantidade: "1000" }], null),
    });
    expect(prep.pendencias.map((p) => p.tipo)).toEqual(["sem_rendimento"]);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ preparoId: prep.resumo.id, quantidade: "100" }]) });
    expect(f.pendencias.map((p) => p.tipo)).toEqual(["preparo_incompleto"]);
    expect(f.resumo.completa).toBe(false);
    const vazio = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Vazio"), unidadeRendimento: "g", receita: receita([], "1") });
    expect(vazio.pendencias.map((p) => p.tipo)).toEqual(["sem_itens"]);
  });
});

describe("versões", () => {
  it("cada gravação cria versão nova; as antigas ficam; versão base errada é recusada", async () => {
    const { cheese, queijo, pao } = await cenarioCheese();
    const v2 = await salvarFicha(db, gerente, {
      id: cheese.resumo.id,
      versaoBase: 1,
      receita: receita([{ ingredienteId: pao, quantidade: "1" }, { ingredienteId: queijo, quantidade: "25" }], "1", { motivo: "Mais queijo" }),
    });
    expect(v2.resumo.versao).toBe(2);
    expect(v2.historico.map((h) => h.numero)).toEqual([2, 1]);
    expect(v2.historico[0]!.motivo).toBe("Mais queijo");
    const antiga = await verVersaoDaFicha(db, gerente, v2.historico[1]!.id);
    expect(antiga.itens).toHaveLength(3);
    expect(antiga.fichaId).toBe(cheese.resumo.id);
    expect(compararVersoes(antiga, v2.versao!).some((m) => m.texto.includes("20 g → 25 g"))).toBe(true);
    const e = await erroDe(salvarFicha(db, gerente, { id: cheese.resumo.id, versaoBase: 1, receita: receita([{ ingredienteId: pao, quantidade: "2" }]) }));
    expect(e.codigo).toBe("conflito");
    expect((await erroDe(salvarFicha(db, gerente, { id: cheese.resumo.id, receita: receita([]) }))).codigo).toBe("conflito");
    // O banco não deixa mudar nem apagar o histórico.
    await expect(sql`UPDATE ficha_item SET quantidade = 99 WHERE versao_id = ${antiga.id}`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`DELETE FROM ficha_versao WHERE id = ${antiga.id}`.execute(db)).rejects.toThrow(/não muda/);
    const aud = await db
      .selectFrom("auditoria")
      .select("detalhes")
      .where("alvo_tipo", "=", "ficha")
      .where("alvo_id", "=", String(cheese.resumo.id))
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(aud.detalhes).toMatchObject({ operacao: "nova_versao", versao: 2, motivo: "Mais queijo" });
  });

  it("ligar e desligar não cria versão; preparo em uso não desliga", async () => {
    const { cheese, bacon } = await cenarioCheese();
    const e = await erroDe(salvarFicha(db, gerente, { id: bacon.resumo.id, ativo: false }));
    expect(e.codigo).toBe("conflito");
    expect(e.message).toContain("em uso");
    const off = await salvarFicha(db, gerente, { id: cheese.resumo.id, ativo: false });
    expect(off.resumo).toMatchObject({ ativo: false, versao: 1 });
    expect((await salvarFicha(db, gerente, { id: bacon.resumo.id, ativo: false })).resumo.ativo).toBe(false);
  });
});

describe("regras de gravação", () => {
  it("receita circular e preparo usando a si mesmo são recusados", async () => {
    const x = await ingrediente("Alho", "g", [3000, "1000"]);
    const a = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Tempero A"), unidadeRendimento: "g", receita: receita([{ ingredienteId: x, quantidade: "100" }], "100") });
    const b = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Tempero B"), unidadeRendimento: "g", receita: receita([{ preparoId: a.resumo.id, quantidade: "50" }], "50") });
    const e = await erroDe(salvarFicha(db, gerente, { id: a.resumo.id, versaoBase: 1, receita: receita([{ preparoId: b.resumo.id, quantidade: "10" }], "10") }));
    expect(e.message).toContain("a si mesmo");
    expect((await verFicha(db, gerente, a.resumo.id)).resumo.versao).toBe(1); // nada gravado
    expect((await erroDe(salvarFicha(db, gerente, { id: a.resumo.id, versaoBase: 1, receita: receita([{ preparoId: a.resumo.id, quantidade: "1" }]) }))).message).toContain("a si mesmo");
  });

  it("alvo: combo não tem ficha; uma ficha ativa por produto; produto desativado recusado", async () => {
    const p = await produto();
    const x = await ingrediente("Pão de forma", "un", [800, "20"]);
    await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "2" }]) });
    expect((await erroDe(salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([]) }))).codigo).toBe("conflito");
    const off = await produto();
    await salvarProduto(db, gerente, { id: off.id, ativo: false });
    expect((await erroDe(salvarFicha(db, gerente, { tipo: "produto", produtoId: off.id, receita: receita([]) }))).codigo).toBe("nao_encontrado");
    const combo = await salvarProduto(db, gerente, {
      nome: nome("Combo"),
      categoriaId: cat,
      precoCentavos: 3000,
      combo: { partes: [{ nome: "Lanche", opcoes: [{ produtoId: p.id, acrescimoCentavos: 0 }] }] },
    });
    expect((await erroDe(salvarFicha(db, gerente, { tipo: "produto", produtoId: combo.id, receita: receita([]) }))).message).toContain("Combo");
    expect((await erroDe(salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, tamanhoId: 1, receita: receita([]) }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Sem unidade"), receita: receita([]) }))).message).toContain("unidade");
  });

  it("itens: ingrediente ou preparo, sem repetir, ativos, quantidade exata", async () => {
    const x = await ingrediente("Cebola", "g", [600, "1000"]);
    const p = await produto();
    const base = { tipo: "produto", produtoId: p.id };
    expect((await erroDe(salvarFicha(db, gerente, { ...base, receita: receita([{ ingredienteId: x, quantidade: "1" }, { ingredienteId: x, quantidade: "2" }]) }))).message).toContain("duas vezes");
    expect((await erroDe(salvarFicha(db, gerente, { ...base, receita: receita([{ quantidade: "1" }]) }))).message).toContain("ingrediente ou um preparo");
    expect((await erroDe(salvarFicha(db, gerente, { ...base, receita: receita([{ ingredienteId: x, quantidade: "0" }]) }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarFicha(db, gerente, { ...base, receita: receita([{ ingredienteId: x, quantidade: "1.23456" }]) }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarFicha(db, gerente, { ...base, receita: receita([{ ingredienteId: 999_999, quantidade: "1" }]) }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(salvarFicha(db, gerente, { ...base, receita: receita([{ preparoId: 999_999, quantidade: "1" }]) }))).codigo).toBe("nao_encontrado");
    const ok = await salvarFicha(db, gerente, { ...base, receita: receita([{ ingredienteId: x, quantidade: "12,5", opcional: true }], "1", { etapas: [{ texto: "Picar" }], equipamentos: ["Faca"] }) });
    expect(ok.versao!.itens[0]).toMatchObject({ quantidade: "12.5", opcional: true, unidade: "g" });
    expect(ok.versao!.etapas).toEqual([{ texto: "Picar", minutos: null }]);
  });
});

describe("permissões e custo", () => {
  it("a cozinha vê a receita sem custo; atendente não vê; só quem gerencia grava", async () => {
    const { cheese } = await cenarioCheese();
    const daCozinha = await verFicha(db, cozinheira, cheese.resumo.id);
    expect(daCozinha.versao!.itens).toHaveLength(3);
    expect(daCozinha.resumo.custoCentavos).toBeNull();
    expect(daCozinha.resumo.custoPbLoja).toBeNull();
    expect(daCozinha.custoDosItens).toEqual([null, null, null]);
    const painel = await painelDeFichas(db, cozinheira);
    expect(painel.podeVerCusto).toBe(false);
    expect(painel.ingredientes.every((g) => g.custoCentavos === null && g.custoQuantidade === null)).toBe(true);
    expect((await erroDe(verFicha(db, atendente, cheese.resumo.id))).codigo).toBe("sem_permissao");
    expect((await erroDe(salvarFicha(db, cozinheira, { id: cheese.resumo.id, ativo: false }))).codigo).toBe("sem_permissao");
    // Custo de referência: precisa gerenciar cadastros E ver custos.
    expect((await erroDe(salvarCustoDeReferencia(db, financeiro, { ingredienteId: 1, custoCentavos: 1, quantidade: "1" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(salvarCustoDeReferencia(db, cozinheira, { ingredienteId: 1, custoCentavos: 1, quantidade: "1" }))).codigo).toBe("sem_permissao");
    const g = await painelDeFichas(db, gerente);
    expect(g.podeVerCusto).toBe(true);
    expect(g.fichas.find((f) => f.id === cheese.resumo.id)!.custoCentavos).toBe(491);
  });

  it("custo de referência: grava, apaga e audita; limite do alerta", async () => {
    const x = await ingrediente("Tomate", "g");
    expect((await erroDe(salvarCustoDeReferencia(db, gerente, { ingredienteId: x, custoCentavos: 800 }))).message).toContain("quantidade");
    expect(await salvarCustoDeReferencia(db, gerente, { ingredienteId: x, custoCentavos: 800, quantidade: "1000.0" })).toEqual({ ingredienteId: x, custoCentavos: 800, custoQuantidade: "1000" });
    expect(await salvarCustoDeReferencia(db, gerente, { ingredienteId: x, custoCentavos: null })).toEqual({ ingredienteId: x, custoCentavos: null, custoQuantidade: null });
    const aud = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "ingrediente_custo").where("alvo_id", "=", String(x)).orderBy("id", "desc").executeTakeFirstOrThrow();
    expect(aud.detalhes).toMatchObject({ antes: { custoCentavos: 800, custoQuantidade: "1000" }, depois: { custoCentavos: null } });
    expect(await salvarLimiteDeCusto(db, gerente, { limiteCustoPb: 3200 })).toEqual({ limiteCustoPb: 3200 });
    expect((await painelDeFichas(db, gerente)).limiteCustoPb).toBe(3200);
    expect((await erroDe(salvarLimiteDeCusto(db, gerente, { limiteCustoPb: 50 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarLimiteDeCusto(db, cozinheira, { limiteCustoPb: 3000 }))).codigo).toBe("sem_permissao");
    await salvarLimiteDeCusto(db, gerente, { limiteCustoPb: 3500 });
  });

  it("painel: produto sem ficha aparece; ficha de produto desativado fica fora do cardápio", async () => {
    const sem = await produto();
    const com = await produto();
    const x = await ingrediente("Ovo", "un", [1200, "12"]);
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: com.id, receita: receita([{ ingredienteId: x, quantidade: "2" }]) });
    let painel = await painelDeFichas(db, gerente);
    expect(painel.semFicha.some((s) => s.id === sem.id)).toBe(true);
    expect(painel.semFicha.some((s) => s.id === com.id)).toBe(false);
    await salvarProduto(db, gerente, { id: com.id, ativo: false });
    painel = await painelDeFichas(db, gerente);
    expect(painel.fichas.find((x) => x.id === f.resumo.id)!.foraDoCardapio).toBe(true);
  });
});

describe("concorrência", () => {
  it("determinística: gravar espera a trava das fichas e enxerga a receita circular feita por outro", async () => {
    const x = await ingrediente("Cominho", "g", [9000, "1000"]);
    const a = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Mix A"), unidadeRendimento: "g", receita: receita([{ ingredienteId: x, quantidade: "10" }], "10") });
    const b = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Mix B"), unidadeRendimento: "g", receita: receita([{ ingredienteId: x, quantidade: "10" }], "10") });
    const outra = bancoDeTeste();
    let soltarNoFim: (() => void) | undefined;
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      soltarNoFim = () => soltar();
      let travou!: () => void;
      const travado = new Promise<void>((r) => (travou = r));
      // Outra gravação em andamento: segura a trava e faz B usar A.
      const segura = outra.transaction().execute(async (trx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext('fichas:gravar'))`.execute(trx);
        travou();
        await solto;
        const v = await sql<{ id: number }>`INSERT INTO ficha_versao (ficha_id, numero, rende, criada_por)
          VALUES (${b.resumo.id}, 2, 10, ${gerente.usuarioId}) RETURNING id`.execute(trx);
        const vid = v.rows[0]!.id;
        await sql`INSERT INTO ficha_item (versao_id, ordem, preparo_id, quantidade) VALUES (${vid}, 1, ${a.resumo.id}, 10)`.execute(trx);
        await sql`UPDATE ficha SET versao_atual_id = ${vid} WHERE id = ${b.resumo.id}`.execute(trx);
      });
      await travado;
      let terminou = false;
      // Agora A tenta usar B: precisa esperar e então ver o ciclo.
      const grava = salvarFicha(db, gerente, { id: a.resumo.id, versaoBase: 1, receita: receita([{ preparoId: b.resumo.id, quantidade: "5" }], "5") }).finally(() => (terminou = true));
      grava.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(terminou).toBe(false);
      soltar();
      await segura;
      const e = await erroDe(grava);
      expect(e.message).toContain("a si mesmo");
      expect((await verFicha(db, gerente, a.resumo.id)).resumo.versao).toBe(1);
      soltarNoFim = soltar;
    } finally {
      soltarNoFim?.();
      await outra.destroy();
    }
  });
});

describe("ajustes da revisão", () => {
  it("profundidade: o resultado não depende da ordem; gravar o preparo de baixo que estoura um de cima é recusado", async () => {
    const x = await ingrediente("Base", "g", [100, "100"]);
    // Cadeia P1 <- P2 <- ... <- P8 (P8 usa P7 ... P2 usa P1): 8 níveis no limite.
    const ids: number[] = [];
    for (let k = 0; k < 8; k++) {
      const itens = k === 0 ? [{ ingredienteId: x, quantidade: "1" }] : [{ preparoId: ids[k - 1]!, quantidade: "1" }];
      ids.push((await salvarFicha(db, gerente, { tipo: "preparo", nome: nome(`Nivel ${k}`), unidadeRendimento: "g", receita: receita(itens, "1") })).resumo.id);
    }
    // P9 usaria P8: 9 níveis -> recusado ao gravar.
    const e = await erroDe(salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Nivel 9"), unidadeRendimento: "g", receita: receita([{ preparoId: ids[7]!, quantidade: "1" }], "1") }));
    expect(e.message).toContain("níveis");
    // O painel e a ficha sozinha concordam.
    const painel = await painelDeFichas(db, gerente);
    for (const id of ids) expect(painel.fichas.find((f) => f.id === id)!.completa).toBe((await verFicha(db, gerente, id)).resumo.completa);
    // Pôr um nível a mais lá embaixo (P1 passa a usar um preparo novo) estoura P8: recusado.
    const fundo = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Fundo"), unidadeRendimento: "g", receita: receita([{ ingredienteId: x, quantidade: "1" }], "1") });
    const e2 = await erroDe(salvarFicha(db, gerente, { id: ids[0]!, versaoBase: 1, receita: receita([{ preparoId: fundo.resumo.id, quantidade: "1" }], "1") }));
    expect(e2.message).toContain("fica com problema");
  });

  it("produto com ficha não vira combo; ficha não religa em produto fora do cardápio; consumo recusa ficha desligada", async () => {
    const x = await ingrediente("Presunto", "g", [3000, "1000"]);
    const p = await produto();
    const outro = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "20" }]) });
    const e = await erroDe(salvarProduto(db, gerente, { id: p.id, combo: { partes: [{ nome: "Lanche", opcoes: [{ produtoId: outro.id, acrescimoCentavos: 0 }] }] } }));
    expect(e.message).toContain("ficha técnica ativa");
    await salvarFicha(db, gerente, { id: f.resumo.id, ativo: false });
    expect((await erroDe(consumoDaFicha(db, f.resumo.id))).message).toContain("desligada");
    await salvarProduto(db, gerente, { id: p.id, ativo: false });
    expect((await erroDe(salvarFicha(db, gerente, { id: f.resumo.id, ativo: true }))).message).toContain("saiu do cardápio");
    await salvarProduto(db, gerente, { id: p.id, ativo: true });
    expect((await salvarFicha(db, gerente, { id: f.resumo.id, ativo: true })).resumo.ativo).toBe(true);
    expect((await consumoDaFicha(db, f.resumo.id)).consumo).toHaveLength(1);
  });

  it("ingrediente desativado depois deixa a ficha incompleta; quem vê custo: financeiro sim, supervisor não", async () => {
    const nomeIng = nome("Rúcula");
    const x = (await salvarIngrediente(db, gerente, { nome: nomeIng, unidadeBase: "g", area: "cozinha" })).id;
    await salvarCustoDeReferencia(db, gerente, { ingredienteId: x, custoCentavos: 2000, quantidade: "1000" });
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "30" }]) });
    expect(f.resumo.completa).toBe(true);
    expect((await verFicha(db, financeiro, f.resumo.id)).resumo.custoCentavos).toBe(60);
    const supervisor = await atorDoCargo(db, "supervisor");
    expect((await verFicha(db, supervisor, f.resumo.id)).resumo.custoCentavos).toBeNull();
    await salvarIngrediente(db, gerente, { id: x, nome: nomeIng, area: "cozinha", ativo: false });
    const g = await verFicha(db, gerente, f.resumo.id);
    expect(g.resumo.completa).toBe(false);
    expect(g.pendencias.map((p) => p.tipo)).toEqual(["ingrediente_inativo"]);
  });

  it("quebra de linha: aceita nas observações, recusada na medida caseira; produto com ficha em todos os tamanhos sai de 'sem ficha'", async () => {
    const x = await ingrediente("Batata palha", "g", [1500, "1000"]);
    const p = await produto(1500, { tamanhos: [{ nome: "P", acrescimoCentavos: 0 }, { nome: "G", acrescimoCentavos: 500 }] });
    expect((await erroDe(salvarFicha(db, gerente, { tipo: "tamanho", tamanhoId: p.tamanhos[0]!.id, receita: receita([{ ingredienteId: x, quantidade: null, medidaCaseira: "um\npunhado" }]) }))).codigo).toBe("dados_invalidos");
    const a = await salvarFicha(db, gerente, { tipo: "tamanho", tamanhoId: p.tamanhos[0]!.id, receita: receita([{ ingredienteId: x, quantidade: "50" }], "1", { observacoes: "Linha 1\nLinha 2" }) });
    expect(a.versao!.observacoes).toBe("Linha 1\nLinha 2");
    expect((await painelDeFichas(db, gerente)).semFicha.some((s) => s.id === p.id)).toBe(true);
    await salvarFicha(db, gerente, { tipo: "tamanho", tamanhoId: p.tamanhos[1]!.id, receita: receita([{ ingredienteId: x, quantidade: "100" }]) });
    expect((await painelDeFichas(db, gerente)).semFicha.some((s) => s.id === p.id)).toBe(false);
  });
});
