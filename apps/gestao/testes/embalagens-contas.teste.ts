/** Funções puras do catálogo de embalagens (apps/gestao/app/cadastros/embalagens/contas.ts). */
import { describe, expect, it } from "vitest";
import type { UnidadePadrao } from "../app/cadastros/auxiliares";
import {
  agruparPorTipo,
  ajustarLinhasParaBase,
  casaComBusca,
  compararDecimal,
  contaDoModelo,
  contarParaFiltros,
  FILTROS_VAZIOS,
  filtrarModelos,
  medidaDoModelo,
  nomeDoModeloParaMostrar,
  nomeDoRascunho,
  nomeParaMostrar,
  perguntaDaQuantidade,
  plural,
  problemaDoRascunho,
  procurarIgual,
  quantidadeDigitada,
  quantidadePeloNome,
  rascunhoDaBusca,
  resumoDasEmbalagens,
  sugerirModelos,
  tamanhoNormalizado,
  trechosComRealce,
  type ModeloDeEmbalagem,
} from "../app/cadastros/embalagens/contas";

const U = (codigo: string, nome: string, grandeza: string, fator: string): UnidadePadrao => ({ codigo, nome, grandeza, fator });
// Como vem do servidor (fator sem zeros à direita).
const UNIDADES: UnidadePadrao[] = [
  U("mg", "miligrama", "massa", "0.001"),
  U("g", "grama", "massa", "1"),
  U("kg", "quilograma", "massa", "1000"),
  U("t", "tonelada", "massa", "1000000"),
  U("ml", "mililitro", "volume", "1"),
  U("cl", "centilitro", "volume", "10"),
  U("dl", "decilitro", "volume", "100"),
  U("l", "litro", "volume", "1000"),
  U("un", "unidade", "contagem", "1"),
  U("dz", "dúzia", "contagem", "12"),
];

let id = 0;
function M(tipo: string, tamanho: string | null, unidade: string | null, extra: Partial<ModeloDeEmbalagem> = {}): ModeloDeEmbalagem {
  const nome = tamanho ? `${tipo} ${tamanho.replace(".", ",")} ${unidade}` : tipo;
  return { id: ++id, tipo, tamanho, unidade, nome, fornecedorId: null, fornecedor: null, ativo: true, emUso: 0, ...extra };
}

describe("nomes para mostrar", () => {
  it("tipo com maiúscula, vírgula no decimal e L para litro", () => {
    expect(nomeDoModeloParaMostrar({ tipo: "saco", tamanho: "25", unidade: "kg" })).toBe("Saco 25 kg");
    expect(nomeDoModeloParaMostrar({ tipo: "galão", tamanho: "2.5", unidade: "l" })).toBe("Galão 2,5 L");
    expect(nomeDoModeloParaMostrar({ tipo: "caixa", tamanho: null, unidade: null })).toBe("Caixa");
    expect(nomeParaMostrar("galão 5 l")).toBe("Galão 5 L");
    expect(nomeParaMostrar("caixa 12 L")).toBe("Caixa 12 L");
    expect(nomeParaMostrar("lata 350 ml")).toBe("Lata 350 ml");
  });

  it("plural do corredor", () => {
    expect(["saco", "galão", "pote", "barril", "tonel", "saquinho", "bisnaga", "engradado", "flor"].map(plural)).toEqual([
      "Sacos",
      "Galões",
      "Potes",
      "Barris",
      "Tonéis",
      "Saquinhos",
      "Bisnagas",
      "Engradados",
      "Flores",
    ]);
  });

  it("resumo do bloco recolhido", () => {
    expect(resumoDasEmbalagens([])).toBe("Nenhuma");
    expect(resumoDasEmbalagens(["saco 25 kg"])).toBe("1 embalagem: Saco 25 kg");
    expect(resumoDasEmbalagens(["saco 25 kg", "caixa 12 un"])).toBe("2 embalagens: Saco 25 kg, Caixa 12 un");
    expect(resumoDasEmbalagens(["a", "b", "c", "d", "e"])).toBe("5 embalagens: A, B, C e mais 2");
  });

  it("nenhum texto usa o ponto do meio", () => {
    expect(resumoDasEmbalagens(["saco 25 kg", "caixa"])).not.toMatch(/·/);
  });
});

