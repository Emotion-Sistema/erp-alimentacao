import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORES_DO_TEMA_CLARO } from "../src/cores";

const css = readFileSync(new URL("../src/tema.css", import.meta.url), "utf8");
const blocoClaro = css.match(/:root\s*\{([^}]*)\}/)![1]!;
const valor = (nome: string) => blocoClaro.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1]?.trim();

describe("cores.ts espelha tema.css (tema claro)", () => {
  it("fundo", () => expect(CORES_DO_TEMA_CLARO.fundo).toBe(valor("cor-fundo")));
  it("primária", () => expect(CORES_DO_TEMA_CLARO.primaria).toBe(valor("cor-primaria")));
  it("texto sobre a primária", () => expect(CORES_DO_TEMA_CLARO.primariaTexto).toBe(valor("cor-primaria-texto")));
});
