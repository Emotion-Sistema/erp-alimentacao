/**
 * Alergênicos calculados da ficha técnica (S1; migração 0020; decisão 0026). Contra PostgreSQL real,
 * com ingredientes e receitas inventados. Regra de saúde: na dúvida, "em conferência", nunca
 * "não contém".
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  alergenicosDasFichas,
  alergenicosDoProduto,
  codigoDeAlergenico,
  ErroDeRegra,
  listarAlergenicos,
  listarIngredientes,
  painelDeFichas,
  PROFUNDIDADE_MAXIMA,
  salvarAlergenico,
  salvarAlergenicosDoIngrediente,
  salvarCategoria,
  salvarFicha,
  salvarIngrediente,
  salvarProduto,
  verFicha,
  TRAVA_DA_LISTA_DE_ALERGENICOS,
  type Ator,
  type FichaParaConta,
  type IngredienteParaAlergenicos,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let atendente: Ator;
let cat: number;
// Só letras (o código do catálogo não aceita número).
const sufixo = randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${String.fromCharCode(97 + (n++ % 26))}${Math.floor(n / 26)}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  atendente = await atorDoCargo(db, "atendente");
  cat = (await salvarCategoria(db, gerente, { nome: `Alergenicos ${sufixo}` })).id;
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

const ingrediente = async (base: string, unidadeBase: "g" | "ml" | "un" = "g") => (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase, area: "cozinha" })).id;
/** A conferência que a tela veria agora (como o servidor a devolve: ISO em milissegundos). */
const conferidoAgora = async (ingredienteId: number): Promise<string | null> => {
  const r = await db.selectFrom("ingrediente").select("alergenicos_conferidos_em as em").where("id", "=", ingredienteId).executeTakeFirst();
  return r?.em ? new Date(r.em).toISOString() : null;
};
/** Os códigos que a tela mostraria agora (os ativos do catálogo). */
const catalogoAgora = async (): Promise<string[]> => (await db.selectFrom("alergenico").select("codigo").where("ativo", "=", true).execute()).map((a) => a.codigo);
/** O que a tela tem ao abrir a janela do ingrediente. */
const abrirTela = async (ingredienteId: number) => ({ conferidoEmVisto: await conferidoAgora(ingredienteId), catalogoVisto: await catalogoAgora() });
/** Marca como a tela faria: abre (vê a conferência e a lista atuais) e grava. */
const marcar = async (ingredienteId: number, contem: string[] = [], tracos: string[] = [], ator: Ator = gerente) =>
  salvarAlergenicosDoIngrediente(db, ator, { ingredienteId, contem, tracos, ...(await abrirTela(ingredienteId)) });
const produto = async (extra: Record<string, unknown> = {}) => salvarProduto(db, gerente, { nome: nome("Prato"), categoriaId: cat, precoCentavos: 2000, ...extra });
type Item = { ingredienteId?: number; preparoId?: number; quantidade: string | null; opcional?: boolean };
const receita = (itens: Item[], rende: string | null = "1") => ({ rende, itens });
const codigos = (l: { codigo: string }[]) => l.map((x) => x.codigo);

