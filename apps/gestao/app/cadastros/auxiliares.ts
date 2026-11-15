/**
 * Funções puras das telas de cadastro rápido (sem React, sem banco): máscaras de documento e
 * telefone, e a conta da embalagem de um toque. Ficam à parte para serem testadas sozinhas.
 * Quantidades são decimais exatos (texto), nunca float.
 */

export type UnidadePadrao = { codigo: string; nome: string; grandeza: string; fator: string };
export type UnidadeBase = "g" | "ml" | "un";

export const GRANDEZA_DA_BASE: Record<UnidadeBase, string> = { g: "massa", ml: "volume", un: "contagem" };

/** Botões de tipo de embalagem, na ordem mais comum primeiro. */
export const TIPOS_DE_EMBALAGEM = ["caixa", "pacote", "saco", "fardo", "bandeja", "lata", "garrafa", "galão", "pote", "balde"] as const;

// ---------- decimal exato (4 casas), como o servidor ----------
const ESCALA = 10000n;
function paraInteiro(v: string): bigint | null {
  const m = /^(\d{1,10})(?:[.,](\d{1,4}))?$/.exec(v.trim());
  if (!m) return null;
  return BigInt(m[1]!) * ESCALA + BigInt((m[2] ?? "").padEnd(4, "0"));
}
function paraTexto(n: bigint): string {
  const inteiro = n / ESCALA;
  const resto = (n % ESCALA).toString().padStart(4, "0").replace(/0+$/, "");
  return resto ? `${inteiro}.${resto}` : `${inteiro}`;
}
/** a × b com até 4 casas cada; nulo se não for número válido ou o resultado for zero. */
export function multiplicarDecimal(a: string, b: string): string | null {
  const x = paraInteiro(a);
  const y = paraInteiro(b);
  if (x === null || y === null) return null;
  const arred = (x * y + ESCALA / 2n) / ESCALA;
  return arred === 0n ? null : paraTexto(arred);
}
/** "12.5" -> "12,5" (como a pessoa escreve). */
export const comVirgula = (v: string) => v.replace(".", ",");

export type EmbalagemMontada = {
  nome: string;
  /** Quantidade na unidade do estoque; nulo quando a pessoa precisa dizer. */
  quantidadeBase: string | null;
  /** Verdadeiro quando a unidade do tamanho é de outra grandeza (ou não há tamanho). */
  precisaQuantidade: boolean;
};

/**
 * Embalagem de um toque: tipo + tamanho + unidade. Na mesma grandeza do estoque a quantidade
 * sai da conta ("saco 25 kg" em g = 25000); em outra grandeza (saco 3 kg de limão contado em un)
 * o nome fica igual e a pessoa informa a quantidade.
 */
export function montarEmbalagem(tipo: string, tamanho: string, unidade: UnidadePadrao | undefined, base: UnidadeBase): EmbalagemMontada | null {
  const t = tipo.trim();
  if (!t) return null;
  const tam = tamanho.trim();
  if (!tam) return { nome: t, quantidadeBase: null, precisaQuantidade: true };
  const valor = paraInteiro(tam);
  if (!unidade || valor === null || valor === 0n) return null;
  const nome = `${t} ${comVirgula(tam.replace(",", "."))} ${unidade.codigo}`;
  if (unidade.grandeza !== GRANDEZA_DA_BASE[base]) return { nome, quantidadeBase: null, precisaQuantidade: true };
  const q = multiplicarDecimal(tam, unidade.fator);
  return q ? { nome, quantidadeBase: q, precisaQuantidade: false } : null;
}

// ---------- máscaras ----------
export const soDigitos = (v: string) => v.replace(/\D/g, "");

/** CPF (11 dígitos) ou CNPJ (14) conforme o tamanho; vai formatando enquanto digita. */
export function mascararDocumento(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

/** (00) 0000-0000 ou (00) 00000-0000 (celular). */
export function mascararTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (d.length <= 10) return `(${ddd}) ${resto.length > 4 ? `${resto.slice(0, 4)}-${resto.slice(4)}` : resto}`;
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}

/**
 * Aplica a máscara ao que a pessoa digitou. Se ela apagou só um símbolo ("-", ")", "."), tira o
 * último número em vez de recolocar o símbolo (senão o apagar travaria).
 */
export function digitarComMascara(novo: string, anterior: string, mascara: (v: string) => string): string {
  if (novo.length < anterior.length && soDigitos(novo) === soDigitos(anterior)) return mascara(soDigitos(anterior).slice(0, -1));
  return mascara(novo);
}

/** Confere os dígitos verificadores do CNPJ (a mesma regra do servidor, só para mostrar o botão). */
export function cnpjValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    let peso = n - 7;
    for (let i = 0; i < n; i++) {
      soma += Number(d[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}
