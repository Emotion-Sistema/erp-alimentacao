/**
 * Contagem de estoque (E09 parte 4; migração 0023; decisão 0027): cega, rápida do dia e
 * inventário, com o ajuste pela diferença no fechamento. Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  abrirContagem,
  bloquear,
  cancelarContagem,
  conferirEstoque,
  consumirNaTransacao,
  contagemRapidaDoDia,
  ErroDeRegra,
  estoqueDoItem,
  fecharContagem,
  historicoDoItem,
  listarContagens,
  painelDoEstoque,
  registrarPerda,
  transferir,
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

describe("revisão do PR 4", () => {
  it("duas contagens abertas do mesmo item: a segunda a fechar pede recontagem (sem ajuste em dobro)", async () => {
    const x = await ingrediente("Farinha", "g");
    await entrada(x, "10");
    const c1 = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    const c2 = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    await contar(c1, c1.linhas[0]!.contagemItemId, "8", gerente);
    await contar(c2, c2.linhas[0]!.contagemItemId, "8", gerente);
    await fecharContagem(db, gerente, { contagemId: c1.id });
    expect((await erroDe(fecharContagem(db, gerente, { contagemId: c2.id }))).message).toMatch(/Conte de novo/);
    await contar(c2, c2.linhas[0]!.contagemItemId, "8", gerente);
    await fecharContagem(db, gerente, { contagemId: c2.id });
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x })).total).toBe("8");
  });

  it("cega também no painel, no item e no histórico para quem conta; a gestão vê", async () => {
    const x = await ingrediente("Arroz", "g");
    await entrada(x, "37.4813");
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    const p = (await painelDoEstoque(db, cozinheira)).find((i) => i.ingredienteId === x)!;
    expect([p.emContagem, p.total, p.areas[0]!.emUso, p.areas[0]!.livre]).toEqual([true, null, null, null]);
    const i = await estoqueDoItem(db, cozinheira, { ingredienteId: x });
    expect(i.lotes.flatMap((l) => l.saldos.map((s) => s.quantidade))).toEqual([null]);
    const h = await historicoDoItem(db, cozinheira, { ingredienteId: x });
    expect(h.every((m) => m.quantidade === null && m.quantidadeDepois === null)).toBe(true);
    // Número que não aparece em data, hora nem id (o "37" sozinho batia com o horário).
    expect(JSON.stringify([p, i, h])).not.toMatch(/4813/);
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x })).total).toBe("37.4813");
    // Nem as mensagens de recusa dizem quanto há.
    const e1 = await erroDe(registrarPerda(db, cozinheira, { ingredienteId: x, quantidade: "99999", area: "cozinha", local: "em_uso", motivo: "estragou" }));
    const e2 = await erroDe(transferir(db, cozinheira, { ingredienteId: x, quantidade: "99999", de: { area: "cozinha", local: "em_uso" }, para: { area: "cozinha", local: "guardado" } }));
    for (const e of [e1, e2]) {
      expect(e.message).toMatch(/em contagem/);
      expect(e.message).not.toMatch(/4813/);
    }
    await cancelarContagem(db, gerente, { contagemId: c.id, observacao: "teste" });
    expect((await estoqueDoItem(db, cozinheira, { ingredienteId: x })).total).toBe("37.4813");
  });

  it("contagem fechada mostra o que o ajuste aplicou de fato e o valor lançado; falta tira o livre antes do bloqueado", async () => {
    const x = await ingrediente("Presunto");
    await entrada(x, "5", "em_uso", 500);
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    await contar(c, c.linhas[0]!.contagemItemId, "0", gerente);
    await consumir(x, "3");
    await fecharContagem(db, gerente, { contagemId: c.id });
    expect((await verContagem(db, gerente, { contagemId: c.id })).linhas[0]).toMatchObject({ diferenca: "-5", aplicado: "-2", valorDaDiferenca: "-200" });
    const y = await ingrediente("Queijo ralado");
    await entrada(y, "4");
    await entrada(y, "4");
    const lotes = (await estoqueDoItem(db, gerente, { ingredienteId: y })).lotes;
    await bloquear(db, gerente, { ingredienteId: y, quantidade: "4", area: "cozinha", local: "em_uso", motivo: "quarentena", loteId: lotes[0]!.loteId });
    const c2 = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: y, local: "em_uso" }] });
    await contar(c2, c2.linhas[0]!.contagemItemId, "6", gerente);
    await fecharContagem(db, gerente, { contagemId: c2.id });
    const area = (await estoqueDoItem(db, gerente, { ingredienteId: y })).areas[0]!;
    expect([area.bloqueado, area.livre]).toEqual(["4", "2"]);
  });

  it("valor por linha: falta num local e sobra no outro mostram cada um o seu", async () => {
    const x = await ingrediente("Leite", "un");
    await entrada(x, "10", "em_uso", 1000);
    await entrada(x, "10", "guardado", 1000);
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x }] });
    const nm = await nomeDe(x);
    await contar(c, linha(c, nm, "em_uso").contagemItemId, "8", gerente);
    await contar(c, linha(c, nm, "guardado").contagemItemId, "12", gerente);
    await fecharContagem(db, gerente, { contagemId: c.id });
    const v = await verContagem(db, gerente, { contagemId: c.id });
    expect([linha(v, nm, "em_uso").valorDaDiferenca, linha(v, nm, "guardado").valorDaDiferenca]).toEqual(["-200", "200"]);
  });

  it("concorrência: contar espera o consumo; rápida do dia ao mesmo tempo é uma só; fechar e cancelar juntos, um vale", async () => {
    const x = await ingrediente("Batata palha", "g");
    await entrada(x, "100");
    const c = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    const outra = bancoDeTeste();
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      let pronto!: () => void;
      const consumido = new Promise<void>((r) => (pronto = r));
      const venda = db.transaction().execute(async (trx) => {
        await consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "30" }] });
        pronto();
        await solto;
      });
      await consumido;
      const contando = registrarContagem(outra, gerente, { contagemId: c.id, contagemItemId: c.linhas[0]!.contagemItemId, quantidade: "70" });
      for (let k = 0; k < 100; k++) {
        const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(db);
        if (r.rows[0]!.n >= 1) break;
        await new Promise((r) => setTimeout(r, 30));
      }
      soltar();
      await venda;
      await contando;
      // Contou 70 depois da venda de 30: esperado 70, sem diferença.
      const f = await fecharContagem(db, gerente, { contagemId: c.id });
      expect(f.ajustes).toEqual([]);
      const area = "bebidas_salao";
      const y = await ingrediente("Suco", "un", area);
      await registrarEntrada(db, gerente, { itens: [{ ingredienteId: y, quantidade: "5", local: "guardado", area }] });
      const [r1, r2] = await Promise.all([contagemRapidaDoDia(db, supervisor, { area }), contagemRapidaDoDia(outra, supervisor, { area })]);
      expect(r1.id).toBe(r2.id);
      const c3 = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
      await contar(c3, c3.linhas[0]!.contagemItemId, "70", gerente);
      const r = await Promise.allSettled([fecharContagem(db, gerente, { contagemId: c3.id }), cancelarContagem(outra, gerente, { contagemId: c3.id, observacao: "junto" })]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    } finally {
      await outra.destroy();
    }
    expect((await estoqueDoItem(db, gerente, { ingredienteId: x })).total).toBe("70");
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