describe("regra pura (sem banco)", () => {
  const ficha = (id: number, itens: { ingredienteId?: number; preparoId?: number; opcional?: boolean }[], tipo: FichaParaConta["tipo"] = "preparo"): FichaParaConta => ({
    id,
    tipo,
    nome: `F${id}`,
    ativo: true,
    unidadeRendimento: tipo === "preparo" ? "g" : null,
    versao: {
      rende: "1",
      pendencias: [],
      itens: itens.map((i, k) => ({
        ordem: k + 1,
        ingredienteId: i.ingredienteId ?? null,
        preparoId: i.preparoId ?? null,
        nome: i.ingredienteId ? `I${i.ingredienteId}` : `F${i.preparoId}`,
        unidade: "g",
        quantidade: "1",
        opcional: i.opcional ?? false,
        medidaCaseira: null,
        observacao: null,
      })),
    },
  });
  const ing = (id: number, alergenicos: IngredienteParaAlergenicos["alergenicos"] = [], conferido = true): IngredienteParaAlergenicos => ({ id, nome: `I${id}`, ativo: true, conferido, alergenicos });

  it("receita circular fica em conferência, com o aviso, sem travar", () => {
    const fichas = new Map([
      [1, ficha(1, [{ ingredienteId: 10 }, { preparoId: 2 }])],
      [2, ficha(2, [{ preparoId: 1 }])],
    ]);
    const r = alergenicosDasFichas(fichas, new Map([[10, ing(10, [{ codigo: "leite", tipo: "contem" }])]]), [1, 2]);
    expect(r.get(1)!.situacao).toBe("em_conferencia");
    expect(r.get(1)!.pendencias.some((p) => /acaba usando a si mesmo/.test(p))).toBe(true);
    expect(r.get(1)!.contem).toEqual(["leite"]);
    expect(r.get(2)!.situacao).toBe("em_conferencia");
  });

  it("preparo dentro de preparo além do limite fica em conferência; no limite, não", () => {
    const fichas = new Map<number, FichaParaConta>();
    // Cadeia 1 -> 2 -> ... -> N, com o ingrediente no fim.
    const N = PROFUNDIDADE_MAXIMA + 2;
    for (let i = 1; i < N; i++) fichas.set(i, ficha(i, [{ preparoId: i + 1 }]));
    fichas.set(N, ficha(N, [{ ingredienteId: 10 }]));
    const ings = new Map([[10, ing(10, [{ codigo: "soja", tipo: "contem" }])]]);
    const r = alergenicosDasFichas(fichas, ings, [1, N - PROFUNDIDADE_MAXIMA + 1, N]);
    expect(r.get(1)!.situacao).toBe("em_conferencia");
    expect(r.get(1)!.pendencias.join(" ")).toMatch(/passou de 8 níveis/);
    // A partir de uma ficha mais de baixo o caminho cabe no limite: conta tudo e fica conferido.
    expect(r.get(N - PROFUNDIDADE_MAXIMA + 1)!.situacao).toBe("conferido");
    expect(r.get(N - PROFUNDIDADE_MAXIMA + 1)!.contem).toEqual(["soja"]);
    expect(r.get(N)!.contem).toEqual(["soja"]);
  });

  it("opcional dentro de preparo opcional leva o nome do item de fora; traços não repetem o que já contém", () => {
    const fichas = new Map([
      [1, ficha(1, [{ preparoId: 2, opcional: true }, { ingredienteId: 11 }], "produto")],
      [2, ficha(2, [{ ingredienteId: 10, opcional: true }])],
    ]);
    const ings = new Map([
      [10, ing(10, [{ codigo: "ovos", tipo: "contem" }, { codigo: "leite", tipo: "tracos" }])],
      [11, ing(11, [{ codigo: "leite", tipo: "contem" }])],
    ]);
    const r = alergenicosDasFichas(fichas, ings, [1, 2]).get(1)!;
    expect(r.contem).toEqual(["leite"]);
    expect(r.tracos).toEqual([]);
    expect(r.opcionais).toEqual([{ codigo: "ovos", tipo: "contem", itens: ["F2"] }]);
  });

  it("preparo desativado: continua contando e deixa o prato em conferência, com o aviso", () => {
    const fichas = new Map([
      [1, ficha(1, [{ preparoId: 2 }], "produto")],
      [2, { ...ficha(2, [{ ingredienteId: 10 }]), ativo: false }],
    ]);
    const r = alergenicosDasFichas(fichas, new Map([[10, ing(10, [{ codigo: "ovos", tipo: "contem" }])]]), [1]).get(1)!;
    expect(r.situacao).toBe("em_conferencia");
    expect(r.pendencias).toEqual(["F2: preparo desativado."]);
    expect(r.contem).toEqual(["ovos"]);
  });

  it("preparo já visto perto do topo e de novo lá no fundo: o reuso confere a profundidade", () => {
    // P -> A -> B -> C -> ingrediente (P tem altura 3). A raiz usa P direto (nível 1) e também
    // pelo caminho D1 -> ... -> D5 -> P (P no nível 6: C fica no nível 9, além do limite de 8).
    const fichas = new Map<number, FichaParaConta>([
      [100, ficha(100, [{ preparoId: 1 }, { preparoId: 11 }], "produto")],
      [1, ficha(1, [{ preparoId: 2 }])],
      [2, ficha(2, [{ preparoId: 3 }])],
      [3, ficha(3, [{ preparoId: 4 }])],
      [4, ficha(4, [{ ingredienteId: 10 }])],
      [11, ficha(11, [{ preparoId: 12 }])],
      [12, ficha(12, [{ preparoId: 13 }])],
      [13, ficha(13, [{ preparoId: 14 }])],
      [14, ficha(14, [{ preparoId: 15 }])],
      [15, ficha(15, [{ preparoId: 1 }])],
    ]);
    const r = alergenicosDasFichas(fichas, new Map([[10, ing(10, [{ codigo: "peixes", tipo: "contem" }])]]), [100, 1]);
    expect(r.get(100)!.situacao).toBe("em_conferencia");
    expect(r.get(100)!.pendencias.join(" ")).toMatch(/passou de 8 níveis/);
    // Sozinho, P cabe no limite.
    expect(r.get(1)!.situacao).toBe("conferido");
    expect(r.get(1)!.contem).toEqual(["peixes"]);
  });

  it("código do catálogo a partir do nome", () => {
    expect(codigoDeAlergenico("Castanha-do-pará")).toBe("castanha_do_para");
    expect(codigoDeAlergenico("  Gergelim  ")).toBe("gergelim");
    expect(codigoDeAlergenico("123")).toBe("");
  });
});

