/**
 * Peças das telas do estoque (cliente): mostrar quantidade e dinheiro sem float, a chave contra
 * toque duplo e o filtro da URL. Nunca importa `@erp/dominio` raiz.
 */
import { mostrarQuantidade, opcoesDaBase } from "@erp/dominio/unidades";

/**
 * Quantidade do servidor (texto na unidade do estoque: g, ml ou un) para ler: "2.500 g" vira
 * "2,5 kg"; "-500" fica "-500 g". Preparo pode contar em outra unidade: sai como veio.
 */
export function qtd(valor: string | null | undefined, unidade: string): string {
  if (valor === null || valor === undefined) return "";
  const neg = valor.startsWith("-");
  const abs = neg ? valor.slice(1) : valor;
  const grande = /^\d{4,}/.test(abs);
  const mostrar = unidade === "g" && grande ? "kg" : unidade === "ml" && grande ? "l" : unidade;
  const t = mostrarQuantidade(valor, mostrar) ?? mostrarQuantidade(valor, unidade);
  if (t) return t;
  return `${valor.replace(".", ",")} ${unidade}`.trim();
}

/** Mudança com sinal: "+2 kg" ou "-500 g". */
export function qtdComSinal(valor: string, unidade: string): string {
  return valor.startsWith("-") || valor === "0" ? qtd(valor, unidade) : `+${qtd(valor, unidade)}`;
}

/** Centavos (texto inteiro, pode ser negativo) -> "R$ 1.234,56". Feito com BigInt. */
export function reais(centavos: string | null | undefined): string {
  if (centavos === null || centavos === undefined || !/^-?\d+$/.test(centavos)) return "";
  const n = BigInt(centavos);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const inteiro = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${inteiro},${(a % 100n).toString().padStart(2, "0")}`;
}

/**
 * Custo médio (centavos por 1 unidade do estoque, com até 4 casas, ex.: "1.2345") -> "R$ 12,35 por kg".
 * Grama e mililitro viram quilo e litro (é como se compra).
 */
export function custoMedio(centavosPorUnidade: string | null, unidade: string): string {
  if (!centavosPorUnidade) return "";
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(centavosPorUnidade);
  if (!m) return "";
  const dezMil = BigInt(m[1]!) * 10_000n + BigInt((m[2] ?? "").padEnd(4, "0"));
  const fator = unidade === "g" || unidade === "ml" ? 1000n : 1n;
  const centavos = (dezMil * fator + 5_000n) / 10_000n;
  const por = unidade === "g" ? "kg" : unidade === "ml" ? "L" : unidade;
  return `${reais(centavos.toString())} por ${por}`;
}

/** "2026-11-24" -> "24/11/2026". */
export function dia(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Hoje no fuso da loja (AAAA-MM-DD). */
export function hojeNaLoja(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

/**
 * Chave de um envio de formulário (contra toque duplo e reenvio): o mesmo envio repetido devolve o
 * que já foi gravado. Uma chave nova a cada formulário aberto e depois de cada gravação.
 */
export function novaChave(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fora de https: monta à mão abaixo */
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** ?a=1&b=sim (vazios saem). */
export function consulta(filtro: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtro)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  const t = p.toString();
  return t ? `?${t}` : "";
}

/** Unidades em que a pessoa pode informar a quantidade: as da família do item (e embalagens, se houver). */
export function unidadesDoItem(unidade: string, embalagens: readonly string[] = []): { valor: string; texto: string }[] {
  const familia = opcoesDaBase(unidade).map((o) => ({ valor: o.codigo, texto: o.nome }));
  const base = familia.length ? familia : [{ valor: unidade, texto: unidade }];
  return [...base, ...embalagens.map((e) => ({ valor: e, texto: `${e} (embalagem)` }))];
}

/** Baixa um texto como arquivo (montado aqui na tela). */
export function baixarArquivo(nome: string, texto: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lê um arquivo do aparelho em base64 (vai dentro do JSON; o servidor confere de novo). */
export function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolver, falhar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).replace(/^data:[^,]*,/, ""));
    leitor.onerror = () => falhar(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

/** Texto decimal do servidor ("12.5", "-3") -> dez-milésimos (BigInt), para somar sem float. */
export function q4(t: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(t.trim());
  if (!m) return 0n;
  const v = BigInt(m[2]!) * 10_000n + BigInt((m[3] ?? "").padEnd(4, "0"));
  return m[1] ? -v : v;
}

/** Dez-milésimos -> texto decimal com ponto ("12.5"), como o servidor manda. */
export function textoQ4(q: bigint): string {
  const neg = q < 0n;
  const a = neg ? -q : q;
  const resto = (a % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / 10_000n}${resto ? `.${resto}` : ""}`;
}
