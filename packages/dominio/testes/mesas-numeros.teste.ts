/**
 * Número das mesas escolhido por supervisor e acima (pedido do responsável, 25/11/2026), contra
 * PostgreSQL real: quem pode, troca entre duas mesas, repetido recusado, mesa faltando ou
 * desconhecida, auditoria, recusa auditada e o banco barrando número repetido.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import { ErroDeRegra, MESAS_DA_LOJA, mesasDaUnidade, numerarMesas, type Ator } from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let unidadeId: number;

beforeAll(async () => {
  db = bancoDeTeste();
  ({ unidadeId } = await prepararDados(db));
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

const padrao = () => Object.fromEntries(MESAS_DA_LOJA.map((m) => [m.codigo, m.numero]));
const numeroDe = (mesas: { codigo: string; numero: number }[], codigo: string) => mesas.find((m) => m.codigo === codigo)!.numero;

describe("número das mesas (mesas.numerar)", () => {
  it("sem escolha, vale o número padrão", async () => {
    const atendente = await atorDoCargo(db, "atendente");
    const mesas = await mesasDaUnidade(db, atendente, "pedidos.lancar");
    expect(mesas.map((m) => [m.codigo, m.numero])).toEqual(MESAS_DA_LOJA.map((m) => [m.codigo, m.numero]));
  });

  it("supervisor troca o número de duas mesas numa gravação só; todos veem; fica na auditoria", async () => {
    const sup = await atorDoCargo(db, "supervisor");
    const novos = { ...padrao(), m1: 2, m2: 1, balcao: 20 };
    const r = await numerarMesas(db, sup, { numeros: novos });
    expect(numeroDe(r, "m1")).toBe(2);
    const vista = await mesasDaUnidade(db, await atorDoCargo(db, "caixa"), "caixa.operar");
    expect([numeroDe(vista, "m1"), numeroDe(vista, "m2"), numeroDe(vista, "balcao"), numeroDe(vista, "m9")]).toEqual([2, 1, 20, 9]);
    const reg = await db.selectFrom("auditoria").select(["resultado", "detalhes"]).where("acao", "=", "mesas.numerar").where("usuario_id", "=", sup.usuarioId).orderBy("id", "desc").executeTakeFirstOrThrow();
    expect(reg.resultado).toBe("permitido");
    expect(reg.detalhes.mudancas).toEqual([
      { mesa: "m1", de: 1, para: 2 },
      { mesa: "m2", de: 2, para: 1 },
      { mesa: "balcao", de: 12, para: 20 },
    ]);
    const linha = await db.selectFrom("mesa_numero").select(["numero", "atualizado_por"]).where("unidade_id", "=", unidadeId).where("codigo", "=", "balcao").executeTakeFirstOrThrow();
    expect(linha).toEqual({ numero: 20, atualizado_por: sup.usuarioId });
  });

  it("gerente geral, administrador e dono também numeram; atendente, caixa e cozinha não (recusa auditada)", async () => {
    for (const c of ["gerente_geral", "administrador", "dono"]) {
      const a = await atorDoCargo(db, c);
      await expect(numerarMesas(db, a, { numeros: padrao() }), c).resolves.toHaveLength(MESAS_DA_LOJA.length);
    }
    for (const c of ["atendente", "caixa", "cozinheira", "motoboy", "financeiro", "contador"]) {
      const a: Ator = await atorDoCargo(db, c);
      expect((await erroDe(numerarMesas(db, a, { numeros: { ...padrao(), m1: 50 } }))).codigo, c).toBe("sem_permissao");
      const recusa = await db.selectFrom("auditoria").select("resultado").where("acao", "=", "mesas.numerar").where("usuario_id", "=", a.usuarioId).orderBy("id", "desc").executeTakeFirstOrThrow();
      expect(recusa.resultado, c).toBe("recusado");
    }
    expect((await erroDe(numerarMesas(db, null, { numeros: padrao() }))).codigo).toBe("nao_autenticado");
    expect(numeroDe(await mesasDaUnidade(db, await atorDoCargo(db, "supervisor"), "pedidos.lancar"), "m1")).toBe(1);
  });

  it("recusa número repetido, mesa faltando, mesa que não existe, número fora de 1 a 999 e campo a mais", async () => {
    const sup = await atorDoCargo(db, "supervisor");
    expect((await erroDe(numerarMesas(db, sup, { numeros: { ...padrao(), m2: 1 } }))).codigo).toBe("conflito");
    const semUma = padrao();
    delete semUma.m5;
    for (const ruim of [
      { numeros: semUma },
      { numeros: { ...padrao(), mesa99: 99 } },
      { numeros: { ...padrao(), m1: 0 } },
      { numeros: { ...padrao(), m1: 1000 } },
      { numeros: { ...padrao(), m1: 1.5 } },
      { numeros: { ...padrao(), m1: "1" } },
      { numeros: padrao(), extra: 1 },
      {},
      null,
    ])
      expect((await erroDe(numerarMesas(db, sup, ruim))).codigo, JSON.stringify(ruim)).toBe("dados_invalidos");
  });

  it("o banco barra número repetido na mesma loja e não deixa apagar a numeração", async () => {
    const sup = await atorDoCargo(db, "supervisor");
    await numerarMesas(db, sup, { numeros: { ...padrao(), m3: 33 } });
    await expect(
      db.transaction().execute(async (t) => {
        await t.updateTable("mesa_numero").set({ numero: 1 }).where("unidade_id", "=", unidadeId).where("codigo", "=", "m3").execute();
      }),
    ).rejects.toThrow();
    await expect(sql`DELETE FROM mesa_numero WHERE unidade_id = ${unidadeId}`.execute(db)).rejects.toThrow();
  });

  it("duas gravações ao mesmo tempo não misturam números (uma de cada vez por loja)", async () => {
    const sup = await atorDoCargo(db, "supervisor");
    const ger = await atorDoCargo(db, "gerente_geral");
    await Promise.all([
      numerarMesas(db, sup, { numeros: { ...padrao(), m10: 100 } }),
      numerarMesas(db, ger, { numeros: { ...padrao(), m11: 100 } }),
    ]);
    const vista = await mesasDaUnidade(db, sup, "pedidos.lancar");
    const numeros = vista.map((m) => m.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect([numeroDe(vista, "m10"), numeroDe(vista, "m11")].filter((n) => n === 100)).toHaveLength(1);
  });
});