describe("ingrediente: marcar e conferir", () => {
  it("grava contém e traços, marca conferido com quem e quando, e audita antes e depois", async () => {
    const farinha = await ingrediente("Farinha");
    let lista = (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === farinha)!;
    expect(lista.alergenicosConferidosEm).toBeNull();
    const r = await marcar(farinha, ["gluten"], ["soja"]);
    expect(r).toMatchObject({ contem: ["gluten"], tracos: ["soja"], conferidoPor: "Teste gerente geral" });
    expect(r.conferidoEm).not.toBeNull();
    lista = (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === farinha)!;
    expect(lista.alergenicos).toEqual([
      { codigo: "gluten", tipo: "contem" },
      { codigo: "soja", tipo: "tracos" },
    ]);
    expect(lista.alergenicosConferidosPor).toBe("Teste gerente geral");
    // Troca: soja sai, leite entra como traço. Nada é apagado: a linha da soja fica inativa.
    await marcar(farinha, ["gluten"], ["leite"]);
    const linhas = await db.selectFrom("ingrediente_alergenico").select(["alergenico_codigo", "tipo", "ativo"]).where("ingrediente_id", "=", farinha).orderBy("alergenico_codigo").execute();
    expect(linhas).toEqual([
      { alergenico_codigo: "gluten", tipo: "contem", ativo: true },
      { alergenico_codigo: "leite", tipo: "tracos", ativo: true },
      { alergenico_codigo: "soja", tipo: "tracos", ativo: false },
    ]);
    const aud = await db
      .selectFrom("auditoria")
      .select(["usuario_id", "detalhes"])
      .where("alvo_tipo", "=", "ingrediente_alergenico")
      .where("alvo_id", "=", String(farinha))
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(aud.usuario_id).toBe(gerente.usuarioId);
    const det = aud.detalhes as { antes: { tracos: string[] }; depois: { tracos: string[] } };
    expect(det.antes.tracos).toEqual(["soja"]);
    expect(det.depois.tracos).toEqual(["leite"]);
  });

  it("recusa código nos dois, repetido, fora do catálogo, inválido e ingrediente inexistente", async () => {
    const x = await ingrediente("Coisa");
    expect((await erroDe(marcar(x, ["leite"], ["leite"]))).codigo).toBe("dados_invalidos");
    expect((await erroDe(marcar(x, ["leite", "leite"]))).codigo).toBe("dados_invalidos");
    expect((await erroDe(marcar(x, ["nao_existe"]))).codigo).toBe("dados_invalidos");
    expect((await erroDe(marcar(x, ["Leite"]))).codigo).toBe("dados_invalidos");
    expect((await erroDe(marcar(999_999, ["leite"]))).codigo).toBe("nao_encontrado");
    // Nada mudou: segue não conferido.
    const i = (await listarIngredientes(db, gerente)).ingredientes.find((g) => g.id === x)!;
    expect(i.alergenicosConferidosEm).toBeNull();
  });

  it("permissões: só quem gerencia cadastros marca; quem vê cadastros vê o catálogo; a recusa fica na auditoria", async () => {
    const x = await ingrediente("Cebola");
    expect((await erroDe(marcar(x, [], [], cozinheira))).codigo).toBe("sem_permissao");
    expect((await erroDe(marcar(x, [], [], atendente))).codigo).toBe("sem_permissao");
    const recusa = await db
      .selectFrom("auditoria")
      .select(["resultado", "usuario_id"])
      .where("alvo_tipo", "=", "ingrediente_alergenico")
      .where("usuario_id", "=", atendente.usuarioId)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(recusa.resultado).toBe("recusado");
    expect((await listarAlergenicos(db, cozinheira)).length).toBeGreaterThanOrEqual(10);
    expect((await erroDe(listarAlergenicos(db, atendente))).codigo).toBe("sem_permissao");
    expect((await erroDe(salvarAlergenico(db, cozinheira, { codigo: `x${sufixo}`, novo: true, nome: "Teste" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(salvarAlergenicosDoIngrediente(db, null, { ingredienteId: x, contem: [], tracos: [], conferidoEmVisto: null }))).codigo).toBe("nao_autenticado");
  });
});

describe("catálogo", () => {
  it("nasce com a lista inicial (RDC 26/2015 e lactose), na ordem", async () => {
    const c = await listarAlergenicos(db, gerente);
    expect(c.slice(0, 10).map((a) => a.codigo)).toEqual(["gluten", "crustaceos", "ovos", "peixes", "amendoim", "soja", "leite", "castanhas", "latex", "lactose"]);
    expect(c.find((a) => a.codigo === "castanhas")!.descricao).toMatch(/pistache/);
  });

  it("adiciona, edita, recusa repetido e código inválido, desativa e reativa (nada se apaga)", async () => {
    const codigo = `gergelim_${sufixo}`;
    const novo = await salvarAlergenico(db, gerente, { codigo, novo: true, nome: `Gergelim ${sufixo}`, descricao: "Sementes de gergelim." });
    expect(novo).toMatchObject({ codigo, ativo: true });
    expect(novo.ordem).toBeGreaterThan(100);
    const repetido = await erroDe(salvarAlergenico(db, gerente, { codigo, novo: true, nome: "Outro nome" }));
    expect(repetido.codigo).toBe("conflito");
    expect(repetido.message).toBe("Já existe um alergênico com esse código.");
    expect((await erroDe(salvarAlergenico(db, gerente, { codigo: `outro_${sufixo}`, novo: true, nome: `gergelim ${sufixo}` }))).codigo).toBe("conflito");
    expect((await erroDe(salvarAlergenico(db, gerente, { codigo: "Com Espaco", novo: true, nome: "X" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarAlergenico(db, gerente, { codigo: "a1", novo: true, nome: "Xy" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarAlergenico(db, gerente, { codigo: "nao_existe_mesmo", nome: "Xy" }))).codigo).toBe("nao_encontrado");
    const editado = await salvarAlergenico(db, gerente, { codigo, nome: `Gergelim e tahine ${sufixo}`, descricao: "" });
    expect(editado).toMatchObject({ nome: `Gergelim e tahine ${sufixo}`, descricao: null });
    expect((await salvarAlergenico(db, gerente, { codigo, ativo: false })).ativo).toBe(false);
    expect((await listarAlergenicos(db, gerente)).find((a) => a.codigo === codigo)!.ativo).toBe(false);
    expect((await salvarAlergenico(db, gerente, { codigo, ativo: true })).ativo).toBe(true);
    const aud = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "alergenico").where("alvo_id", "=", codigo).execute();
    expect(aud.length).toBe(4);
  });

  it("alergênico desativado no catálogo continua contando no prato e no ingrediente que já tinha; não pode ser marcado de novo", async () => {
    const codigo = `mostarda_${sufixo}`;
    await salvarAlergenico(db, gerente, { codigo, novo: true, nome: `Mostarda ${sufixo}` });
    const molho = await ingrediente("Molho de mostarda");
    const outro = await ingrediente("Outro molho");
    await marcar(molho, [codigo]);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: molho, quantidade: "10" }]) });
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
    const a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("conferido");
    expect(a.contem).toEqual([{ codigo, nome: `Mostarda ${sufixo}`, ativoNoCatalogo: false }]);
    // O que já tinha pode continuar ao gravar de novo; marcar num ingrediente novo, não.
    await marcar(molho, [codigo]);
    expect((await erroDe(marcar(outro, [codigo]))).codigo).toBe("dados_invalidos");
    await salvarAlergenico(db, gerente, { codigo, ativo: true });
  });
});

describe("prato herda dos ingredientes (pela ficha)", () => {
  it("herda de preparo, traços à parte, opcional à parte e item sem quantidade conta", async () => {
    const leite = await ingrediente("Leite", "ml");
    const ovo = await ingrediente("Ovo", "un");
    const farinha = await ingrediente("Farinha de trigo");
    const chocolate = await ingrediente("Granulado");
    const sal = await ingrediente("Sal");
    await marcar(leite, ["leite", "lactose"]);
    await marcar(ovo, ["ovos"]);
    await marcar(farinha, ["gluten"], ["soja"]);
    await marcar(chocolate, ["leite"], ["amendoim", "castanhas"]);
    await marcar(sal); // conferido: não contém nenhum
    const massa = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: nome("Massa"),
      unidadeRendimento: "g",
      receita: receita(
        [
          { ingredienteId: farinha, quantidade: "500" },
          { ingredienteId: ovo, quantidade: "2" },
          { ingredienteId: sal, quantidade: null }, // a gosto: ficha incompleta, mas conta
        ],
        "600",
      ),
    });
    expect(massa.resumo.completa).toBe(false);
    const p = await produto();
    const f = await salvarFicha(db, gerente, {
      tipo: "produto",
      produtoId: p.id,
      receita: receita([
        { preparoId: massa.resumo.id, quantidade: "200" },
        { ingredienteId: leite, quantidade: "50" },
        { ingredienteId: chocolate, quantidade: "5", opcional: true },
      ]),
    });
    const a = f.resumo.alergenicos;
    expect(a.situacao).toBe("conferido");
    expect(codigos(a.contem)).toEqual(["gluten", "ovos", "leite", "lactose"]);
    expect(codigos(a.tracos)).toEqual(["soja"]);
    expect(a.opcionais.map((o) => [o.codigo, o.tipo, o.itens])).toEqual([
      ["amendoim", "tracos", [f.versao!.itens[2]!.nome]],
      ["castanhas", "tracos", [f.versao!.itens[2]!.nome]],
    ]);
    expect(a.emConferencia).toEqual([]);
    // O preparo sozinho também mostra os dele.
    expect(codigos((await verFicha(db, gerente, massa.resumo.id)).resumo.alergenicos.contem)).toEqual(["gluten", "ovos"]);
    // O painel traz o mesmo resumo e o catálogo.
    const painel = await painelDeFichas(db, cozinheira);
    expect(painel.fichas.find((x) => x.id === f.resumo.id)!.alergenicos).toEqual(a);
    expect(painel.alergenicos.length).toBeGreaterThanOrEqual(10);
  });

  it("ingrediente não conferido deixa o prato em conferência (também dentro de preparo e em opcional); conferido sem nada = não contém", async () => {
    const tomate = await ingrediente("Tomate");
    const azeite = await ingrediente("Azeite", "ml");
    const manjericao = await ingrediente("Manjericão");
    await marcar(tomate);
    const molho = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: nome("Molho"),
      unidadeRendimento: "g",
      receita: receita([
        { ingredienteId: tomate, quantidade: "500" },
        { ingredienteId: azeite, quantidade: "20" },
      ], "450"),
    });
    const p = await produto();
    const f = await salvarFicha(db, gerente, {
      tipo: "produto",
      produtoId: p.id,
      receita: receita([
        { preparoId: molho.resumo.id, quantidade: "100" },
        { ingredienteId: manjericao, quantidade: "2", opcional: true },
      ]),
    });
    let a = f.resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia.map((x) => x.ingredienteId).sort()).toEqual([azeite, manjericao].sort());
    expect(a.contem).toEqual([]);
    await marcar(azeite);
    a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.emConferencia.map((x) => x.ingredienteId)).toEqual([manjericao]);
    await marcar(manjericao);
    a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a).toMatchObject({ situacao: "conferido", contem: [], tracos: [], opcionais: [], emConferencia: [], pendencias: [] });
  });

  it("ingrediente desativado conta como em conferência (e os alergênicos dele continuam)", async () => {
    const queijo = await ingrediente("Queijo");
    await marcar(queijo, ["leite"]);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: queijo, quantidade: "30" }]) });
    expect(f.resumo.alergenicos.situacao).toBe("conferido");
    await salvarIngrediente(db, gerente, { id: queijo, nome: (await db.selectFrom("ingrediente").select("nome").where("id", "=", queijo).executeTakeFirstOrThrow()).nome, area: "cozinha", ativo: false });
    const a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia.map((x) => x.ingredienteId)).toEqual([queijo]);
    expect(codigos(a.contem)).toEqual(["leite"]);
  });

  it("trocar o ingrediente na ficha muda o resultado sozinho", async () => {
    const paoComum = await ingrediente("Pão comum", "un");
    const paoSemGluten = await ingrediente("Pão sem glúten", "un");
    await marcar(paoComum, ["gluten"]);
    await marcar(paoSemGluten, [], ["gluten"]);
    const p = await produto();
    const v1 = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: paoComum, quantidade: "1" }]) });
    expect(codigos(v1.resumo.alergenicos.contem)).toEqual(["gluten"]);
    const v2 = await salvarFicha(db, gerente, { id: v1.resumo.id, versaoBase: 1, receita: receita([{ ingredienteId: paoSemGluten, quantidade: "1" }]) });
    expect(v2.resumo.alergenicos.contem).toEqual([]);
    expect(codigos(v2.resumo.alergenicos.tracos)).toEqual(["gluten"]);
  });

  it("ficha sem itens fica em conferência (nunca 'não contém')", async () => {
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([]) });
    expect(f.resumo.alergenicos.situacao).toBe("em_conferencia");
    expect(f.resumo.alergenicos.pendencias.join(" ")).toMatch(/nenhum item/);
  });
});

