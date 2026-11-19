/**
 * Importar fichas técnicas por planilha (E08; decisão 0025). Contra PostgreSQL real, com
 * receitas inventadas em CSV montado no próprio teste.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import { ErroDeRegra, importarFichas, salvarCategoria, salvarIngrediente, salvarProduto, verFicha, type Ator } from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let cat: number;
const s = randomUUID().slice(0, 6).replace(/[0-9]/g, "x");

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  cat = (await salvarCategoria(db, gerente, { nome: `Importar fichas ${s}` })).id;
});
afterAll(() => db.destroy());

const CAB = "ficha;tipo;rende;unidade do rendimento;porcao;unidade da porcao;tempo (min);validade (dias);ingrediente;quantidade;unidade;opcional;medida caseira;observacao;pendencia;etapa";
const csv = (linhas: string[]) => ({ nome: `fichas-${s}.csv`, conteudo: Buffer.from([CAB, ...linhas].join("\n"), "utf8").toString("base64") });
const importar = (linhas: string[], aplicar: boolean, criarIngredientes = false, quem: Ator = gerente) =>
  importarFichas(db, quem, { arquivo: csv(linhas), aplicar, criarIngredientes });

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

describe("importar fichas", () => {
  it("confere sem gravar; grava tudo; o mesmo arquivo de novo não cria versão", async () => {
    const leite = (await salvarIngrediente(db, gerente, { nome: `Leite ${s}`, unidadeBase: "ml", area: "cozinha" })).id;
    const prod = await salvarProduto(db, gerente, { nome: `Lasanha ${s}`, categoriaId: cat, precoCentavos: 3500 });
    const linhas = [
      // O produto vem antes do preparo na planilha: a gravação ordena sozinha.
      `Lasanha ${s};produto;4;;350;g;40;;Molho branco ${s};0,6;kg;não;;;Peso do queijo a confirmar;Montar em camadas`,
      `;;;;;;;;Queijo ${s};300;g;;;;;Gratinar`,
      `;;;;;;;;Sal ${s};;;;a gosto;;;`,
      `Molho branco ${s};preparo;1,2;l;;;20;3;Leite ${s};1;l;;;;;Ferver o leite`,
      `;;;;;;;;Farinha ${s};80;g;;;;;Engrossar`,
    ];
    // Sem criar ingredientes: queijo, sal e farinha faltam.
    const sem = await importar(linhas, false);
    expect(sem.aplicado).toBe(false);
    expect(sem.fichas.find((f) => f.tipo === "produto")!.erros.map((e) => e.texto).join(" ")).toContain("não está cadastrado");
    // Conferir com criar ingredientes: tudo certo, nada gravado.
    const conf = await importar(linhas, false, true);
    expect(conf.fichas.map((f) => [f.nome, f.acao])).toEqual([
      [`Lasanha ${s}`, "erro"],
      [`Molho branco ${s}`, "criar"],
    ]);
    expect(conf.ingredientesNovos.map((i) => [i.nome, i.unidade]).sort()).toEqual([
      [`Farinha ${s}`, "g"],
      [`Queijo ${s}`, "g"],
    ]);
    // O sal não existe e veio sem unidade: não dá para criar; erro só nessa linha.
    expect(conf.fichas[0]!.erros).toEqual([
      { linha: 2, texto: expect.stringContaining("é contado em ml; a planilha diz kg") }, // o preparo vem depois e mesmo assim é conferido
      { linha: 4, texto: expect.stringContaining(`"Sal ${s}" não existe`) },
    ]);
    expect(conf.fichas[1]!.erros).toEqual([]);
    void leite;
    expect(await db.selectFrom("ficha").select("id").where("produto_id", "=", prod.id).executeTakeFirst()).toBeUndefined();
  });

  it("grava: kg vira g, l vira ml, pendência, medida caseira e etapas; repetir não muda nada", async () => {
    const sal = (await salvarIngrediente(db, gerente, { nome: `Sal fino ${s}`, unidadeBase: "g", area: "cozinha" })).id;
    const leite = (await salvarIngrediente(db, gerente, { nome: `Leite integral ${s}`, unidadeBase: "ml", area: "cozinha" })).id;
    const prod = await salvarProduto(db, gerente, { nome: `Gratinado ${s}`, categoriaId: cat, precoCentavos: 3000 });
    const linhas = [
      `Gratinado ${s};produto;4;;350;g;40;;Bechamel ${s};0,6;l;não;;;Peso do queijo a confirmar;Montar em camadas`,
      `;;;;;;;;Mussarela ${s};300;g;sim;;;;Gratinar`,
      `;;;;;;;;Sal fino ${s};;;;a gosto;;;`,
      `Bechamel ${s};preparo;1,2;l;;;20;3;Leite integral ${s};1;l;;;;;Ferver o leite`,
      `;;;;;;;;Trigo ${s};80;g;;;;;Engrossar`,
    ];
    const r = await importar(linhas, true, true);
    expect(r.aplicado).toBe(true);
    expect(r.fichas.map((f) => f.acao)).toEqual(["criar", "criar"]);
    const fichaProd = await db.selectFrom("ficha").select("id").where("produto_id", "=", prod.id).where("ativo", "=", true).executeTakeFirstOrThrow();
    const f = await verFicha(db, gerente, fichaProd.id);
    expect(f.versao!.rende).toBe("4");
    expect(f.versao!.porcaoQuantidade).toBe("350");
    expect(f.versao!.itens.map((i) => [i.nome, i.quantidade, i.opcional, i.medidaCaseira])).toEqual([
      [`Bechamel ${s}`, "600", false, null],
      [`Mussarela ${s}`, "300", true, null],
      [`Sal fino ${s}`, null, false, "a gosto"],
    ]);
    expect(f.versao!.pendencias).toEqual(["Peso do queijo a confirmar"]);
    expect(f.versao!.etapas.map((e) => e.texto)).toEqual(["Montar em camadas", "Gratinar"]);
    expect(f.versao!.motivo).toContain("Importada da planilha");
    expect(f.resumo.completa).toBe(false);
    const prep = f.versao!.itens[0]!.preparoId!;
    const b = await verFicha(db, gerente, prep);
    expect(b.versao!.rende).toBe("1200"); // 1,2 l
    expect(b.versao!.itens[0]).toMatchObject({ ingredienteId: leite, quantidade: "1000" });
    expect(b.versao!.validadeDias).toBe(3);
    void sal;
    // De novo, o mesmo arquivo: nada muda.
    const de_novo = await importar(linhas, true, true);
    expect(de_novo.fichas.map((x) => x.acao)).toEqual(["sem_mudanca", "sem_mudanca"]);
    expect((await verFicha(db, gerente, fichaProd.id)).resumo.versao).toBe(1);
    // Mudou uma quantidade: só aquela ficha ganha versão nova.
    linhas[1] = `;;;;;;;;Mussarela ${s};350;g;sim;;;;Gratinar`;
    const mudou = await importar(linhas, true, true);
    expect(mudou.fichas.map((x) => x.acao)).toEqual(["nova_versao", "sem_mudanca"]);
    expect((await verFicha(db, gerente, fichaProd.id)).resumo.versao).toBe(2);
  });

  it("erros por linha e nada gravado quando sobra erro", async () => {
    const leite = (await salvarIngrediente(db, gerente, { nome: `Creme ${s}`, unidadeBase: "ml", area: "cozinha" })).id;
    void leite;
    const r = await importar(
      [
        `Produto que não existe ${s};produto;1;;;;;;Creme ${s};10;ml;;;;;`,
        `Outro ${s};lanche;1;;;;;;Creme ${s};10;ml;;;;;`,
        `Preparo sem unidade ${s};preparo;1;;;;;;Creme ${s};10;ml;;;;;`,
        `Preparo certo ${s};preparo;100;g;;;;;Creme ${s};10;g;;;;;`,
        `;;;;;;;;Creme ${s};abc;ml;;;;;`,
      ],
      true,
    );
    expect(r.aplicado).toBe(false);
    const erros = r.fichas.flatMap((f) => f.erros.map((e) => `${e.linha}: ${e.texto}`)).join(" | ");
    expect(erros).toContain("não encontrado no cardápio");
    expect(erros).toContain('Tipo "lanche" desconhecido');
    expect(erros).toContain("unidade do rendimento");
    expect(erros).toContain("é contado em ml");
    expect(erros).toContain('"abc"');
    expect(await db.selectFrom("ficha").select("id").where("nome", "=", `Preparo certo ${s}`).executeTakeFirst()).toBeUndefined();
    // Pulando as com erro: grava só as boas; quem usa preparo com erro fica de fora junto.
    const prod = await salvarProduto(db, gerente, { nome: `Torta ${s}`, categoriaId: cat, precoCentavos: 900 });
    void prod;
    const parcial = await importarFichas(db, gerente, {
      arquivo: csv([
        `Preparo certo ${s};preparo;100;ml;;;;;Creme ${s};10;ml;;;;;`,
        `Preparo ruim ${s};preparo;100;ml;;;;;Creme ${s};abc;ml;;;;;`,
        `Torta ${s};produto;1;;;;;;Preparo ruim ${s};10;ml;;;;;`,
      ]),
      aplicar: true,
      pularComErro: true,
    });
    expect(parcial.aplicado).toBe(true);
    expect(parcial.fichas.map((f) => [f.nome, f.acao])).toEqual([
      [`Preparo certo ${s}`, "criar"],
      [`Preparo ruim ${s}`, "erro"],
      [`Torta ${s}`, "erro"],
    ]);
    expect(await db.selectFrom("ficha").select("id").where("nome", "=", `Preparo certo ${s}`).executeTakeFirst()).toBeDefined();
    expect(await db.selectFrom("ficha").select("id").where("nome", "=", `Preparo ruim ${s}`).executeTakeFirst()).toBeUndefined();
  });

  it("colunas faltando, preparos em círculo e permissão", async () => {
    const r = await importarFichas(db, gerente, { arquivo: { nome: "x.csv", conteudo: Buffer.from("ficha;tipo\nA;produto").toString("base64") }, aplicar: false });
    expect(r.erros[0]).toContain("Faltam colunas");
    await salvarIngrediente(db, gerente, { nome: `Água ${s}`, unidadeBase: "ml", area: "cozinha" });
    const c = await importar(
      [`Calda A ${s};preparo;100;ml;;;;;Calda B ${s};10;ml;;;;;`, `Calda B ${s};preparo;100;ml;;;;;Calda A ${s};10;ml;;;;;`],
      true,
    );
    expect(c.aplicado).toBe(false);
    expect(c.erros.join(" ")).toContain("círculo");
    expect((await erroDe(importar([], false, false, cozinheira))).codigo).toBe("sem_permissao");
  });
});

describe("ajustes da revisão (importação)", () => {
  it("preparo com erro nunca vira ingrediente falso; quem o usa fica de fora", async () => {
    const r = await importarFichas(db, gerente, {
      arquivo: csv([
        `Molho R ${s};preparo;100;ml;;;;;Agua R ${s};10;ml;;;;;`,
        `;;200;;;;;;;;;;;;;`, // rende diferente na mesma ficha: erro de montagem
        `Prato R ${s};produto;1;;;;;;Molho R ${s};10;ml;;;;;`,
      ]),
      aplicar: true,
      criarIngredientes: true,
      pularComErro: true,
    });
    expect(r.fichas.map((f) => f.acao)).toEqual(["erro", "erro"]);
    expect(r.aplicado).toBe(false); // nada gravado
    expect(await db.selectFrom("ingrediente").select("id").where("nome", "=", `Molho R ${s}`).executeTakeFirst()).toBeUndefined();
    expect(await db.selectFrom("ingrediente").select("id").where("nome", "=", `Agua R ${s}`).executeTakeFirst()).toBeUndefined();
  });

  it("produto com o mesmo nome de um preparo usa o preparo; linhas repetidas somam; 1.000 é ambíguo; nome curto não cria", async () => {
    await salvarIngrediente(db, gerente, { nome: `Tomate V ${s}`, unidadeBase: "g", area: "cozinha" });
    await salvarProduto(db, gerente, { nome: `Vinagrete ${s}`, categoriaId: cat, precoCentavos: 500 });
    const r = await importarFichas(db, gerente, {
      arquivo: csv([
        `Vinagrete ${s};preparo;500;g;;;;;Tomate V ${s};300;g;;;;;`,
        `;;;;;;;;Tomate V ${s};100;g;;;;;`,
        `Vinagrete ${s};produto;1;;;;;;Vinagrete ${s};50;g;;;;;`,
      ]),
      aplicar: true,
    });
    expect(r.fichas.map((f) => [f.tipo, f.acao])).toEqual([
      ["preparo", "criar"],
      ["produto", "criar"],
    ]);
    const prep = await db.selectFrom("ficha").select(["id", "versao_atual_id"]).where("nome", "=", `Vinagrete ${s}`).executeTakeFirstOrThrow();
    const f = await verFicha(db, gerente, prep.id);
    expect(f.versao!.itens.map((i) => i.quantidade)).toEqual(["400"]); // 300 + 100
    const prod = await db.selectFrom("ficha as f").innerJoin("produto as p", "p.id", "f.produto_id").select("f.id").where("p.nome", "=", `Vinagrete ${s}`).executeTakeFirstOrThrow();
    expect((await verFicha(db, gerente, prod.id)).versao!.itens[0]!.preparoId).toBe(prep.id);
    const amb = await importar([`Mil ${s};preparo;1.000;g;;;;;Tomate V ${s};1.000;g;;;;;`], false);
    expect(amb.fichas[0]!.erros.map((e) => e.texto).join(" ")).toContain("ponto de milhar");
    const curto = await importar([`Curto ${s};preparo;10;g;;;;;Z;1;g;;;;;`], false, true);
    expect(curto.fichas[0]!.erros.map((e) => e.texto).join(" ")).toContain("inválido para criar");
  });

  it("limites conferidos já na conferência; reimportar mantém observações e equipamentos; versão mudada é recusada", async () => {
    await salvarIngrediente(db, gerente, { nome: `Farinha L ${s}`, unidadeBase: "g", area: "cozinha" });
    const muitas = [`Massa L ${s};preparo;100;g;;;;;Farinha L ${s};10;g;;;;;Etapa 0`, ...Array.from({ length: 41 }, (_, k) => `;;;;;;;;;;;;;;;Etapa ${k + 1}`)];
    const m = await importar(muitas, false);
    expect(m.fichas[0]!.erros.map((e) => e.texto).join(" ")).toContain("40 etapas");
    const base = [`Massa M ${s};preparo;100;g;;;;;Farinha L ${s};10;g;;;;;`];
    await importar(base, true);
    const id = (await db.selectFrom("ficha").select("id").where("nome", "=", `Massa M ${s}`).executeTakeFirstOrThrow()).id;
    const { salvarFicha } = await import("../src/index");
    const atual = await verFicha(db, gerente, id);
    await salvarFicha(db, gerente, {
      id,
      versaoBase: 1,
      receita: { rende: "100", itens: [{ ingredienteId: atual.versao!.itens[0]!.ingredienteId!, quantidade: "10" }], observacoes: "Servir quente", equipamentos: ["Forno"] },
    });
    const conf = await importar([`Massa M ${s};preparo;100;g;;;;;Farinha L ${s};12;g;;;;;`], false);
    expect(conf.fichas[0]!.versaoAtual).toBe(2);
    const g = await importarFichas(db, gerente, { arquivo: csv([`Massa M ${s};preparo;100;g;;;;;Farinha L ${s};12;g;;;;;`]), aplicar: true, versoes: { [`preparo:Massa M ${s}`]: 2 } });
    expect(g.fichas[0]!.acao).toBe("nova_versao");
    const v3 = await verFicha(db, gerente, id);
    expect(v3.versao).toMatchObject({ numero: 3, observacoes: "Servir quente", equipamentos: ["Forno"] });
    const velha = await importarFichas(db, gerente, { arquivo: csv([`Massa M ${s};preparo;100;g;;;;;Farinha L ${s};13;g;;;;;`]), aplicar: true, versoes: { [`preparo:Massa M ${s}`]: 2 } });
    expect(velha.aplicado).toBe(false);
    expect(velha.fichas[0]!.erros[0]!.texto).toContain("mudou depois da conferência");
  });

  it("tipo digitado errado num preparo não deixa o nome dele virar ingrediente", async () => {
    await salvarIngrediente(db, gerente, { nome: `Agua T ${s}`, unidadeBase: "ml", area: "cozinha" });
    await salvarProduto(db, gerente, { nome: `Bife T ${s}`, categoriaId: cat, precoCentavos: 2000 });
    const r = await importarFichas(db, gerente, {
      arquivo: csv([`Molho T ${s};prepraro;100;ml;;;;;Agua T ${s};10;ml;;;;;`, `Bife T ${s};produto;1;;;;;;Molho T ${s};10;ml;;;;;`]),
      aplicar: true,
      criarIngredientes: true,
      pularComErro: true,
    });
    expect(r.aplicado).toBe(false);
    expect(r.fichas.every((f) => f.acao === "erro")).toBe(true);
    expect(await db.selectFrom("ingrediente").select("id").where("nome", "=", `Molho T ${s}`).executeTakeFirst()).toBeUndefined();
  });
});