describe("busca com realce", () => {
  it("acha sem acento e devolve o texto original cortado", () => {
    expect(trechosComRealce("Galão 5 L", "galao")).toEqual([
      { texto: "Galão", achado: true },
      { texto: " 5 L", achado: false },
    ]);
    expect(trechosComRealce("Saco 2,5 kg", "2.5")).toEqual([
      { texto: "Saco ", achado: false },
      { texto: "2,5", achado: true },
      { texto: " kg", achado: false },
    ]);
    expect(trechosComRealce("Caixa", "")).toEqual([{ texto: "Caixa", achado: false }]);
    // Várias ocorrências.
    expect(trechosComRealce("aXa", "a").filter((p) => p.achado)).toHaveLength(2);
  });

  it("procura no nome, no tamanho junto ou separado e no fornecedor", () => {
    const m = M("saco", "25", "kg", { fornecedorId: 1, fornecedor: "Atacado Exemplo" });
    expect(casaComBusca(m, "25 kg")).toBe(true);
    expect(casaComBusca(m, "25kg")).toBe(true);
    expect(casaComBusca(m, "atacado")).toBe(true);
    expect(casaComBusca(m, "galão")).toBe(false);
  });
});

describe("conta exata (igual ao servidor)", () => {
  it("mesma família faz a conta; outra família ou sem tamanho pede a quantidade", () => {
    expect(contaDoModelo({ tamanho: "25", unidade: "kg" }, "g", UNIDADES)).toBe("25000");
    expect(contaDoModelo({ tamanho: "2.5", unidade: "l" }, "ml", UNIDADES)).toBe("2500");
    expect(contaDoModelo({ tamanho: "2", unidade: "dz" }, "un", UNIDADES)).toBe("24");
    expect(contaDoModelo({ tamanho: "500", unidade: "mg" }, "g", UNIDADES)).toBe("0.5");
    expect(contaDoModelo({ tamanho: "12", unidade: "un" }, "g", UNIDADES)).toBeNull();
    expect(contaDoModelo({ tamanho: null, unidade: null }, "un", UNIDADES)).toBeNull();
    // Sem float: 0,1 + 0,2 não vira 0,30000000000000004.
    expect(contaDoModelo({ tamanho: "0.3", unidade: "kg" }, "g", UNIDADES)).toBe("300");
  });

  it("quantidade pelo nome da embalagem já colocada", () => {
    expect(quantidadePeloNome("saco 25 kg", "g", UNIDADES)).toBe("25000");
    expect(quantidadePeloNome("caixa 12 L", "ml", UNIDADES)).toBe("12000");
    expect(quantidadePeloNome("pacote 2,5 kg", "g", UNIDADES)).toBe("2500");
    expect(quantidadePeloNome("saco 3 kg", "un", UNIDADES)).toBeNull();
    expect(quantidadePeloNome("caixa", "un", UNIDADES)).toBeNull();
  });

  it("quantidade digitada aceita vírgula e recusa zero e texto", () => {
    expect(quantidadeDigitada("12,5")).toBe("12.5");
    expect(quantidadeDigitada("40")).toBe("40");
    expect(quantidadeDigitada("0")).toBeNull();
    expect(quantidadeDigitada("doze")).toBeNull();
    expect(quantidadeDigitada("")).toBeNull();
  });

  it("pergunta igual à do servidor", () => {
    expect(perguntaDaQuantidade("g", "caixa 12 un")).toBe("Quantos gramas (g) vêm em 1 caixa 12 un?");
    expect(perguntaDaQuantidade("un", "saco 3 kg")).toBe("Quantas unidades (un) vêm em 1 saco 3 kg?");
  });

  it("trocar a unidade do estoque de família refaz a conta pelo nome e esvazia as digitadas", () => {
    const linhas = [
      { chave: 1, nome: "saco 25 kg", quantidade: "25000" },
      { chave: 2, nome: "caixa", quantidade: "30" },
      { chave: 3, nome: "caixa 12 un", quantidade: "12" },
    ];
    expect(ajustarLinhasParaBase(linhas, "g", "g", UNIDADES)).toBe(linhas);
    expect(ajustarLinhasParaBase(linhas, "un", "g", UNIDADES).map((l) => l.quantidade)).toEqual(["25000", "", ""]);
    expect(ajustarLinhasParaBase(linhas, "g", "un", UNIDADES).map((l) => l.quantidade)).toEqual(["", "", "12"]);
  });

  it("compara decimais sem float", () => {
    expect(compararDecimal("2.5", "25")).toBe(-1);
    expect(compararDecimal("1000", "999.9999")).toBe(1);
    expect(compararDecimal("1.50", "1.5")).toBe(0);
  });
});

