/**
 * Cadastro rápido (ideia nº 4) contra PostgreSQL real: todo item do catálogo passa pela regra
 * de conversão do banco; lista colada é entendida linha a linha; lote é tudo ou nada; consulta
 * do CNPJ só preenche e nunca devolve sócios.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  buscarNoCatalogo,
  cadastrarEmLote,
  CATALOGO_INGREDIENTES,
  catalogoParaCadastrar,
  consultarCnpj,
  converterParaBase,
  ErroDeRegra,
  lerListaColada,
  listarIngredientes,
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

describe("catálogo pronto", () => {
  it("cada item do catálogo é aceito pela regra do banco (unidade, área, embalagens)", async () => {
    const nomes = new Set<string>();
    for (const c of CATALOGO_INGREDIENTES) {
      expect(nomes.has(c.nome), `repetido: ${c.nome}`).toBe(false);
      nomes.add(c.nome);
    }
    // Grava tudo numa transação e desfaz no fim (não suja o banco de testes).
    await db
      .transaction()
      .execute(async (trx) => {
        for (const c of CATALOGO_INGREDIENTES) {
          const ing = await trx
            .insertInto("ingrediente")
            .values({ nome: `${c.nome} cat ${sufixo}`, unidade_base: c.unidadeBase, area_estoque: c.area })
            .returning("id")
            .executeTakeFirstOrThrow();
          for (const [nome, q] of c.embalagens) {
            await trx
              .insertInto("ingrediente_conversao")
              .values({ ingrediente_id: ing.id, nome, quantidade_base: q })
              .execute()
              .catch((e) => {
                throw new Error(`${c.nome} / ${nome} = ${q}: ${(e as Error).message}`);
              });
          }
        }
        throw new Error("desfazer");
      })
      .catch((e) => {
        if ((e as Error).message !== "desfazer") throw e;
      });
  });

  it("busca por nome, sinônimo e sem acento", () => {
    expect(buscarNoCatalogo("mussarela")[0]?.nome).toBe("Queijo muçarela");
    expect(buscarNoCatalogo("acucar").map((c) => c.nome)).toContain("Açúcar refinado");
    expect(buscarNoCatalogo("lei")[0]?.nome).toMatch(/^Leite/);
    expect(buscarNoCatalogo("x")).toEqual([]);
  });

  it("a tela recebe o catálogo marcando o que já está cadastrado; quem só vê não recebe", async () => {
    await cadastrarEmLote(db, gerente, [{ nome: n("Tomate"), unidadeBase: "g", area: "cozinha" }]);
    const cat = await catalogoParaCadastrar(db, gerente);
    expect(cat.itens.length).toBe(CATALOGO_INGREDIENTES.length);
    expect(cat.jaCadastrados).toContain(n("Tomate"));
    const cozinheira = await atorDoCargo(db, "cozinheira");
    expect((await erroDe(catalogoParaCadastrar(db, cozinheira))).codigo).toBe("sem_permissao");
  });
});

describe("lista colada", () => {
  const ler = (t: string, ja: string[] = []) => lerListaColada(t, ja);

  it("entende os jeitos comuns de escrever", () => {
    const l = ler(
      [
        "Farinha de trigo - saco 25 kg",
        "Ovo; caixa com 30",
        "• Leite integral | fardo 12 l",
        "Refrigerante lata: fardo 12 latas",
        "Queijo muçarela 4kg",
        "1. Cebola",
        "Molho especial da casa - pote 2,5 kg",
        "Suco de caju; fardo 6 x 1 l",
      ].join("\n"),
    );
    const por = (nome: string) => l.find((x) => x.nome === nome)!;
    expect(por("Farinha de trigo")).toMatchObject({ unidadeBase: "g", area: "cozinha", situacao: "pronto", catalogo: "Farinha de trigo" });
    expect(por("Farinha de trigo").embalagens[0]).toEqual({ nome: "saco 25 kg", quantidadeBase: "25000", doCatalogo: false });
    expect(por("Ovo").embalagens[0]).toMatchObject({ nome: "caixa 30 un", quantidadeBase: "30" });
    expect(por("Leite integral")).toMatchObject({ unidadeBase: "ml", area: "cafeteria" });
    expect(por("Leite integral").embalagens.filter((e) => e.nome === "fardo 12 l")).toHaveLength(1);
    expect(por("Refrigerante lata").embalagens[0]).toMatchObject({ nome: "fardo 12 un", quantidadeBase: "12" });
    expect(por("Queijo muçarela").embalagens[0]).toMatchObject({ nome: "4 kg", quantidadeBase: "4000" });
    expect(por("Cebola")).toMatchObject({ unidadeBase: "g", situacao: "pronto" });
    // Fora do catálogo: unidade vem da embalagem; área fica como cozinha e pede conferência.
    expect(por("Molho especial da casa")).toMatchObject({ unidadeBase: "g", situacao: "conferir" });
    expect(por("Molho especial da casa").embalagens[0]).toMatchObject({ nome: "pote 2,5 kg", quantidadeBase: "2500" });
    expect(por("Suco de caju").embalagens[0]).toMatchObject({ nome: "fardo 6 l", quantidadeBase: "6000" });
  });

  it("aponta o que falta e o que está errado, sem chutar", () => {
    const l = ler("Xarope misterioso\nTomate\nTomate\nLimão - saco 3 kg\nAzeite - garrafa ???\n\n   \nPão de forma", ["pão de forma"]);
    expect(l.find((x) => x.nome === "Xarope misterioso")).toMatchObject({ situacao: "erro" });
    expect(l.find((x) => x.nome === "Xarope misterioso")!.erros.join()).toContain("g, ml ou un");
    expect(l.filter((x) => x.nome === "Tomate")[1]!.erros.join()).toContain("Repetido");
    const limao = l.find((x) => x.nome === "Limão")!;
    expect(limao.situacao).toBe("conferir");
    expect(limao.embalagens[0]).toMatchObject({ nome: "saco 3 kg", quantidadeBase: null });
    expect(l.find((x) => x.nome.startsWith("Azeite"))!.situacao).toBe("erro");
    expect(l.find((x) => x.nome === "Pão de forma")!.erros.join()).toContain("Já está cadastrado");
    expect(l.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 8]);
  });

  it("decimal exato e limite de linhas", () => {
    expect(ler("Molho X - balde 0,3 kg")[0]!.embalagens[0]!.quantidadeBase).toBe("300");
    expect(ler("Molho Y - fardo 3 x 0,1 l")[0]!.embalagens[0]!.quantidadeBase).toBe("300");
    const muitas = Array.from({ length: 305 }, (_, k) => `Item ${k} - pacote 1 kg`).join("\n");
    const r = ler(muitas);
    expect(r).toHaveLength(301);
    expect(r[300]!.erros.join()).toContain("no máximo 300");
  });

  it("o que a prévia diz que está pronto é aceito pelo banco", async () => {
    const l = ler(`Farinha especial ${sufixo} - saco 25 kg\nOvo caipira ${sufixo}; caixa com 30\nSuco de uva ${sufixo} - fardo 6 x 1,5 l`);
    expect(l.every((x) => x.situacao !== "erro")).toBe(true);
    const r = await cadastrarEmLote(
      db,
      gerente,
      l.map((x) => ({ nome: x.nome, unidadeBase: x.unidadeBase, area: x.area, embalagens: x.embalagens.map((e) => ({ nome: e.nome, quantidadeBase: e.quantidadeBase })) })),
    );
    expect(r.criados).toBe(3);
    expect(await converterParaBase(db, r.ids[2]!, "1", "fardo 9 l")).toBe("9000");
  });
});

describe("gravar em lote", () => {
  it("tudo ou nada: um item ruim e nenhum é gravado, com o nome do item na mensagem", async () => {
    const e = await erroDe(
      cadastrarEmLote(db, gerente, [
        { nome: n("Bom 1"), unidadeBase: "g", area: "cozinha", embalagens: [{ nome: "saco 5 kg", quantidadeBase: "5000" }] },
        { nome: n("Ruim"), unidadeBase: "g", area: "cozinha", embalagens: [{ nome: "kg", quantidadeBase: "900" }] },
      ]),
    );
    expect(e.message).toContain(n("Ruim"));
    expect(e.message).toContain("Nada foi gravado");
    const lista = await listarIngredientes(db, gerente);
    expect(lista.ingredientes.some((x) => x.nome === n("Bom 1"))).toBe(false);
  });

  it("recusa nome repetido na lista ou já cadastrado, lista vazia e lote grande demais", async () => {
    expect((await erroDe(cadastrarEmLote(db, gerente, [{ nome: n("Dup"), unidadeBase: "g", area: "cozinha" }, { nome: n("dup"), unidadeBase: "g", area: "cozinha" }]))).message).toContain("duas vezes");
    await cadastrarEmLote(db, gerente, [{ nome: n("Existe"), unidadeBase: "g", area: "cozinha" }]);
    expect((await erroDe(cadastrarEmLote(db, gerente, [{ nome: n("Existe"), unidadeBase: "g", area: "cozinha" }]))).message).toContain("já existe");
    expect((await erroDe(cadastrarEmLote(db, gerente, []))).codigo).toBe("dados_invalidos");
    const grande = Array.from({ length: 301 }, (_, k) => ({ nome: n(`G${k}`), unidadeBase: "g", area: "cozinha" }));
    expect((await erroDe(cadastrarEmLote(db, gerente, grande))).codigo).toBe("dados_invalidos");
  });

  it("cada item gravado fica na auditoria; sem permissão é recusado", async () => {
    const r = await cadastrarEmLote(db, gerente, [{ nome: n("Auditado"), unidadeBase: "ml", area: "cafeteria", embalagens: [{ nome: "garrafa 1 l", quantidadeBase: "1000" }] }]);
    const a = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "ingrediente").where("alvo_id", "=", String(r.ids[0])).executeTakeFirstOrThrow();
    expect(a.detalhes).toMatchObject({ operacao: "criar_em_lote" });
    const supervisor = await atorDoCargo(db, "supervisor");
    expect((await erroDe(cadastrarEmLote(db, supervisor, [{ nome: n("Não"), unidadeBase: "g", area: "cozinha" }]))).codigo).toBe("sem_permissao");
  });
});

describe("consulta do CNPJ", () => {
  const resposta = (status: number, corpo: unknown) => async () => ({ status, json: async () => corpo });
  const exemplo = {
    cnpj: "11222333000181",
    razao_social: "EMPRESA FICTICIA DE ALIMENTOS LTDA",
    nome_fantasia: "ATACADO FICTICIO",
    descricao_situacao_cadastral: "ATIVA",
    descricao_tipo_de_logradouro: "RUA",
    logradouro: "DAS FLORES",
    numero: "100",
    complemento: null,
    bairro: "CENTRO",
    municipio: "JUIZ DE FORA",
    uf: "MG",
    cep: "36010000",
    ddd_telefone_1: "3233334444",
    email: "CONTATO@EXEMPLO.COM",
    qsa: [{ nome_socio: "PESSOA FICTICIA", cnpj_cpf_do_socio: "***123456**" }],
  };

  it("preenche nome, situação e endereço; nunca devolve sócios", async () => {
    const d = await consultarCnpj(db, gerente, "11.222.333/0001-81", resposta(200, exemplo));
    expect(d).toEqual({
      cnpj: "11222333000181",
      razaoSocial: "EMPRESA FICTICIA DE ALIMENTOS LTDA",
      nomeFantasia: "ATACADO FICTICIO",
      situacao: "ATIVA",
      ativa: true,
      endereco: "RUA DAS FLORES, 100 - CENTRO - JUIZ DE FORA/MG - CEP 36010-000",
      telefone: "3233334444",
      email: "contato@exemplo.com",
    });
    expect(JSON.stringify(d)).not.toContain("PESSOA");
  });

  it("CNPJ inválido nem consulta; não encontrado, fora do ar e resposta estranha viram mensagem", async () => {
    let chamou = false;
    const espia = async () => {
      chamou = true;
      return { status: 200, json: async () => exemplo };
    };
    expect((await erroDe(consultarCnpj(db, gerente, "11.222.333/0001-82", espia))).codigo).toBe("dados_invalidos");
    expect(chamou).toBe(false);
    expect((await erroDe(consultarCnpj(db, gerente, "11222333000181", resposta(404, {})))).codigo).toBe("nao_encontrado");
    expect((await erroDe(consultarCnpj(db, gerente, "11222333000181", resposta(500, {})))).message).toContain("Preencha à mão");
    expect((await erroDe(consultarCnpj(db, gerente, "11222333000181", resposta(200, { nada: 1 })))).message).toContain("Preencha à mão");
    const cai = async () => {
      throw new Error("rede");
    };
    expect((await erroDe(consultarCnpj(db, gerente, "11222333000181", cai))).message).toContain("Preencha à mão");
  });

  it("só quem gerencia cadastros consulta", async () => {
    const cozinheira = await atorDoCargo(db, "cozinheira");
    expect((await erroDe(consultarCnpj(db, cozinheira, "11222333000181", resposta(200, exemplo)))).codigo).toBe("sem_permissao");
  });
});

describe("endereço do fornecedor", () => {
  it("a coluna existe e aceita até 300 caracteres", async () => {
    await expect(sql`SELECT endereco FROM fornecedor LIMIT 1`.execute(db)).resolves.toBeTruthy();
  });
});
