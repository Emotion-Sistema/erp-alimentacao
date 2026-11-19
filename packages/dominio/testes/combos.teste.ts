/**
 * Combos (migração 0017; decisão 0023): partes, opções, regras e preço. Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import {
  calcularPrecoDoItem,
  ErroDeRegra,
  listarProdutos,
  salvarCategoria,
  salvarGrupoDeAdicionais,
  salvarProduto,
  salvarTipoDeProducao,
  type Ator,
  type Produto,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let cat: number;
let tipo: number;
const sufixo = randomUUID().slice(0, 6).replace(/[0-9]/g, "x");
let n = 0;
const nome = (b: string) => `${b} ${sufixo} ${n++}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  cat = (await salvarCategoria(db, gerente, { nome: `Combos ${sufixo}` })).id;
  tipo = (await salvarTipoDeProducao(db, gerente, { nome: `Chapa CB ${sufixo}`, area: "cozinha" })).id;
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

async function montar() {
  const lanche = await salvarProduto(db, gerente, { nome: nome("X-Burguer"), categoriaId: cat, precoCentavos: 2500, tipoProducaoId: tipo, tempoPreparoMin: 12 });
  const outroLanche = await salvarProduto(db, gerente, { nome: nome("X-Frango"), categoriaId: cat, precoCentavos: 2400, tipoProducaoId: tipo, tempoPreparoMin: 12 });
  const refri = await salvarProduto(db, gerente, { nome: nome("Refri"), categoriaId: cat, precoCentavos: 600, tamanhos: [{ nome: "Lata", acrescimoCentavos: 0 }, { nome: "600 ml", acrescimoCentavos: 300 }] });
  const suco = await salvarProduto(db, gerente, { nome: nome("Suco"), categoriaId: cat, precoCentavos: 900 });
  const combo = await salvarProduto(db, gerente, {
    nome: nome("Combo X"),
    categoriaId: cat,
    precoCentavos: 3200,
    precoDeliveryCentavos: 3500,
    combo: {
      partes: [
        { nome: "Lanche", opcoes: [{ produtoId: lanche.id, acrescimoCentavos: 0 }, { produtoId: outroLanche.id, acrescimoCentavos: 0 }] },
        {
          nome: "Bebida",
          opcoes: [
            { produtoId: refri.id, tamanhoId: refri.tamanhos[0]!.id, acrescimoCentavos: 0 },
            { produtoId: suco.id, acrescimoCentavos: 300, acrescimoDeliveryCentavos: 400 },
          ],
        },
      ],
    },
  });
  return { lanche, outroLanche, refri, suco, combo };
}

const escolha = (c: Produto, a: number, b: number) => ({
  combo: [
    { parteId: c.combo!.partes[0]!.id, opcaoId: c.combo!.partes[0]!.opcoes[a]!.id },
    { parteId: c.combo!.partes[1]!.id, opcaoId: c.combo!.partes[1]!.opcoes[b]!.id },
  ],
});

describe("combos", () => {
  it("cria com partes e opções na ordem; lista mostra; preço = combo + acréscimo da opção no canal", async () => {
    const { combo, lanche, refri } = await montar();
    expect(combo.combo!.partes.map((p) => [p.nome, p.opcoes.length])).toEqual([
      ["Lanche", 2],
      ["Bebida", 2],
    ]);
    expect(combo.tipoProducaoId).toBeNull();
    expect((await listarProdutos(db, cozinheira)).find((p) => p.id === combo.id)!.combo!.partes).toHaveLength(2);
    const r = await calcularPrecoDoItem(db, combo.id, "loja", escolha(combo, 0, 0));
    expect(r.unitarioCentavos).toBe(3200);
    expect(r.combo.map((l) => [l.parte, l.produtoId, l.tamanhoId])).toEqual([
      ["Lanche", lanche.id, null],
      ["Bebida", refri.id, refri.tamanhos[0]!.id],
    ]);
    expect((await calcularPrecoDoItem(db, combo.id, "loja", escolha(combo, 1, 1))).unitarioCentavos).toBe(3500);
    expect((await calcularPrecoDoItem(db, combo.id, "delivery", escolha(combo, 1, 1))).unitarioCentavos).toBe(3900);
  });

  it("escolha: uma opção por parte, da própria parte; nada repetido; formato", async () => {
    const { combo } = await montar();
    const [p0, p1] = combo.combo!.partes;
    const msg = async (c: unknown) => (await erroDe(calcularPrecoDoItem(db, combo.id, "loja", { combo: c } as never))).message;
    expect(await msg([{ parteId: p0!.id, opcaoId: p0!.opcoes[0]!.id }])).toContain("Bebida: escolha uma opção");
    expect(await msg([{ parteId: p0!.id, opcaoId: p1!.opcoes[0]!.id }, { parteId: p1!.id, opcaoId: p1!.opcoes[0]!.id }])).toContain("opção não encontrada");
    expect(await msg([{ parteId: p0!.id, opcaoId: p0!.opcoes[0]!.id }, { parteId: p0!.id, opcaoId: p0!.opcoes[1]!.id }])).toContain("duas vezes");
    expect(await msg([...escolha(combo, 0, 0).combo, { parteId: 2_147_483_000, opcaoId: 1 }])).toContain("parte do combo não encontrada");
    for (const ruim of [[{ parteId: "1", opcaoId: 1 }], [null], "x"]) expect(await msg(ruim)).toMatch(/formato inválido/);
    const comum = await salvarProduto(db, gerente, { nome: nome("Comum"), categoriaId: cat, precoCentavos: 100 });
    expect((await erroDe(calcularPrecoDoItem(db, comum.id, "loja", escolha(combo, 0, 0)))).message).toContain("não é combo");
  });

  it("opção fora de venda ou tamanho tirado fica indisponível na venda", async () => {
    const { combo, outroLanche, refri } = await montar();
    await salvarProduto(db, gerente, { id: outroLanche.id, ativo: false });
    expect((await erroDe(calcularPrecoDoItem(db, combo.id, "loja", escolha(combo, 1, 0)))).message).toContain("não está disponível");
    expect((await calcularPrecoDoItem(db, combo.id, "loja", escolha(combo, 0, 1))).unitarioCentavos).toBe(3500);
    await salvarProduto(db, gerente, { id: refri.id, tamanhos: [{ id: refri.tamanhos[1]!.id, nome: "600 ml", acrescimoCentavos: 300 }] });
    expect((await erroDe(calcularPrecoDoItem(db, combo.id, "loja", escolha(combo, 0, 0)))).message).toContain("não está disponível");
  });

  it("regras ao gravar: sem tipo, sem tamanho, opção ativa, não combo, não ele mesmo, tamanho certo, sem repetir", async () => {
    const { combo, lanche, refri, suco } = await montar();
    const parte = (opcoes: unknown[]) => ({ combo: { partes: [{ nome: "Única", opcoes }] } });
    const msg = async (d: Record<string, unknown>) => (await erroDe(salvarProduto(db, gerente, { id: combo.id, ...d }))).message;
    expect(await msg({ tipoProducaoId: tipo, tempoPreparoMin: 5 })).toContain("sem tipo de produção");
    expect(await msg({ tamanhos: [{ nome: "G", acrescimoCentavos: 0 }] })).toContain("não tem tamanhos");
    expect(await msg(parte([{ produtoId: combo.id, acrescimoCentavos: 0 }]))).toContain("dele mesmo");
    const outroCombo = await salvarProduto(db, gerente, { nome: nome("Combo Y"), categoriaId: cat, precoCentavos: 100, combo: { partes: [{ nome: "A", opcoes: [{ produtoId: suco.id, acrescimoCentavos: 0 }] }] } });
    expect(await msg(parte([{ produtoId: outroCombo.id, acrescimoCentavos: 0 }]))).toContain("combo dentro de combo");
    expect(await msg(parte([{ produtoId: refri.id, acrescimoCentavos: 0 }]))).toContain("escolha o tamanho");
    expect(await msg(parte([{ produtoId: suco.id, tamanhoId: refri.tamanhos[0]!.id, acrescimoCentavos: 0 }]))).toContain("não tem tamanhos");
    expect(await msg(parte([{ produtoId: refri.id, tamanhoId: (await salvarProduto(db, gerente, { nome: nome("T"), categoriaId: cat, precoCentavos: 1, tamanhos: [{ nome: "X", acrescimoCentavos: 0 }] })).tamanhos[0]!.id, acrescimoCentavos: 0 }]))).toContain("tamanho de");
    expect(await msg(parte([{ produtoId: lanche.id, acrescimoCentavos: 0 }, { produtoId: lanche.id, acrescimoCentavos: 100 }]))).toContain("duas vezes");
    expect(await msg(parte([{ produtoId: 2_147_483_000, acrescimoCentavos: 0 }]))).toContain("não encontrado");
    expect(await msg({ combo: { partes: [{ nome: "A", opcoes: [{ produtoId: lanche.id, acrescimoCentavos: 0 }] }, { nome: "a", opcoes: [{ produtoId: suco.id, acrescimoCentavos: 0 }] }] } })).toContain("repetida");
    expect(await msg({ combo: { partes: [] } })).toContain("pelo menos uma parte");
    expect(await msg(parte([]))).toContain("pelo menos uma opção");
    for (const v of [-1, 1.5, 1_000_000]) expect(await msg(parte([{ produtoId: lanche.id, acrescimoCentavos: v }]))).toBeTruthy();
    // Nada mudou depois das recusas.
    expect((await listarProdutos(db, gerente)).find((p) => p.id === combo.id)!.combo!.partes.map((p) => p.nome)).toEqual(["Lanche", "Bebida"]);
    // O banco também recusa combo com tipo de produção.
    await expect(db.updateTable("produto").set({ tipo_producao_id: tipo, tempo_preparo_min: 5 }).where("id", "=", combo.id).execute()).rejects.toMatchObject({ code: "23514" });
  });

  it("editar: mantém ids, tira parte e opção (ficam inativas), campo ausente mantém o acréscimo do delivery; null desmonta", async () => {
    const { combo, suco } = await montar();
    const [lanche, bebida] = combo.combo!.partes;
    const r = await salvarProduto(db, gerente, {
      id: combo.id,
      combo: {
        partes: [
          {
            id: bebida!.id,
            nome: "Bebida",
            opcoes: [{ id: bebida!.opcoes[1]!.id, produtoId: suco.id, acrescimoCentavos: 350 }],
          },
        ],
      },
    });
    expect(r.combo!.partes.map((p) => p.id)).toEqual([bebida!.id]);
    expect(r.combo!.partes[0]!.opcoes[0]).toMatchObject({ acrescimoCentavos: 350, acrescimoDeliveryCentavos: 400 });
    const inativas = await db.selectFrom("combo_opcao").select("ativo").where("parte_id", "=", lanche!.id).execute();
    expect(inativas.every((o) => !o.ativo)).toBe(true);
    const audit = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "produto").where("alvo_id", "=", String(combo.id)).orderBy("id", "desc").executeTakeFirstOrThrow();
    expect((audit.detalhes as { antes: Produto }).antes.combo!.partes).toHaveLength(2);
    const d = await salvarProduto(db, gerente, { id: combo.id, combo: null });
    expect(d.combo).toBeNull();
    expect((await calcularPrecoDoItem(db, combo.id, "loja", {})).unitarioCentavos).toBe(3200);
    // Parte de outro combo não vale.
    const { combo: c2 } = await montar();
    expect((await erroDe(salvarProduto(db, gerente, { id: combo.id, combo: { partes: [{ id: c2.combo!.partes[0]!.id, nome: "X", opcoes: [{ produtoId: suco.id, acrescimoCentavos: 0 }] }] } }))).codigo).toBe("nao_encontrado");
  });

  it("combo com adicionais próprios soma tudo", async () => {
    const { combo } = await montar();
    const g = await salvarGrupoDeAdicionais(db, gerente, { nome: nome("Extra combo"), itens: [{ nome: "Batata grande", precoCentavos: 500 }] });
    await salvarProduto(db, gerente, { id: combo.id, gruposAdicionais: [g.id] });
    const r = await calcularPrecoDoItem(db, combo.id, "loja", { ...escolha(combo, 0, 1), adicionais: [{ id: g.itens[0]!.id, quantidade: 1 }] });
    expect(r.unitarioCentavos).toBe(3200 + 300 + 500);
  });
});
