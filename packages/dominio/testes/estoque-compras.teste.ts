/**
 * Compras no estoque (E09 parte 2; migração 0022; decisão 0027): dados da nota, foto da nota,
 * correção de custo da entrada, lista de entradas e saldo inicial por planilha (com correção no
 * painel). Contra PostgreSQL real, com dados inventados.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import {
  anexarFotoDaNota,
  arquivoDaFotoDaNota,
  conferirEstoque,
  consumirNaTransacao,
  corrigirCustoDaEntrada,
  ErroDeRegra,
  estoqueDoItem,
  FOTOS_POR_NOTA,
  importarSaldoInicial,
  listarEntradas,
  registrarEntrada,
  salvarConversao,
  salvarFicha,
  salvarFornecedor,
  salvarIngrediente,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let supervisor: Ator;
const sufixo = randomUUID().slice(0, 6);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${++n}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  supervisor = await atorDoCargo(db, "supervisor");
});
afterEach(async () => {
  expect(await conferirEstoque(db)).toEqual([]);
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

async function ingrediente(base: string, unidadeBase: "g" | "ml" | "un" = "g", area = "cozinha"): Promise<{ id: number; nome: string }> {
  const nm = nome(base);
  return { id: (await salvarIngrediente(db, gerente, { nome: nm, unidadeBase, area })).id, nome: nm };
}
const total = async (ingredienteId: number) => {
  const i = await estoqueDoItem(db, gerente, { ingredienteId });
  return { q: i.total, v: i.valorCentavos };
};
const consumir = (ingredienteId: number, quantidade: string) =>
  db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId, quantidade }] }));

const foto = async (w: number, h: number, cor = "#334455") => (await sharp({ create: { width: w, height: h, channels: 3, background: cor } }).jpeg().toBuffer()).toString("base64");

describe("entrada com nota", () => {
  it("guarda fornecedor, número e data da nota e lista as entradas", async () => {
    const f = await salvarFornecedor(db, gerente, { nome: nome("Atacado Teste") });
    const x = await ingrediente("Farinha");
    const r = await registrarEntrada(db, gerente, {
      fornecedorId: f.id,
      notaNumero: "12345",
      notaData: "2026-11-20",
      itens: [{ ingredienteId: x.id, quantidade: "5", unidade: "kg", local: "guardado", valorCentavos: 2500 }],
    });
    const lista = await listarEntradas(db, gerente, { fornecedorId: f.id });
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ movimentoId: r.movimentoId, fornecedor: f.nome, notaNumero: "12345", notaData: "2026-11-20", fotos: [] });
    expect(lista[0]!.itens).toEqual([expect.objectContaining({ nome: x.nome, quantidade: "5000", valorCentavos: "2500", estimado: false, corrigido: false })]);
    // A cozinheira vê a entrada da cozinha, sem valores; o supervisor (salão) não a vê.
    const daCozinheira = await listarEntradas(db, cozinheira, { fornecedorId: f.id });
    expect(daCozinheira[0]!.itens[0]!.valorCentavos).toBeNull();
    expect(await listarEntradas(db, supervisor, { fornecedorId: f.id })).toEqual([]);
  });
});

describe("foto da nota", () => {
  it("refaz em WebP, não duplica a mesma foto, até 5 por entrada; só quem vê a entrada", async () => {
    const x = await ingrediente("Arroz");
    const r = await registrarEntrada(db, cozinheira, { itens: [{ ingredienteId: x.id, quantidade: "1000", local: "guardado" }] });
    // Nota comprida (1 x 6) passa; na foto do cardápio não passaria.
    const a = await anexarFotoDaNota(db, cozinheira, { movimentoId: r.movimentoId, arquivo: await foto(400, 2400) });
    expect(a).toMatchObject({ repetida: false });
    expect(Math.max(a.largura, a.altura)).toBeLessThanOrEqual(2000);
    const b = await anexarFotoDaNota(db, cozinheira, { movimentoId: r.movimentoId, arquivo: await foto(400, 2400) });
    expect(b).toMatchObject({ id: a.id, repetida: true });
    const arquivo = await arquivoDaFotoDaNota(db, gerente, a.id);
    expect((await sharp(arquivo.conteudo).metadata()).format).toBe("webp");
    expect((await erroDe(arquivoDaFotoDaNota(db, supervisor, a.id))).codigo).toBe("sem_permissao");
    expect((await erroDe(anexarFotoDaNota(db, supervisor, { movimentoId: r.movimentoId, arquivo: await foto(400, 400) }))).codigo).toBe("sem_permissao");
    for (let k = 1; k < FOTOS_POR_NOTA; k++) await anexarFotoDaNota(db, cozinheira, { movimentoId: r.movimentoId, arquivo: await foto(300, 300, `#00${k}0${k}0`) });
    expect((await erroDe(anexarFotoDaNota(db, cozinheira, { movimentoId: r.movimentoId, arquivo: await foto(300, 300, "#ffffff") }))).message).toMatch(/já tem 5 fotos/);
    expect((await listarEntradas(db, gerente, {})).find((e) => e.movimentoId === r.movimentoId)!.fotos).toHaveLength(FOTOS_POR_NOTA);
    // Consumo não é entrada: sem foto.
    const c = await consumir(x.id, "10");
    expect((await erroDe(anexarFotoDaNota(db, gerente, { movimentoId: c.movimentoId, arquivo: await foto(300, 300) }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(arquivoDaFotoDaNota(db, gerente, 999999999))).codigo).toBe("nao_encontrado");
  });
});

describe("correção de custo da entrada", () => {
  it("entrada estimada recebe o preço certo; a diferença vai na proporção do que resta", async () => {
    const x = await ingrediente("Queijo");
    // Entrada sem preço (cozinheira), estimada em zero (sem custo de referência).
    const e = await registrarEntrada(db, cozinheira, { itens: [{ ingredienteId: x.id, quantidade: "1000", local: "em_uso" }] });
    expect(await total(x.id)).toEqual({ q: "1000", v: "0" });
    expect((await listarEntradas(db, gerente, { soEstimadas: true })).some((m) => m.movimentoId === e.movimentoId)).toBe(true);
    // Um quarto já foi usado: só 3/4 da diferença ficam no estoque.
    await consumir(x.id, "250");
    expect((await erroDe(corrigirCustoDaEntrada(db, cozinheira, { movimentoId: e.movimentoId, itens: [{ ingredienteId: x.id, valorCentavos: 4000 }] }))).codigo).toBe("sem_permissao");
    const c = await corrigirCustoDaEntrada(db, gerente, { movimentoId: e.movimentoId, itens: [{ ingredienteId: x.id, valorCentavos: 4000 }] });
    expect(c.aplicadoCentavos).toBe("3000");
    expect(await total(x.id)).toEqual({ q: "750", v: "3000" });
    expect((await listarEntradas(db, gerente, { soEstimadas: true })).some((m) => m.movimentoId === e.movimentoId)).toBe(false);
    const item = (await listarEntradas(db, gerente, {})).find((m) => m.movimentoId === e.movimentoId)!.itens[0]!;
    expect(item).toMatchObject({ valorCentavos: "4000", corrigido: true });
    // Corrigir de novo parte do valor corrigido (4000 -> 3600: -400, 3/4 = -300).
    const c2 = await corrigirCustoDaEntrada(db, gerente, { movimentoId: e.movimentoId, itens: [{ ingredienteId: x.id, valorCentavos: 3600 }] });
    expect(c2.aplicadoCentavos).toBe("-300");
    expect(await total(x.id)).toEqual({ q: "750", v: "2700" });
    // Nova entrada sem preço usa o custo médio de agora (2700 / 750 g).
    await registrarEntrada(db, cozinheira, { itens: [{ ingredienteId: x.id, quantidade: "750", local: "em_uso" }] });
    expect(await total(x.id)).toEqual({ q: "1500", v: "5400" });
  });

  it("item fora da entrada e movimento que não é entrada são recusados; tudo consumido não muda valor", async () => {
    const x = await ingrediente("Sal");
    const y = await ingrediente("Açúcar");
    const e = await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x.id, quantidade: "100", local: "em_uso", valorCentavos: 100 }] });
    expect((await erroDe(corrigirCustoDaEntrada(db, gerente, { movimentoId: e.movimentoId, itens: [{ ingredienteId: y.id, valorCentavos: 1 }] }))).message).toMatch(/não está nesta entrada/);
    const c = await consumir(x.id, "100");
    expect((await erroDe(corrigirCustoDaEntrada(db, gerente, { movimentoId: c.movimentoId, itens: [{ ingredienteId: x.id, valorCentavos: 1 }] }))).codigo).toBe("nao_encontrado");
    const r = await corrigirCustoDaEntrada(db, gerente, { movimentoId: e.movimentoId, itens: [{ ingredienteId: x.id, valorCentavos: 900 }] });
    expect(r.aplicadoCentavos).toBe("0");
    expect(await total(x.id)).toEqual({ q: "0", v: "0" });
  });
});

describe("revisão do PR 2", () => {
  it("lista de entradas: cada um vê só os itens da própria área; valor só com todas as áreas", async () => {
    const farinha = await ingrediente("Farinha");
    const cerveja = await ingrediente("Cerveja", "un", "bebidas_salao");
    const r = await registrarEntrada(db, gerente, {
      itens: [
        { ingredienteId: farinha.id, quantidade: "1000", local: "guardado", valorCentavos: 500 },
        { ingredienteId: cerveja.id, quantidade: "12", local: "guardado", valorCentavos: 6000 },
      ],
    });
    const nomes = async (a: Ator) => (await listarEntradas(db, a, {})).find((e) => e.movimentoId === r.movimentoId)!.itens.map((i) => i.nome);
    expect(await nomes(cozinheira)).toEqual([farinha.nome]);
    expect(await nomes(supervisor)).toEqual([cerveja.nome]);
    expect((await nomes(gerente)).sort()).toEqual([cerveja.nome, farinha.nome].sort());
    // O financeiro vê custos, mas não cuida de nenhuma área: não corrige o que não vê.
    const financeiro = await atorDoCargo(db, "financeiro");
    expect((await erroDe(corrigirCustoDaEntrada(db, financeiro, { movimentoId: r.movimentoId, itens: [{ ingredienteId: farinha.id, valorCentavos: 1 }] }))).codigo).toBe("sem_permissao");
  });

  it("correção pelo custo médio, com arredondamento, último custo e chave", async () => {
    // Caso do revisor: E1 100 un por R$ 100,00; E2 100 un por R$ 1,00; saem 150.
    const x = await ingrediente("Garrafa", "un");
    const e1 = await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x.id, quantidade: "100", local: "em_uso", valorCentavos: 10000 }] });
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x.id, quantidade: "100", local: "em_uso", valorCentavos: 100 }] });
    await consumir(x.id, "150");
    expect(await total(x.id)).toEqual({ q: "50", v: "2525" });
    const c = await corrigirCustoDaEntrada(db, gerente, { movimentoId: e1.movimentoId, itens: [{ ingredienteId: x.id, valorCentavos: 0 }] });
    expect(c.aplicadoCentavos).toBe("-2500");
    expect(await total(x.id)).toEqual({ q: "50", v: "25" });
    // Arredondamento não exato: 2/3 de 1000 = 666,67 -> 667.
    const y = await ingrediente("Limão", "un");
    const e = await registrarEntrada(db, cozinheira, { itens: [{ ingredienteId: y.id, quantidade: "3", local: "em_uso" }] });
    await consumir(y.id, "1");
    const chave = `teste-${randomUUID()}`;
    const r1 = await corrigirCustoDaEntrada(db, gerente, { chave, movimentoId: e.movimentoId, itens: [{ ingredienteId: y.id, valorCentavos: 1000 }] });
    expect(r1.aplicadoCentavos).toBe("667");
    const r2 = await corrigirCustoDaEntrada(db, gerente, { chave, movimentoId: e.movimentoId, itens: [{ ingredienteId: y.id, valorCentavos: 1000 }] });
    expect(r2).toMatchObject({ movimentoId: r1.movimentoId, repetido: true, aplicadoCentavos: "667" });
    expect(await total(y.id)).toEqual({ q: "2", v: "667" });
    // Último custo: corrigir a entrada mais antiga não volta o último custo para ela.
    const z = await ingrediente("Mel");
    const a1 = await registrarEntrada(db, cozinheira, { itens: [{ ingredienteId: z.id, quantidade: "100", local: "em_uso" }] });
    const a2 = await registrarEntrada(db, cozinheira, { itens: [{ ingredienteId: z.id, quantidade: "100", local: "em_uso" }] });
    await corrigirCustoDaEntrada(db, gerente, { movimentoId: a2.movimentoId, itens: [{ ingredienteId: z.id, valorCentavos: 900 }] });
    await corrigirCustoDaEntrada(db, gerente, { movimentoId: a1.movimentoId, itens: [{ ingredienteId: z.id, valorCentavos: 100 }] });
    const u = await db.selectFrom("estoque_item").select(["ultimo_custo_centavos"]).where("ingrediente_id", "=", z.id).executeTakeFirstOrThrow();
    expect(u.ultimo_custo_centavos).toBe("900");
  });

  it("foto da nota comprida demais é recusada", async () => {
    const x = await ingrediente("Óleo", "ml");
    const r = await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x.id, quantidade: "900", local: "guardado" }] });
    expect((await erroDe(anexarFotoDaNota(db, gerente, { movimentoId: r.movimentoId, arquivo: await foto(200, 2200) }))).message).toMatch(/10 vezes/);
  });
});

describe("saldo inicial por planilha", () => {
  const csv = (linhas: string[][]) => ({ nome: "saldo.csv", conteudo: Buffer.from(linhas.map((l) => l.join(";")).join("\n"), "utf8").toString("base64") });

  it("confere, mostra os erros com as células, corrige no painel e grava uma vez só", async () => {
    const farinha = await ingrediente("Farinha");
    await salvarConversao(db, gerente, farinha.id, { nome: "saco", quantidadeBase: "5000" });
    const leite = await ingrediente("Leite", "ml");
    const prep = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Molho"), unidadeRendimento: "g", receita: { rende: "100", itens: [{ ingredienteId: farinha.id, quantidade: "100" }] } });
    const arquivo = csv([
      ["Item", "Quantidade", "Unidade", "Local", "Validade", "Preço por unidade (R$)"],
      [farinha.nome, "2", "saco", "Guardado", "31/12/2099", "40,00"],
      [leite.nome, "1.000", "ml", "Em uso", "", ""],
      [prep.resumo.nome ?? "", "500", "", "Em uso", "", ""],
      ["Coisa que não existe", "3", "", "", "", ""],
    ]);
    const c = await importarSaldoInicial(db, gerente, { arquivo });
    expect(c.resumo).toEqual({ total: 4, prontas: 2, erros: 2, puladas: 0 });
    const erroLeite = c.linhas.find((l) => l.numero === 3)!;
    expect(erroLeite.problemas[0]!.texto).toMatch(/sem ponto de milhar/);
    expect(erroLeite.celulas?.[1]).toBe("1.000");
    expect(c.opcoes[String(c.mapa.local)]).toEqual(["Em uso", "Guardado"]);
    // Gravar com erro: nada entra.
    expect((await erroDe(importarSaldoInicial(db, gerente, { arquivo, aplicar: true, chave: c.chave }))).message).toMatch(/Nada foi gravado/);
    // Corrige ali mesmo (leite) e pula a linha que não existe.
    const correcoes = [{ linha: 3, coluna: 1, valor: "1000" }];
    const c2 = await importarSaldoInicial(db, gerente, { arquivo, correcoes, pular: [5] });
    expect(c2.resumo).toEqual({ total: 4, prontas: 3, erros: 0, puladas: 1 });
    const g = await importarSaldoInicial(db, gerente, { arquivo, correcoes, pular: [5], aplicar: true, chave: c2.chave });
    expect(g).toMatchObject({ aplicado: true, repetido: false });
    const g2 = await importarSaldoInicial(db, gerente, { arquivo, correcoes, pular: [5], aplicar: true, chave: c2.chave });
    expect(g2).toMatchObject({ movimentoId: g.movimentoId, repetido: true });
    expect(await total(farinha.id)).toEqual({ q: "10000", v: "8000" });
    expect(await total(leite.id)).toEqual({ q: "1000", v: "0" });
    expect((await estoqueDoItem(db, gerente, { preparoId: prep.resumo.id })).total).toBe("500");
    // Conferir de novo avisa que gravar outra vez soma.
    expect((await importarSaldoInicial(db, gerente, { arquivo })).avisoDeRepeticao).toMatch(/SOMA/);
  });

  it("reenvio depois de mudar o cadastro devolve o gravado; desativado entra com aviso; datas e dinheiro", async () => {
    const x = await ingrediente("Azeite", "ml");
    const arquivo = csv([
      ["Item", "Quantidade", "Validade", "Valor total (R$)"],
      [x.nome, "500", "31/12/99", "R$ 1.234,56"],
    ]);
    const c = await importarSaldoInicial(db, gerente, { arquivo });
    expect(c.resumo.prontas).toBe(1);
    const g = await importarSaldoInicial(db, gerente, { arquivo, aplicar: true, chave: c.chave });
    await salvarIngrediente(db, gerente, { id: x.id, nome: x.nome, area: "cozinha", ativo: false });
    const g2 = await importarSaldoInicial(db, gerente, { arquivo, aplicar: true, chave: c.chave });
    expect(g2).toMatchObject({ movimentoId: g.movimentoId, repetido: true });
    expect(await total(x.id)).toEqual({ q: "500", v: "123456" });
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x.id })).lotes[0]!.validade).toBe("2099-12-31");
    // Desativado: entra com aviso (o que está na loja é contado).
    const c2 = await importarSaldoInicial(db, gerente, { arquivo: csv([["Item", "Quantidade"], [x.nome, "10"]]) });
    expect(c2.linhas[0]).toMatchObject({ situacao: "ok" });
    expect(c2.linhas[0]!.avisos.join(" ")).toMatch(/desativado/);
    // Data que não existe e valor acima do teto.
    const c3 = await importarSaldoInicial(db, gerente, { arquivo: csv([["Item", "Quantidade", "Validade", "Valor total (R$)"], [x.nome, "1", "30/02/2099", "999999999,99"]]) });
    expect(c3.linhas[0]!.problemas.map((p) => p.texto).join(" ")).toMatch(/dd\/mm\/aaaa.*100 milhões/);
  });

  it("valor só para quem vê custos; área que a pessoa não cuida é erro na linha", async () => {
    const pao = await ingrediente("Pão", "un");
    const refri = await ingrediente("Refrigerante", "un", "bebidas_salao");
    const arquivo = csv([
      ["Item", "Quantidade", "Valor total (R$)"],
      [pao.nome, "10", "12,00"],
      [refri.nome, "24", ""],
    ]);
    const c = await importarSaldoInicial(db, cozinheira, { arquivo });
    expect(c.linhas[0]!.problemas[0]!.texto).toMatch(/Só quem vê custos/);
    expect(c.linhas[1]!.problemas[0]!.texto).toMatch(/não cuida da área Bebidas do salão/);
    const s = await importarSaldoInicial(db, supervisor, { arquivo: csv([["Item", "Quantidade"], [refri.nome, "24"]]) });
    expect(s.resumo.prontas).toBe(1);
    expect((await erroDe(importarSaldoInicial(db, await atorDoCargo(db, "atendente"), { arquivo }))).codigo).toBe("sem_permissao");
    // Falta coluna obrigatória.
    expect((await importarSaldoInicial(db, gerente, { arquivo: csv([["Item"], [pao.nome]]) })).faltamColunas).toEqual(["Quantidade"]);
  });
});
