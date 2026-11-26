/** Mesas da loja (layout provisório do esboço do responsável, cerebro/empresa/mapa-das-mesas.md). Sem banco. */
import { describe, expect, it } from "vitest";
import { FAIXAS_DA_LOJA, MARCOS_DA_LOJA, MESAS_DA_LOJA, mesaDaLoja, nomeDaMesa } from "../src/mesas";

describe("mesas da loja", () => {
  it("são 11 mesas, números padrão de 1 a 11 e códigos fixos sem repetir; onde era a entrada há outra bancada de 2 lugares", () => {
    expect(MESAS_DA_LOJA).toHaveLength(11);
    const numeros = MESAS_DA_LOJA.map((m) => m.numero).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(MESAS_DA_LOJA.map((m) => m.codigo)).size).toBe(11);
    expect(MARCOS_DA_LOJA.some((k) => /entrada/i.test(k.texto))).toBe(false);
    expect(MARCOS_DA_LOJA.filter((k) => k.texto === "Bancada").map((k) => [k.coluna, k.linha, k.linhas])).toEqual([[1, 6, 2], [1, 8, 2]]);
  });

  it("lugares: salão menor 3 de 2 e 1 de 3, Mesão 6, demais 4 (respostas do responsável, 25/11/2026)", () => {
    for (const n of [1, 2, 3]) expect(mesaDaLoja(n), `mesa ${n}`).toMatchObject({ area: "tv", lugares: 2 });
    expect(mesaDaLoja(4)).toMatchObject({ area: "tv", lugares: 3 });
    expect(mesaDaLoja(9)).toMatchObject({ area: "frente", lugares: 6, apelido: "Mesão" });
    for (const n of [5, 6, 7, 8, 10, 11]) expect(mesaDaLoja(n), `mesa ${n}`).toMatchObject({ area: "frente", lugares: 4 });
    expect(MESAS_DA_LOJA.reduce((s, m) => s + m.lugares, 0)).toBe(3 * 2 + 3 + 6 + 6 * 4);
  });

  it("centro da frente tem 5, 6, 7 e 11; direita tem 8, Mesão e 10", () => {
    const naColuna = (c: number) => MESAS_DA_LOJA.filter((m) => m.area === "frente" && m.coluna === c).map((m) => m.numero);
    expect(naColuna(2)).toEqual([5, 6, 7, 11]);
    expect(naColuna(3)).toEqual([8, 9, 10]);
  });

  it("nenhuma mesa, marco ou faixa ocupa a mesma casa da planta", () => {
    const casas = new Set<string>();
    const ocupar = (coluna: number, linha: number, colunas = 1, linhas = 1) => {
      for (let c = coluna; c < coluna + colunas; c++)
        for (let l = linha; l < linha + linhas; l++) {
          const chave = `${c}x${l}`;
          expect(casas.has(chave), `casa ${chave} repetida`).toBe(false);
          casas.add(chave);
          expect(c).toBeGreaterThanOrEqual(1);
          expect(c).toBeLessThanOrEqual(3);
          expect(l).toBeGreaterThanOrEqual(1);
          expect(l).toBeLessThanOrEqual(9);
        }
    };
    for (const m of MESAS_DA_LOJA) ocupar(m.coluna, m.linha);
    for (const m of MARCOS_DA_LOJA) ocupar(m.coluna, m.linha, m.colunas, m.linhas);
    for (const f of FAIXAS_DA_LOJA) ocupar(1, f.linha, 3);
  });

  it("nome da mesa", () => {
    expect(nomeDaMesa(mesaDaLoja(9)!)).toBe("Mesa 9 (Mesão)");
    expect(nomeDaMesa(mesaDaLoja(4)!)).toBe("Mesa 4");
    expect(mesaDaLoja(12)).toBeUndefined();
  });
});
