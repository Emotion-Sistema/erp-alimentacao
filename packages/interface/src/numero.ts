/**
 * Números no formato brasileiro, feitos por texto e BigInt (nunca float):
 * milhar com ponto e decimal com vírgula. Ex.: "25000" -> "25.000"; "0.5" -> "0,5".
 */
export function formatarDecimal(valor: string): string | null {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(valor.trim());
  if (!m) return null;
  const inteiro = BigInt(m[1]!)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimais = (m[2] ?? "").replace(/0+$/, "");
  return decimais ? `${inteiro},${decimais}` : inteiro;
}

/** "25000" + "g" -> "25.000 g". Nulo se o valor não for número. */
export function quantidadeComUnidade(
  valor: string,
  unidade: string,
): string | null {
  const n = formatarDecimal(valor);
  return n === null ? null : `${n} ${unidade}`.trim();
}
