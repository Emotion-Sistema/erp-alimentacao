import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORES_DO_TEMA_CLARO, CORES_DO_TEMA_ESCURO } from "../src/cores";

const css = readFileSync(new URL("../src/tema.css", import.meta.url), "utf8");
const blocoClaro = css.match(/:root\s*\{([^}]*)\}/)![1]!;
const valor = (nome: string) =>
  blocoClaro.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1]?.trim();
// Modo escuro dos apps do cliente (publico.css): o bloco dentro de @media (prefers-color-scheme: dark).
const publico = readFileSync(
  new URL("../src/publico.css", import.meta.url),
  "utf8",
);
const blocoEscuro = publico.match(
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/,
)![1]!;
const valorEscuro = (nome: string) =>
  blocoEscuro.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1]?.trim() ??
  valor(nome);

describe("cores.ts espelha tema.css (tema claro)", () => {
  it("fundo", () => expect(CORES_DO_TEMA_CLARO.fundo.toLowerCase()).toBe(valor("cor-fundo")));
  it("primária", () =>
    expect(CORES_DO_TEMA_CLARO.primaria.toLowerCase()).toBe(valor("cor-primaria")));
  it("texto sobre a primária", () =>
    expect(CORES_DO_TEMA_CLARO.primariaTexto.toLowerCase()).toBe(
      valor("cor-primaria-texto"),
    ));
  it("marca, âmbar e faixa escura", () => {
    expect(CORES_DO_TEMA_CLARO.marca.toLowerCase()).toBe(valor("cor-marca"));
    expect(CORES_DO_TEMA_CLARO.ambar.toLowerCase()).toBe(valor("cor-ambar"));
    expect(CORES_DO_TEMA_CLARO.faixaEscura.toLowerCase()).toBe(valor("cor-faixa-escura"));
    expect(CORES_DO_TEMA_CLARO.faixaEscuraTexto.toLowerCase()).toBe(
      valor("cor-faixa-escura-texto"),
    );
  });
  it("fundo do modo escuro (publico.css)", () =>
    expect(CORES_DO_TEMA_ESCURO.fundo.toLowerCase()).toBe(valorEscuro("cor-fundo")));
});

describe("claro por padrão; escuro só por escolha da pessoa (decisões 0012 e 0030)", () => {
  it("o aparelho nunca escurece a gestão sozinho", () => {
    expect(css).not.toMatch(/prefers-color-scheme\s*:\s*dark/);
  });
  it("o escuro existe só pela escolha guardada (atributo data-tema no html)", () => {
    expect(css).toMatch(/:root\[data-tema="escuro"\]\s*\{/);
  });
  it("sem escolha, os controles nativos ficam claros", () => {
    expect(css).toMatch(/:root\s*\{\s*color-scheme:\s*light;/);
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*light/);
  });
});

// Escuro da gestão (decisão 0030): o bloco :root[data-tema="escuro"] do tema.css.
const blocoEscuroGestao = css.match(/:root\[data-tema="escuro"\]\s*\{([^}]*)\}/)![1]!;
const valorEscuroGestao = (nome: string) =>
  blocoEscuroGestao.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1]?.trim() ?? valor(nome);

