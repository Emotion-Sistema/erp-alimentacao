/**
 * Estoque (E09; RC-09; migração 0021; decisão 0027). Contra PostgreSQL real, com ingredientes
 * inventados. Cobre: em uso e guardado com passagem automática, custo médio, lotes e validade,
 * perda, bloqueio, transferência, permissão por área, repetição e concorrência.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  bloquear,
  conferirEstoque,
  consumirNaTransacao,
  desbloquear,
  ErroDeRegra,
  estoqueDoItem,
  Fracao,
  historicoDoItem,
  painelDoEstoque,
  q4,
  registrarEntrada,
  registrarPerda,
  registrarSaldoInicial,
  salvarConversao,
  salvarCustoDeReferencia,
  salvarFicha,
  salvarFornecedor,
  salvarIngrediente,
  textoQ4,
  transferir,
  valorDaSaida,
  type Ator,
  type DadosDoConsumo,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let supervisor: Ator;
let atendente: Ator;
const sufixo = randomUUID().slice(0, 6);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${++n}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  supervisor = await atorDoCargo(db, "supervisor");
  atendente = await atorDoCargo(db, "atendente");
});
afterEach(async () => {
  // Depois de cada teste, tudo fecha: linhas = saldos = totais = soma dos movimentos.
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

async function ingrediente(base: string, unidadeBase: "g" | "ml" | "un" = "g", area = "cozinha"): Promise<number> {
  return (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase, area })).id;
}

const consumir = (d: Omit<DadosDoConsumo, "autorId" | "chave"> & { chave?: string }, autorId = gerente.usuarioId) =>
  db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId, chave: `teste-${randomUUID()}`, ...d }));

async function saldo(ingredienteId: number) {
  const item = await estoqueDoItem(db, gerente, { ingredienteId });
  const a = item.areas.find((x) => x.area === "cozinha");
  return { total: item.total, emUso: a?.emUso ?? "0", guardado: a?.guardado ?? "0", valor: item.valorCentavos, livre: a?.livre ?? "0", item };
}

const entrada = (ingredienteId: number, quantidade: string, local: "em_uso" | "guardado", extra: Record<string, unknown> = {}, ator = gerente) =>
  registrarEntrada(db, ator, { itens: [{ ingredienteId, quantidade, local, ...extra }] });

describe("contas puras", () => {
  it("quantidade exata com 4 casas, sem float", () => {
    expect(q4("12,5")).toBe(125000n);
    expect(q4("0.0001")).toBe(1n);
    expect(q4("1.00001")).toBeNull();
    expect(q4("-1")).toBeNull();
    expect(textoQ4(125000n)).toBe("12.5");
    expect(textoQ4(-5000n)).toBe("-0.5");
  });
  it("valor da saída pelo custo médio; levar tudo leva o valor todo", () => {
    expect(valorDaSaida(30000n, 1000n, 10000n)).toBe(333n);
    expect(valorDaSaida(30000n, 1000n, 30000n)).toBe(1000n);
    expect(valorDaSaida(0n, 0n, 10n)).toBe(0n);
  });
});

describe("entrada", () => {
  it("entra com valor, unidade convertida e embalagem; custo médio pondera as compras", async () => {
    const farinha = await ingrediente("Farinha");
    await salvarConversao(db, gerente, farinha, { nome: "saco", quantidadeBase: "5000" });
    await registrarEntrada(db, gerente, {
      itens: [
        { ingredienteId: farinha, quantidade: "2", unidade: "kg", local: "em_uso", valorCentavos: 1000 },
        { ingredienteId: farinha, quantidade: "1", unidade: "saco", local: "guardado", valorCentavos: 4000 },
      ],
    });
    const s = await saldo(farinha);
    expect(s.total).toBe("7000");
    expect(s.emUso).toBe("2000");
    expect(s.guardado).toBe("5000");
    expect(s.valor).toBe("5000");
    expect(s.item.custoMedioCentavos).toBe("0.7143"); // R$ 50,00 / 7 kg = 0,7143 centavo por g
    expect(s.item.lotes).toHaveLength(2);
  });

  it("sem valor: custo estimado pelo custo de referência e marcado como estimado", async () => {
    const leite = await ingrediente("Leite", "ml");
    await salvarCustoDeReferencia(db, gerente, { ingredienteId: leite, custoCentavos: 500, quantidade: "1000" });
    await entrada(leite, "2000", "guardado");
    const s = await saldo(leite);
    expect(s.valor).toBe("1000");
    const h = await historicoDoItem(db, gerente, { ingredienteId: leite });
    expect(h[0]).toMatchObject({ tipo: "entrada", quantidade: "2000", quantidadeDepois: "2000", custoEstimado: true, valorCentavos: "1000" });
  });

  it("recusa validade passada, preparo por compra e ingrediente desativado", async () => {
    const x = await ingrediente("Creme");
    expect((await erroDe(entrada(x, "10", "em_uso", { validade: "2020-01-01" }))).message).toMatch(/já passou/);
    const prep = await salvarFicha(db, gerente, { tipo: "preparo", nome: nome("Molho"), unidadeRendimento: "g", receita: { rende: "100", itens: [{ ingredienteId: x, quantidade: "100" }] } });
    expect((await erroDe(registrarEntrada(db, gerente, { itens: [{ preparoId: prep.resumo.id, quantidade: "10", local: "em_uso" }] }))).message).toMatch(/produção/);
    // Saldo inicial aceita preparo.
    await registrarSaldoInicial(db, gerente, { itens: [{ preparoId: prep.resumo.id, quantidade: "300", local: "em_uso" }] });
    expect((await estoqueDoItem(db, gerente, { preparoId: prep.resumo.id })).total).toBe("300");
    await salvarIngrediente(db, gerente, { id: x, nome: nome("Creme"), area: "cozinha", ativo: false });
    expect((await erroDe(entrada(x, "10", "em_uso"))).message).toMatch(/desativado/);
  });

  it("valor em reais só para quem vê custos; cada um só na própria área", async () => {
    const pao = await ingrediente("Pão", "un");
    expect((await erroDe(entrada(pao, "10", "em_uso", { valorCentavos: 100 }, cozinheira))).codigo).toBe("sem_permissao");
    await entrada(pao, "10", "em_uso", {}, cozinheira);
    expect((await erroDe(entrada(pao, "10", "em_uso", {}, supervisor))).codigo).toBe("sem_permissao");
    const refri = await ingrediente("Refrigerante", "un", "bebidas_salao");
    await entrada(refri, "24", "guardado", {}, supervisor);
    expect((await erroDe(entrada(refri, "1", "guardado", {}, cozinheira))).codigo).toBe("sem_permissao");
    expect((await erroDe(entrada(refri, "1", "guardado", {}, atendente))).codigo).toBe("sem_permissao");
    // A cozinheira não vê valores; o painel do supervisor não mostra a cozinha.
    const pCoz = await painelDoEstoque(db, cozinheira);
    expect(pCoz.find((p) => p.ingredienteId === pao)?.valorCentavos).toBeNull();
    expect(pCoz.find((p) => p.ingredienteId === refri)).toBeUndefined();
    const pSup = await painelDoEstoque(db, supervisor);
    expect(pSup.find((p) => p.ingredienteId === pao)).toBeUndefined();
    expect(pSup.find((p) => p.ingredienteId === refri)?.total).toBe("24");
    expect((await erroDe(painelDoEstoque(db, atendente))).codigo).toBe("sem_permissao");
    expect((await erroDe(estoqueDoItem(db, supervisor, { ingredienteId: pao }))).codigo).toBe("sem_permissao");
  });
});

describe("consumo (RC-09 seção 1)", () => {
  it("cabe no em uso: baixa só do em uso", async () => {
    const queijo = await ingrediente("Queijo");
    await entrada(queijo, "100", "em_uso");
    await entrada(queijo, "1000", "guardado");
    await consumir({ itens: [{ ingredienteId: queijo, quantidade: "30" }] });
    const s = await saldo(queijo);
    expect([s.emUso, s.guardado, s.total]).toEqual(["70", "1000", "1070"]);
  });

  it("em uso 6, guardado 40, consome 10: passa 4 sozinho, em uso 0, guardado 36", async () => {
    const ovo = await ingrediente("Ovo", "un");
    await entrada(ovo, "6", "em_uso");
    await entrada(ovo, "40", "guardado");
    const r = await consumir({ itens: [{ ingredienteId: ovo, quantidade: "10" }] });
    expect(r.usouGuardado).toEqual([expect.objectContaining({ quantidade: "4" })]);
    expect(r.faltas).toEqual([]);
    const s = await saldo(ovo);
    expect([s.emUso, s.guardado, s.total]).toEqual(["0", "36", "36"]);
    const linhas = await db.selectFrom("estoque_movimento_linha").select(["local", "quantidade", "automatica"]).where("movimento_id", "=", r.movimentoId).orderBy("id").execute();
    expect(linhas.map((l) => [l.local, Number(l.quantidade), l.automatica])).toEqual([
      ["em_uso", -6, false],
      ["guardado", -4, true],
      ["em_uso", 4, true],
      ["em_uso", -4, false],
    ]);
  });

  it("sem saldo: recusa; com venda autorizada, consome o que há e registra o que faltou", async () => {
    const pao = await ingrediente("Pão", "un");
    await entrada(pao, "2", "em_uso");
    expect((await erroDe(consumir({ itens: [{ ingredienteId: pao, quantidade: "3" }] }))).message).toMatch(/Sem saldo/);
    expect((await saldo(pao)).total).toBe("2");
    const r = await consumir({ itens: [{ ingredienteId: pao, quantidade: "3" }], permitirFalta: true });
    expect(r.faltas).toEqual([expect.objectContaining({ quantidade: "1" })]);
    expect((await saldo(pao)).total).toBe("0");
    const h = await historicoDoItem(db, gerente, { ingredienteId: pao });
    expect(h[0]).toMatchObject({ tipo: "consumo", quantidade: "-2", faltou: "1", quantidadeDepois: "0" });
  });

  it("fração exata da ficha arredonda só no fim; mesmo item em duas linhas soma antes", async () => {
    const sal = await ingrediente("Sal");
    await entrada(sal, "10", "em_uso");
    await consumir({ itens: [{ ingredienteId: sal, quantidade: new Fracao(1n, 3n) }, { ingredienteId: sal, quantidade: new Fracao(1n, 3n) }] });
    expect((await saldo(sal)).total).toBe("9.3333");
  });

  it("custo médio: saídas levam a parte proporcional e zerar zera o valor", async () => {
    const carne = await ingrediente("Carne");
    await entrada(carne, "1000", "em_uso", { valorCentavos: 4000 });
    await entrada(carne, "1000", "em_uso", { valorCentavos: 6000 });
    await consumir({ itens: [{ ingredienteId: carne, quantidade: "500" }] });
    expect((await saldo(carne)).valor).toBe("7500");
    const tres = await ingrediente("Limão", "un");
    await entrada(tres, "3", "em_uso", { valorCentavos: 1000 });
    for (let k = 0; k < 3; k++) await consumir({ itens: [{ ingredienteId: tres, quantidade: "1" }] });
    const h = await historicoDoItem(db, gerente, { ingredienteId: tres });
    expect(h.filter((m) => m.tipo === "consumo").map((m) => m.valorCentavos)).toEqual(["-333", "-334", "-333"]); // o mais novo primeiro
    expect((await saldo(tres)).valor).toBe("0");
  });

  it("o que vence primeiro sai primeiro; bloqueado não é consumido", async () => {
    const iog = await ingrediente("Iogurte", "un");
    await entrada(iog, "5", "em_uso", { validade: "2099-12-31", lote: "B" });
    await entrada(iog, "5", "em_uso", { validade: "2099-06-30", lote: "A" });
    await consumir({ itens: [{ ingredienteId: iog, quantidade: "3" }] });
    const lotes = (await saldo(iog)).item.lotes;
    expect(lotes.map((l) => [l.codigo, l.saldos[0]!.quantidade])).toEqual([
      ["A", "2"],
      ["B", "5"],
    ]);
    await bloquear(db, gerente, { ingredienteId: iog, quantidade: "5", area: "cozinha", local: "em_uso", motivo: "quarentena", loteId: lotes[1]!.loteId });
    expect((await saldo(iog)).livre).toBe("2");
    expect((await erroDe(consumir({ itens: [{ ingredienteId: iog, quantidade: "3" }] }))).message).toMatch(/há 2 un livre/);
    await desbloquear(db, gerente, { ingredienteId: iog, quantidade: "5", area: "cozinha", local: "em_uso" });
    expect((await saldo(iog)).livre).toBe("7");
    await registrarPerda(db, cozinheira, { ingredienteId: iog, quantidade: "1", area: "cozinha", local: "em_uso", motivo: "caiu_ou_quebrou" });
    expect((await saldo(iog)).total).toBe("6");
  });

  it("lote vencido não é consumido e sai primeiro na perda", async () => {
    const creme = await ingrediente("Creme de leite", "un");
    const fuso = (await db.selectFrom("unidade").select(["id", "fuso_horario"]).orderBy("id").executeTakeFirstOrThrow());
    try {
      // Na loja "atrasada" (UTC-12), hoje é um dia; na "adiantada" (UTC+14), já é amanhã ou depois.
      await db.updateTable("unidade").set({ fuso_horario: "Etc/GMT+12" }).where("id", "=", fuso.id).execute();
      const r = await sql<{ d: string }>`SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS d`.execute(db);
      await entrada(creme, "2", "em_uso", { validade: r.rows[0]!.d });
      await entrada(creme, "3", "em_uso", { validade: "2099-01-01" });
      await db.updateTable("unidade").set({ fuso_horario: "Etc/GMT-14" }).where("id", "=", fuso.id).execute();
      const s = await saldo(creme);
      expect(s.item.areas[0]).toMatchObject({ vencido: "2", livre: "3" });
      expect((await erroDe(consumir({ itens: [{ ingredienteId: creme, quantidade: "4" }] }))).message).toMatch(/Sem saldo/);
      expect((await erroDe(transferir(db, gerente, { ingredienteId: creme, quantidade: "4", de: { area: "cozinha", local: "em_uso" }, para: { area: "cozinha", local: "guardado" } }))).message).toMatch(/há 3 un/);
      // Saldo inicial de algo já vencido na loja: entra bloqueado (compra vencida, não).
      const r2 = await sql<{ d: string }>`SELECT to_char(hoje_na_loja() - 1, 'YYYY-MM-DD') AS d`.execute(db);
      await registrarSaldoInicial(db, gerente, { itens: [{ ingredienteId: creme, quantidade: "1", local: "guardado", validade: r2.rows[0]!.d }] });
      expect((await saldo(creme)).item.areas[0]).toMatchObject({ bloqueado: "1", livre: "3" });
      await registrarPerda(db, gerente, { ingredienteId: creme, quantidade: "1", area: "cozinha", local: "guardado", motivo: "venceu", doBloqueado: true });
      await registrarPerda(db, gerente, { ingredienteId: creme, quantidade: "2", area: "cozinha", local: "em_uso", motivo: "venceu" });
      const depois = await saldo(creme);
      expect(depois.item.lotes.map((l) => l.vencido)).toEqual([false]);
      expect(depois.total).toBe("3");
    } finally {
      await db.updateTable("unidade").set({ fuso_horario: fuso.fuso_horario }).where("id", "=", fuso.id).execute();
    }
  });
});

describe("transferência e perda", () => {
  it("em uso <-> guardado não muda total nem valor; só o livre muda de lugar", async () => {
    const arroz = await ingrediente("Arroz");
    await entrada(arroz, "5000", "guardado", { valorCentavos: 2500 });
    await transferir(db, cozinheira, { ingredienteId: arroz, quantidade: "1", unidade: "kg", de: { area: "cozinha", local: "guardado" }, para: { area: "cozinha", local: "em_uso" } });
    const s = await saldo(arroz);
    expect([s.emUso, s.guardado, s.total, s.valor]).toEqual(["1000", "4000", "5000", "2500"]);
    expect((await erroDe(transferir(db, cozinheira, { ingredienteId: arroz, quantidade: "2000", de: { area: "cozinha", local: "em_uso" }, para: { area: "cozinha", local: "guardado" } }))).message).toMatch(/há 1000 g/);
  });

  it("entre áreas: precisa de quem recebeu, e essa pessoa cuida da área de destino", async () => {
    const leite = await ingrediente("Leite", "ml");
    await entrada(leite, "3000", "guardado");
    const base = { ingredienteId: leite, quantidade: "1000", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" } };
    expect((await erroDe(transferir(db, gerente, base))).message).toMatch(/quem recebeu/);
    expect((await erroDe(transferir(db, gerente, { ...base, recebidoPor: cozinheira.usuarioId }))).message).toMatch(/cuidar da área Cafeteria/);
    const r = await transferir(db, cozinheira, { ...base, recebidoPor: supervisor.usuarioId });
    const m = await db.selectFrom("estoque_movimento").select(["recebido_por", "autor_id"]).where("id", "=", r.movimentoId).executeTakeFirstOrThrow();
    expect(m).toEqual({ recebido_por: supervisor.usuarioId, autor_id: cozinheira.usuarioId });
    const p = (await painelDoEstoque(db, supervisor)).find((x) => x.ingredienteId === leite);
    expect(p?.areas).toEqual([expect.objectContaining({ area: "cafeteria", emUso: "1000" })]);
    // O supervisor não tira da cozinha.
    expect((await erroDe(transferir(db, supervisor, { ...base, recebidoPor: supervisor.usuarioId }))).codigo).toBe("sem_permissao");
  });

  it("perda: motivo obrigatório, 'outro' pede observação, valor sai pelo custo médio", async () => {
    const tomate = await ingrediente("Tomate");
    await entrada(tomate, "1000", "em_uso", { valorCentavos: 800 });
    const base = { ingredienteId: tomate, quantidade: "250", area: "cozinha", local: "em_uso" };
    expect((await erroDe(registrarPerda(db, gerente, base))).codigo).toBe("dados_invalidos");
    expect((await erroDe(registrarPerda(db, gerente, { ...base, motivo: "outro" }))).message).toMatch(/observação/);
    await registrarPerda(db, gerente, { ...base, motivo: "estragou" });
    expect((await saldo(tomate)).valor).toBe("600");
    expect((await erroDe(registrarPerda(db, gerente, { ...base, quantidade: "1000", motivo: "estragou" }))).message).toMatch(/há 750 g/);
  });
});

describe("cada um vê só a própria área (RC-09 seção 4)", () => {
  it("o supervisor não vê o total, o histórico nem a observação da cozinha", async () => {
    const leite = await ingrediente("Leite", "ml");
    await registrarEntrada(db, gerente, { observacao: "nota secreta da cozinha", itens: [{ ingredienteId: leite, quantidade: "9000", local: "guardado", valorCentavos: 9000 }] });
    await transferir(db, gerente, { ingredienteId: leite, quantidade: "1", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" }, recebidoPor: supervisor.usuarioId });
    const p = (await painelDoEstoque(db, supervisor)).find((x) => x.ingredienteId === leite)!;
    expect(p.total).toBe("1");
    expect(p.valorCentavos).toBeNull();
    const item = await estoqueDoItem(db, supervisor, { ingredienteId: leite });
    expect(item.total).toBe("1");
    expect(item.lotes.flatMap((l) => l.saldos.map((x) => x.area))).toEqual(["cafeteria"]);
    const h = await historicoDoItem(db, supervisor, { ingredienteId: leite });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ tipo: "transferencia", quantidade: "1", quantidadeDepois: null });
    expect(JSON.stringify(h)).not.toContain("secreta");
    // O gerente vê tudo, com o total depois.
    const hg = await historicoDoItem(db, gerente, { ingredienteId: leite });
    expect(hg.map((x) => [x.tipo, x.quantidade, x.quantidadeDepois])).toEqual([
      ["transferencia", "0", "9000"],
      ["entrada", "9000", "9000"],
    ]);
  });

  it("bloqueio, desbloqueio e perda só na própria área; sem custos, nada de valor", async () => {
    const x = await ingrediente("Presunto");
    await entrada(x, "500", "em_uso", { valorCentavos: 2000 });
    const base = { ingredienteId: x, quantidade: "100", area: "cozinha", local: "em_uso" };
    expect((await erroDe(bloquear(db, supervisor, { ...base, motivo: "quarentena" }))).codigo).toBe("sem_permissao");
    await bloquear(db, cozinheira, { ...base, motivo: "quarentena" });
    expect((await erroDe(desbloquear(db, supervisor, base))).codigo).toBe("sem_permissao");
    expect((await erroDe(registrarPerda(db, supervisor, { ...base, motivo: "estragou" }))).codigo).toBe("sem_permissao");
    const item = await estoqueDoItem(db, cozinheira, { ingredienteId: x });
    expect([item.valorCentavos, item.custoMedioCentavos, item.areas[0]!.valorCentavos]).toEqual([null, null, null]);
    const h = await historicoDoItem(db, cozinheira, { ingredienteId: x });
    expect(h.every((m) => m.valorCentavos === null && m.valorDepois === null)).toBe(true);
    // A perda que zera leva o valor todo.
    await desbloquear(db, cozinheira, base);
    await registrarPerda(db, cozinheira, { ...base, quantidade: "500", motivo: "estragou" });
    expect((await saldo(x)).valor).toBe("0");
  });

  it("consumo de outra área usa o saldo daquela área", async () => {
    const x = await ingrediente("Leite condensado", "ml");
    await entrada(x, "300", "em_uso", { area: "cafeteria" });
    expect((await erroDe(consumir({ itens: [{ ingredienteId: x, quantidade: "100" }] }))).message).toMatch(/Sem saldo/);
    await consumir({ itens: [{ ingredienteId: x, quantidade: "100", area: "cafeteria" }] });
    const p = (await painelDoEstoque(db, gerente)).find((i) => i.ingredienteId === x)!;
    expect(p.areas).toEqual([expect.objectContaining({ area: "cafeteria", emUso: "200" })]);
  });

  it("valor no saldo inicial pede custos; quem não pode não descobre a chave; fornecedor desativado é recusado", async () => {
    const x = await ingrediente("Fermento");
    expect((await erroDe(registrarSaldoInicial(db, cozinheira, { itens: [{ ingredienteId: x, quantidade: "10", local: "em_uso", valorCentavos: 100 }] }))).codigo).toBe("sem_permissao");
    const chave = `teste-${randomUUID()}`;
    await registrarEntrada(db, gerente, { chave, itens: [{ ingredienteId: x, quantidade: "10", local: "em_uso" }] });
    expect((await erroDe(registrarEntrada(db, atendente, { chave, itens: [{ ingredienteId: x, quantidade: "99", local: "em_uso" }] }))).codigo).toBe("sem_permissao");
    const f = await salvarFornecedor(db, gerente, { nome: nome("Fornecedor parado") });
    await salvarFornecedor(db, gerente, { id: f.id, nome: f.nome, ativo: false });
    expect((await erroDe(registrarEntrada(db, gerente, { fornecedorId: f.id, itens: [{ ingredienteId: x, quantidade: "1", local: "em_uso" }] }))).message).toMatch(/desativado/);
  });
});

describe("histórico imutável e repetição", () => {
  it("movimento, linha e lote não mudam nem somem", async () => {
    const x = await ingrediente("Açúcar");
    const r = await entrada(x, "10", "em_uso");
    await expect(sql`UPDATE estoque_movimento SET observacao = 'x' WHERE id = ${r.movimentoId}::bigint`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`DELETE FROM estoque_movimento_linha WHERE movimento_id = ${r.movimentoId}::bigint`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`DELETE FROM estoque_saldo s USING estoque_item e WHERE e.id = s.item_id AND e.ingrediente_id = ${x}`.execute(db)).rejects.toThrow(/não é apagado/);
    await expect(sql`UPDATE estoque_saldo s SET quantidade = -1 FROM estoque_item e WHERE e.id = s.item_id AND e.ingrediente_id = ${x}`.execute(db)).rejects.toThrow(/check/);
  });

  it("mesma chave: um movimento só; conteúdo diferente com a mesma chave é recusado", async () => {
    const x = await ingrediente("Café", "g");
    const chave = `teste-${randomUUID()}`;
    const a = await registrarEntrada(db, gerente, { chave, itens: [{ ingredienteId: x, quantidade: "500", local: "guardado" }] });
    const b = await registrarEntrada(db, gerente, { chave, itens: [{ ingredienteId: x, quantidade: "500", local: "guardado" }] });
    expect(b).toEqual({ movimentoId: a.movimentoId, repetido: true });
    expect((await erroDe(registrarEntrada(db, gerente, { chave, itens: [{ ingredienteId: x, quantidade: "501", local: "guardado" }] }))).codigo).toBe("conflito");
    expect((await saldo(x)).total).toBe("500");
    // Consumo da E11: o mesmo pedido reenviado não baixa de novo.
    const ck = `pedido-${randomUUID()}`;
    const c1 = await consumir({ chave: ck, origemTipo: "pedido", origemId: "1", itens: [{ ingredienteId: x, quantidade: "100" }] });
    const c2 = await consumir({ chave: ck, origemTipo: "pedido", origemId: "1", itens: [{ ingredienteId: x, quantidade: "100" }] });
    expect(c2).toMatchObject({ movimentoId: c1.movimentoId, repetido: true });
    // Reenvio do mesmo pedido por outro aparelho (outro autor): o mesmo consumo, sem baixar de novo.
    const c3 = await consumir({ chave: ck, origemTipo: "pedido", origemId: "1", itens: [{ ingredienteId: x, quantidade: "100" }] }, cozinheira.usuarioId);
    expect(c3).toMatchObject({ movimentoId: c1.movimentoId, repetido: true });
    expect((await saldo(x)).total).toBe("400");
    // Consumo sem chave é recusado (a baixa acontece uma vez só).
    await expect(db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, itens: [{ ingredienteId: x, quantidade: "1" }] } as unknown as DadosDoConsumo))).rejects.toThrow(/Chave/);
  });

  it("mesma chave ao mesmo tempo: uma grava, a outra recebe a gravada", async () => {
    const x = await ingrediente("Chá", "g");
    const chave = `teste-${randomUUID()}`;
    const outra = bancoDeTeste();
    try {
      const d = { chave, itens: [{ ingredienteId: x, quantidade: "50", local: "em_uso" }] };
      const r = await Promise.all([registrarEntrada(db, gerente, d), registrarEntrada(outra, gerente, d), registrarEntrada(db, gerente, d)]);
      expect(new Set(r.map((x) => x.movimentoId)).size).toBe(1);
      expect(r.filter((x) => !x.repetido)).toHaveLength(1);
    } finally {
      await outra.destroy();
    }
    expect((await saldo(x)).total).toBe("50");
  });
});

describe("concorrência (RC-09 critério 10)", () => {
  async function esperarPresos(minimo: number) {
    for (let k = 0; k < 100; k++) {
      const r = await sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(db);
      if (r.rows[0]!.n >= minimo) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error("as transações não ficaram presas na trava");
  }

  it("última porção disputada: quem chega depois espera e recebe 'sem saldo'; nunca negativo", async () => {
    const x = await ingrediente("Picanha", "un");
    await entrada(x, "1", "em_uso");
    const outra = bancoDeTeste();
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      let consumiu!: () => void;
      const consumido = new Promise<void>((r) => (consumiu = r));
      const a = db.transaction().execute(async (trx) => {
        await consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "1" }] });
        consumiu();
        await solto;
      });
      await consumido;
      const b = outra.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "1" }] }));
      b.catch(() => undefined);
      await esperarPresos(1);
      soltar();
      await a;
      const e = await erroDe(b);
      expect(e.message).toMatch(/Sem saldo/);
    } finally {
      await outra.destroy();
    }
    expect((await saldo(x)).total).toBe("0");
  });

  it("dois pedidos com os mesmos itens em ordem trocada: sem impasse, os dois baixam", async () => {
    const a = await ingrediente("Batata");
    const b = await ingrediente("Cebola");
    await entrada(a, "100", "em_uso");
    await entrada(b, "100", "em_uso");
    const outra = bancoDeTeste();
    try {
      const r = await Promise.all(
        Array.from({ length: 6 }, (_, k) =>
          (k % 2 ? outra : db).transaction().execute((trx) =>
            consumirNaTransacao(trx, {
              autorId: gerente.usuarioId,
              chave: `teste-${randomUUID()}`,
              itens: k % 2 ? [{ ingredienteId: a, quantidade: "10" }, { ingredienteId: b, quantidade: "10" }] : [{ ingredienteId: b, quantidade: "10" }, { ingredienteId: a, quantidade: "10" }],
            }),
          ),
        ),
      );
      expect(r).toHaveLength(6);
    } finally {
      await outra.destroy();
    }
    expect([(await saldo(a)).total, (await saldo(b)).total]).toEqual(["40", "40"]);
  });

  it("muitos consumos ao mesmo tempo com passagem do guardado: total exato e nada negativo", async () => {
    const x = await ingrediente("Mussarela");
    await entrada(x, "50", "em_uso", { valorCentavos: 500 });
    await entrada(x, "100", "guardado", { valorCentavos: 1000 });
    const outra = bancoDeTeste();
    try {
      const r = await Promise.allSettled(
        Array.from({ length: 20 }, (_, k) => (k % 2 ? outra : db).transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "10" }] }))),
      );
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(15);
      expect(r.filter((x) => x.status === "rejected").every((x) => (x as PromiseRejectedResult).reason instanceof ErroDeRegra)).toBe(true);
    } finally {
      await outra.destroy();
    }
    const s = await saldo(x);
    expect([s.total, s.valor]).toEqual(["0", "0"]);
  });
});
