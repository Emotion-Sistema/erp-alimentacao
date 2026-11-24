/**
 * Contas puras do estoque (E09; RC-09; decisão 0027), sem banco: quantidades exatas com 4 casas
 * (BigInt em dez-milésimos da unidade do estoque) e o custo médio em centavos inteiros.
 * Nunca float.
 */
import type { Acao } from "./permissoes";
import { Fracao } from "./fichas-comum";
import type { AreaEstoque } from "./cadastros";

/** 1 unidade do estoque (g, ml, un) = 10 000 dez-milésimos. */
export const ESCALA = 10_000n;
/** Maior quantidade aceita num lançamento (na unidade do estoque): 100 milhões. */
export const QUANTIDADE_MAXIMA = 100_000_000n * ESCALA;

export const LOCAIS = ["em_uso", "guardado"] as const;
export type LocalDoEstoque = (typeof LOCAIS)[number];
export const NOME_DO_LOCAL: Readonly<Record<LocalDoEstoque, string>> = { em_uso: "Em uso", guardado: "Guardado" };

/** Ação de permissão que dá acesso a cada área (decisão 0008, item 2). */
export function acaoDaArea(area: AreaEstoque): Acao {
  return area === "cozinha" ? "estoque.cozinha" : "estoque.salao";
}

export const MOTIVOS_DE_PERDA = ["venceu", "estragou", "caiu_ou_quebrou", "erro_no_preparo", "sobra_descartada", "outro"] as const;
export type MotivoDePerda = (typeof MOTIVOS_DE_PERDA)[number];
export const NOME_DO_MOTIVO_DE_PERDA: Readonly<Record<MotivoDePerda, string>> = {
  venceu: "Venceu",
  estragou: "Estragou",
  caiu_ou_quebrou: "Caiu ou quebrou",
  erro_no_preparo: "Erro no preparo",
  sobra_descartada: "Sobra descartada",
  outro: "Outro (escreva o motivo)",
};

export const MOTIVOS_DE_BLOQUEIO = ["vencido", "quarentena", "suspeita", "outro"] as const;
export type MotivoDeBloqueio = (typeof MOTIVOS_DE_BLOQUEIO)[number];
export const NOME_DO_MOTIVO_DE_BLOQUEIO: Readonly<Record<MotivoDeBloqueio, string>> = {
  vencido: "Vencido",
  quarentena: "Quarentena (aguardando conferência)",
  suspeita: "Suspeita de problema",
  outro: "Outro (escreva o motivo)",
};

/**
 * "12,5" ou "12.5000" -> 125000n. Nulo se não for decimal simples, se tiver mais de 4 casas
 * (a pessoa digitou algo que o estoque não guarda) ou se for negativo.
 */
export function q4(v: string | number): bigint | null {
  const t = (typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v).trim().replace(",", ".");
  const m = /^(\d{1,12})(?:\.(\d{1,4}))?$/.exec(t);
  if (!m) return null;
  return BigInt(m[1]!) * ESCALA + BigInt((m[2] ?? "").padEnd(4, "0"));
}

/** Fração exata (ex.: consumo da ficha x quantidade vendida) -> dez-milésimos, arredondado (meio para cima). */
export function q4DaFracao(f: Fracao): bigint {
  return new Fracao(f.n * ESCALA, f.d).arredondado();
}

/** 125000n -> "12.5"; -5000n -> "-0.5". */
export function textoQ4(q: bigint): string {
  const neg = q < 0n;
  const a = neg ? -q : q;
  const inteiro = a / ESCALA;
  const resto = (a % ESCALA).toString().padStart(4, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${inteiro}${resto ? `.${resto}` : ""}`;
}

/** Texto decimal do banco ("12.5000") -> dez-milésimos. Aceita sinal. */
export function q4DoBanco(t: string | number): bigint {
  const s = String(t);
  const neg = s.startsWith("-");
  const v = q4(neg ? s.slice(1) : s);
  if (v === null) throw new Error(`Quantidade do banco inválida: ${s}`);
  return neg ? -v : v;
}

/** Divisão inteira arredondada (meio para cima), para números não negativos. */
function dividirArredondado(a: bigint, b: bigint): bigint {
  return (2n * a + b) / (2n * b);
}

/**
 * Valor (centavos) que sai junto com `qSai` de um item que tem `qTotal` e vale `vTotal`: a parte
 * proporcional do custo médio. Levando tudo, leva o valor todo (nada sobra nem falta).
 */
export function valorDaSaida(qTotal: bigint, vTotal: bigint, qSai: bigint): bigint {
  if (qSai <= 0n || qTotal <= 0n) return 0n;
  if (qSai >= qTotal) return vTotal;
  const v = dividirArredondado(vTotal * qSai, qTotal);
  return v > vTotal ? vTotal : v;
}

/** Valor de `q` a um custo de `custoCentavos` por `custoQuantidade` (ambos em dez-milésimos na quantidade). */
export function valorPeloCusto(q: bigint, custoCentavos: bigint, custoQuantidade: bigint): bigint {
  if (q <= 0n || custoQuantidade <= 0n) return 0n;
  return dividirArredondado(q * custoCentavos, custoQuantidade);
}

/** Custo médio em centavos por 1 unidade do estoque, com 4 casas (para mostrar). Nulo sem saldo. */
export function custoMedioPorUnidade(qTotal: bigint, vTotal: bigint): string | null {
  if (qTotal <= 0n) return null;
  return new Fracao(vTotal * ESCALA, qTotal).texto(4);
}
