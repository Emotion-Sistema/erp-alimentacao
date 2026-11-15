/**
 * Lista pronta de unidades do estoque (ideia nº 5, migração 0008). Por dentro o estoque conta
 * sempre em g, ml ou un (conta exata; fichas técnicas em g). A pessoa escolhe como quer VER e
 * informar: kg ou g, L ou ml, un ou dz. Funções puras (sem banco), usadas no servidor e nas telas.
 * Quantidades são decimais exatos em texto, feitas com BigInt, nunca float.
 */

export const UNIDADES_PARA_MOSTRAR = ["kg", "g", "l", "ml", "un", "dz"] as const;
export type UnidadeParaMostrar = (typeof UNIDADES_PARA_MOSTRAR)[number];
type Base = "g" | "ml" | "un";

export type OpcaoDeUnidade = {
  codigo: UnidadeParaMostrar;
  /** Unidade em que o estoque conta por dentro. */
  base: Base;
  /** Quantas unidades da base valem 1 desta. */
  fator: bigint;
  sigla: string;
  nome: string;
};

export const OPCOES_DE_UNIDADE: readonly OpcaoDeUnidade[] = [
  { codigo: "kg", base: "g", fator: 1000n, sigla: "kg", nome: "Quilos (kg)" },
  { codigo: "g", base: "g", fator: 1n, sigla: "g", nome: "Gramas (g)" },
  { codigo: "l", base: "ml", fator: 1000n, sigla: "L", nome: "Litros (L)" },
  { codigo: "ml", base: "ml", fator: 1n, sigla: "ml", nome: "Mililitros (ml)" },
  { codigo: "un", base: "un", fator: 1n, sigla: "un", nome: "Unidades (un)" },
  { codigo: "dz", base: "un", fator: 12n, sigla: "dz", nome: "Dúzias (dz)" },
];

/** Família de cada unidade do estoque, para as mensagens. */
export const NOME_DA_FAMILIA: Readonly<Record<Base, string>> = { g: "peso (gramas)", ml: "volume (mililitros)", un: "unidades" };

export const opcaoDeUnidade = (codigo: string): OpcaoDeUnidade | undefined => OPCOES_DE_UNIDADE.find((o) => o.codigo === codigo);

/** Unidade do estoque (por dentro) de uma unidade para mostrar: kg -> g, l -> ml, dz -> un. */
export const baseDaUnidade = (codigo: string): Base | undefined => opcaoDeUnidade(codigo)?.base;

/** As opções que valem para um ingrediente que conta em `base`. */
export const opcoesDaBase = (base: string): OpcaoDeUnidade[] => OPCOES_DE_UNIDADE.filter((o) => o.base === base);

// ---------- decimal exato ----------
const CASAS = 7; // 4 casas da base ÷ 1000 = até 7 casas, sem perder nada
const ESCALA = 10n ** BigInt(CASAS);

function paraInteiro(v: string): bigint | null {
  const m = /^(-?)(\d{1,14})(?:\.(\d{1,7}))?$/.exec(v.trim());
  if (!m) return null;
  const n = BigInt(m[2]!) * ESCALA + BigInt((m[3] ?? "").padEnd(CASAS, "0"));
  return m[1] ? -n : n;
}

function formatar(n: bigint): string {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const inteiro = (a / ESCALA).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const resto = (a % ESCALA).toString().padStart(CASAS, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${inteiro}${resto ? `,${resto}` : ""}`;
}

/**
 * Quantidade guardada na base (texto do banco, ex.: "2500") escrita na unidade escolhida, no
 * formato brasileiro: "2,5 kg", "1,25 L", "2 dz". Dúzia só quando a conta é inteira; senão
 * "1 dz e 6 un" (ou "8 un"), para nunca mostrar dízima; dúzia negativa sai em unidades.
 * Aceita o texto do banco (até 7 casas, ponto decimal); outro formato ("5.", ".5", "1e3") dá nulo.
 */
export function mostrarQuantidade(quantidadeBase: string, unidade: string): string | null {
  const n = paraInteiro(quantidadeBase);
  const o = opcaoDeUnidade(unidade);
  if (n === null || !o) return null;
  if (o.codigo === "dz") {
    // Fração ou negativo (ajuste, falta) vai em unidades: "-1 dz e 6 un" seria ambíguo.
    if (n % ESCALA !== 0n || n < 0n) return `${formatar(n)} un`;
    const inteiras = n / ESCALA;
    const dz = inteiras / 12n;
    const un = inteiras % 12n;
    if (dz === 0n) return `${un} un`;
    return un === 0n ? `${dz} dz` : `${dz} dz e ${un} un`;
  }
  // Divisão por 1 ou 1000 é sempre exata com 7 casas.
  return `${formatar(n / o.fator)} ${o.sigla}`;
}

