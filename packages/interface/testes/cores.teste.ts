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

describe("fundo sempre claro (pedido do responsável, 15/11/2026)", () => {
  it("o tema não tem modo escuro automático nem manual", () => {
    expect(css).not.toMatch(/prefers-color-scheme\s*:\s*dark/);
    expect(css).not.toMatch(/data-tema/);
  });
  it("os controles nativos também ficam claros", () => {
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*light;/);
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*light/);
  });
});

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canais[0]! + 0.7152 * canais[1]! + 0.0722 * canais[2]!;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("contraste AA (4,5 ou mais) das cores do padrão visual", () => {
  const variantes = ["neutro", "info", "sucesso", "alerta", "perigo", "cozinha", "bebidas-salao", "cafeteria", "sorvete"];
  for (const v of variantes) {
    it(`selo ${v}: texto sobre fundo`, () => {
      const fundo = valor(`selo-${v}-fundo`);
      const texto = valor(`selo-${v}-texto`);
      expect(fundo, `falta --selo-${v}-fundo`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(texto, `falta --selo-${v}-texto`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(fundo!, texto!)).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const [texto, fundo] of [
    ["cor-texto", "cor-superficie"],
    ["cor-texto-suave", "cor-superficie"],
    ["cor-texto-suave", "cor-fundo"],
    ["cor-atencao", "cor-fundo"],
    ["cor-primaria", "cor-superficie"],
  ] as const) {
    it(`${texto} sobre ${fundo}`, () => expect(contraste(valor(texto)!, valor(fundo)!)).toBeGreaterThanOrEqual(4.5));
  }
});
