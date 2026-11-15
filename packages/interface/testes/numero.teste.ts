import { describe, expect, it } from "vitest";
import { formatarDecimal, quantidadeComUnidade } from "../src/numero";

describe("números no formato brasileiro (texto, sem float)", () => {
  it("milhar com ponto e decimal com vírgula", () => {
    expect(formatarDecimal("25000")).toBe("25.000");
    expect(formatarDecimal("1500")).toBe("1.500");
    expect(formatarDecimal("0.5")).toBe("0,5");
    expect(formatarDecimal("2,5")).toBe("2,5");
    expect(formatarDecimal("1234567.1250")).toBe("1.234.567,125");
    expect(formatarDecimal("40.0000")).toBe("40");
  });
  it("não aceita lixo", () => {
    expect(formatarDecimal("")).toBeNull();
    expect(formatarDecimal("abc")).toBeNull();
    expect(formatarDecimal("-3")).toBeNull();
  });
  it("com unidade", () => {
    expect(quantidadeComUnidade("25000", "g")).toBe("25.000 g");
    expect(quantidadeComUnidade("0,5", "kg")).toBe("0,5 kg");
  });
});
