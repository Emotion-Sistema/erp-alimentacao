/**
 * Produção de preparo com rendimento real e desfazer movimento (E09 parte 3; decisão 0027).
 * Contra PostgreSQL real, com receitas inventadas.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  conferirEstoque,
  consumirNaTransacao,
  corrigirCustoDaEntrada,
  desfazerMovimento,
  ErroDeRegra,
  estoqueDoItem,
  historicoDoItem,
  produzirPreparo,
  registrarEntrada,
  registrarPerda,
  salvarFicha,
  salvarIngrediente,
  transferir,
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

const ingrediente = async (base: string, unidadeBase: "g" | "ml" | "un" = "g") => (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase, area: "cozinha" })).id;
const entrada = (ingredienteId: number, quantidade: string, valorCentavos?: number, local: "em_uso" | "guardado" = "em_uso") =>
  registrarEntrada(db, gerente, { itens: [{ ingredienteId, quantidade, local, ...(valorCentavos !== undefined ? { valorCentavos } : {}) }] });
const total = async (ref: { ingredienteId?: number; preparoId?: number }) => {
  const i = await estoqueDoItem(db, gerente, ref);
  return { q: i.total, v: i.valorCentavos };
};
const consumir = (ingredienteId: number, quantidade: string, origem?: string) =>
  db.transaction().execute((trx) =>
    consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId, quantidade }], ...(origem ? { origemTipo: "pedido", origemId: origem } : {}) }),
  );

/** Molho: a receita rende 1000 g com 500 g de tomate e 10 g de sal; validade 3 dias. */
async function molho() {
  const tomate = await ingrediente("Tomate");
  const sal = await ingrediente("Sal");
  const f = await salvarFicha(db, gerente, {
    tipo: "preparo",
    nome: nome("Molho"),
    unidadeRendimento: "g",
    receita: { rende: "1000", validadeDias: 3, itens: [{ ingredienteId: tomate, quantidade: "500" }, { ingredienteId: sal, quantidade: "10" }] },
  });
  return { tomate, sal, molhoId: f.resumo.id };
}