describe("rascunho do painel", () => {
  it("normaliza o tamanho como o banco", () => {
    expect(tamanhoNormalizado("25,50")).toBe("25.5");
    expect(tamanhoNormalizado("007")).toBe("7");
    expect(tamanhoNormalizado("")).toBe("");
    expect(tamanhoNormalizado("0")).toBeNull();
    expect(tamanhoNormalizado("1,23456")).toBeNull();
    expect(tamanhoNormalizado("abc")).toBeNull();
    expect(nomeDoRascunho({ tipo: "  Galão ", tamanho: "2,50", unidade: "l" })).toBe("galão 2,5 l");
    expect(nomeDoRascunho({ tipo: "caixa", tamanho: "", unidade: "kg" })).toBe("caixa");
  });

  it("explica o que falta em linguagem simples", () => {
    const r = { tipo: "saco", tamanho: "25", unidade: "kg", fornecedorId: null };
    expect(problemaDoRascunho(r, UNIDADES)).toBeNull();
    expect(problemaDoRascunho({ ...r, tipo: "" }, UNIDADES)).toMatch(/Escolha o tipo/);
    expect(problemaDoRascunho({ ...r, tipo: "saco25" }, UNIDADES)).toMatch(/só a palavra/);
    expect(problemaDoRascunho({ ...r, tipo: "litro" }, UNIDADES)).toMatch(/é uma unidade/);
    expect(problemaDoRascunho({ ...r, tipo: "kg" }, UNIDADES)).toMatch(/é uma unidade/);
    expect(problemaDoRascunho({ ...r, tamanho: "2,55555" }, UNIDADES)).toMatch(/Confira o tamanho/);
    expect(problemaDoRascunho({ ...r, tipo: "x" }, UNIDADES)).toMatch(/2 letras/);
  });

  it("acha igual no mesmo fornecedor, a desativada e a geral", () => {
    const geral = M("saco", "25", "kg");
    const doAtacado = M("saco", "25", "kg", { fornecedorId: 1, fornecedor: "Atacado" });
    const desativada = M("saco", "30", "kg", { ativo: false });
    const modelos = [geral, doAtacado, desativada];
    expect(procurarIgual({ tipo: "Saco", tamanho: "25,0", unidade: "kg", fornecedorId: null }, modelos).ativa).toBe(geral);
    expect(procurarIgual({ tipo: "saco", tamanho: "25", unidade: "kg", fornecedorId: 1 }, modelos).ativa).toBe(doAtacado);
    const paraOutro = procurarIgual({ tipo: "saco", tamanho: "25", unidade: "kg", fornecedorId: 2 }, modelos);
    expect(paraOutro.ativa).toBeNull();
    expect(paraOutro.geral).toBe(geral);
    expect(procurarIgual({ tipo: "saco", tamanho: "30", unidade: "kg", fornecedorId: null }, modelos).desativada).toBe(desativada);
    // Ao editar, ela mesma não conta como repetida.
    expect(procurarIgual({ tipo: "saco", tamanho: "25", unidade: "kg", fornecedorId: null }, modelos, geral.id).ativa).toBeNull();
  });

  it("lê a busca como embalagem nova", () => {
    expect(rascunhoDaBusca("saco 30 kg", UNIDADES)).toEqual({ tipo: "saco", tamanho: "30", unidade: "kg", fornecedorId: null });
    expect(rascunhoDaBusca("balde 3,5 l", UNIDADES)).toMatchObject({ tipo: "balde", tamanho: "3,5", unidade: "l" });
    expect(rascunhoDaBusca("tonel", UNIDADES)).toMatchObject({ tipo: "tonel", tamanho: "" });
    expect(rascunhoDaBusca("saco 30 xícaras", UNIDADES)).toBeNull();
    expect(rascunhoDaBusca("30 kg", UNIDADES)).toBeNull();
    expect(rascunhoDaBusca("kg", UNIDADES)).toBeNull();
  });
});

