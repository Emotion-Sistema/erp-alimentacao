import { CANAIS, type Canal } from "./horarios-comum";

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
  /** Preço no delivery; nulo = igual ao da loja (migração 0015). */
  precoDeliveryCentavos: number | null;
  ordem: number;
  ativo: boolean;
  /** Tamanhos ativos, na ordem (vazio = produto sem tamanho). */
  tamanhos: Tamanho[];
  /** Grupos de adicionais que o produto oferece, na ordem (ids; ligações ativas). */
  gruposAdicionais: number[];
  /** Foto ativa (id em /api/cadastros/produtos/foto/[id]); nulo = sem foto (decisão 0022). */
  fotoId: number | null;
};


/** O mesmo jeito de comparar nomes do banco (função nome_de_unidade, migração 0006). */
export function nomeComparavel(texto: string): string {
  // A mesma lista de acentos do translate() da função do banco; outras letras viram espaço, como lá.
  const de = "áàâãäéèêëíìîïóòôõöúùûüçñ";
  const para = "aaaaaeeeeiiiiooooouuuucn";
  return [...texto.toLowerCase()]
    .map((c) => {
      const i = de.indexOf(c);
      return i < 0 ? c : para[i];
    })
    .join("")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .trim()
    .replace(/^1 /, "");
}

export const TAMANHOS_POR_PRODUTO = 10;
export const GRUPOS_POR_PRODUTO = 10;
export const ITENS_POR_GRUPO = 40;
export const MAXIMO_POR_ITEM = 10;
export const ESCOLHAS_POR_GRUPO = 20;

/** Tamanho do produto: soma um acréscimo ao preço do produto (0 no menor). */
export type Tamanho = {
  id: number;
  nome: string;
  acrescimoCentavos: number;
  /** Nulo = igual ao acréscimo da loja. */
  acrescimoDeliveryCentavos: number | null;
  ordem: number;
};

export type Adicional = {
  id: number;
  nome: string;
  /** Pode ser 0 (escolha sem custo, ex.: ponto da carne). */
  precoCentavos: number;
  /** Nulo = igual ao da loja. */
  precoDeliveryCentavos: number | null;
  /** Quantas vezes entra no mesmo item (1 a 10). */
  maximoPorItem: number;
  ordem: number;
  ativo: boolean;
};

export type GrupoDeAdicionais = {
  id: number;
  nome: string;
  /** 0 = opcional; 1 ou mais = escolha obrigatória. */
  minimo: number;
  maximo: number;
  ativo: boolean;
  /** Itens do grupo, ativos primeiro, na ordem. */
  itens: Adicional[];
};

/** Preço do produto no canal (o delivery usa o da loja quando não tem preço próprio). */
export const precoNoCanal = (p: Pick<Produto, "precoCentavos" | "precoDeliveryCentavos">, canal: Canal): number =>
  canal === "delivery" ? (p.precoDeliveryCentavos ?? p.precoCentavos) : p.precoCentavos;

export const acrescimoNoCanal = (t: Pick<Tamanho, "acrescimoCentavos" | "acrescimoDeliveryCentavos">, canal: Canal): number =>
  canal === "delivery" ? (t.acrescimoDeliveryCentavos ?? t.acrescimoCentavos) : t.acrescimoCentavos;

export const precoDoAdicionalNoCanal = (a: Pick<Adicional, "precoCentavos" | "precoDeliveryCentavos">, canal: Canal): number =>
  canal === "delivery" ? (a.precoDeliveryCentavos ?? a.precoCentavos) : a.precoCentavos;

export type EscolhaDoItem = {
  tamanhoId?: number | null;
  adicionais?: { id: number; quantidade: number }[];
};

export type PrecoDoItem =
  | {
      ok: true;
      canal: Canal;
      /** Preço de UMA unidade do item: produto + tamanho + adicionais. */
      unitarioCentavos: number;
      baseCentavos: number;
      tamanho: { id: number; nome: string; acrescimoCentavos: number } | null;
      adicionais: {
        id: number;
        nome: string;
        grupoId: number;
        quantidade: number;
        unitarioCentavos: number;
        totalCentavos: number;
      }[];
    }
  | { ok: false; motivo: string };

