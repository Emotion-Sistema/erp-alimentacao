/**
 * Produtos (E07 parte 2, PR 3; migração 0012; decisão 0018). Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import {
  centavosDoTexto,
  ErroDeRegra,
  listarProdutos,
  salvarCategoria,
  salvarProduto,
  salvarTipoDeProducao,
  textoDosCentavos,
  type Ator,
  type Produto,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let supervisor: Ator;
let atendente: Ator;
let catA: number;
let catB: number;
let tipo: number;
const sufixo = randomUUID().slice(0, 6).replace(/[0-9]/g, "x");

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  supervisor = await atorDoCargo(db, "supervisor");
  atendente = await atorDoCargo(db, "atendente");
  catA = (await salvarCategoria(db, gerente, { nome: `Lanches ${sufixo}` })).id;
  catB = (await salvarCategoria(db, gerente, { nome: `Doces ${sufixo}` })).id;
  tipo = (await salvarTipoDeProducao(db, gerente, { nome: `Chapa ${sufixo}`, area: "cozinha" })).id;
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

async function ultimaAuditoria(alvoId: number) {
  return db
    .selectFrom("auditoria")
    .select(["acao", "usuario_id", "detalhes"])
    .where("alvo_tipo", "=", "produto")
    .where("alvo_id", "=", String(alvoId))
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();
}

const daCategoria = async (categoriaId: number): Promise<Produto[]> => (await listarProdutos(db, gerente)).filter((p) => p.ativo && p.categoriaId === categoriaId);

describe("preço em centavos (texto da tela)", () => {
  it("lê o que a pessoa digita, sem float", () => {
    expect(centavosDoTexto("12,50")).toBe(1250);
    expect(centavosDoTexto("12.50")).toBe(1250);
    expect(centavosDoTexto("12,5")).toBe(1250);
    expect(centavosDoTexto("12")).toBe(1200);
    expect(centavosDoTexto("R$ 1.234,56")).toBe(123456);
    expect(centavosDoTexto("1234,56")).toBe(123456);
    expect(centavosDoTexto("1.234")).toBe(123400);
    expect(centavosDoTexto("0,10")).toBe(10);
    // 0,1 + 0,2 em float dá 0,30000000000000004; aqui é sempre inteiro.
    expect(centavosDoTexto("0,29")).toBe(29);
    expect(centavosDoTexto("19,99")).toBe(1999);
    for (const ruim of ["", "abc", "12,345", "-5", "1,2,3", "12,", ",50", "1e3"]) expect(centavosDoTexto(ruim)).toBeNull();
  });
  it("mostra em reais", () => {
    expect(textoDosCentavos(1250)).toBe("R$ 12,50");
    expect(textoDosCentavos(5)).toBe("R$ 0,05");
    expect(textoDosCentavos(123456)).toBe("R$ 1.234,56");
    expect(textoDosCentavos(999999)).toBe("R$ 9.999,99");
  });
});

describe("produtos", () => {
  it("cria com categoria, tipo, preço e tempo; altera mantendo o que não veio; auditoria com antes e depois", async () => {
    const p = await salvarProduto(db, gerente, { nome: `  X-Salada   ${sufixo} `, categoriaId: catA, tipoProducaoId: tipo, precoCentavos: 2590, tempoPreparoMin: 12, descricao: "Pão, carne e salada." });
    expect(p).toMatchObject({ nome: `X-Salada ${sufixo}`, categoriaId: catA, tipoProducaoId: tipo, precoCentavos: 2590, tempoPreparoMin: 12, descricao: "Pão, carne e salada.", ativo: true });
    const a1 = await ultimaAuditoria(p.id);
    expect(a1).toMatchObject({ acao: "cadastros.gerenciar", usuario_id: gerente.usuarioId, detalhes: { operacao: "criar", antes: null, depois: { id: p.id, precoCentavos: 2590 } } });

    const p2 = await salvarProduto(db, gerente, { id: p.id, precoCentavos: 2790 });
    expect(p2).toMatchObject({ nome: p.nome, precoCentavos: 2790, tipoProducaoId: tipo, tempoPreparoMin: 12, descricao: "Pão, carne e salada." });
    // O histórico do preço fica na auditoria.
    expect((await ultimaAuditoria(p.id)).detalhes).toMatchObject({ operacao: "alterar", antes: { precoCentavos: 2590 }, depois: { precoCentavos: 2790 } });

    // Desativar só com id e ativo não desfaz o que outra pessoa mudou.
    await salvarProduto(db, gerente, { id: p.id, nome: `${p.nome} duplo` });
    const p3 = await salvarProduto(db, gerente, { id: p.id, ativo: false });
    expect(p3).toMatchObject({ nome: `${p.nome} duplo`, precoCentavos: 2790, ativo: false });
    // Descrição vazia limpa.
    expect((await salvarProduto(db, gerente, { id: p.id, descricao: "" })).descricao).toBeNull();
  });

  it("sem tipo de produção não passa pela produção e não tem tempo; tirar o tipo tira o tempo", async () => {
    const refri = await salvarProduto(db, gerente, { nome: `Refrigerante ${sufixo}`, categoriaId: catB, precoCentavos: 700 });
    expect(refri).toMatchObject({ tipoProducaoId: null, tempoPreparoMin: null });
    // Com tipo, o tempo é obrigatório.
    expect((await erroDe(salvarProduto(db, gerente, { id: refri.id, tipoProducaoId: tipo }))).message).toMatch(/tempo de preparo/);
    const comTipo = await salvarProduto(db, gerente, { id: refri.id, tipoProducaoId: tipo, tempoPreparoMin: 2 });
    expect(comTipo).toMatchObject({ tipoProducaoId: tipo, tempoPreparoMin: 2 });
    // Mudar só o tempo mantém o tipo.
    expect(await salvarProduto(db, gerente, { id: refri.id, tempoPreparoMin: 3 })).toMatchObject({ tipoProducaoId: tipo, tempoPreparoMin: 3 });
    // Tirar o tipo tira o tempo.
    expect(await salvarProduto(db, gerente, { id: refri.id, tipoProducaoId: null })).toMatchObject({ tipoProducaoId: null, tempoPreparoMin: null });
    // Tempo sem tipo é recusado.
    expect((await erroDe(salvarProduto(db, gerente, { id: refri.id, tempoPreparoMin: 5 }))).message).toMatch(/Sem tipo de produção/);
    expect((await erroDe(salvarProduto(db, gerente, { nome: `Suco ${sufixo}`, categoriaId: catB, precoCentavos: 900, tempoPreparoMin: 5 }))).message).toMatch(/Sem tipo de produção/);
    // O banco também segura a regra.
    await expect(db.updateTable("produto").set({ tempo_preparo_min: 5 }).where("id", "=", refri.id).execute()).rejects.toMatchObject({ code: "23514" });
  });

  it("recusa dado errado com frase clara e não grava nada", async () => {
    const msg = async (d: unknown) => (await erroDe(salvarProduto(db, gerente, d))).message;
    const base = { nome: `Bom ${sufixo}`, categoriaId: catA, precoCentavos: 1000 };
    expect(await msg({ ...base, nome: "x" })).toMatch(/2 letras/);
    expect(await msg({ ...base, nome: "a".repeat(61) })).toMatch(/60 letras/);
    expect(await msg({ ...base, nome: "Bom\u0007ruim" })).toMatch(/inválido/);
    expect(await msg({ categoriaId: catA, precoCentavos: 1000 })).toMatch(/Informe o nome/);
    expect(await msg({ nome: base.nome, precoCentavos: 1000 })).toMatch(/categoria/);
    expect(await msg({ nome: base.nome, categoriaId: catA })).toMatch(/Informe o preço/);
    expect(await msg({ ...base, precoCentavos: 0 })).toMatch(/R\$ 0,01/);
    expect(await msg({ ...base, precoCentavos: -100 })).toMatch(/R\$ 0,01/);
    expect(await msg({ ...base, precoCentavos: 1000000 })).toMatch(/9\.999,99/);
    expect(await msg({ ...base, precoCentavos: 12.5 })).toMatch(/inteiro/);
    expect(await msg({ ...base, precoCentavos: "1250" })).toMatch(/centavos/);
    expect(await msg({ ...base, tipoProducaoId: tipo, tempoPreparoMin: 0 })).toMatch(/pelo menos 1 minuto/);
    expect(await msg({ ...base, tipoProducaoId: tipo, tempoPreparoMin: 181 })).toMatch(/180 minutos/);
    expect(await msg({ ...base, tipoProducaoId: tipo, tempoPreparoMin: 2.5 })).toMatch(/inteiro/);
    expect(await msg({ ...base, descricao: "a".repeat(301) })).toMatch(/300 letras/);
    expect(await msg({ ...base, categoriaId: 999999 })).toMatch(/Categoria não encontrada/);
    expect(await msg({ ...base, tipoProducaoId: 999999, tempoPreparoMin: 5 })).toMatch(/Tipo de produção não encontrado/);
    expect(await msg({ ...base, posicao: 0 })).toMatch(/1 em diante/);
    expect(await msg({ ...base, ativo: "sim" })).toBeTruthy();
    expect(await msg({ id: "1", ativo: false })).toBeTruthy();
    expect((await erroDe(salvarProduto(db, gerente, { id: 999999, precoCentavos: 100 }))).codigo).toBe("nao_encontrado");
    const n = await db.selectFrom("produto").select("id").where("nome", "=", base.nome).execute();
    expect(n).toHaveLength(0);
  });

  it("categoria ou tipo desativado não pode ser escolhido; produto que já estava lá continua", async () => {
    const cat = (await salvarCategoria(db, gerente, { nome: `Sazonal ${sufixo}` })).id;
    const tp = (await salvarTipoDeProducao(db, gerente, { nome: `Forno ${sufixo}`, area: "cozinha" })).id;
    const p = await salvarProduto(db, gerente, { nome: `Torta ${sufixo}`, categoriaId: cat, tipoProducaoId: tp, tempoPreparoMin: 20, precoCentavos: 1500 });
    await salvarCategoria(db, gerente, { id: cat, nome: `Sazonal ${sufixo}`, ativo: false });
    await salvarTipoDeProducao(db, gerente, { id: tp, ativo: false });
    // Mudar o preço não mexe na categoria nem no tipo: aceita.
    expect((await salvarProduto(db, gerente, { id: p.id, precoCentavos: 1600 })).precoCentavos).toBe(1600);
    expect((await erroDe(salvarProduto(db, gerente, { nome: `Bolo ${sufixo}`, categoriaId: cat, precoCentavos: 900 }))).message).toMatch(/desativada/);
    const outro = await salvarProduto(db, gerente, { nome: `Bolo ${sufixo}`, categoriaId: catA, precoCentavos: 900 });
    expect((await erroDe(salvarProduto(db, gerente, { id: outro.id, categoriaId: cat }))).message).toMatch(/desativada/);
    expect((await erroDe(salvarProduto(db, gerente, { id: outro.id, tipoProducaoId: tp, tempoPreparoMin: 5 }))).message).toMatch(/desativado/);
    // Reativar um produto cuja categoria foi desativada é recusado.
    await salvarProduto(db, gerente, { id: p.id, ativo: false });
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, ativo: true }))).message).toMatch(/desativada/);
  });

  it("nome único entre os ativos (sem ligar para acento e maiúscula); desativar libera o nome", async () => {
    const p = await salvarProduto(db, gerente, { nome: `Pão de queijo ${sufixo}`, categoriaId: catA, precoCentavos: 600 });
    expect((await erroDe(salvarProduto(db, gerente, { nome: `PAO DE QUEIJO ${sufixo.toUpperCase()}`, categoriaId: catB, precoCentavos: 650 }))).codigo).toBe("conflito");
    await salvarProduto(db, gerente, { id: p.id, ativo: false });
    const outro = await salvarProduto(db, gerente, { nome: `Pão de queijo ${sufixo}`, categoriaId: catA, precoCentavos: 650 });
    expect(outro.id).not.toBe(p.id);
    expect((await erroDe(salvarProduto(db, gerente, { id: p.id, ativo: true }))).codigo).toBe("conflito");
    const lista = await listarProdutos(db, gerente);
    expect(lista.findIndex((x) => x.id === p.id)).toBeGreaterThan(lista.findIndex((x) => x.id === outro.id));
  });

  it("supervisor vê, mas não cria nem altera; atendente nem vê; sem login não vê", async () => {
    expect(Array.isArray(await listarProdutos(db, supervisor))).toBe(true);
    expect((await erroDe(listarProdutos(db, atendente))).codigo).toBe("sem_permissao");
    expect((await erroDe(listarProdutos(db, null))).codigo).toBe("nao_autenticado");
    for (const quem of [supervisor, atendente, null]) {
      expect(["sem_permissao", "nao_autenticado"]).toContain((await erroDe(salvarProduto(db, quem, { nome: `Proibido ${sufixo}`, categoriaId: catA, precoCentavos: 100 }))).codigo);
    }
    const alvo = await salvarProduto(db, gerente, { nome: `Alvo ${sufixo}`, categoriaId: catA, precoCentavos: 100 });
    expect((await erroDe(salvarProduto(db, supervisor, { id: alvo.id, precoCentavos: 1 }))).codigo).toBe("sem_permissao");
    expect((await db.selectFrom("produto").select("preco_centavos").where("id", "=", alvo.id).executeTakeFirstOrThrow()).preco_centavos).toBe(100);
    expect(await db.selectFrom("produto").select("id").where("nome", "=", `Proibido ${sufixo}`).execute()).toHaveLength(0);
  });

  it("posição dentro da categoria: cada categoria tem a sua lista; mudar de categoria vai para o fim da nova", async () => {
    const cat1 = (await salvarCategoria(db, gerente, { nome: `Lista um ${sufixo}` })).id;
    const cat2 = (await salvarCategoria(db, gerente, { nome: `Lista dois ${sufixo}` })).id;
    const a = await salvarProduto(db, gerente, { nome: `Um A ${sufixo}`, categoriaId: cat1, precoCentavos: 100 });
    const b = await salvarProduto(db, gerente, { nome: `Um B ${sufixo}`, categoriaId: cat1, precoCentavos: 100 });
    const c = await salvarProduto(db, gerente, { nome: `Um C ${sufixo}`, categoriaId: cat1, precoCentavos: 100, posicao: 1 });
    const x = await salvarProduto(db, gerente, { nome: `Dois X ${sufixo}`, categoriaId: cat2, precoCentavos: 100 });
    expect((await daCategoria(cat1)).map((p) => p.id)).toEqual([c.id, a.id, b.id]);
    expect((await daCategoria(cat1)).map((p) => p.ordem)).toEqual([10, 20, 30]);
    expect((await daCategoria(cat2)).map((p) => [p.id, p.ordem])).toEqual([[x.id, 10]]);
    expect((await ultimaAuditoria(c.id)).detalhes).toMatchObject({ reordenados: expect.arrayContaining([{ id: a.id, antes: 10, depois: 20 }]) });

    // Mudar de categoria sem escolher lugar: fim da nova; a antiga continua em ordem.
    await salvarProduto(db, gerente, { id: c.id, categoriaId: cat2 });
    expect((await daCategoria(cat2)).map((p) => p.id)).toEqual([x.id, c.id]);
    expect((await daCategoria(cat1)).map((p) => p.id)).toEqual([a.id, b.id]);
    // Mudar de categoria escolhendo o lugar.
    await salvarProduto(db, gerente, { id: b.id, categoriaId: cat2, posicao: 1 });
    expect((await daCategoria(cat2)).map((p) => [p.id, p.ordem])).toEqual([[b.id, 10], [x.id, 20], [c.id, 30]]);
    // Mudar o preço não mexe no lugar.
    await salvarProduto(db, gerente, { id: x.id, precoCentavos: 200 });
    expect((await daCategoria(cat2)).map((p) => p.id)).toEqual([b.id, x.id, c.id]);
  });

  it("muitas pessoas criando e mudando posição ao mesmo tempo: sem deadlock e sem número repetido", async () => {
    const cat = (await salvarCategoria(db, gerente, { nome: `Corrida ${sufixo}` })).id;
    const x = await salvarProduto(db, gerente, { nome: `Corrida A ${sufixo}`, categoriaId: cat, precoCentavos: 100 });
    const y = await salvarProduto(db, gerente, { nome: `Corrida B ${sufixo}`, categoriaId: cat, precoCentavos: 100 });
    for (let rodada = 0; rodada < 8; rodada++) {
      await Promise.all([
        salvarProduto(db, gerente, { id: x.id, posicao: 1 }),
        salvarProduto(db, gerente, { id: y.id, posicao: 2 }),
        salvarProduto(db, gerente, { nome: `Corrida C${rodada} ${sufixo}`, categoriaId: cat, precoCentavos: 100, posicao: 1 }),
        salvarProduto(db, gerente, { nome: `Corrida D${rodada} ${sufixo}`, categoriaId: cat, precoCentavos: 100 }),
        // Ao mesmo tempo, alguém mexe na ordem das categorias (outra trava; não pode travar uma na outra).
        salvarCategoria(db, gerente, { id: cat, nome: `Corrida ${sufixo}`, posicao: (rodada % 3) + 1 }),
      ]);
      const lista = await daCategoria(cat);
      expect(lista.map((p) => p.ordem)).toEqual(lista.map((_, i) => (i + 1) * 10));
    }
  });

  it("duas pessoas criando o mesmo nome ao mesmo tempo: só uma consegue", async () => {
    const nome = `Coxinha ${sufixo}`;
    const r = await Promise.allSettled([1, 2, 3].map(() => salvarProduto(db, gerente, { nome, categoriaId: catA, precoCentavos: 800 })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r) if (x.status === "rejected") expect((x.reason as ErroDeRegra).codigo).toBe("conflito");
  });
});