describe("produção de preparo", () => {
  it("gasta pela receita do previsto, cria o lote com o que rendeu e o custo vem do que saiu", async () => {
    const { tomate, sal, molhoId } = await molho();
    await entrada(tomate, "600", 600); // R$ 6,00
    await entrada(tomate, "1000", 1000, "guardado");
    await entrada(sal, "100", 100);
    const r = await produzirPreparo(db, gerente, { preparoId: molhoId, previsto: "2000", rendimento: "1800" });
    // 1000 g de tomate (600 do em uso + 400 do guardado, sozinho) e 20 g de sal.
    expect(await total({ ingredienteId: tomate })).toEqual({ q: "600", v: "600" });
    expect(await total({ ingredienteId: sal })).toEqual({ q: "80", v: "80" });
    expect(r).toMatchObject({ diferenca: "-200", custoCentavos: "1020", custoPorUnidade: "0.5667" });
    const prep = await estoqueDoItem(db, gerente, { preparoId: molhoId });
    expect([prep.total, prep.valorCentavos]).toEqual(["1800", "1020"]);
    const hoje = (await sql<{ d: string }>`SELECT to_char(hoje_na_loja() + 3, 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
    expect(prep.lotes[0]!.validade).toBe(hoje);
    expect(prep.areas[0]).toMatchObject({ area: "cozinha", emUso: "1800" });
    // A cozinheira produz, mas não vê o custo.
    const c = await produzirPreparo(db, cozinheira, { preparoId: molhoId, previsto: "100", rendimento: "100" });
    expect([c.custoCentavos, c.custoPorUnidade]).toEqual([null, null]);
  });

  it("sem saldo: recusa e diz o que falta; o supervisor não produz na cozinha", async () => {
    const { tomate, molhoId } = await molho();
    await entrada(tomate, "100");
    const e = await erroDe(produzirPreparo(db, gerente, { preparoId: molhoId, previsto: "1000", rendimento: "1000" }));
    expect(e.message).toMatch(/Falta para produzir/);
    expect(e.message).toMatch(/precisa 500 g, há 100 g/);
    expect(await total({ ingredienteId: tomate })).toEqual({ q: "100", v: "0" });
    expect((await erroDe(produzirPreparo(db, supervisor, { preparoId: molhoId, previsto: "10", rendimento: "10" }))).codigo).toBe("sem_permissao");
  });

  it("preparo dentro de preparo gasta o preparo pronto, não a matéria-prima de novo", async () => {
    const { tomate, sal, molhoId } = await molho();
    const massa = await ingrediente("Massa");
    const lasanha = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: nome("Recheio"),
      unidadeRendimento: "g",
      receita: { rende: "500", itens: [{ preparoId: molhoId, quantidade: "300" }, { ingredienteId: massa, quantidade: "200" }] },
    });
    await entrada(tomate, "500");
    await entrada(sal, "10");
    await entrada(massa, "1000");
    expect((await erroDe(produzirPreparo(db, gerente, { preparoId: lasanha.resumo.id, previsto: "500", rendimento: "500" }))).message).toMatch(/Molho/);
    await produzirPreparo(db, gerente, { preparoId: molhoId, previsto: "1000", rendimento: "1000" });
    await produzirPreparo(db, gerente, { preparoId: lasanha.resumo.id, previsto: "500", rendimento: "480" });
    expect((await total({ preparoId: molhoId })).q).toBe("700");
    expect((await total({ ingredienteId: tomate })).q).toBe("0");
    expect((await total({ ingredienteId: massa })).q).toBe("800");
    expect((await total({ preparoId: lasanha.resumo.id })).q).toBe("480");
  });

  it("mesma chave: produz uma vez só", async () => {
    const { tomate, sal, molhoId } = await molho();
    await entrada(tomate, "1000");
    await entrada(sal, "20");
    const chave = `teste-${randomUUID()}`;
    const a = await produzirPreparo(db, gerente, { chave, preparoId: molhoId, previsto: "1000", rendimento: "950" });
    const b = await produzirPreparo(db, gerente, { chave, preparoId: molhoId, previsto: "1000", rendimento: "950" });
    expect(b).toMatchObject({ movimentoId: a.movimentoId, repetido: true, diferenca: "-50" });
    expect((await total({ preparoId: molhoId })).q).toBe("950");
  });
});

describe("desfazer movimento", () => {
  const obs = { observacao: "lançado errado" };

  it("desfaz entrada, perda e transferência; cada movimento uma vez só", async () => {
    const x = await ingrediente("Queijo");
    const e = await entrada(x, "1000", 5000);
    const p = await registrarPerda(db, gerente, { ingredienteId: x, quantidade: "100", area: "cozinha", local: "em_uso", motivo: "estragou" });
    const t = await transferir(db, gerente, { ingredienteId: x, quantidade: "300", de: { area: "cozinha", local: "em_uso" }, para: { area: "cozinha", local: "guardado" } });
    await desfazerMovimento(db, gerente, { movimentoId: p.movimentoId, ...obs });
    expect(await total({ ingredienteId: x })).toEqual({ q: "1000", v: "5000" });
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: p.movimentoId, ...obs }))).message).toMatch(/já foi desfeito/);
    await desfazerMovimento(db, gerente, { movimentoId: t.movimentoId, ...obs });
    const i = await estoqueDoItem(db, gerente, { ingredienteId: x });
    expect(i.areas[0]).toMatchObject({ emUso: "1000", guardado: "0" });
    const d = await desfazerMovimento(db, gerente, { movimentoId: e.movimentoId, ...obs });
    expect(await total({ ingredienteId: x })).toEqual({ q: "0", v: "0" });
    const h = await historicoDoItem(db, gerente, { ingredienteId: x });
    expect(h.find((m) => m.movimentoId === e.movimentoId)!.desfeitoPor).toBe(d.movimentoId);
    expect(h[0]).toMatchObject({ tipo: "estorno", observacao: "lançado errado" });
    // Estorno não se desfaz.
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: d.movimentoId, ...obs }))).message).toMatch(/lance de novo/);
  });

  it("entrada já usada não se desfaz; consumo de pedido também não; quem pode desfazer", async () => {
    const x = await ingrediente("Pão", "un");
    const e = await entrada(x, "10");
    await consumir(x, "3", "77");
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: e.movimentoId, ...obs }))).message).toMatch(/precisa 10 un, há 7 un/);
    const c = await consumir(x, "1", "78");
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: c.movimentoId, ...obs }))).message).toMatch(/cancele o pedido/);
    expect((await erroDe(desfazerMovimento(db, cozinheira, { movimentoId: e.movimentoId, ...obs }))).codigo).toBe("sem_permissao");
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: e.movimentoId, observacao: "" }))).codigo).toBe("dados_invalidos");
    // Consumo interno (sem pedido) se desfaz.
    const interno = await consumir(x, "2");
    await desfazerMovimento(db, gerente, { movimentoId: interno.movimentoId, ...obs });
    expect((await total({ ingredienteId: x })).q).toBe("6");
  });

  it("desfazer a produção devolve os ingredientes e tira o preparo", async () => {
    const { tomate, sal, molhoId } = await molho();
    await entrada(tomate, "500", 500);
    await entrada(sal, "10", 10);
    const p = await produzirPreparo(db, gerente, { preparoId: molhoId, previsto: "1000", rendimento: "900" });
    await desfazerMovimento(db, gerente, { movimentoId: p.movimentoId, ...obs });
    expect(await total({ ingredienteId: tomate })).toEqual({ q: "500", v: "500" });
    expect(await total({ ingredienteId: sal })).toEqual({ q: "10", v: "10" });
    expect(await total({ preparoId: molhoId })).toEqual({ q: "0", v: "0" });
  });

  it("desfazer entrada com custo corrigido tira também o valor da correção", async () => {
    const x = await ingrediente("Carne");
    await entrada(x, "1000", 3000);
    const e = await entrada(x, "1000", 1000);
    await corrigirCustoDaEntrada(db, gerente, { movimentoId: e.movimentoId, itens: [{ ingredienteId: x, valorCentavos: 4000 }] });
    expect(await total({ ingredienteId: x })).toEqual({ q: "2000", v: "7000" });
    await desfazerMovimento(db, gerente, { movimentoId: e.movimentoId, ...obs });
    expect(await total({ ingredienteId: x })).toEqual({ q: "1000", v: "3000" });
  });

  it("dois desfazer do mesmo movimento ao mesmo tempo: um só vale", async () => {
    const x = await ingrediente("Ovo", "un");
    const e = await entrada(x, "12");
    const outra = bancoDeTeste();
    try {
      const r = await Promise.allSettled([desfazerMovimento(db, gerente, { movimentoId: e.movimentoId, ...obs }), desfazerMovimento(outra, gerente, { movimentoId: e.movimentoId, ...obs })]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ErroDeRegra);
    } finally {
      await outra.destroy();
    }
    expect((await total({ ingredienteId: x })).q).toBe("0");
  });
});