const inteiroPositivo = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/**
 * Preço de uma unidade do item, conferindo as escolhas (regra única, usada pela tela para mostrar
 * e pelo servidor para gravar; o servidor é quem vale). Só ativos contam: produto, tamanho, grupo
 * ligado e item do grupo. Produto com tamanho exige um tamanho; cada grupo respeita mínimo e
 * máximo de escolhas; cada adicional, o máximo por item. Tudo em centavos inteiros.
 * `grupos`: os grupos de adicionais (pode vir a lista inteira; só os do produto contam).
 */
export function precoDoItem(produto: Produto, grupos: readonly GrupoDeAdicionais[], canal: Canal, escolha: EscolhaDoItem): PrecoDoItem {
  const erro = (motivo: string): PrecoDoItem => ({ ok: false, motivo });
  if (!escolha || typeof escolha !== "object" || Array.isArray(escolha)) return erro("Escolha em formato inválido.");
  if (!CANAIS.includes(canal)) return erro("Canal desconhecido.");
  if (!produto.ativo) return erro(`${produto.nome}: produto fora de venda.`);

  let tamanho: Tamanho | null = null;
  const tamanhoId = escolha.tamanhoId ?? null;
  if (produto.tamanhos.length) {
    if (tamanhoId === null) return erro(`${produto.nome}: escolha o tamanho.`);
    tamanho = produto.tamanhos.find((t) => t.id === tamanhoId) ?? null;
    if (!tamanho) return erro(`${produto.nome}: tamanho não encontrado.`);
  } else if (tamanhoId !== null) return erro(`${produto.nome}: este produto não tem tamanhos.`);

  // Grupos oferecidos: ligados ao produto e ativos, na ordem do produto.
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const oferecidos = produto.gruposAdicionais.map((id) => porId.get(id)).filter((g): g is GrupoDeAdicionais => !!g && g.ativo);
  const itemDoGrupo = new Map<number, { item: Adicional; grupo: GrupoDeAdicionais }>();
  for (const g of oferecidos) for (const a of g.itens) if (a.ativo) itemDoGrupo.set(a.id, { item: a, grupo: g });

  const pedidos = escolha.adicionais ?? [];
  if (!Array.isArray(pedidos)) return erro("Adicionais em formato inválido.");
  const vistos = new Set<number>();
  const porGrupo = new Map<number, number>();
  const linhas: Extract<PrecoDoItem, { ok: true }>["adicionais"] = [];
  for (const p of pedidos) {
    if (!p || !inteiroPositivo(p.id) || !inteiroPositivo(p.quantidade)) return erro("Adicional em formato inválido.");
    if (vistos.has(p.id)) return erro("O mesmo adicional veio duas vezes; use a quantidade.");
    vistos.add(p.id);
    const achado = itemDoGrupo.get(p.id);
    if (!achado) return erro(`${produto.nome}: adicional não disponível para este produto.`);
    const { item, grupo } = achado;
    if (p.quantidade > item.maximoPorItem)
      return erro(`${item.nome}: no máximo ${item.maximoPorItem} ${item.maximoPorItem === 1 ? "vez" : "vezes"} por item.`);
    porGrupo.set(grupo.id, (porGrupo.get(grupo.id) ?? 0) + p.quantidade);
    const unitario = precoDoAdicionalNoCanal(item, canal);
    linhas.push({ id: item.id, nome: item.nome, grupoId: grupo.id, quantidade: p.quantidade, unitarioCentavos: unitario, totalCentavos: unitario * p.quantidade });
  }
  for (const g of oferecidos) {
    const n = porGrupo.get(g.id) ?? 0;
    if (n < g.minimo) return erro(g.minimo === 1 ? `${g.nome}: escolha uma opção.` : `${g.nome}: escolha pelo menos ${g.minimo}.`);
    if (n > g.maximo) return erro(g.maximo === 1 ? `${g.nome}: escolha só uma opção.` : `${g.nome}: escolha no máximo ${g.maximo}.`);
  }

  const base = precoNoCanal(produto, canal);
  const acrescimo = tamanho ? acrescimoNoCanal(tamanho, canal) : 0;
  const unitario = base + acrescimo + linhas.reduce((s, l) => s + l.totalCentavos, 0);
  return {
    ok: true,
    canal,
    unitarioCentavos: unitario,
    baseCentavos: base,
    tamanho: tamanho ? { id: tamanho.id, nome: tamanho.nome, acrescimoCentavos: acrescimo } : null,
    adicionais: linhas,
  };
}

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
