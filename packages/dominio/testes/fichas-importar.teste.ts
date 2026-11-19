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
