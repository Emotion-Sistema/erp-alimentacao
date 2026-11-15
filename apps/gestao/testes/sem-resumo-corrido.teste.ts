import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Impede a volta do resumo em linha corrida ("g · Alimentos da cozinha · pote 2,5 kg").
 * Nas telas, dado com rótulo vai em FichaDeDados/Dado, situação em Selo e embalagem em chip
 * (pedido do responsável, 15/11/2026, decisão 0012). O ponto do meio só é aceito em comentário.
 */
const RAIZ = join(import.meta.dirname, "..", "app");

function arquivos(pasta: string, saida: string[] = []): string[] {
  for (const n of readdirSync(pasta)) {
    if (n === "node_modules" || n === ".next") continue;
    const caminho = join(pasta, n);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (n.endsWith(".tsx")) saida.push(caminho);
  }
  return saida;
}

/** Tira comentários de bloco e de linha, mantendo as quebras de linha para contar certo. */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((linha) => linha.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

describe("telas sem resumo em linha corrida", () => {
  it("nenhum .tsx de apps/gestao/app usa o ponto do meio no texto da interface", () => {
    const achados: string[] = [];
    for (const f of arquivos(RAIZ)) {
      semComentarios(readFileSync(f, "utf8"))
        .split("\n")
        .forEach((linha, i) => {
          if (/·/.test(linha)) achados.push(`${relative(RAIZ, f).split(sep).join("/")}:${i + 1}: ${linha.trim()}`);
        });
    }
    expect(achados).toEqual([]);
  });

  it("o detector pega o padrão antigo", () => {
    expect(semComentarios('const t = `${a} · ${b}`;')).toMatch(/·/);
    expect(semComentarios("// g · Alimentos\n/* a · b */")).not.toMatch(/·/);
  });
});