function luminancia(hex: string): number {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canais[0]! + 0.7152 * canais[1]! + 0.0722 * canais[2]!;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("contraste AA (4,5 ou mais) das cores do padrão visual", () => {
  const variantes = [
    "neutro",
    "info",
    "sucesso",
    "alerta",
    "perigo",
    "cozinha",
    "bebidas-salao",
    "cafeteria",
    "sorvete",
  ];
  for (const v of variantes) {
    it(`selo ${v}: texto sobre fundo`, () => {
      const fundo = valor(`selo-${v}-fundo`);
      const texto = valor(`selo-${v}-texto`);
      expect(fundo, `falta --selo-${v}-fundo`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(texto, `falta --selo-${v}-texto`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(fundo!, texto!)).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const [texto, fundo] of PARES) {
    it(`${texto} sobre ${fundo}`, () =>
      expect(contraste(valor(texto)!, valor(fundo)!)).toBeGreaterThanOrEqual(
        4.5,
      ));
  }
  it("borda de campo: 3:1 ou mais no fundo, na superfície e no cartão", () => {
    for (const f of ["cor-fundo", "cor-superficie", "cor-cartao"])
      expect(contraste(valor("cor-borda")!, valor(f)!)).toBeGreaterThanOrEqual(
        3,
      );
  });
});

/** Pares de leitura da marca (texto sobre fundo). Valem no claro (todos os apps) e no escuro (cliente). */
const PARES = [
  ["cor-texto", "cor-fundo"],
  ["cor-texto", "cor-superficie"],
  ["cor-texto", "cor-cartao"],
  ["cor-texto-suave", "cor-superficie"],
  ["cor-texto-suave", "cor-fundo"],
  ["cor-texto-suave", "cor-cartao"],
  ["cor-atencao", "cor-fundo"],
  ["cor-sucesso", "cor-fundo"],
  ["cor-perigo", "cor-fundo"],
  ["cor-perigo", "cor-cartao"],
  ["cor-info", "cor-fundo"],
  ["cor-primaria", "cor-superficie"],
  ["cor-primaria", "cor-cartao"],
  ["cor-primaria", "cor-fundo"],
  ["cor-primaria-texto", "cor-primaria"],
  ["cor-primaria-texto", "cor-primaria-hover"],
  ["cor-preco", "cor-cartao"],
  ["cor-preco", "cor-fundo"],
  ["cor-ouro-texto", "cor-ouro"],
  ["cor-faixa-escura-texto", "cor-faixa-escura"],
  ["cor-faixa-escura-suave", "cor-faixa-escura"],
] as const;

describe("trilho da gestão (decisão 0028, só no claro): contraste AA", () => {
  it("seção aberta: brasa funda sobre brasa suave", () =>
    expect(contraste(valor("cor-primaria-hover")!, valor("cor-brasa-suave")!)).toBeGreaterThanOrEqual(4.5));
  it("nome das seções: texto suave sobre o fundo", () =>
    expect(contraste(valor("cor-texto-suave")!, valor("cor-fundo")!)).toBeGreaterThanOrEqual(4.5));
});

describe("mesas (tela Mesas, protótipo A): contraste AA", () => {
  for (const s of ["livre", "ocupada", "conta"]) {
    it(`mesa ${s}: texto sobre fundo`, () => {
      const fundo = valor(`mesa-${s}-fundo`);
      const texto = valor(`mesa-${s}-texto`);
      expect(fundo, `falta --mesa-${s}-fundo`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(texto, `falta --mesa-${s}-texto`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(fundo!, texto!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("etapas da produção (tela Produção, protótipo A): contraste AA", () => {
  for (const e of ["fila", "preparo", "pronto"]) {
    it(`etapa ${e}: texto sobre fundo`, () => {
      const fundo = valor(`etapa-${e}-fundo`);
      const texto = valor(`etapa-${e}-texto`);
      expect(fundo, `falta --etapa-${e}-fundo`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(texto, `falta --etapa-${e}-texto`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contraste(fundo!, texto!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("modo escuro dos apps do cliente (publico.css): contraste AA", () => {
  it("no cliente o escuro segue o aparelho (na gestão, só por escolha)", () => {
    expect(publico).toMatch(/prefers-color-scheme:\s*dark/);
    expect(publico).toMatch(/color-scheme:\s*light dark/);
  });
  const variantes = [
    "neutro",
    "info",
    "sucesso",
    "alerta",
    "perigo",
    "cozinha",
    "bebidas-salao",
    "cafeteria",
    "sorvete",
  ];
  for (const v of variantes) {
    it(`selo ${v} no escuro`, () =>
      expect(
        contraste(
          valorEscuro(`selo-${v}-fundo`)!,
          valorEscuro(`selo-${v}-texto`)!,
        ),
      ).toBeGreaterThanOrEqual(4.5));
  }
  for (const [texto, fundo] of PARES) {
    it(`${texto} sobre ${fundo} no escuro`, () =>
      expect(
        contraste(valorEscuro(texto)!, valorEscuro(fundo)!),
      ).toBeGreaterThanOrEqual(4.5));
  }
});

describe("laranja e âmbar da logo nunca como letra (contraste 3:1 só serve de enfeite)", () => {
  it("o tema não usa --cor-marca nem --cor-ambar em color:", () => {
    for (const texto of [css, publico])
      expect(texto).not.toMatch(/(^|[^-])color:\s*var\(--cor-(marca|ambar)\)/m);
  });
});

describe("escuro da gestão (decisão 0030): mesma paleta do cliente e contraste AA", () => {
  it("cada cor do escuro do cliente tem o mesmo valor no escuro da gestão", () => {
    const nomes = [...blocoEscuro.matchAll(/--([a-z0-9-]+):\s*#[0-9a-f]{6}/gi)].map((m) => m[1]!);
    expect(nomes.length).toBeGreaterThan(20);
    for (const n of nomes) expect(valorEscuroGestao(n), n).toBe(valorEscuro(n));
  });
  for (const v of ["neutro", "info", "sucesso", "alerta", "perigo", "cozinha", "bebidas-salao", "cafeteria", "sorvete"]) {
    it(`selo ${v}`, () =>
      expect(contraste(valorEscuroGestao(`selo-${v}-fundo`)!, valorEscuroGestao(`selo-${v}-texto`)!)).toBeGreaterThanOrEqual(4.5));
  }
  for (const [texto, fundo] of PARES) {
    it(`${texto} sobre ${fundo}`, () =>
      expect(contraste(valorEscuroGestao(texto)!, valorEscuroGestao(fundo)!)).toBeGreaterThanOrEqual(4.5));
  }
  it("trilho: seção aberta (brasa funda sobre brasa suave) e nome das seções", () => {
    expect(contraste(valorEscuroGestao("cor-primaria-hover")!, valorEscuroGestao("cor-brasa-suave")!)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(valorEscuroGestao("cor-texto-suave")!, valorEscuroGestao("cor-fundo")!)).toBeGreaterThanOrEqual(4.5);
  });
  for (const m of ["livre", "ocupada", "conta"]) {
    it(`mesa ${m}`, () =>
      expect(contraste(valorEscuroGestao(`mesa-${m}-fundo`)!, valorEscuroGestao(`mesa-${m}-texto`)!)).toBeGreaterThanOrEqual(4.5));
  }
  it("borda de campo: 3:1 ou mais no fundo e no cartão", () => {
    for (const f of ["cor-fundo", "cor-cartao"])
      expect(contraste(valorEscuroGestao("cor-borda")!, valorEscuroGestao(f)!), f).toBeGreaterThanOrEqual(3);
  });
});
