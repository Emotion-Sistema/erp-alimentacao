/**
 * Contagem de estoque (E09 parte 4; migração 0023; decisão 0027): cega, rápida do dia e
 * inventário, com o ajuste pela diferença no fechamento. Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import {
  abrirContagem,
  cancelarContagem,
  conferirEstoque,
  consumirNaTransacao,
  contagemRapidaDoDia,
  ErroDeRegra,
  estoqueDoItem,
  fecharContagem,
  historicoDoItem,
  listarContagens,
  registrarContagem,
  registrarEntrada,
  salvarIngrediente,
  verContagem,
  type Ator,
  type ContagemVista,
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

const ingrediente = async (base: string, unidadeBase: "g" | "ml" | "un" = "un", area = "cozinha") => (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase, area })).id;
const entrada = (ingredienteId: number, quantidade: string, local: "em_uso" | "guardado" = "em_uso", valorCentavos?: number) =>
  registrarEntrada(db, gerente, { itens: [{ ingredienteId, quantidade, local, ...(valorCentavos !== undefined ? { valorCentavos } : {}) }] });
const consumir = (ingredienteId: number, quantidade: string, permitirFalta = false) =>
  db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId, quantidade }], permitirFalta }));
const linha = (c: ContagemVista, itemNome: string | undefined, local: "em_uso" | "guardado") => c.linhas.find((l) => l.nome === itemNome && l.local === local)!;
const nomeDe = async (ingredienteId: number) => (await estoqueDoItem(db, gerente, { ingredienteId })).nome;
const contar = (c: ContagemVista, contagemItemId: number, quantidade: string, ator = cozinheira) => registrarContagem(db, ator, { contagemId: c.id, contagemItemId, quantidade });

describe("contagem cega", () => {
  it("quem conta não vê o esperado; ao fechar, ajusta pela diferença e mostra o resultado", async () => {
    const x = await ingrediente("Ovo");
    await entrada(x, "10", "em_uso", 1000);
    const c = await abrirContagem(db, cozinheira, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }], motivo: "acabou" });
    expect(c.linhas).toHaveLength(1);
    const l = c.linhas[0]!;
    const r = await contar(c, l.contagemItemId, "8");
    expect(Object.keys(r)).toEqual(["registroId"]);
    const aberta = await verContagem(db, cozinheira, { contagemId: c.id });
    expect(aberta.linhas[0]).toMatchObject({ contado: "8", esperado: null, diferenca: null });
    expect(JSON.stringify(aberta)).not.toContain('"10"');
    const f = await fecharContagem(db, cozinheira, { contagemId: c.id });
    expect(f.ajustes).toEqual([expect.objectContaining({ diferenca: "-2", aplicado: "-2" })]);
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x })).total).toBe("8");
    const fechada = await verContagem(db, gerente, { contagemId: c.id });
    expect(fechada).toMatchObject({ situacao: "fechada", fim: expect.objectContaining({ movimentoId: f.movimentoId }) });
    expect(fechada.linhas[0]).toMatchObject({ esperado: "10", diferenca: "-2", valorDaDiferenca: "-200" });
    expect((await verContagem(db, cozinheira, { contagemId: c.id })).linhas[0]!.valorDaDiferenca).toBeNull();
    const h = await historicoDoItem(db, gerente, { ingredienteId: x });
    expect(h[0]).toMatchObject({ tipo: "ajuste", motivo: "contagem", quantidade: "-2" });
  });

  it("venda entre contar e fechar não entra na diferença; recontar vale o último", async () => {
    const x = await ingrediente("Pão");
    await entrada(x, "10");
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    const id = c.linhas[0]!.contagemItemId;
    await contar(c, id, "7");
    await contar(c, id, "9"); // recontou: 9 (esperava 10)
    await consumir(x, "3"); // vendeu depois de contar: saldo 7
    await fecharContagem(db, gerente, { contagemId: c.id });
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x })).total).toBe("6");
  });

  it("sobra entra num lote novo pelo custo médio; falta nunca passa do que há agora", async () => {
    const x = await ingrediente("Queijo", "g");
    await entrada(x, "1000", "guardado", 4000);
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x }] });
    const nm = await nomeDe(x);
    await contar(c, linha(c, nm, "guardado").contagemItemId, "1100");
    await contar(c, linha(c, nm, "em_uso").contagemItemId, "0"); // em uso já estava zerado: sem diferença
    const f = await fecharContagem(db, gerente, { contagemId: c.id });
    expect(f.ajustes).toEqual([expect.objectContaining({ local: "guardado", diferenca: "100" })]);
    const i = await estoqueDoItem(db, gerente, { ingredienteId: x });
    expect([i.total, i.valorCentavos]).toEqual(["1100", "4400"]);
    expect(i.lotes.map((l) => l.codigo)).toContain("contagem");
    // Falta maior do que o que sobrou depois de contar: aplica só o que há.
    const y = await ingrediente("Presunto");
    await entrada(y, "5");
    const c2 = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: y, local: "em_uso" }] });
    await contar(c2, c2.linhas[0]!.contagemItemId, "0", gerente);
    await consumir(y, "3");
    const f2 = await fecharContagem(db, gerente, { contagemId: c2.id });
    expect(f2.ajustes).toEqual([expect.objectContaining({ diferenca: "-5", aplicado: "-2" })]);
    expect((await estoqueDoItem(db, gerente, { ingredienteId: y })).total).toBe("0");
  });
});

describe("inventário e contagem rápida", () => {
  it("inventário traz todos os itens da área; o que não foi contado não muda", async () => {
    const area = "sorvete";
    const a = await ingrediente("Pote A", "un", area);
    const b = await ingrediente("Pote B", "un", area);
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: a, quantidade: "4", local: "guardado" }, { ingredienteId: b, quantidade: "6", local: "guardado" }] });
    const c = await abrirContagem(db, supervisor, { tipo: "inventario", area });
    const nmA = await nomeDe(a);
    const nmB = await nomeDe(b);
    expect(c.linhas.filter((l) => l.nome === nmA || l.nome === nmB)).toHaveLength(4);
    await contar(c, linha(c, nmA, "guardado").contagemItemId, "3", supervisor);
    await fecharContagem(db, supervisor, { contagemId: c.id });
    expect((await estoqueDoItem(db, gerente, { ingredienteId: a })).total).toBe("3");
    expect((await estoqueDoItem(db, gerente, { ingredienteId: b })).total).toBe("6");
  });

  it("rápida do dia: uma por área por dia; o que faltou numa venda vem primeiro", async () => {
    const area = "cafeteria";
    const x = await ingrediente("Leite em pó", "g", area);
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "100", local: "em_uso", area }] });
    await db.transaction().execute((trx) =>
      consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "150", area }], permitirFalta: true }),
    );
    const c = await contagemRapidaDoDia(db, supervisor, { area, quantos: 3 });
    const de = await contagemRapidaDoDia(db, supervisor, { area, quantos: 3 });
    expect(de.id).toBe(c.id);
    expect(c.tipo).toBe("rapida");
    const nm = await nomeDe(x);
    expect(c.linhas.filter((l) => l.nome === nm).map((l) => l.motivo)).toEqual(["faltou", "faltou"]);
    expect(new Set(c.linhas.map((l) => l.itemId)).size).toBeLessThanOrEqual(3);
    expect((await listarContagens(db, supervisor, { area })).some((x) => x.id === c.id)).toBe(true);
  });
});

describe("regras da contagem", () => {
  it("cada um só conta a própria área; fechada não recebe contagem; cancelar pede motivo", async () => {
    const x = await ingrediente("Batata", "g");
    await entrada(x, "1000");
    expect((await erroDe(abrirContagem(db, supervisor, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x }] }))).codigo).toBe("sem_permissao");
    const c = await abrirContagem(db, cozinheira, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    expect((await erroDe(contar(c, c.linhas[0]!.contagemItemId, "1", supervisor))).codigo).toBe("sem_permissao");
    expect((await erroDe(verContagem(db, supervisor, { contagemId: c.id }))).codigo).toBe("sem_permissao");
    expect((await erroDe(fecharContagem(db, cozinheira, { contagemId: c.id }))).message).toMatch(/Nada foi contado/);
    expect((await erroDe(cancelarContagem(db, cozinheira, { contagemId: c.id }))).message).toMatch(/por que está cancelando/);
    await cancelarContagem(db, cozinheira, { contagemId: c.id, observacao: "aberta por engano" });
    expect((await erroDe(contar(c, c.linhas[0]!.contagemItemId, "1"))).message).toMatch(/cancelada/);
    const c2 = await abrirContagem(db, cozinheira, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    await contar(c2, c2.linhas[0]!.contagemItemId, "1000");
    const f = await fecharContagem(db, cozinheira, { contagemId: c2.id });
    expect(f).toMatchObject({ movimentoId: null, ajustes: [] });
    expect((await erroDe(fecharContagem(db, cozinheira, { contagemId: c2.id }))).message).toMatch(/já foi fechada/);
    expect((await erroDe(contar(c2, c2.linhas[0]!.contagemItemId, "1"))).message).toMatch(/já foi fechada/);
  });

  it("fechar duas vezes ao mesmo tempo: um ajuste só", async () => {
    const x = await ingrediente("Tomate", "g");
    await entrada(x, "500");
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    await contar(c, c.linhas[0]!.contagemItemId, "400", gerente);
    const outra = bancoDeTeste();
    try {
      const r = await Promise.allSettled([fecharContagem(db, gerente, { contagemId: c.id }), fecharContagem(outra, gerente, { contagemId: c.id })]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ErroDeRegra);
    } finally {
      await outra.destroy();
    }
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x })).total).toBe("400");
  });
});