describe("filtros, contadores e corredores", () => {
  const atacado = { fornecedorId: 7, fornecedor: "Atacado" };
  const modelos = [M("saco", "25", "kg"), M("saco", "5", "kg", atacado), M("caixa", "12", "un"), M("caixa", null, null), M("galão", "5", "l")];

  it("filtra por tipo, fornecedor e medida, junto com a busca", () => {
    expect(filtrarModelos(modelos, { ...FILTROS_VAZIOS, tipo: "saco" }, "", UNIDADES)).toHaveLength(2);
    expect(filtrarModelos(modelos, { ...FILTROS_VAZIOS, fornecedor: "qualquer" }, "", UNIDADES)).toHaveLength(4);
    expect(filtrarModelos(modelos, { ...FILTROS_VAZIOS, fornecedor: 7 }, "", UNIDADES)).toHaveLength(1);
    expect(filtrarModelos(modelos, { ...FILTROS_VAZIOS, medida: "sem-tamanho" }, "", UNIDADES)).toHaveLength(1);
    expect(filtrarModelos(modelos, { ...FILTROS_VAZIOS, medida: "peso" }, "25", UNIDADES)).toHaveLength(1);
    expect(medidaDoModelo({ unidade: "l" }, UNIDADES)).toBe("volume");
  });

  it("contadores de cada chip mantêm os outros filtros", () => {
    const c = contarParaFiltros(modelos, { ...FILTROS_VAZIOS, tipo: "saco" }, "", UNIDADES);
    expect(c.tipo.get("")).toBe(5);
    expect(c.tipo.get("caixa")).toBe(2);
    expect(c.fornecedor.get("")).toBe(2);
    expect(c.fornecedor.get("qualquer")).toBe(1);
    expect(c.fornecedor.get("7")).toBe(1);
    expect(c.medida.get("peso")).toBe(2);
    expect(c.medida.get("volume")).toBeUndefined();
  });

  it("corredores na ordem comum e tamanhos crescentes (sem tamanho primeiro)", () => {
    const g = agruparPorTipo(modelos, UNIDADES);
    expect(g.map((x) => x.tipo)).toEqual(["saco", "caixa", "galão"]);
    expect(g[0]!.modelos.map((m) => m.tamanho)).toEqual(["5", "25"]);
    expect(g[1]!.modelos.map((m) => m.tamanho)).toEqual([null, "12"]);
  });
});

describe("sugestões no ingrediente", () => {
  it("padrão do fornecedor primeiro, depois as mais usadas, depois a mesma família", () => {
    const doFornecedor = M("caixa", "12", "un", { fornecedorId: 3, fornecedor: "Laticínios" });
    const usada = M("pacote", "1", "kg", { emUso: 4 });
    const poucoUsada = M("saco", "25", "kg", { emUso: 1 });
    const familia = M("saco", "5", "kg");
    const outraFamilia = M("galão", "5", "l");
    const deOutroFornecedor = M("saco", "50", "kg", { fornecedorId: 9, fornecedor: "Outro" });
    const desativada = M("saco", "2", "kg", { ativo: false });
    const s = sugerirModelos([familia, outraFamilia, poucoUsada, usada, doFornecedor, deOutroFornecedor, desativada], {
      fornecedorId: 3,
      base: "g",
      unidades: UNIDADES,
    });
    expect(s.map((x) => [x.modelo.id, x.motivo])).toEqual([
      [doFornecedor.id, "fornecedor"],
      [usada.id, "mais-usada"],
      [poucoUsada.id, "mais-usada"],
      [familia.id, "mesma-familia"],
    ]);
  });
});