describe("alergênicos do produto (para o cardápio)", () => {
  it("usa a ficha do tamanho se houver, senão a do produto; sem ficha fica em conferência", async () => {
    const camarao = await ingrediente("Camarão");
    const peixe = await ingrediente("Tilápia");
    await marcar(camarao, ["crustaceos"]);
    await marcar(peixe, ["peixes"]);
    const p = await produto({ tamanhos: [{ nome: "Meia", acrescimoCentavos: 0 }, { nome: "Inteira", acrescimoCentavos: 1000 }] });
    const [meia, inteira] = [p.tamanhos[0]!.id, p.tamanhos[1]!.id];
    expect((await alergenicosDoProduto(db, p.id)).situacao).toBe("em_conferencia");
    expect((await alergenicosDoProduto(db, p.id)).pendencias).toEqual(["Este item ainda não tem ficha técnica."]);
    await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: peixe, quantidade: "200" }]) });
    await salvarFicha(db, gerente, { tipo: "tamanho", tamanhoId: inteira, receita: receita([{ ingredienteId: camarao, quantidade: "300" }]) });
    expect(codigos((await alergenicosDoProduto(db, p.id, inteira)).contem)).toEqual(["crustaceos"]);
    expect(codigos((await alergenicosDoProduto(db, p.id, meia)).contem)).toEqual(["peixes"]);
    expect(codigos((await alergenicosDoProduto(db, p.id)).contem)).toEqual(["peixes"]);
    const outro = await produto();
    expect((await erroDe(alergenicosDoProduto(db, outro.id, inteira))).codigo).toBe("nao_encontrado");
    expect((await erroDe(alergenicosDoProduto(db, 999_999))).codigo).toBe("nao_encontrado");
  });
});

