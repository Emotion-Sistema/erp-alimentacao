/**
 * Mesas da loja e a planta do salão (pedido do responsável, 25/11/2026: telas iguais ao protótipo A).
 *
 * LAYOUT PROVISÓRIO: é a leitura do esboço à mão do responsável (cerebro/empresa/mapa-das-mesas.md).
 * Lugares confirmados pelo responsável (25/11/2026): salão 6 mesas de 4 e o Mesão de 6; salão menor 3 mesas
 * de 2 e 1 de 3 (a mesa 4, a maior do esboço: hipótese); Bancada 2 lugares. Números das mesas ainda provisórios. As posições
 * (coluna e linha) são as mesmas da tela Mesas do protótipo (cerebro/frentes/visual-limpo/prototipos.html).
 *
 * Sem banco e sem permissão: é só o desenho fixo da loja. A situação de cada mesa (livre, ocupada,
 * pedindo a conta) vem dos pedidos, que só existem a partir da etapa E13. Até lá, toda mesa está livre.
 *
 * Planta em 3 colunas e 9 linhas:
 *   linha 1: 60 Sabores e Cafeteria          linha 2: faixa "Área da TV"
 *   linhas 3-4: mesas 1 a 4, Banheiro e TV   linha 5: faixa "Frente, perto do caixa"
 *   linhas 6-9: mesas 5 a 11, Bancada, Entrada (calçada) e Caixa
 */

export type AreaDaMesa = "tv" | "frente";

export type Mesa = {
  numero: number;
  area: AreaDaMesa;
  lugares: number;
  /** Posição na planta (coluna 1 a 3, linha 1 a 9). */
  coluna: number;
  linha: number;
  /** Nome especial (ex.: "Mesão"); sem nome, a mesa é chamada só pelo número. */
  apelido?: string;
};

export const NOME_DA_AREA_DA_MESA: Readonly<Record<AreaDaMesa, string>> = {
  tv: "Área da TV",
  frente: "Frente, perto do caixa",
};

export const MESAS_DA_LOJA: readonly Mesa[] = [
  // Área da TV ("salão menor"): mesas de 2 lugares, em duas colunas.
  { numero: 1, area: "tv", lugares: 2, coluna: 1, linha: 3 },
  { numero: 2, area: "tv", lugares: 2, coluna: 2, linha: 3 },
  { numero: 3, area: "tv", lugares: 2, coluna: 1, linha: 4 },
  { numero: 4, area: "tv", lugares: 3, coluna: 2, linha: 4 },
  // Frente, perto do caixa: centro (5, 6, 7, 11) e direita (8, Mesão, 10).
  { numero: 5, area: "frente", lugares: 4, coluna: 2, linha: 6 },
  { numero: 8, area: "frente", lugares: 4, coluna: 3, linha: 6 },
  { numero: 6, area: "frente", lugares: 4, coluna: 2, linha: 7 },
  { numero: 9, area: "frente", lugares: 6, coluna: 3, linha: 7, apelido: "Mesão" },
  { numero: 7, area: "frente", lugares: 4, coluna: 2, linha: 8 },
  { numero: 10, area: "frente", lugares: 4, coluna: 3, linha: 8 },
  { numero: 11, area: "frente", lugares: 4, coluna: 2, linha: 9 },
];

/** Pontos de referência da planta (não são mesas). `colunas` e `linhas` dizem quantas casas ocupam. */
export type MarcoDaLoja = {
  texto: string;
  detalhe?: string;
  coluna: number;
  linha: number;
  colunas?: number;
  linhas?: number;
};

export const MARCOS_DA_LOJA: readonly MarcoDaLoja[] = [
  { texto: "60 Sabores", coluna: 1, linha: 1 },
  { texto: "Cafeteria", coluna: 2, linha: 1, colunas: 2 },
  { texto: "Banheiro", coluna: 3, linha: 3 },
  { texto: "TV", coluna: 3, linha: 4 },
  { texto: "Bancada", detalhe: "2 lugares virados para a parede, usar em último caso", coluna: 1, linha: 6, linhas: 2 },
  { texto: "Entrada (calçada)", coluna: 1, linha: 8, linhas: 2 },
  { texto: "Caixa", coluna: 3, linha: 9 },
];

/** Títulos das faixas da planta (uma linha inteira). */
export const FAIXAS_DA_LOJA: readonly { texto: string; linha: number }[] = [
  { texto: "Área da TV (salão menor)", linha: 2 },
  { texto: "Frente, perto do caixa", linha: 5 },
];

export function mesaDaLoja(numero: number): Mesa | undefined {
  return MESAS_DA_LOJA.find((m) => m.numero === numero);
}

/** "Mesa 9 (Mesão)" ou "Mesa 4". */
export function nomeDaMesa(m: Mesa): string {
  return m.apelido ? `Mesa ${m.numero} (${m.apelido})` : `Mesa ${m.numero}`;
}
