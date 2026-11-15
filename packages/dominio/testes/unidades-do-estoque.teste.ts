/**
 * Ideia nº 5 (migração 0008): lista pronta de unidades do estoque. Por dentro conta em g, ml ou
 * un; a pessoa vê e escolhe kg, g, L, ml, un ou dz. Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  cadastrarEmLote,
  converterParaBase,
  ErroDeRegra,
  listarIngredientes,
  mostrarQuantidade,
  salvarIngrediente,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
const sufixo = randomUUID().slice(0, 8);
const n = (nome: string) => `${nome} ${sufixo}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
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
const doBanco = async (id: number) => (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === id)!;

describe("mostrar a quantidade na unidade escolhida (conta exata)", () => {
  it("kg e L dividem por 1000 sem perder casa; formato brasileiro", () => {
    expect(mostrarQuantidade("2500", "kg")).toBe("2,5 kg");
    expect(mostrarQuantidade("25000", "kg")).toBe("25 kg");
    expect(mostrarQuantidade("1250000", "kg")).toBe("1.250 kg");
    expect(mostrarQuantidade("0.1", "kg")).toBe("0,0001 kg");
    expect(mostrarQuantidade("1234.5678", "kg")).toBe("1,2345678 kg");
    expect(mostrarQuantidade("1250", "l")).toBe("1,25 L");
    expect(mostrarQuantidade("25000", "g")).toBe("25.000 g");
    expect(mostrarQuantidade("-300", "kg")).toBe("-0,3 kg");
  });
  it("dúzia nunca mostra dízima: resto vai em unidades", () => {
    expect(mostrarQuantidade("24", "dz")).toBe("2 dz");
    expect(mostrarQuantidade("18", "dz")).toBe("1 dz e 6 un");
    expect(mostrarQuantidade("8", "dz")).toBe("8 un");
    expect(mostrarQuantidade("0.5", "dz")).toBe("0,5 un");
    expect(mostrarQuantidade("30", "un")).toBe("30 un");
    expect(mostrarQuantidade("-18", "dz")).toBe("-18 un");
    expect(mostrarQuantidade("0", "dz")).toBe("0 un");
  });
  it("texto que não é número ou unidade fora da lista dá nulo", () => {
    expect(mostrarQuantidade("abc", "kg")).toBeNull();
    expect(mostrarQuantidade("1e3", "kg")).toBeNull();
    expect(mostrarQuantidade("10", "t")).toBeNull();
    expect(mostrarQuantidade("5.", "kg")).toBeNull();
  });
});

describe("unidade para mostrar no cadastro", () => {
  it("escolher kg cria o ingrediente contando em g; a conversão continua exata", async () => {
    const { id } = await salvarIngrediente(db, gerente, { nome: n("Farinha kg"), unidadeExibicao: "kg", area: "cozinha" });
    const i = await doBanco(id);
    expect(i.unidadeBase).toBe("g");
    expect(i.unidadeExibicao).toBe("kg");
    expect(await converterParaBase(db, id, "2,5", "kg")).toBe("2500");
  });
  it("L vira ml e dz vira un; sem escolha, mostra na própria unidade do estoque", async () => {
    const leite = await salvarIngrediente(db, gerente, { nome: n("Leite L"), unidadeExibicao: "l", area: "cafeteria" });
    expect((await doBanco(leite.id)).unidadeBase).toBe("ml");
    const ovo = await salvarIngrediente(db, gerente, { nome: n("Ovo dz"), unidadeExibicao: "dz", area: "cozinha" });
    expect((await doBanco(ovo.id)).unidadeBase).toBe("un");
    const sal = await salvarIngrediente(db, gerente, { nome: n("Sal"), unidadeBase: "g", area: "cozinha" });
    expect((await doBanco(sal.id)).unidadeExibicao).toBe("g");
  });
  it("unidade de outra família é recusada com mensagem clara, na criação e na alteração", async () => {
    const e1 = await erroDe(salvarIngrediente(db, gerente, { nome: n("Errado"), unidadeBase: "g", unidadeExibicao: "l", area: "cozinha" }));
    expect(e1.message).toBe("Este ingrediente conta em peso (gramas): escolha kg ou g.");
    const { id } = await salvarIngrediente(db, gerente, { nome: n("Açúcar"), unidadeBase: "g", area: "cozinha" });
    const e2 = await erroDe(salvarIngrediente(db, gerente, { id, nome: n("Açúcar"), unidadeExibicao: "dz", area: "cozinha" }));
    expect(e2.message).toBe("Este ingrediente conta em peso (gramas): escolha kg ou g.");
    const e3 = await erroDe(salvarIngrediente(db, gerente, { nome: n("Tonelada"), unidadeExibicao: "t", area: "cozinha" }));
    expect(e3.message).toContain("kg, g, L, ml, un ou dz");
  });
  it("trocar g por kg depois de criado muda só como se vê; a base fica e vai para a auditoria", async () => {
    const { id } = await salvarIngrediente(db, gerente, { nome: n("Queijo"), unidadeBase: "g", area: "cozinha" });
    await salvarIngrediente(db, gerente, { id, nome: n("Queijo"), unidadeExibicao: "kg", area: "cozinha" });
    const i = await doBanco(id);
    expect([i.unidadeBase, i.unidadeExibicao]).toEqual(["g", "kg"]);
    // Alterar sem mandar a unidade para mostrar mantém a escolhida.
    await salvarIngrediente(db, gerente, { id, nome: n("Queijo"), area: "cozinha" });
    expect((await doBanco(id)).unidadeExibicao).toBe("kg");
    const aud = await sql<{ d: { antes: { unidade_exibicao: string }; depois: { unidade_exibicao: string } } }>`
      SELECT detalhes AS d FROM auditoria WHERE alvo_tipo = 'ingrediente' AND alvo_id = ${String(id)}
        AND detalhes->>'operacao' = 'alterar' ORDER BY id LIMIT 1`.execute(db);
    expect(aud.rows[0]!.d.antes.unidade_exibicao).toBe("g");
    expect(aud.rows[0]!.d.depois.unidade_exibicao).toBe("kg");
  });
  it("o banco recusa unidade de outra família mesmo direto, e põe a base quando falta", async () => {
    const { id } = await salvarIngrediente(db, gerente, { nome: n("Direto"), unidadeBase: "ml", area: "cafeteria" });
    await expect(sql`UPDATE ingrediente SET unidade_exibicao = 'kg' WHERE id = ${id}`.execute(db)).rejects.toThrow(/ingrediente_exibicao_da_familia/);
    await sql`UPDATE ingrediente SET unidade_exibicao = NULL WHERE id = ${id}`.execute(db);
    expect((await doBanco(id)).unidadeExibicao).toBe("ml");
  });
  it("cadastro em lote aceita a unidade para mostrar e recusa a de outra família dizendo o item", async () => {
    const r = await cadastrarEmLote(db, gerente, [{ nome: n("Arroz lote"), unidadeBase: "g", unidadeExibicao: "kg", area: "cozinha" }]);
    expect((await doBanco(r.ids[0]!)).unidadeExibicao).toBe("kg");
    const e = await erroDe(cadastrarEmLote(db, gerente, [{ nome: n("Suco lote"), unidadeBase: "ml", unidadeExibicao: "kg", area: "cafeteria" }]));
    expect(e.message).toBe(`"${n("Suco lote")}": Este ingrediente conta em volume (mililitros): escolha L ou ml. Nada foi gravado; corrija e tente de novo.`);
  });
});
