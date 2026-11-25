/** Relatórios do estoque (E09 parte 5; decisão 0027). Contra PostgreSQL real. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  abrirContagem,
  desfazerMovimento,
  ErroDeRegra,
  fecharContagem,
  registrarContagem,
  registrarEntrada,
  registrarPerda,
  relatorioDeContagens,
  relatorioDePerdas,
  salvarIngrediente,
  verContagem,
  valorDoEstoquePorArea,
  type Ator,
} from "../src/index";
import { linhasParaCsv } from "../src/importar-comum";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let supervisor: Ator;
let hoje: string;
const sufixo = randomUUID().slice(0, 6);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${++n}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  supervisor = await atorDoCargo(db, "supervisor");
  hoje = (await sql<{ d: string }>`SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
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

describe("relatórios do estoque", () => {
  it("perdas por motivo, sem as desfeitas; valor só para quem vê custos de todas as áreas", async () => {
    const x = (await salvarIngrediente(db, gerente, { nome: nome("Alface"), unidadeBase: "un", area: "cozinha" })).id;
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "10", local: "em_uso", valorCentavos: 1000 }] });
    const base = { ingredienteId: x, area: "cozinha", local: "em_uso" };
    await registrarPerda(db, cozinheira, { ...base, quantidade: "2", motivo: "estragou" });
    const p2 = await registrarPerda(db, cozinheira, { ...base, quantidade: "1", motivo: "caiu_ou_quebrou" });
    await desfazerMovimento(db, gerente, { movimentoId: p2.movimentoId, observacao: "não caiu" });
    const r = await relatorioDePerdas(db, gerente, { desde: hoje, ate: hoje });
    const meu = r.itens.filter((i) => i.itemId !== undefined && i.nome.includes(sufixo));
    expect(meu).toEqual([expect.objectContaining({ motivo: "estragou", vezes: 1, quantidade: "2", valorCentavos: "200" })]);
    const rc = await relatorioDePerdas(db, cozinheira, { desde: hoje, ate: hoje });
    expect(rc.totalCentavos).toBeNull();
    expect(rc.itens.filter((i) => i.nome.includes(sufixo))).toHaveLength(1);
    expect((await relatorioDePerdas(db, supervisor, { desde: hoje, ate: hoje })).itens.filter((i) => i.nome.includes(sufixo))).toHaveLength(0);
    expect((await erroDe(relatorioDePerdas(db, gerente, { desde: hoje, ate: "2000-01-01" }))).codigo).toBe("dados_invalidos");
  });

  it("diferenças das contagens e valor por área", async () => {
    const x = (await salvarIngrediente(db, gerente, { nome: nome("Copo"), unidadeBase: "un", area: "cafeteria" })).id;
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "100", local: "guardado", area: "cafeteria", valorCentavos: 5000 }] });
    const c = await abrirContagem(db, supervisor, { tipo: "item", area: "cafeteria", itens: [{ ingredienteId: x, local: "guardado" }] });
    await registrarContagem(db, supervisor, { contagemId: c.id, contagemItemId: c.linhas[0]!.contagemItemId, quantidade: "90" });
    await fecharContagem(db, supervisor, { contagemId: c.id });
    const r = await relatorioDeContagens(db, gerente, { desde: hoje, ate: hoje, area: "cafeteria" });
    expect(r.linhas.find((l) => l.itemId && l.nome.includes(sufixo))).toMatchObject({ esperado: "100", contado: "90", diferenca: "-10", valorCentavos: "-500" });
    expect((await relatorioDeContagens(db, supervisor, { desde: hoje, ate: hoje })).faltaCentavos).toBeNull();
    const v = await valorDoEstoquePorArea(db, gerente);
    expect(BigInt(v.areas.find((a) => a.area === "cafeteria")!.valorCentavos)).toBeGreaterThanOrEqual(4500n);
    expect((await erroDe(valorDoEstoquePorArea(db, supervisor))).codigo).toBe("sem_permissao");
  });

  it("diferença vale o que o ajuste lançou (não muda com compra mais cara); ajuste desfeito sai; área alheia é recusada", async () => {
    const nomeTampa = nome("Tampa");
    const x = (await salvarIngrediente(db, gerente, { nome: nomeTampa, unidadeBase: "un", area: "cafeteria" })).id;
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "100", local: "guardado", area: "cafeteria", valorCentavos: 1000 }] });
    const contar = async (q: string) => {
      const c = await abrirContagem(db, supervisor, { tipo: "item", area: "cafeteria", itens: [{ ingredienteId: x, local: "guardado" }] });
      await registrarContagem(db, supervisor, { contagemId: c.id, contagemItemId: c.linhas[0]!.contagemItemId, quantidade: q });
      await fecharContagem(db, supervisor, { contagemId: c.id });
      return c.id;
    };
    const c1 = await contar("90");
    const minha = async () => (await relatorioDeContagens(db, gerente, { desde: hoje, ate: hoje, area: "cafeteria" })).linhas.filter((l) => l.nome === nomeTampa);
    expect(await minha()).toEqual([expect.objectContaining({ contagemId: c1, diferenca: "-10", aplicado: "-10", valorCentavos: "-100" })]);
    // Compra bem mais cara depois: o valor lançado na contagem não muda.
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "10", local: "guardado", area: "cafeteria", valorCentavos: 10000 }] });
    expect((await minha())[0]!.valorCentavos).toBe("-100");
    const antes = await relatorioDeContagens(db, gerente, { desde: hoje, ate: hoje, area: "cafeteria" });
    expect(antes.cortado).toBe(false);
    // Desfeito o ajuste, a linha sai do relatório e dos totais.
    const fim = (await verContagem(db, gerente, { contagemId: c1 })).fim!;
    await desfazerMovimento(db, gerente, { movimentoId: fim.movimentoId!, observacao: "contei errado" });
    expect(await minha()).toEqual([]);
    const depois = await relatorioDeContagens(db, gerente, { desde: hoje, ate: hoje, area: "cafeteria" });
    expect(BigInt(antes.faltaCentavos!) - BigInt(depois.faltaCentavos!)).toBe(100n);
    // Quem não cuida da área não filtra por ela.
    expect((await erroDe(relatorioDeContagens(db, cozinheira, { desde: hoje, ate: hoje, area: "cafeteria" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(relatorioDePerdas(db, cozinheira, { desde: hoje, ate: hoje, area: "cafeteria" }))).codigo).toBe("sem_permissao");
  });

  it("valor por área soma exatamente a entrada nova", async () => {
    const x = (await salvarIngrediente(db, gerente, { nome: nome("Guardanapo"), unidadeBase: "un", area: "cafeteria" })).id;
    const caf = async () => BigInt((await valorDoEstoquePorArea(db, gerente)).areas.find((a) => a.area === "cafeteria")?.valorCentavos ?? "0");
    const antes = await caf();
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "30", local: "guardado", area: "cafeteria", valorCentavos: 3333 }] });
    expect((await caf()) - antes).toBe(3333n);
  });

  it("CSV: número negativo fica número; fórmula continua protegida", () => {
    expect(linhasParaCsv([["-10", "-12,50", "-1.234,5", "=1+1", "-1+2", "@x", "+5"]])).toBe("\ufeff-10;-12,50;-1.234,5;'=1+1;'-1+2;'@x;'+5\r\n");
  });
});
