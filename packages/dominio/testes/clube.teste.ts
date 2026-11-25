/**
 * Base do Clube E-MOTION (migração 0018; decisão 0024): regras do desconto do aplicativo,
 * pontos, prêmios, presentes e campanhas. Contra PostgreSQL real. Nenhum dado de cliente.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  agendarCampanha,
  cancelarCampanha,
  descontoDoClube,
  ErroDeRegra,
  percentualDoTexto,
  pontosDoPagamento,
  regrasDoClube,
  salvarCategoria,
  salvarPremio,
  salvarPresente,
  salvarProduto,
  salvarRegrasDoClube,
  textoDoBeneficio,
  textoDoPercentual,
  verClube,
  type Ator,
  type RegrasDoClube,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let dono: Ator;
let atendente: Ator;
let cozinheira: Ator;
let supervisor: Ator;
let caixa: Ator;
let unidade: number;
let cat: number;
let cat2: number;
const sufixo = randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!);
let n = 0;
const nomeNovo = (base: string) => `${base} ${sufixo} ${String.fromCharCode(97 + (n++ % 26))}${Math.floor(n / 26)}`;

const TODO_DIA = [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, modo: "todo_horario" as const }));

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  dono = await atorDoCargo(db, "dono");
  atendente = await atorDoCargo(db, "atendente");
  cozinheira = await atorDoCargo(db, "cozinheira");
  supervisor = await atorDoCargo(db, "supervisor");
  caixa = await atorDoCargo(db, "caixa");
  unidade = (await db.selectFrom("unidade").select("id").orderBy("id").executeTakeFirstOrThrow()).id;
  cat = (await salvarCategoria(db, gerente, { nome: `Clube A ${sufixo}` })).id;
  cat2 = (await salvarCategoria(db, gerente, { nome: `Clube B ${sufixo}` })).id;
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

const ultimaAuditoria = (alvoTipo: string, alvoId: string | number) =>
  db
    .selectFrom("auditoria")
    .select(["detalhes", "usuario_id", "resultado"])
    .where("alvo_tipo", "=", alvoTipo)
    .where("alvo_id", "=", String(alvoId))
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();

const novoProduto = async () =>
  salvarProduto(db, gerente, { nome: nomeNovo("Café"), categoriaId: cat, precoCentavos: 800 });

const regrasBase = (extra: Partial<RegrasDoClube> = {}): RegrasDoClube => ({
  ligado: true,
  descontoPb: 1000,
  todasAsCategorias: true,
  categorias: [],
  tetoDescontoCentavos: null,
  pontosPorReal: 1,
  campanhasPorSemana: 2,
  horarios: TODO_DIA.map((h) => ({ ...h, inicio: null, fim: null })),
  atualizadoEm: "",
  ...extra,
});

describe("regra do desconto e dos pontos (sem banco)", () => {
  it("percentual em texto <-> pontos-base", () => {
    expect(percentualDoTexto("10")).toBe(1000);
    expect(percentualDoTexto("10,5")).toBe(1050);
    expect(percentualDoTexto(" 12.75% ")).toBe(1275);
    expect(percentualDoTexto("0")).toBe(0);
    expect(percentualDoTexto("100")).toBe(10_000);
    for (const t of ["101", "-1", "1,234", "abc", "", "1e2"]) expect(percentualDoTexto(t), t).toBeNull();
    expect(textoDoPercentual(1000)).toBe("10%");
    expect(textoDoPercentual(1050)).toBe("10,5%");
    expect(textoDoPercentual(1205)).toBe("12,05%");
    expect(textoDoBeneficio({ beneficio: "desconto_valor", valor: 500 })).toBe("R$ 5,00 de desconto");
    expect(textoDoBeneficio({ beneficio: "produto", valor: null }, "Café")).toBe("Café grátis");
  });

  it("desconto: percentual arredondado para baixo, só nas categorias que participam, com teto", () => {
    const itens = [
      { categoriaId: 1, totalCentavos: 1999 },
      { categoriaId: 2, totalCentavos: 1000 },
      { categoriaId: null, totalCentavos: 500 },
    ];
    const agora = { dia: 3, hora: "12:00" };
    expect(descontoDoClube(regrasBase(), itens, agora)).toEqual({ descontoCentavos: 349, baseCentavos: 3499, limitadoPeloTeto: false, motivo: null });
    const so1 = regrasBase({ todasAsCategorias: false, categorias: [1] });
    expect(descontoDoClube(so1, itens, agora)).toMatchObject({ descontoCentavos: 199, baseCentavos: 1999 });
    expect(descontoDoClube(regrasBase({ tetoDescontoCentavos: 300 }), itens, agora)).toMatchObject({ descontoCentavos: 300, limitadoPeloTeto: true });
    expect(descontoDoClube(regrasBase({ tetoDescontoCentavos: 349 }), itens, agora)).toMatchObject({ descontoCentavos: 349, limitadoPeloTeto: false });
    expect(descontoDoClube(regrasBase({ todasAsCategorias: false, categorias: [9] }), itens, agora).motivo).toBe("sem_itens_do_clube");
    expect(descontoDoClube(regrasBase({ ligado: false }), itens, agora)).toMatchObject({ descontoCentavos: 0, motivo: "clube_desligado" });
    expect(descontoDoClube(regrasBase({ descontoPb: 0 }), itens, agora).motivo).toBe("clube_desligado");
  });

  it("desconto: horário por dia (início vale, fim não vale) e dia sem desconto", () => {
    const horarios = TODO_DIA.map((h) => ({ ...h, inicio: null, fim: null })) as RegrasDoClube["horarios"];
    horarios[1] = { dia: 2, modo: "janela", inicio: "14:00", fim: "17:00" };
    horarios[2] = { dia: 3, modo: "sem_desconto", inicio: null, fim: null };
    const r = regrasBase({ horarios });
    const itens = [{ categoriaId: 1, totalCentavos: 1000 }];
    expect(descontoDoClube(r, itens, { dia: 2, hora: "13:59" }).motivo).toBe("fora_do_horario");
    expect(descontoDoClube(r, itens, { dia: 2, hora: "14:00" }).descontoCentavos).toBe(100);
    expect(descontoDoClube(r, itens, { dia: 2, hora: "16:59" }).descontoCentavos).toBe(100);
    expect(descontoDoClube(r, itens, { dia: 2, hora: "17:00" }).motivo).toBe("fora_do_horario");
    expect(descontoDoClube(r, itens, { dia: 3, hora: "15:00" }).motivo).toBe("sem_desconto_no_dia");
    expect(descontoDoClube(r, itens, { dia: 4, hora: "15:00" }).descontoCentavos).toBe(100);
  });

  it("desconto: entrada inválida é recusada (nunca vira desconto)", () => {
    const r = regrasBase();
    expect(() => descontoDoClube(r, [{ categoriaId: 1, totalCentavos: 10.5 }], { dia: 1, hora: "12:00" })).toThrow();
    expect(() => descontoDoClube(r, [{ categoriaId: 1, totalCentavos: -1 }], { dia: 1, hora: "12:00" })).toThrow();
    expect(() => descontoDoClube(r, [], { dia: 8, hora: "12:00" })).toThrow();
    expect(() => descontoDoClube(r, [], { dia: 1, hora: "25:00" })).toThrow();
  });

  it("desconto: regras fora do permitido e valores gigantes dão erro (nunca desconto errado)", () => {
    const itens = [{ categoriaId: 1, totalCentavos: 1000 }];
    const m = { dia: 2, hora: "12:00" };
    expect(() => descontoDoClube(regrasBase({ descontoPb: 5001 }), itens, m)).toThrow();
    expect(() => descontoDoClube(regrasBase({ descontoPb: 10.5 }), itens, m)).toThrow();
    expect(() => descontoDoClube(regrasBase({ tetoDescontoCentavos: 0 }), itens, m)).toThrow();
    expect(() => descontoDoClube(regrasBase(), [{ categoriaId: 1, totalCentavos: Number.MAX_SAFE_INTEGER }], m)).toThrow();
  });

  it("pontos: só reais inteiros contam; Clube desligado não dá pontos", () => {
    expect(pontosDoPagamento({ ligado: true, pontosPorReal: 1 }, 2590)).toBe(25);
    expect(pontosDoPagamento({ ligado: true, pontosPorReal: 3 }, 99)).toBe(0);
    expect(pontosDoPagamento({ ligado: true, pontosPorReal: 3 }, 1000)).toBe(30);
    expect(pontosDoPagamento({ ligado: false, pontosPorReal: 3 }, 1000)).toBe(0);
    expect(() => pontosDoPagamento({ ligado: true, pontosPorReal: 1 }, 1.5)).toThrow();
  });
});

describe("permissões do Clube", () => {
  it("só dono, administrador e gerente geral veem e mudam; a recusa fica na auditoria", async () => {
    for (const quem of [atendente, cozinheira, supervisor, caixa]) {
      expect((await erroDe(verClube(db, quem))).codigo).toBe("sem_permissao");
      expect((await erroDe(salvarRegrasDoClube(db, quem, { descontoPb: 0 }))).codigo).toBe("sem_permissao");
      expect((await erroDe(salvarPremio(db, quem, { nome: "X", pontos: 1 }))).codigo).toBe("sem_permissao");
      expect((await erroDe(salvarPresente(db, quem, { tipo: "aniversario" }))).codigo).toBe("sem_permissao");
      expect((await erroDe(agendarCampanha(db, quem, {}))).codigo).toBe("sem_permissao");
      expect((await erroDe(cancelarCampanha(db, quem, {}))).codigo).toBe("sem_permissao");
    }
    expect((await erroDe(verClube(db, null))).codigo).toBe("nao_autenticado");
    const recusa = await db
      .selectFrom("auditoria")
      .select(["acao", "resultado"])
      .where("usuario_id", "=", caixa.usuarioId)
      .where("alvo_tipo", "=", "clube_campanha")
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(recusa).toEqual({ acao: "clube.gerenciar", resultado: "recusado" });
    const painel = await verClube(db, gerente);
    expect(painel.regras.horarios).toHaveLength(7);
    expect(painel.presentes.map((p) => p.tipo)).toEqual(["boas_vindas", "aniversario", "sentimos_falta"]);
    await verClube(db, dono);
  });

  it("nada de dado de cliente: o painel só tem regras, catálogo e campanhas", async () => {
    const p = await verClube(db, gerente);
    expect(Object.keys(p).sort()).toEqual(["campanhas", "categorias", "premios", "presentes", "produtos", "regras", "unidades"]);
  });
});

describe("regras gerais", () => {
  beforeEach(async () => {
    await salvarRegrasDoClube(db, gerente, {
      ligado: false,
      descontoPb: 1000,
      todasAsCategorias: true,
      categorias: [],
      tetoDescontoCentavos: null,
      pontosPorReal: 1,
      campanhasPorSemana: 2,
      horarios: TODO_DIA,
    });
  });

  it("campo ausente fica como está; null limpa o teto; auditoria com antes e depois", async () => {
    const a = await salvarRegrasDoClube(db, gerente, { descontoPb: 1250, tetoDescontoCentavos: 1500 });
    expect(a).toMatchObject({ descontoPb: 1250, tetoDescontoCentavos: 1500, pontosPorReal: 1, ligado: false });
    const b = await salvarRegrasDoClube(db, gerente, { pontosPorReal: 2 });
    expect(b).toMatchObject({ descontoPb: 1250, tetoDescontoCentavos: 1500, pontosPorReal: 2 });
    const c = await salvarRegrasDoClube(db, gerente, { tetoDescontoCentavos: null });
    expect(c.tetoDescontoCentavos).toBeNull();
    const aud = await ultimaAuditoria("clube_regras", 1);
    expect(aud.usuario_id).toBe(gerente.usuarioId);
    expect(aud.detalhes).toMatchObject({ operacao: "alterar", antes: { tetoDescontoCentavos: 1500 }, depois: { tetoDescontoCentavos: null } });
    expect((await regrasDoClube(db)).pontosPorReal).toBe(2);
  });

  it("valores fora do permitido são recusados com mensagem clara", async () => {
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { descontoPb: 5001 }))).message).toContain("no máximo");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { descontoPb: 10.5 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { tetoDescontoCentavos: 0 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { pontosPorReal: 101 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { campanhasPorSemana: 0 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, null))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, "x"))).codigo).toBe("dados_invalidos");
  });

  it("categorias: lista completa; a que sai fica inativa e pode voltar; categoria desativada é recusada", async () => {
    const a = await salvarRegrasDoClube(db, gerente, { todasAsCategorias: false, categorias: [cat, cat2] });
    expect(a.categorias.sort()).toEqual([cat, cat2].sort());
    const b = await salvarRegrasDoClube(db, gerente, { categorias: [cat2] });
    expect(b.categorias).toEqual([cat2]);
    const linha = await db.selectFrom("clube_categoria").select("ativo").where("categoria_id", "=", cat).executeTakeFirstOrThrow();
    expect(linha.ativo).toBe(false); // nada se apaga
    expect((await salvarRegrasDoClube(db, gerente, { categorias: [cat, cat2] })).categorias.sort()).toEqual([cat, cat2].sort());
    const nomeMorta = nomeNovo("Morta");
    const morta = (await salvarCategoria(db, gerente, { nome: nomeMorta })).id;
    await salvarCategoria(db, gerente, { id: morta, nome: nomeMorta, ativo: false });
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { categorias: [cat, morta] }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { categorias: [999_999] }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { categorias: [cat, cat] }))).message).toContain("duas vezes");
  });

  it("categoria desativada depois sai do Clube sozinha; mudar outro campo continua possível", async () => {
    const nome = nomeNovo("Sai");
    const x = (await salvarCategoria(db, gerente, { nome })).id;
    await salvarRegrasDoClube(db, gerente, { ligado: true, todasAsCategorias: false, categorias: [x] });
    await salvarCategoria(db, gerente, { id: x, nome, ativo: false });
    const r = await regrasDoClube(db);
    expect(r.categorias).toEqual([]);
    expect(descontoDoClube(r, [{ categoriaId: x, totalCentavos: 1000 }], { dia: 2, hora: "12:00" }).descontoCentavos).toBe(0);
    expect((await salvarRegrasDoClube(db, gerente, { pontosPorReal: 2 })).pontosPorReal).toBe(2);
    // Reenviar a categoria desativada é recusado, mesmo já estando marcada.
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { categorias: [x] }))).codigo).toBe("nao_encontrado");
  });

  it("Clube ligado com só algumas categorias precisa de pelo menos uma", async () => {
    const e = await erroDe(salvarRegrasDoClube(db, gerente, { ligado: true, todasAsCategorias: false, categorias: [] }));
    expect(e.message).toContain("pelo menos uma categoria");
    expect((await regrasDoClube(db)).ligado).toBe(false); // nada mudou
    expect((await salvarRegrasDoClube(db, gerente, { ligado: true, todasAsCategorias: true, categorias: [] })).ligado).toBe(true);
  });

  it("horários: os 7 dias, janela com início antes do fim", async () => {
    const h = TODO_DIA.map((x) => ({ ...x })) as { dia: number; modo: string; inicio?: string; fim?: string }[];
    h[1] = { dia: 2, modo: "janela", inicio: "14:00", fim: "17:30" };
    h[2] = { dia: 3, modo: "sem_desconto" };
    const r = await salvarRegrasDoClube(db, gerente, { horarios: h });
    expect(r.horarios[1]).toEqual({ dia: 2, modo: "janela", inicio: "14:00", fim: "17:30" });
    expect(r.horarios[2]).toEqual({ dia: 3, modo: "sem_desconto", inicio: null, fim: null });
    // Voltar para "todo o horário" limpa a janela.
    h[1] = { dia: 2, modo: "todo_horario", inicio: "14:00", fim: "17:30" };
    expect((await salvarRegrasDoClube(db, gerente, { horarios: h })).horarios[1]).toEqual({ dia: 2, modo: "todo_horario", inicio: null, fim: null });
    const ruim = h.map((x) => ({ ...x }));
    ruim[0] = { dia: 1, modo: "janela", inicio: "17:00", fim: "17:00" };
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { horarios: ruim }))).message).toContain("antes do fim");
    ruim[0] = { dia: 1, modo: "janela", inicio: "10:00" };
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { horarios: ruim }))).message).toContain("antes do fim");
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { horarios: h.slice(0, 6) }))).message).toContain("7 dias");
    const repetido = h.map((x) => ({ ...x }));
    repetido[6] = { dia: 1, modo: "todo_horario" };
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { horarios: repetido }))).message).toContain("uma vez");
    ruim[0] = { dia: 1, modo: "janela", inicio: "10:00", fim: "25:00" };
    expect((await erroDe(salvarRegrasDoClube(db, gerente, { horarios: ruim }))).codigo).toBe("dados_invalidos");
  });
});

describe("prêmios", () => {
  it("cria, altera, desativa (nada se apaga) e o nome só se repete entre inativos", async () => {
    const nome = nomeNovo("Café do Clube");
    const p = await salvarPremio(db, gerente, { nome, pontos: 50, descricao: "  Um café  coado " });
    expect(p).toMatchObject({ nome, pontos: 50, descricao: "Um café coado", produtoId: null, ativo: true });
    expect((await erroDe(salvarPremio(db, gerente, { nome: nome.toUpperCase(), pontos: 10 }))).codigo).toBe("conflito");
    const q = await salvarPremio(db, gerente, { id: p.id, pontos: 60 });
    expect(q).toMatchObject({ nome, pontos: 60, descricao: "Um café coado" });
    expect((await salvarPremio(db, gerente, { id: p.id, descricao: "" })).descricao).toBeNull();
    await salvarPremio(db, gerente, { id: p.id, ativo: false });
    const outro = await salvarPremio(db, gerente, { nome, pontos: 10 });
    expect(outro.id).not.toBe(p.id);
    expect((await db.selectFrom("clube_premio").select("id").where("id", "=", p.id).executeTakeFirst())?.id).toBe(p.id);
    const aud = await ultimaAuditoria("clube_premio", outro.id);
    expect(aud.detalhes).toMatchObject({ operacao: "criar", antes: null, depois: { nome, pontos: 10 } });
  });

  it("produto do prêmio precisa existir e estar ativo; sem nome ou pontos é recusado", async () => {
    const prod = await novoProduto();
    const p = await salvarPremio(db, gerente, { nome: nomeNovo("Grátis"), pontos: 100, produtoId: prod.id });
    expect(p.produtoId).toBe(prod.id);
    await salvarProduto(db, gerente, { id: prod.id, ativo: false });
    expect((await erroDe(salvarPremio(db, gerente, { nome: nomeNovo("G"), pontos: 1, produtoId: prod.id }))).codigo).toBe("nao_encontrado");
    // Mudar só os pontos de um prêmio já ligado não exige reconferir o produto.
    expect((await salvarPremio(db, gerente, { id: p.id, pontos: 120 })).pontos).toBe(120);
    expect((await erroDe(salvarPremio(db, gerente, { nome: nomeNovo("G"), pontos: 1, produtoId: 999_999 }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(salvarPremio(db, gerente, { nome: nomeNovo("G") }))).message).toContain("pontos");
    expect((await erroDe(salvarPremio(db, gerente, { pontos: 5 }))).message).toContain("nome");
    expect((await erroDe(salvarPremio(db, gerente, { nome: nomeNovo("G"), pontos: 0 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarPremio(db, gerente, { nome: "X\u0007Y", pontos: 5 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarPremio(db, gerente, { id: 999_999, pontos: 5 }))).codigo).toBe("nao_encontrado");
  });
});

describe("presentes automáticos", () => {
  beforeEach(async () => {
    await salvarPresente(db, gerente, { tipo: "boas_vindas", ligado: false, beneficio: "desconto_percentual", valor: 1000 });
    await salvarPresente(db, gerente, { tipo: "sentimos_falta", ligado: false, beneficio: "desconto_percentual", valor: 1000, diasSemPedir: 30 });
  });

  it("muda benefício e valor; campo ausente fica; auditoria com antes e depois", async () => {
    const a = await salvarPresente(db, gerente, { tipo: "boas_vindas", ligado: true, beneficio: "desconto_valor", valor: 500, mensagem: "Bem-vindo!" });
    expect(a).toMatchObject({ ligado: true, beneficio: "desconto_valor", valor: 500, produtoId: null, mensagem: "Bem-vindo!" });
    const b = await salvarPresente(db, gerente, { tipo: "boas_vindas", validadeDias: 15 });
    expect(b).toMatchObject({ beneficio: "desconto_valor", valor: 500, validadeDias: 15, mensagem: "Bem-vindo!" });
    const aud = await ultimaAuditoria("clube_presente", "boas_vindas");
    expect(aud.detalhes).toMatchObject({ antes: { validadeDias: 30 }, depois: { validadeDias: 15 } });
  });

  it("trocar o benefício pede o valor novo; produto grátis pede produto ativo", async () => {
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "pontos" }))).message).toContain("valor");
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "produto" }))).message).toContain("produto");
    const prod = await novoProduto();
    const p = await salvarPresente(db, gerente, { tipo: "boas_vindas", ligado: true, beneficio: "produto", produtoId: prod.id });
    expect(p).toMatchObject({ beneficio: "produto", produtoId: prod.id, valor: null });
    await salvarProduto(db, gerente, { id: prod.id, ativo: false });
    // Desligado, pode apontar para um produto inativo; ligar de novo é recusado.
    await salvarPresente(db, gerente, { tipo: "boas_vindas", ligado: false });
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", ligado: true }))).codigo).toBe("nao_encontrado");
    const v = await salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "pontos", valor: 50 });
    expect(v).toMatchObject({ beneficio: "pontos", valor: 50, produtoId: null });
  });

  it("campo que não combina com o benefício é recusado (nunca ignorado calado)", async () => {
    const prod = await novoProduto();
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "produto", produtoId: prod.id, valor: 10 }))).message).toContain("não tem valor");
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "pontos", valor: 10, produtoId: prod.id }))).message).toContain("produto grátis");
  });

  it("limites: % até 100; dias sem pedir só no 'sentimos sua falta' (7 a 365)", async () => {
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "desconto_percentual", valor: 10_001 }))).message).toContain("100%");
    expect((await salvarPresente(db, gerente, { tipo: "boas_vindas", beneficio: "desconto_percentual", valor: 10_000 })).valor).toBe(10_000);
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "aniversario", diasSemPedir: 30 }))).message).toContain("Sentimos sua falta");
    expect((await salvarPresente(db, gerente, { tipo: "sentimos_falta", diasSemPedir: 45 })).diasSemPedir).toBe(45);
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "sentimos_falta", diasSemPedir: null }))).message).toContain("quantos dias");
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "sentimos_falta", diasSemPedir: 6 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "outro" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", validadeDias: 91 }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarPresente(db, gerente, { tipo: "boas_vindas", mensagem: "x".repeat(141) }))).codigo).toBe("dados_invalidos");
  });
});

describe("campanhas", () => {
  /** "AAAA-MM-DDTHH:MM" local da unidade: dia da semana (1 = segunda) da semana `k` a partir da próxima. */
  async function quando(k: number, dia: number, hora: string): Promise<string> {
    const r = await sql<{ v: string }>`
      SELECT to_char(date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') + make_interval(weeks => ${k}, days => ${dia - 1})
                     + ${hora}::time, 'YYYY-MM-DD"T"HH24:MI') AS v`.execute(db);
    return r.rows[0]!.v;
  }
  const campanha = async (enviarEm: string, extra: Record<string, unknown> = {}) =>
    agendarCampanha(db, gerente, { unidadeId: unidade, titulo: "Café em dobro", texto: "Hoje o café do Clube vale pontos em dobro.", publico: "todos", enviarEm, ...extra });

  beforeEach(async () => {
    // Cada teste começa com as semanas livres e o limite de 2 por semana.
    await sql`UPDATE clube_campanha SET situacao = 'cancelada', cancelada_por = ${gerente.usuarioId}, cancelada_em = now(),
              motivo_cancelamento = 'limpeza do teste' WHERE situacao = 'agendada'`.execute(db);
    await salvarRegrasDoClube(db, gerente, { campanhasPorSemana: 2 });
  });

  it("agenda na hora local da unidade e grava quem criou; auditoria", async () => {
    const em = await quando(1, 2, "15:00"); // terça
    const c = await campanha(em, { titulo: "  Terça   do café " });
    expect(c).toMatchObject({ enviarEm: em, situacao: "agendada", titulo: "Terça do café", publico: "todos", destinatarios: null });
    const real = await db.selectFrom("clube_campanha").select(["enviar_em", "criada_por"]).where("id", "=", c.id).executeTakeFirstOrThrow();
    expect(real.criada_por).toBe(gerente.usuarioId);
    const [d, h] = em.split("T");
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(real.enviar_em);
    expect(local).toBe(`${d} ${h}`);
    expect((await ultimaAuditoria("clube_campanha", c.id)).detalhes).toMatchObject({ operacao: "agendar", antes: null });
    expect((await verClube(db, gerente)).campanhas.some((x) => x.id === c.id)).toBe(true);
  });

  it("só com a casa aberta: segunda (fechado), antes de abrir, no fechamento e em data especial fechada", async () => {
    expect((await erroDe(campanha(await quando(1, 1, "15:00")))).message).toContain("fora do horário da casa");
    expect((await erroDe(campanha(await quando(1, 2, "09:59")))).message).toContain("fora do horário da casa");
    expect((await campanha(await quando(1, 2, "10:00"))).situacao).toBe("agendada");
    expect((await campanha(await quando(1, 3, "23:29"))).situacao).toBe("agendada");
    expect((await erroDe(campanha(await quando(2, 2, "23:30")))).message).toContain("fora do horário da casa");
    const feriado = (await quando(3, 4, "00:00")).slice(0, 10);
    const ins = await db
      .insertInto("horario_unidade_data")
      .values({ unidade_id: unidade, data: feriado, aberta: false, motivo: "Feriado do teste" })
      .returning("id")
      .executeTakeFirstOrThrow();
    try {
      expect((await erroDe(campanha(await quando(3, 4, "15:00")))).message).toContain("fora do horário da casa");
    } finally {
      await db.updateTable("horario_unidade_data").set({ ativo: false }).where("id", "=", ins.id).execute();
    }
    expect((await campanha(await quando(3, 4, "15:00"))).situacao).toBe("agendada");
  });

  it("prazo: pelo menos 5 minutos à frente, no máximo 90 dias, data que existe", async () => {
    expect((await erroDe(campanha(await quando(-1, 2, "15:00")))).message).toContain("antecedência");
    expect((await erroDe(campanha(await quando(14, 2, "15:00")))).message).toContain("90 dias");
    expect((await erroDe(campanha("2026-02-30T15:00"))).codigo).toBe("dados_invalidos");
    expect((await erroDe(campanha("2026-12-01 15:00"))).codigo).toBe("dados_invalidos");
    expect((await erroDe(campanha("2026-12-01T24:00"))).codigo).toBe("dados_invalidos");
    expect((await erroDe(campanha(await quando(1, 2, "15:00"), { publico: "vip" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(campanha(await quando(1, 2, "15:00"), { texto: "x".repeat(181) }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(campanha(await quando(1, 2, "15:00"), { unidadeId: 999_999 }))).codigo).toBe("nao_encontrado");
  });

  it("limite por semana (segunda a domingo); cancelar libera a vaga; mudar não conta a própria", async () => {
    const a = await campanha(await quando(4, 2, "15:00"));
    await campanha(await quando(4, 7, "20:00")); // domingo da mesma semana
    const e = await erroDe(campanha(await quando(4, 5, "15:00")));
    expect(e.codigo).toBe("conflito");
    expect(e.message).toContain("limite é 2");
    // A semana seguinte está livre.
    expect((await campanha(await quando(5, 2, "15:00"))).situacao).toBe("agendada");
    // Mudar o horário da própria campanha dentro da semana cheia é permitido.
    const a2 = await agendarCampanha(db, gerente, { id: a.id, unidadeId: unidade, titulo: "Outro título", texto: a.texto, publico: "aniversariantes_do_mes", enviarEm: await quando(4, 3, "16:00") });
    expect(a2).toMatchObject({ id: a.id, titulo: "Outro título", publico: "aniversariantes_do_mes" });
    expect((await ultimaAuditoria("clube_campanha", a.id)).detalhes).toMatchObject({ operacao: "alterar", antes: { titulo: "Café em dobro" } });
    const cancelada = await cancelarCampanha(db, gerente, { id: a.id, motivo: "Mudou o plano" });
    expect(cancelada).toMatchObject({ situacao: "cancelada", motivoCancelamento: "Mudou o plano" });
    expect((await campanha(await quando(4, 5, "15:00"))).situacao).toBe("agendada");
    // Subir o limite abre mais vagas.
    await salvarRegrasDoClube(db, gerente, { campanhasPorSemana: 3 });
    expect((await campanha(await quando(4, 6, "15:00"))).situacao).toBe("agendada");
  });

  it("cancelada não muda nem cancela de novo; cancelar pede motivo", async () => {
    const c = await campanha(await quando(6, 2, "15:00"));
    expect((await erroDe(cancelarCampanha(db, gerente, { id: c.id, motivo: "" }))).codigo).toBe("dados_invalidos");
    await cancelarCampanha(db, gerente, { id: c.id, motivo: "Sem estoque" });
    expect((await erroDe(cancelarCampanha(db, gerente, { id: c.id, motivo: "De novo" }))).codigo).toBe("conflito");
    const e = await erroDe(agendarCampanha(db, gerente, { id: c.id, unidadeId: unidade, titulo: "X1", texto: "Y1", publico: "todos", enviarEm: await quando(6, 3, "15:00") }));
    expect(e.codigo).toBe("conflito");
    expect((await erroDe(cancelarCampanha(db, gerente, { id: 999_999, motivo: "Nada" }))).codigo).toBe("nao_encontrado");
    expect((await db.selectFrom("clube_campanha").select("situacao").where("id", "=", c.id).executeTakeFirstOrThrow()).situacao).toBe("cancelada");
  });

  it("hora que não existe no relógio da loja (troca de horário) é recusada", async () => {
    const emp = (await db.selectFrom("unidade").select("empresa_id").where("id", "=", unidade).executeTakeFirstOrThrow()).empresa_id;
    const fora = await db
      .insertInto("unidade")
      .values({ empresa_id: emp, nome: `Teste fuso ${sufixo}`, fuso_horario: "America/New_York" })
      .returning("id")
      .executeTakeFirstOrThrow();
    // Domingo 08/03/2026 já passou; procura o próximo domingo de troca nos EUA (2º domingo de março).
    const r = await sql<{ d: string }>`
      SELECT to_char(d, 'YYYY-MM-DD') AS d FROM generate_series(now()::date, now()::date + 400, interval '1 day') AS d
      WHERE extract(month FROM d) = 3 AND extract(isodow FROM d) = 7 AND extract(day FROM d) BETWEEN 8 AND 14 LIMIT 1`.execute(db);
    const domingo = r.rows[0]!.d;
    // A conferência da hora vem antes do prazo e do horário da casa.
    const e = await erroDe(campanha(`${domingo}T02:30`, { unidadeId: fora.id }));
    expect(e.message).toContain("não existe no relógio da loja");
  });

  it("concorrência determinística: agendar espera quem está agendando e respeita o limite", async () => {
    await salvarRegrasDoClube(db, gerente, { campanhasPorSemana: 1 });
    const em = await quando(7, 2, "15:00");
    const outra = bancoDeTeste();
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      let travou!: () => void;
      const travado = new Promise<void>((r) => (travou = r));
      // Outra gravação de campanha no meio do caminho: segura a trava e grava uma na mesma semana.
      const segura = outra.transaction().execute(async (trx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext('clube:campanhas'))`.execute(trx);
        travou();
        await solto;
        await sql`INSERT INTO clube_campanha (unidade_id, titulo, texto, publico, enviar_em, criada_por)
                  VALUES (${unidade}, 'Outra', 'Outra campanha', 'todos', (${em}::timestamp + interval '1 day') AT TIME ZONE 'America/Sao_Paulo', ${gerente.usuarioId})`.execute(trx);
      });
      await travado;
      let terminou = false;
      const agenda = campanha(em).finally(() => (terminou = true));
      agenda.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(terminou).toBe(false); // esperando a trava
      soltar();
      await segura;
      const e = await erroDe(agenda);
      expect(e.codigo).toBe("conflito");
      const naSemana = await db
        .selectFrom("clube_campanha")
        .select(sql<number>`count(*)::int`.as("n"))
        .where("situacao", "=", "agendada")
        .executeTakeFirstOrThrow();
      expect(naSemana.n).toBe(1);
    } finally {
      await outra.destroy();
    }
  });

  it("concorrência determinística: baixar o limite enquanto alguém agenda vale para quem espera", async () => {
    await campanha(await quando(8, 2, "15:00"));
    const outra = bancoDeTeste();
    try {
      let soltar!: () => void;
      const solto = new Promise<void>((r) => (soltar = r));
      let travou!: () => void;
      const travado = new Promise<void>((r) => (travou = r));
      const segura = outra.transaction().execute(async (trx) => {
        await sql`SELECT id FROM clube_regras WHERE id = 1 FOR UPDATE`.execute(trx);
        travou();
        await solto;
        await sql`UPDATE clube_regras SET campanhas_por_semana = 1 WHERE id = 1`.execute(trx);
      });
      await travado;
      let terminou = false;
      const agenda = campanha(await quando(8, 4, "15:00")).finally(() => (terminou = true));
      agenda.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(terminou).toBe(false);
      soltar();
      await segura;
      expect((await erroDe(agenda)).message).toContain("limite é 1");
    } finally {
      await outra.destroy();
    }
  });
});