describe("conferência que deixa de valer (revisão)", () => {
  it("desmarcou no ingrediente: sai do prato", async () => {
    const creme = await ingrediente("Creme");
    await marcar(creme, ["leite"], ["soja"]);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: creme, quantidade: "40" }]) });
    expect(codigos(f.resumo.alergenicos.contem)).toEqual(["leite"]);
    await marcar(creme, [], []);
    const a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a).toMatchObject({ situacao: "conferido", contem: [], tracos: [] });
  });

  it("tela desatualizada não grava por cima: conferência vista diferente da atual dá conflito", async () => {
    const x = await ingrediente("Mel");
    const telaA = await conferidoAgora(x); // nulo: nunca conferido
    await marcar(x, ["leite"]);
    const conflito = await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], conferidoEmVisto: telaA, catalogoVisto: await catalogoAgora() }));
    expect(conflito.codigo).toBe("conflito");
    expect(conflito.message).toBe("Outra pessoa mudou os alergênicos deste ingrediente. Abra de novo.");
    const visto = await conferidoAgora(x);
    expect((await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], conferidoEmVisto: "2001-01-01T00:00:00.000Z", catalogoVisto: await catalogoAgora() }))).codigo).toBe("conflito");
    expect((await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], catalogoVisto: await catalogoAgora() }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], conferidoEmVisto: visto }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], conferidoEmVisto: "ontem", catalogoVisto: await catalogoAgora() }))).codigo).toBe("dados_invalidos");
    // Nada mudou com as recusas; com a conferência certa, grava.
    expect((await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)!.alergenicos).toEqual([{ codigo: "leite", tipo: "contem" }]);
    expect((await salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], conferidoEmVisto: visto, catalogoVisto: await catalogoAgora() })).contem).toEqual([]);
  });

  it("duas gravações ao mesmo tempo no mesmo ingrediente: uma vence, a outra dá conflito, e o estado fica coerente", async () => {
    const x = await ingrediente("Margarina");
    await marcar(x, ["leite"]);
    const tela = await abrirTela(x);
    const gravacoes = () =>
      db
        .selectFrom("auditoria")
        .select((e) => e.fn.countAll<string>().as("n"))
        .where("alvo_tipo", "=", "ingrediente_alergenico")
        .where("alvo_id", "=", String(x))
        .where("resultado", "=", "permitido")
        .executeTakeFirstOrThrow();
    const audAntes = await gravacoes();
    const r = await Promise.allSettled([
      salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: ["soja"], tracos: [], ...tela }),
      salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: ["leite"], ...tela }),
    ]);
    const ok = r.filter((y): y is PromiseFulfilledResult<Awaited<ReturnType<typeof salvarAlergenicosDoIngrediente>>> => y.status === "fulfilled");
    const recusas = r.filter((y): y is PromiseRejectedResult => y.status === "rejected");
    expect(ok.length).toBe(1);
    expect(recusas.length).toBe(1);
    expect(recusas[0]!.reason).toBeInstanceOf(ErroDeRegra);
    expect((recusas[0]!.reason as ErroDeRegra).codigo).toBe("conflito");
    const vencedor = ok[0]!.value;
    const agora = (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)!;
    expect(agora.alergenicos).toEqual([
      ...vencedor.contem.map((codigo) => ({ codigo, tipo: "contem" })),
      ...vencedor.tracos.map((codigo) => ({ codigo, tipo: "tracos" })),
    ]);
    const ativas = await db.selectFrom("ingrediente_alergenico").select("alergenico_codigo").where("ingrediente_id", "=", x).where("ativo", "=", true).execute();
    expect(ativas.length).toBe(1);
    expect(Number((await gravacoes()).n) - Number(audAntes.n)).toBe(1);
  });

  it("trocar nome ou fornecedor do ingrediente zera a conferência (com registro); trocar a área, não", async () => {
    const x = await ingrediente("Chocolate em pó");
    await marcar(x, ["leite"]);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "10" }]) });
    expect(f.resumo.alergenicos.situacao).toBe("conferido");
    const atual = async () => (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)!;
    const antes = await atual();
    await salvarIngrediente(db, gerente, { id: x, nome: antes.nome, area: "cafeteria" });
    expect((await atual()).alergenicosConferidosEm).not.toBeNull();
    const novoNome = `${antes.nome} meio amargo`;
    await salvarIngrediente(db, gerente, { id: x, nome: novoNome, area: "cafeteria" });
    const depois = await atual();
    expect(depois.alergenicosConferidosEm).toBeNull();
    // As marcas ficam (para quem for conferir), mas o prato volta a "em conferência".
    expect(depois.alergenicos).toEqual([{ codigo: "leite", tipo: "contem" }]);
    const a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia).toEqual([{ ingredienteId: x, nome: novoNome, motivo: "ainda não conferido" }]);
    expect(codigos(a.contem)).toEqual(["leite"]);
    const aud = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "ingrediente").where("alvo_id", "=", String(x)).orderBy("id", "desc").executeTakeFirstOrThrow();
    expect((aud.detalhes as { alergenicosReabertos?: boolean }).alergenicosReabertos).toBe(true);
    // Trocar o fornecedor também reabre.
    await marcar(x, ["leite"]);
    const fornecedor = (await db.selectFrom("fornecedor").select("id").where("ativo", "=", true).orderBy("id").executeTakeFirstOrThrow()).id;
    await salvarIngrediente(db, gerente, { id: x, nome: novoNome, area: "cafeteria", fornecedorId: fornecedor });
    expect((await atual()).alergenicosConferidosEm).toBeNull();
  });

  it("alergênico novo ou reativado no catálogo reabre a conferência de quem foi conferido antes", async () => {
    const tahine = await ingrediente("Tahine");
    await marcar(tahine); // conferido: não contém nenhum
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: tahine, quantidade: "15" }]) });
    expect(f.resumo.alergenicos.situacao).toBe("conferido");
    const codigo = `sesamo_${sufixo}`;
    const nomeNovo = `Sésamo ${sufixo}`;
    await salvarAlergenico(db, gerente, { codigo, novo: true, nome: nomeNovo });
    let a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia).toEqual([{ ingredienteId: tahine, nome: expect.any(String), motivo: `conferido antes de ${nomeNovo} entrar na lista` }]);
    expect((await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === tahine)!.alergenicosNovosNaLista).toEqual([nomeNovo]);
    // Conferido de novo, agora com o sésamo: volta a conferido.
    await marcar(tahine, [codigo]);
    a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("conferido");
    expect(codigos(a.contem)).toEqual([codigo]);
    // Desativado: não pede conferência. Reativado: volta para a lista e reabre quem foi conferido antes.
    const outro = await ingrediente("Grão-de-bico");
    const g = await salvarFicha(db, gerente, { tipo: "produto", produtoId: (await produto()).id, receita: receita([{ ingredienteId: outro, quantidade: "100" }]) });
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
    await marcar(outro);
    expect((await verFicha(db, gerente, g.resumo.id)).resumo.alergenicos.situacao).toBe("conferido");
    await salvarAlergenico(db, gerente, { codigo, ativo: true });
    a = (await verFicha(db, gerente, g.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia[0]!.motivo).toBe(`conferido antes de ${nomeNovo} entrar na lista`);
    // O tahine também precisa conferir de novo (o sésamo voltou depois da conferência dele).
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("em_conferencia");
    // Não deixa o alergênico de teste ativo para os outros testes.
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
  });

  it("janela aberta com a lista antiga: alguém cadastra um alergênico, a conferência é recusada e o prato segue em conferência", async () => {
    const tahine = await ingrediente("Tahine B");
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: tahine, quantidade: "15" }]) });
    expect(f.resumo.alergenicos.situacao).toBe("em_conferencia");
    const telaDeB = await abrirTela(tahine); // B abre a janela do Tahine
    const codigo = `gergelim_b_${sufixo}`;
    await salvarAlergenico(db, gerente, { codigo, novo: true, nome: `Gergelim B ${sufixo}` }); // A cadastra
    const recusa = await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: tahine, contem: [], tracos: [], ...telaDeB })); // B: Conferido
    expect(recusa.codigo).toBe("conflito");
    expect(recusa.message).toBe("A lista de alergênicos mudou enquanto você conferia. Abra de novo.");
    const a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia.map((x) => x.ingredienteId)).toEqual([tahine]);
    expect((await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === tahine)!.alergenicosConferidosEm).toBeNull();
    // Aberta de novo (já com o gergelim na lista), a conferência passa.
    await marcar(tahine, [codigo]);
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("conferido");
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
  });

  it("janela aberta e alguém reativa um alergênico: a conferência é recusada", async () => {
    const codigo = `pimenta_b_${sufixo}`;
    await salvarAlergenico(db, gerente, { codigo, novo: true, nome: `Pimenta B ${sufixo}` });
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
    const x = await ingrediente("Molho B");
    await marcar(x, ["soja"]);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "20" }]) });
    expect(f.resumo.alergenicos.situacao).toBe("conferido");
    const telaDeB = await abrirTela(x);
    await salvarAlergenico(db, gerente, { codigo, ativo: true }); // A reativa
    // O prato já reabre (o alergênico voltou depois da conferência) e B não consegue conferir sem ver.
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("em_conferencia");
    const recusa = await erroDe(salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], ...telaDeB }));
    expect(recusa.codigo).toBe("conflito");
    expect(recusa.message).toBe("A lista de alergênicos mudou enquanto você conferia. Abra de novo.");
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("em_conferencia");
    expect((await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)!.alergenicos).toEqual([{ codigo: "soja", tipo: "contem" }]);
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
  });

  it("alergênico que entrou na lista e já saiu (desativado) não reabre a conferência", async () => {
    const x = await ingrediente("Arroz B");
    await marcar(x);
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "80" }]) });
    const codigo = `canela_b_${sufixo}`;
    await salvarAlergenico(db, gerente, { codigo, novo: true, nome: `Canela B ${sufixo}` });
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("em_conferencia");
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("conferido");
    expect((await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)!.alergenicosNovosNaLista).toEqual([]);
  });
});

