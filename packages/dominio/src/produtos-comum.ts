/**
 * Parte dos produtos que a tela também usa (sem banco). Decisão 0018.
 * Dinheiro sempre em centavos inteiros: a conversão de texto ("12,50") para centavos é feita
 * pelos dígitos, nunca por número com vírgula (float).
 */
export const PRECO_MAXIMO_CENTAVOS = 999_999; // R$ 9.999,99
export const TEMPO_DE_PREPARO_MAXIMO = 180; // minutos

export type Produto = {
  id: number;
  nome: string;
  descricao: string | null;
  categoriaId: number;
  /** Nulo: não passa pela produção (ex.: bebida da geladeira); aí também não há tempo de preparo. */
  tipoProducaoId: number | null;
  precoCentavos: number;
  tempoPreparoMin: number | null;
  ordem: number;
  ativo: boolean;
};

/**
 * "12,50", "12,5", "12", "R$ 1.234,56" (vírgula nos centavos, ponto no milhar) e também "12.50"
 * (ponto com 1 ou 2 dígitos no fim) -> centavos. Devolve null se não for um valor válido.
 */
export function centavosDoTexto(texto: string): number | null {
  const t = texto.replace(/R\$/gi, "").replace(/\s+/g, "");
  let reais: string;
  let cent: string;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)(?:,(\d{1,2}))?$/.exec(t))) [reais, cent] = [m[1]!, m[2] ?? ""];
  else if ((m = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(t))) [reais, cent] = [m[1]!.replace(/\./g, ""), m[2] ?? ""];
  else if ((m = /^(\d+)\.(\d{1,2})$/.exec(t))) [reais, cent] = [m[1]!, m[2]!];
  else return null;
  if (reais.length > 9) return null;
  return Number(reais) * 100 + Number(cent.padEnd(2, "0"));
}

/** 1250 -> "R$ 12,50"; 123456 -> "R$ 1.234,56". */
export function textoDosCentavos(centavos: number): string {
  const negativo = centavos < 0;
  const c = Math.abs(Math.trunc(centavos));
  const reais = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${reais},${String(c % 100).padStart(2, "0")}`;
}
