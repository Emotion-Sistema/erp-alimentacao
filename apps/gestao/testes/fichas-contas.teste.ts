/** Funções puras da tela de fichas técnicas (apps/gestao/app/cadastros/fichas/contas.ts). Sem banco, sem float. */
import { describe, expect, it } from "vitest";
import { escalarQuantidade } from "@erp/dominio/fichas";
import {
  inteiroDoCampo,
  pbDoTexto,
  quantidadeAmigavel,
  quantidadeLegivel,
  quantidadeNaBase,
  quantidadeParaCampo,
  textoDoPb,
  unidadesParaDigitar,
  vezesDoTexto,
} from "../app/cadastros/fichas/contas";

describe("quantidade digitada vira a unidade da ficha (exata)", () => {
  it("kg e L viram g e ml; g, ml e un ficam", () => {
    expect(quantidadeNaBase("1", "kg")).toBe("1000");
    expect(quantidadeNaBase("1,5", "kg")).toBe("1500");
    expect(quantidadeNaBase("0,001", "L")).toBe("1");
    expect(quantidadeNaBase("0,0001", "kg")).toBe("0.1");
    expect(quantidadeNaBase("20,5", "g")).toBe("20.5");
    expect(quantidadeNaBase("2", "un")).toBe("2");
    // 0,1 + 0,2 em float daria 0,30000000000000004; aqui é texto e fração.
    expect(quantidadeNaBase("0.3", "ml")).toBe("0.3");
  });

  it("recusa o que não é número maior que zero, ou que passaria de 4 casas (nunca arredonda escondido)", () => {
    for (const t of ["", "abc", "0", "0,0", "-1", "1e3", "1,2,3", "1.000,5"]) expect(quantidadeNaBase(t, "g"), t).toBeNull();
    expect(quantidadeNaBase("0,00001", "g")).toBeNull();
    expect(quantidadeNaBase("0,0000001", "kg")).toBe("0.0001");
    expect(quantidadeNaBase("0,00001", "un")).toBeNull();
    expect(quantidadeNaBase("12345678901", "g")).toBeNull();
    // 10 dígitos em kg viram 13 em g: passa do que o servidor guarda.
    expect(quantidadeNaBase("9999999999", "kg")).toBeNull();
  });

  it("unidades que a pessoa pode escolher", () => {
    expect(unidadesParaDigitar("g")).toEqual(["g", "kg"]);
    expect(unidadesParaDigitar("ml")).toEqual(["ml", "L"]);
    expect(unidadesParaDigitar("un")).toEqual(["un"]);
  });
});

describe("mostrar quantidades", () => {
  it("formato brasileiro e unidade maior quando fica mais fácil", () => {
    expect(quantidadeParaCampo("20.5")).toBe("20,5");
    expect(quantidadeParaCampo(null)).toBe("");
    expect(quantidadeLegivel("1500", "g")).toBe("1.500 g");
    expect(quantidadeAmigavel("1500", "g")).toBe("1,5 kg");
    expect(quantidadeAmigavel("1000", "ml")).toBe("1 L");
    expect(quantidadeAmigavel("300", "g")).toBe("300 g");
    expect(quantidadeAmigavel("2500", "un")).toBe("2.500 un");
  });

  it("fazer 2x ou 1,5x multiplica exato", () => {
    expect(vezesDoTexto("2")).toBe("2");
    expect(vezesDoTexto("1,5")).toBe("1.5");
    expect(vezesDoTexto("3x")).toBe("3");
    for (const t of ["0", "", "101", "abc", "1,555"]) expect(vezesDoTexto(t), t).toBeNull();
    expect(escalarQuantidade("20.5", vezesDoTexto("3")!)).toBe("61.5");
    expect(escalarQuantidade("0.1", vezesDoTexto("3")!)).toBe("0.3");
  });
});

describe("percentual e números inteiros", () => {
  it("pontos-base de ida e volta", () => {
    expect(textoDoPb(3125)).toBe("31,25%");
    expect(textoDoPb(3500)).toBe("35%");
    expect(textoDoPb(3550)).toBe("35,5%");
    expect(pbDoTexto("35")).toBe(3500);
    expect(pbDoTexto("32,5")).toBe(3250);
    expect(pbDoTexto("32,55 %")).toBe(3255);
    for (const t of ["0", "0,5", "101", "35,555", "abc", ""]) expect(pbDoTexto(t), t).toBeNull();
    expect(pbDoTexto("100")).toBe(10_000);
    expect(pbDoTexto("1")).toBe(100);
  });

  it("inteiro do campo: vazio é nulo, inválido é undefined", () => {
    expect(inteiroDoCampo("", 0, 10)).toBeNull();
    expect(inteiroDoCampo("7", 0, 10)).toBe(7);
    expect(inteiroDoCampo("11", 0, 10)).toBeUndefined();
    expect(inteiroDoCampo("1,5", 0, 10)).toBeUndefined();
  });
});
