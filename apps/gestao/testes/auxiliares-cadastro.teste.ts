/** Funções puras das telas de cadastro rápido: máscaras e a conta da embalagem de um toque. */
import { describe, expect, it } from "vitest";
import { documentoValido } from "@erp/dominio";
import {
  cnpjValido,
  digitarComMascara,
  mascararDocumento,
  mascararTelefone,
  montarEmbalagem,
  multiplicarDecimal,
  type UnidadePadrao,
} from "../app/cadastros/auxiliares";

const U = (codigo: string, grandeza: string, fator: string): UnidadePadrao => ({ codigo, nome: codigo, grandeza, fator });
const kg = U("kg", "massa", "1000");
const g = U("g", "massa", "1");
const l = U("l", "volume", "1000");
const dz = U("dz", "contagem", "12");
const un = U("un", "contagem", "1");

describe("embalagem de um toque", () => {
  it("mesma grandeza: calcula sozinho", () => {
    expect(montarEmbalagem("saco", "25", kg, "g")).toEqual({ nome: "saco 25 kg", quantidadeBase: "25000", precisaQuantidade: false });
    expect(montarEmbalagem("saco", "2,5", kg, "g")).toEqual({ nome: "saco 2,5 kg", quantidadeBase: "2500", precisaQuantidade: false });
    expect(montarEmbalagem("fardo", "12", l, "ml")?.quantidadeBase).toBe("12000");
    expect(montarEmbalagem("caixa", "30", un, "un")?.quantidadeBase).toBe("30");
    expect(montarEmbalagem("caixa", "2", dz, "un")?.quantidadeBase).toBe("24");
    expect(montarEmbalagem("pacote", "500", g, "g")?.quantidadeBase).toBe("500");
  });
  it("outra grandeza ou sem tamanho: pede a quantidade", () => {
    expect(montarEmbalagem("saco", "3", kg, "un")).toEqual({ nome: "saco 3 kg", quantidadeBase: null, precisaQuantidade: true });
    expect(montarEmbalagem("caixa", "", kg, "un")).toEqual({ nome: "caixa", quantidadeBase: null, precisaQuantidade: true });
  });
  it("tamanho inválido não monta", () => {
    expect(montarEmbalagem("saco", "abc", kg, "g")).toBeNull();
    expect(montarEmbalagem("saco", "0", kg, "g")).toBeNull();
    expect(montarEmbalagem("", "25", kg, "g")).toBeNull();
  });
  it("decimal exato, sem float", () => {
    expect(multiplicarDecimal("0,1", "3")).toBe("0.3");
    expect(multiplicarDecimal("1.1", "1.1")).toBe("1.21");
    expect(multiplicarDecimal("x", "1")).toBeNull();
  });
});

describe("máscaras", () => {
  it("documento: CPF até 11 dígitos, CNPJ de 12 a 14", () => {
    expect(mascararDocumento("12345678909")).toBe("123.456.789-09");
    expect(mascararDocumento("1234")).toBe("123.4");
    expect(mascararDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararDocumento("112223330001")).toBe("11.222.333/0001");
    expect(mascararDocumento("11.222.333/0001-81999")).toBe("11.222.333/0001-81");
    expect(mascararDocumento("")).toBe("");
  });
  it("telefone fixo e celular", () => {
    expect(mascararTelefone("1")).toBe("(1");
    expect(mascararTelefone("11")).toBe("(11");
    expect(mascararTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascararTelefone("11912345678")).toBe("(11) 91234-5678");
    expect(mascararTelefone("113333")).toBe("(11) 3333");
    expect(mascararTelefone("")).toBe("");
  });
  it("apagar um símbolo tira o último número (não trava)", () => {
    expect(digitarComMascara("(11) 3333-444", "(11) 3333-4444", mascararTelefone)).toBe("(11) 3333-444");
    expect(digitarComMascara("(11) 3333", "(11) 3333-", mascararTelefone)).toBe("(11) 333");
  });
  it("CNPJ válido confere com a regra do servidor", () => {
    for (const d of ["11222333000181", "11222333000182", "11111111111111", "123", "00000000000191"]) {
      expect(cnpjValido(d), d).toBe(d.length === 14 && documentoValido(d));
    }
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
  });
});
