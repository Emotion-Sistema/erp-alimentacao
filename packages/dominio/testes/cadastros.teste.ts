/**
 * E07 parte 1 contra PostgreSQL real (decisão 0015): conversões exatas e sem equivalência
 * errada, unidade do estoque que não muda, nomes e documentos sem repetição, permissão por
 * cargo, nada apagado e tudo na auditoria.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  converterParaBase,
  decimalLimpo,
  documentoValido,
  ErroDeRegra,
  listarFornecedores,
  listarIngredientes,
  salvarConversao,
  salvarFornecedor,
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

async function ingrediente(nome: string, unidadeBase: "g" | "ml" | "un", area = "cozinha"): Promise<number> {
  return (await salvarIngrediente(db, gerente, { nome: n(nome), unidadeBase, area })).id;
}

describe("conversões de unidade", () => {
  it("mesma grandeza converte sozinha e exata, escrita de vários jeitos", async () => {
    const farinha = await ingrediente("Farinha", "g");
    expect(await converterParaBase(db, farinha, "0,25", "kg")).toBe("250");
    expect(await converterParaBase(db, farinha, "2", " Quilos ")).toBe("2000");
    expect(await converterParaBase(db, farinha, "0.1", "g")).toBe("0.1");
    const leite = await ingrediente("Leite", "ml", "cafeteria");
    expect(await converterParaBase(db, leite, "2.5", "litros")).toBe("2500");
    const ovo = await ingrediente("Ovo", "un");
    expect(await converterParaBase(db, ovo, "3", "dúzias")).toBe("36");
  });

  it("decimal sem erro de float: 0,1 + 0,2 de 3 em 3 casas", async () => {
    const acucar = await ingrediente("Açúcar", "g");
    await salvarConversao(db, gerente, acucar, { nome: "pacote", quantidadeBase: "0.1" });
    expect(await converterParaBase(db, acucar, "3", "pacote")).toBe("0.3");
    expect(await converterParaBase(db, acucar, "0.0001", "kg")).toBe("0.1");
  });

  it("entre grandezas só com conversão explícita; sem ela, recusa e explica", async () => {
    const leite = await ingrediente("Leite integral", "ml", "cafeteria");
    expect((await erroDe(converterParaBase(db, leite, "1", "kg"))).message).toContain('Não há conversão de "kg" para ml');
    await salvarConversao(db, gerente, leite, { nome: "kg", quantidadeBase: "970,5" });
    expect(await converterParaBase(db, leite, "2", "KG")).toBe("1941");
    const ovo = await ingrediente("Ovo caipira", "un");
    expect((await erroDe(converterParaBase(db, ovo, "1", "caixa"))).codigo).toBe("dados_invalidos");
    await salvarConversao(db, gerente, ovo, { nome: "Caixa", quantidadeBase: 30 });
    expect(await converterParaBase(db, ovo, "2", "caixa")).toBe("60");
  });

  it("recusa equivalência errada da mesma grandeza (kg = 900 g) e nome repetido", async () => {
    const arroz = await ingrediente("Arroz", "g");
    for (const nome of ["kg", "Quilo", "gramas", "g"]) {
      const e = await erroDe(salvarConversao(db, gerente, arroz, { nome, quantidadeBase: "900" }));
      expect(e.codigo, nome).toBe("dados_invalidos");
      expect(e.message).toContain("já é convertido sozinho");
    }
    const refri = await ingrediente("Refrigerante lata", "un", "bebidas_salao");
    expect((await erroDe(salvarConversao(db, gerente, refri, { nome: "dúzia", quantidadeBase: "10" }))).message).toContain("já é convertido sozinho");
    await salvarConversao(db, gerente, arroz, { nome: "saco 5 kg", quantidadeBase: "5000" });
    expect((await erroDe(salvarConversao(db, gerente, arroz, { nome: "SACO 5 KG ", quantidadeBase: "5000" }))).codigo).toBe("conflito");
  });

  it("recusa quantidade zero, negativa, com 5 casas ou que não é número", async () => {
    const sal = await ingrediente("Sal", "g");
    for (const q of ["0", "-1", "1.00001", "abc", "", "1e3", 0]) {
      expect((await erroDe(salvarConversao(db, gerente, sal, { nome: "pote", quantidadeBase: q }))).codigo, String(q)).toBe("dados_invalidos");
    }
    expect((await erroDe(converterParaBase(db, sal, "0", "kg"))).codigo).toBe("dados_invalidos");
  });

  it("conversão desativada deixa de valer, e nada é apagado", async () => {
    const cafe = await ingrediente("Café em grão", "g", "cafeteria");
    const c = await salvarConversao(db, gerente, cafe, { nome: "pacote", quantidadeBase: "500" });
    await salvarConversao(db, gerente, cafe, { id: c.id, nome: "pacote", quantidadeBase: "500", ativo: false });
    expect((await erroDe(converterParaBase(db, cafe, "1", "pacote"))).codigo).toBe("dados_invalidos");
    const lista = await listarIngredientes(db, gerente);
    expect(lista.ingredientes.find((i) => i.id === cafe)?.conversoes).toEqual([{ id: c.id, nome: "pacote", quantidadeBase: "500", ativo: false }]);
  });

  it("conversão de outro ingrediente não é alterada pelo id errado", async () => {
    const a = await ingrediente("Tomate", "g");
    const b = await ingrediente("Cebola", "g");
    const c = await salvarConversao(db, gerente, a, { nome: "caixa", quantidadeBase: "20000" });
    expect((await erroDe(salvarConversao(db, gerente, b, { id: c.id, nome: "caixa", quantidadeBase: "1" }))).codigo).toBe("nao_encontrado");
    expect(await converterParaBase(db, a, "1", "caixa")).toBe("20000");
  });
});

describe("ingredientes", () => {
  it("a unidade do estoque não muda depois de criada (nem pela regra, nem direto no banco)", async () => {
    const id = await ingrediente("Queijo", "g");
    const e = await erroDe(salvarIngrediente(db, gerente, { id, nome: n("Queijo"), unidadeBase: "un", area: "cozinha" }));
    expect(e.message).toContain("não muda depois de criada");
    await expect(sql`UPDATE ingrediente SET unidade_base = 'ml' WHERE id = ${id}`.execute(db)).rejects.toThrow(/não muda depois de criada/);
    // Mudar o resto pode (nome, área, fornecedor), e fica na auditoria com antes e depois.
    await salvarIngrediente(db, gerente, { id, nome: n("Queijo muçarela"), area: "cozinha" });
    const a = await db
      .selectFrom("auditoria")
      .select(["detalhes"])
      .where("alvo_tipo", "=", "ingrediente")
      .where("alvo_id", "=", String(id))
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(a.detalhes).toMatchObject({ operacao: "alterar", antes: { nome: n("Queijo") }, depois: { nome: n("Queijo muçarela") } });
  });

  it("nome repetido (sem diferença de maiúscula e espaço) é recusado", async () => {
    await ingrediente("Manteiga", "g");
    expect((await erroDe(salvarIngrediente(db, gerente, { nome: `  ${n("MANTEIGA")} `, unidadeBase: "g", area: "cozinha" }))).codigo).toBe("conflito");
  });

  it("criar exige unidade e área válidas", async () => {
    expect((await erroDe(salvarIngrediente(db, gerente, { nome: n("Sem unidade"), area: "cozinha" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarIngrediente(db, gerente, { nome: n("Kg"), unidadeBase: "kg", area: "cozinha" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarIngrediente(db, gerente, { nome: n("Área"), unidadeBase: "g", area: "deposito" }))).codigo).toBe("dados_invalidos");
  });

  it("desativar não apaga: continua na lista, marcado como inativo", async () => {
    const id = await ingrediente("Orégano", "g");
    await salvarIngrediente(db, gerente, { id, nome: n("Orégano"), area: "cozinha", ativo: false });
    const i = (await listarIngredientes(db, gerente)).ingredientes.find((x) => x.id === id);
    expect(i).toMatchObject({ ativo: false, unidadeBase: "g" });
  });

  it("fornecedor desativado ou inexistente não pode ser o fornecedor do ingrediente", async () => {
    const f = await salvarFornecedor(db, gerente, { nome: n("Distribuidora parada"), ativo: false });
    expect((await erroDe(salvarIngrediente(db, gerente, { nome: n("Batata"), unidadeBase: "g", area: "cozinha", fornecedorId: f.id }))).message).toContain("desativado");
    expect((await erroDe(salvarIngrediente(db, gerente, { nome: n("Batata"), unidadeBase: "g", area: "cozinha", fornecedorId: 999999 }))).codigo).toBe("dados_invalidos");
  });
});

describe("fornecedores", () => {
  it("CPF e CNPJ conferidos pelos dígitos; guardados só com números; sem repetir", async () => {
    expect(documentoValido("11222333000181")).toBe(true);
    expect(documentoValido("11222333000182")).toBe(false);
    expect(documentoValido("52998224725")).toBe(true);
    expect(documentoValido("11111111111")).toBe(false);
    const f = await salvarFornecedor(db, gerente, { nome: n("Atacado Fictício"), documento: "11.222.333/0001-81", prazoEntregaDias: 2 });
    expect(f.documento).toBe("11222333000181");
    expect((await erroDe(salvarFornecedor(db, gerente, { nome: n("Outro nome"), documento: "11222333000181" }))).message).toContain("CPF ou CNPJ");
    expect((await erroDe(salvarFornecedor(db, gerente, { nome: n("Errado"), documento: "11.222.333/0001-82" }))).codigo).toBe("dados_invalidos");
    // Limpa o documento para não atrapalhar outra execução da suíte no mesmo banco.
    await salvarFornecedor(db, gerente, { id: f.id, nome: f.nome, documento: null });
  });

  it("nome repetido é recusado; e-mail e prazo validados", async () => {
    await salvarFornecedor(db, gerente, { nome: n("Hortifruti") });
    expect((await erroDe(salvarFornecedor(db, gerente, { nome: n("hortifruti") }))).codigo).toBe("conflito");
    expect((await erroDe(salvarFornecedor(db, gerente, { nome: n("Email ruim"), email: "sem-arroba" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarFornecedor(db, gerente, { nome: n("Prazo"), prazoEntregaDias: 91 }))).codigo).toBe("dados_invalidos");
  });
});

describe("quem pode", () => {
  it("cozinheira e supervisor veem, mas não mudam; atendente nem vê; recusa fica na auditoria", async () => {
    for (const cargo of ["cozinheira", "supervisor", "financeiro"]) {
      const a = await atorDoCargo(db, cargo);
      await expect(listarIngredientes(db, a)).resolves.toBeTruthy();
      await expect(listarFornecedores(db, a)).resolves.toBeTruthy();
      expect((await erroDe(salvarIngrediente(db, a, { nome: n(`De ${cargo}`), unidadeBase: "g", area: "cozinha" }))).codigo).toBe("sem_permissao");
    }
    const atendente = await atorDoCargo(db, "atendente");
    expect((await erroDe(listarIngredientes(db, atendente))).codigo).toBe("sem_permissao");
    const r = await db
      .selectFrom("auditoria")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("usuario_id", "=", atendente.usuarioId)
      .where("acao", "=", "cadastros.ver")
      .where("resultado", "=", "recusado")
      .executeTakeFirstOrThrow();
    expect(r.n).toBeGreaterThan(0);
  });

  it("decimalLimpo só tira zeros à direita da parte decimal", () => {
    expect(decimalLimpo("1030.0000")).toBe("1030");
    expect(decimalLimpo("0.2500")).toBe("0.25");
    expect(decimalLimpo("100")).toBe("100");
  });
});

describe("ressalvas da revisão (E07 parte 1)", () => {
  it("equivalência errada é recusada em qualquer grafia: ponto, acento, tab, espaço especial, '1 kg', mg", async () => {
    const farinha = await ingrediente("Farinha especial", "g");
    for (const nome of ["kg.", "kilograma", "Kilôgrama", "1 kg", "1kg", "mg", "kg\t", "kg\u00a0", "GRAMAS", "t"]) {
      const e = await erroDe(salvarConversao(db, gerente, farinha, { nome, quantidadeBase: "900" }));
      expect(e.message, JSON.stringify(nome)).toContain("já é convertido sozinho");
    }
    // Direto no banco também (a importação manda texto cru).
    await expect(sql`INSERT INTO ingrediente_conversao (ingrediente_id, nome, quantidade_base) VALUES (${farinha}, ${"kg\t"}, 900)`.execute(db)).rejects.toThrow();
    expect(await converterParaBase(db, farinha, "1", "1 Kg.")).toBe("1000");
    expect(await converterParaBase(db, farinha, "500", "mg")).toBe("0.5");
    // Nome de embalagem com número continua valendo.
    await salvarConversao(db, gerente, farinha, { nome: "saco 10kg", quantidadeBase: "10000" });
    expect(await converterParaBase(db, farinha, "2", "Saco 10 KG")).toBe("20000");
  });

  it("a função de conversão recusa quantidade vazia, zero e negativa e arredonda a 4 casas", async () => {
    const sal = await ingrediente("Sal grosso", "g");
    for (const q of [null, 0, -5]) {
      await expect(sql`SELECT para_unidade_base(${sal}, ${q}::numeric, 'kg')`.execute(db), String(q)).rejects.toThrow(/maior que zero/);
    }
    const r = await sql<{ v: string }>`SELECT para_unidade_base(${sal}, 0.00012345, 'kg')::text AS v`.execute(db);
    expect(r.rows[0]!.v).toBe("0.1235");
    await expect(sql`SELECT para_unidade_base(${sal}, 0.00001, 'g')`.execute(db)).rejects.toThrow(/pequena demais/);
  });

  it("conversão não muda de ingrediente; ingrediente desativado não recebe conversão", async () => {
    const a = await ingrediente("Pimenta", "g");
    const b = await ingrediente("Páprica", "g");
    const c = await salvarConversao(db, gerente, a, { nome: "pote", quantidadeBase: "100" });
    await expect(sql`UPDATE ingrediente_conversao SET ingrediente_id = ${b} WHERE id = ${c.id}`.execute(db)).rejects.toThrow(/não muda de ingrediente/);
    await salvarIngrediente(db, gerente, { id: b, nome: n("Páprica"), area: "cozinha", ativo: false });
    expect((await erroDe(salvarConversao(db, gerente, b, { nome: "pote", quantidadeBase: "100" }))).message).toContain("desativado");
  });

  it("nome só é único entre os ativos: desativado não impede cadastrar de novo; reativar com nome tomado é recusado", async () => {
    const velho = await ingrediente("Creme de leite", "g");
    await salvarIngrediente(db, gerente, { id: velho, nome: n("Creme de leite"), area: "cozinha", ativo: false });
    const novo = await ingrediente("Creme de leite", "ml");
    expect(novo).not.toBe(velho);
    expect((await erroDe(salvarIngrediente(db, gerente, { id: velho, nome: n("Creme de leite"), area: "cozinha", ativo: true }))).codigo).toBe("conflito");
  });

  it("quem só vê não recebe CPF, telefone, e-mail nem contato do fornecedor", async () => {
    const f = await salvarFornecedor(db, gerente, { nome: n("Feirante"), documento: "52998224725", telefone: "32 99999-0000", email: "feira@exemplo.com", contato: "Fulano" });
    const cozinheira = await atorDoCargo(db, "cozinheira");
    const visto = (await listarFornecedores(db, cozinheira)).find((x) => x.id === f.id);
    expect(visto).toMatchObject({ nome: f.nome, documento: null, telefone: null, email: null, contato: null });
    const doGerente = (await listarFornecedores(db, gerente)).find((x) => x.id === f.id);
    expect(doGerente).toMatchObject({ documento: "52998224725", telefone: "32 99999-0000" });
    await salvarFornecedor(db, gerente, { id: f.id, nome: f.nome, documento: null, ativo: false });
  });

  it("sem cadastros.gerenciar não grava fornecedor nem conversão", async () => {
    const sal = await ingrediente("Sal refinado", "g");
    const supervisor = await atorDoCargo(db, "supervisor");
    expect((await erroDe(salvarFornecedor(db, supervisor, { nome: n("Do supervisor") }))).codigo).toBe("sem_permissao");
    expect((await erroDe(salvarConversao(db, supervisor, sal, { nome: "pote", quantidadeBase: "1" }))).codigo).toBe("sem_permissao");
  });

  it("id fora do limite vira 'não encontrado', não erro do servidor", async () => {
    expect((await erroDe(salvarConversao(db, gerente, 99999999999, { nome: "pote", quantidadeBase: "1" }))).codigo).toBe("nao_encontrado");
  });
});