/**
 * Segura uma transação aberta numa conexão SEPARADA (outra pessoa no meio de uma gravação).
 * `soltar(confirmar)` termina a transação e fecha a conexão; chame sempre num finally.
 */
async function outraTransacao(passos: (c: Banco) => Promise<void>): Promise<{ soltar: (confirmar: boolean) => Promise<void> }> {
  const outro = bancoDeTeste();
  let fim!: (confirmar: boolean) => void;
  const terminar = new Promise<boolean>((r) => (fim = r));
  let pronta!: (erro?: unknown) => void;
  const aberta = new Promise<unknown>((r) => (pronta = r));
  const tarefa = outro.connection().execute(async (c) => {
    await sql`BEGIN`.execute(c);
    try {
      await passos(c);
    } catch (e) {
      await sql`ROLLBACK`.execute(c);
      pronta(e);
      return;
    }
    pronta();
    await sql.raw((await terminar) ? "COMMIT" : "ROLLBACK").execute(c);
  });
  const erro = await aberta;
  let solta = false;
  const soltar = async (confirmar: boolean) => {
    if (solta) return;
    solta = true;
    fim(confirmar);
    await tarefa;
    await outro.destroy();
  };
  if (erro) {
    await soltar(false);
    throw erro;
  }
  return { soltar };
}

