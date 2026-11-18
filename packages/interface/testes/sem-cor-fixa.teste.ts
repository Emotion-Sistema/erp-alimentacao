import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
// publico.css: tema escuro dos apps do cliente (decisão 0019), também é arquivo de tema.
const PERMITIDOS = new Set([
  "packages/interface/src/tema.css",
  "packages/interface/src/publico.css",
  "packages/interface/src/cores.ts",
]);
const COR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function arquivos(pasta: string, saida: string[] = []): string[] {
  let nomes: string[];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return saida;
  }
  for (const n of nomes) {
    if (n === "node_modules" || n === ".next") continue;
    const caminho = join(pasta, n);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.(css|ts|tsx|js|mjs)$/.test(n)) saida.push(caminho);
  }
  return saida;
}

describe("nenhuma cor fixa fora do tema", () => {
  it("só tema.css, publico.css e cores.ts têm cor escrita", () => {
    const pastas = [join(RAIZ, "packages/interface/src")];
    for (const app of readdirSync(join(RAIZ, "apps"))) {
      pastas.push(
        join(RAIZ, "apps", app, "app"),
        join(RAIZ, "apps", app, "src"),
      );
    }
    const achados: string[] = [];
    for (const f of pastas.flatMap((p) => arquivos(p))) {
      const rel = relative(RAIZ, f).split(sep).join("/");
      if (PERMITIDOS.has(rel)) continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (COR.test(linha)) achados.push(`${rel}:${i + 1}: ${linha.trim()}`);
        });
    }
    expect(achados).toEqual([]);
  });
});
