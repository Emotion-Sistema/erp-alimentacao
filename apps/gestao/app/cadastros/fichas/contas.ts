/**
 * Contas da tela de fichas técnicas, sem banco e sem React. Quem decide é o servidor
 * (`packages/dominio/src/fichas.ts`); aqui só se converte o que a pessoa digita e se monta o
 * texto para mostrar. Tudo por texto e frações exatas (`Fracao`): nada de float.
 */
import { formatarDecimal } from "@erp/interface";
import { Fracao, type UnidadeDaFicha } from "@erp/dominio/fichas";
import { textoDosCentavos } from "@erp/dominio/produtos";

/** Unidade em que a pessoa pode digitar: a da ficha ou a maior (kg, L). */
export type UnidadeDigitada = UnidadeDaFicha | "kg" | "L";

/** Unidades que a pessoa pode escolher para digitar uma quantidade guardada em `base`. */
export const unidadesParaDigitar = (base: UnidadeDaFicha): UnidadeDigitada[] => (base === "g" ? ["g", "kg"] : base === "ml" ? ["ml", "L"] : ["un"]);

const FATOR: Record<UnidadeDigitada, bigint> = { g: 1n, ml: 1n, un: 1n, kg: 1000n, L: 1000n };
const DEZ_MIL = new Fracao(10_000n);

/**
 * "1,5" em kg -> "1500" (g). Nulo se não for número maior que zero, se passar do tamanho que o
 * servidor aceita (10 dígitos antes da vírgula) ou se, na unidade da ficha, sobrar mais de 4 casas
 * (ex.: 0,00001 kg). Nunca arredonda escondido: ou dá exato, ou a tela explica.
 */
export function quantidadeNaBase(texto: string, digitada: UnidadeDigitada): string | null {
  const t = texto.trim().replace(/\s+/g, "");
  if (!/^\d{1,10}([.,]\d{1,7})?$/.test(t)) return null;
  const f = Fracao.decimal(t).vezes(new Fracao(FATOR[digitada]));
  if (f.ehZero() || f.vezes(DEZ_MIL).d !== 1n) return null;
  const s = f.texto(4);
  return s.split(".")[0]!.length > 10 ? null : s;
}

/** Quantidade guardada ("1500") para o campo de digitar, no formato brasileiro ("1500" ou "0,5"). */
export const quantidadeParaCampo = (q: string | null) => (q === null ? "" : q.replace(".", ","));

/** "1500" + "g" -> "1.500 g"; "0.25" + "un" -> "0,25 un". */
export function quantidadeLegivel(q: string, unidade: string): string {
  return `${formatarDecimal(q) ?? q} ${unidade}`;
}

/** Quantidade com a unidade maior quando fica mais fácil de ler: 1500 g -> "1,5 kg"; 300 g fica "300 g". */
export function quantidadeAmigavel(q: string, unidade: UnidadeDaFicha): string {
  const f = Fracao.decimal(q);
  if ((unidade === "g" || unidade === "ml") && f.n >= 1000n * f.d) {
    const maior = f.dividido(new Fracao(1000n));
    return quantidadeLegivel(maior.texto(4), unidade === "g" ? "kg" : "L");
  }
  return quantidadeLegivel(f.texto(4), unidade);
}

/** Pontos-base para texto: 3125 -> "31,25%"; 3500 -> "35%". */
export function textoDoPb(pb: number): string {
  const inteiro = Math.trunc(pb / 100);
  const resto = String(pb % 100).padStart(2, "0").replace(/0+$/, "");
  return `${inteiro}${resto ? `,${resto}` : ""}%`;
}

/** "35" ou "35,5" (%) -> pontos-base (3550). Nulo fora de 1% a 100% ou com mais de 2 casas. */
export function pbDoTexto(texto: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(texto.trim().replace(/\s*%$/, ""));
  if (!m) return null;
  const pb = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return pb < 100 || pb > 10_000 ? null : pb;
}

/** Custo para mostrar: "R$ 4,91". */
export const textoDoCusto = (centavos: number) => textoDosCentavos(centavos);

/** Quantas vezes multiplicar a receita: "2", "1,5" -> texto decimal; nulo se não for de 0,1 a 100. */
export function vezesDoTexto(texto: string): string | null {
  const t = texto.trim().replace(/x$/i, "").trim();
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return null;
  const f = Fracao.decimal(t);
  if (f.ehZero() || f.n > 100n * f.d) return null;
  return f.texto(2);
}

/** Inteiro de um campo ("15" -> 15); vazio -> nulo; inválido -> undefined. */
export function inteiroDoCampo(texto: string, min: number, max: number): number | null | undefined {
  const t = texto.trim();
  if (!t) return null;
  if (!/^\d{1,5}$/.test(t)) return undefined;
  const n = Number(t);
  return n < min || n > max ? undefined : n;
}

/** Data e hora curtas, no relógio da loja: "19/11/2026 14:05". */
export function quando(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
}