/** A promessa ainda não terminou depois de `ms` (está esperando uma trava). */
const aindaEsperando = async (p: Promise<unknown>, ms = 300) =>
  Promise.race([p.then(() => false, () => false), new Promise<boolean>((r) => setTimeout(() => r(true), ms))]);

describe("trava da lista de alergênicos (duas conexões, ordem forçada)", () => {
  it("quem cria vem primeiro: a conferência espera e, quando a criação confirma, dá conflito", async () => {
    const x = await ingrediente("Pasta A");
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "30" }]) });
    const tela = await abrirTela(x);
    const codigo = `trava_a_${sufixo}`;
    const criacao = await outraTransacao(async (c) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${TRAVA_DA_LISTA_DE_ALERGENICOS}))`.execute(c);
      await sql`INSERT INTO alergenico (codigo, nome, ativo) VALUES (${codigo}, ${`Trava A ${sufixo}`}, true)`.execute(c);
    });
    let conferencia: Promise<unknown> | undefined;
    try {
      conferencia = salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], ...tela });
      conferencia.catch(() => undefined);
      expect(await aindaEsperando(conferencia)).toBe(true);
    } finally {
      await criacao.soltar(true);
    }
    const recusa = await erroDe(conferencia!);
    expect(recusa.codigo).toBe("conflito");
    expect(recusa.message).toBe("A lista de alergênicos mudou enquanto você conferia. Abra de novo.");
    expect((await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos.situacao).toBe("em_conferencia");
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
  });

  it("quem confere vem primeiro: a criação espera e entra depois, reabrindo a conferência", async () => {
    const x = await ingrediente("Pasta B");
    const p = await produto();
    const f = await salvarFicha(db, gerente, { tipo: "produto", produtoId: p.id, receita: receita([{ ingredienteId: x, quantidade: "30" }]) });
    const tela = await abrirTela(x);
    const codigo = `trava_b_${sufixo}`;
    const nomeNovo = `Trava B ${sufixo}`;
    // Outra conexão segura o ingrediente: a conferência pega a trava da lista e para no FOR UPDATE.
    const segura = await outraTransacao(async (c) => {
      await sql`SELECT id FROM ingrediente WHERE id = ${x} FOR UPDATE`.execute(c);
    });
    let conferencia: Promise<unknown> | undefined;
    let criacao: Promise<unknown> | undefined;
    try {
      conferencia = salvarAlergenicosDoIngrediente(db, gerente, { ingredienteId: x, contem: [], tracos: [], ...tela });
      conferencia.catch(() => undefined);
      // Espera (sem adivinhar tempo) a conferência estar com a trava compartilhada da lista.
      for (let i = 0; ; i++) {
        const r = await sql<{ n: string }>`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND mode = 'ShareLock' AND granted`.execute(db);
        if (Number(r.rows[0]!.n) > 0) break;
        if (i > 200) throw new Error("a conferência não pegou a trava da lista");
        await new Promise((r) => setTimeout(r, 10));
      }
      criacao = salvarAlergenico(db, gerente, { codigo, novo: true, nome: nomeNovo });
      criacao.catch(() => undefined);
      expect(await aindaEsperando(criacao)).toBe(true);
      expect(await aindaEsperando(conferencia, 50)).toBe(true);
    } finally {
      await segura.soltar(false);
    }
    await conferencia;
    await criacao;
    const a = (await verFicha(db, gerente, f.resumo.id)).resumo.alergenicos;
    expect(a.situacao).toBe("em_conferencia");
    expect(a.emConferencia).toEqual([{ ingredienteId: x, nome: expect.any(String), motivo: `conferido antes de ${nomeNovo} entrar na lista` }]);
    await salvarAlergenico(db, gerente, { codigo, ativo: false });
  });
});
