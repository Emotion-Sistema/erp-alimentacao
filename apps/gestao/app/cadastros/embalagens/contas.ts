/**
 * Funções puras do catálogo de embalagens (sem React, sem banco, sem rede). Tudo que a tela
 * decide sozinha mora aqui, para ser testado em apps/gestao/testes/embalagens-contas.teste.ts.
 *
 * Regras que não mudam: quantidade é decimal exato em texto (nunca float; a conta usa
 * multiplicarDecimal, a mesma do servidor, com 4 casas); o nome do modelo é montado igual ao
 * do banco (função nome_do_modelo): "saco 25 kg", "galão 2,5 l", "caixa".
 */
import { multiplicarDecimal, unidadePorExtenso, type UnidadeBase, type UnidadePadrao } from "../auxiliares";

/** Como vem de GET /api/cadastros/embalagens. */
export type ModeloDeEmbalagem = {
  id: number;
  tipo: string;
  /** Texto decimal exato ("25", "2.5") ou nulo quando o modelo não tem tamanho. */
  tamanho: string | null;
  unidade: string | null;
  /** Nome pronto, em minúsculas ("saco 25 kg"). É ele que vai para o ingrediente. */
  nome: string;
  fornecedorId: number | null;
  fornecedor: string | null;
  ativo: boolean;
  /** Quantos ingredientes usam (é o que trava tipo e tamanho). */
  emUso: number;
};

export type Medida = "peso" | "volume" | "unidades" | "sem-tamanho";
export const MEDIDAS: readonly Medida[] = ["peso", "volume", "unidades", "sem-tamanho"];

const GRANDEZA_DA_MEDIDA: Record<string, Medida> = { massa: "peso", volume: "volume", contagem: "unidades" };
const GRANDEZA_DA_BASE: Record<UnidadeBase, string> = { g: "massa", ml: "volume", un: "contagem" };

// ---------- textos ----------

/** Sem acento, minúsculo, espaços simples. "Galão" -> "galao". */
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Mesma chave que o banco usa para barrar nome repetido (sem acento, caixa ou pontuação). */
export const chaveDoNome = (n: string) => normalizar(n).replace(/[^a-z0-9,]+/g, " ").trim();

export const capitalizar = (t: string) => (t ? t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1) : t);

/** Sigla da unidade para mostrar: litro é "L" (para não confundir com o número 1). */
export const siglaDaUnidade = (codigo: string) => (codigo.toLowerCase() === "l" ? "L" : codigo.toLowerCase());

/** "2.5" -> "2,5". */
const comVirgula = (v: string) => v.replace(".", ",");

/** "Saco 25 kg", "Galão 2,5 L", "Caixa". */
export function nomeDoModeloParaMostrar(m: Pick<ModeloDeEmbalagem, "tipo" | "tamanho" | "unidade">): string {
  const tipo = capitalizar(m.tipo.trim().replace(/\s+/g, " "));
  if (!m.tamanho || !m.unidade) return tipo;
  return `${tipo} ${comVirgula(m.tamanho)} ${siglaDaUnidade(m.unidade)}`;
}

/** Nome de uma embalagem já no ingrediente ("galão 5 l") escrito para mostrar ("Galão 5 L"). */
export function nomeParaMostrar(nome: string): string {
  return capitalizar(nome.trim()).replace(/(\d)\s*l\.?$/i, "$1 L");
}

/** Plural do tipo para o título do corredor: saco -> Sacos, galão -> Galões, barril -> Barris. */
export function plural(tipo: string): string {
  const t = tipo.trim().toLowerCase();
  let p: string;
  if (/ão$/.test(t)) p = t.replace(/ão$/, "ões");
  else if (/[rzs]$/.test(t)) p = `${t}es`;
  else if (/el$/.test(t)) p = t.replace(/el$/, "éis");
  else if (/ol$/.test(t)) p = t.replace(/ol$/, "óis");
  else if (/[au]l$/.test(t)) p = t.replace(/l$/, "is");
  else if (/il$/.test(t)) p = t.replace(/il$/, "is");
  else if (/m$/.test(t)) p = t.replace(/m$/, "ns");
  else p = `${t}s`;
  return capitalizar(p);
}

/**
 * Pedaços do texto com o trecho buscado marcado (sem acento e sem caixa: "galao" acha "Galão").
 * Devolve sempre o texto ORIGINAL, só cortado em pedaços.
 */
export function trechosComRealce(texto: string, termo: string): { texto: string; achado: boolean }[] {
  const alvo = normalizar(termo).replace(/\./g, ",");
  if (!alvo) return [{ texto, achado: false }];
  // Cada letra do texto normalizado lembra de qual letra do original veio.
  let normal = "";
  const origem: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const n = texto[i]!.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s/g, " ");
    for (const c of n) {
      normal += c;
      origem.push(i);
    }
  }
  const pedacos: { texto: string; achado: boolean }[] = [];
  let cursor = 0;
  let de = normal.indexOf(alvo);
  while (de !== -1 && alvo.length > 0) {
    const ini = origem[de]!;
    const fim = origem[de + alvo.length - 1]! + 1;
    if (ini > cursor) pedacos.push({ texto: texto.slice(cursor, ini), achado: false });
    pedacos.push({ texto: texto.slice(ini, fim), achado: true });
    cursor = fim;
    de = normal.indexOf(alvo, de + alvo.length);
  }
  if (cursor < texto.length) pedacos.push({ texto: texto.slice(cursor), achado: false });
  return pedacos.length ? pedacos : [{ texto, achado: false }];
}

/** O modelo aparece na busca? Procura no nome mostrado, no nome do banco e no fornecedor. */
export function casaComBusca(m: ModeloDeEmbalagem, termo: string): boolean {
  const alvo = normalizar(termo).replace(/\./g, ",");
  if (!alvo) return true;
  const onde = normalizar(`${nomeDoModeloParaMostrar(m)} ${m.nome} ${m.fornecedor ?? ""}`);
  return onde.includes(alvo) || onde.replace(/ /g, "").includes(alvo.replace(/ /g, ""));
}

// ---------- medida e conta ----------

/** Peso, volume, unidades ou sem tamanho (pela unidade do tamanho). */
export function medidaDoModelo(m: Pick<ModeloDeEmbalagem, "unidade">, unidades: UnidadePadrao[]): Medida {
  if (!m.unidade) return "sem-tamanho";
  const u = unidades.find((x) => x.codigo === m.unidade);
  return (u && GRANDEZA_DA_MEDIDA[u.grandeza]) || "sem-tamanho";
}

/**
 * Quanto 1 embalagem do modelo dá na unidade de dentro do ingrediente (g, ml ou un), com a mesma
 * conta do servidor. Nulo quando não dá para saber sozinho (outra família ou sem tamanho): aí a
 * pessoa informa.
 */
export function contaDoModelo(m: Pick<ModeloDeEmbalagem, "tamanho" | "unidade">, base: UnidadeBase, unidades: UnidadePadrao[]): string | null {
  if (!m.tamanho || !m.unidade) return null;
  const u = unidades.find((x) => x.codigo === m.unidade);
  if (!u || u.grandeza !== GRANDEZA_DA_BASE[base]) return null;
  return multiplicarDecimal(m.tamanho, u.fator);
}

/**
 * O nome de uma embalagem já colocada diz o tamanho na mesma família do estoque ("saco 25 kg"
 * num item em g)? Então a quantidade sai do nome (e o servidor exige que bata). Senão, nulo.
 */
export function quantidadePeloNome(nome: string, base: UnidadeBase, unidades: UnidadePadrao[]): string | null {
  const m = /([0-9]+(?:[.,][0-9]+)?)\s*([^0-9\s.,]+)\.?\s*$/.exec(nome.trim().toLowerCase());
  if (!m) return null;
  return contaDoModelo({ tamanho: m[1]!.replace(",", "."), unidade: m[2]! }, base, unidades);
}

/** Valor decimal positivo como a pessoa digitou ("12,5") no formato do servidor ("12.5"); senão nulo. */
export function quantidadeDigitada(v: string): string | null {
  const t = v.trim().replace(",", ".");
  return multiplicarDecimal(t, "1") ? t : null;
}

/** "Quantos gramas (g) vêm em 1 caixa 12 un?" (igual à mensagem do servidor). */
export function perguntaDaQuantidade(base: UnidadeBase, nomeDaEmbalagem: string): string {
  return `${base === "un" ? "Quantas" : "Quantos"} ${unidadePorExtenso(base).toLowerCase()} vêm em 1 ${nomeDaEmbalagem.trim()}?`;
}

export type LinhaLocal = { chave: number; nome: string; quantidade: string; modeloId?: number | null };

let contador = 0;
/** Chave estável de uma embalagem na tela (lista de embalagens de um item ainda não gravado). */
export const novaChave = () => ++contador;

/**
 * A unidade do estoque do item mudou de família (de kg para un, por exemplo): as embalagens cuja
 * quantidade sai do nome são refeitas; as que a pessoa digitou ficam vazias para ela dizer de novo
 * (40 unidades não viram 40 gramas). Na mesma família nada muda.
 */
export function ajustarLinhasParaBase<T extends LinhaLocal>(linhas: T[], baseAnterior: UnidadeBase, novaBase: UnidadeBase, unidades: UnidadePadrao[]): T[] {
  if (baseAnterior === novaBase) return linhas;
  return linhas.map((l) => ({ ...l, quantidade: quantidadePeloNome(l.nome, novaBase, unidades) ?? "" }));
}

// ---------- rascunho do painel ----------

export type Rascunho = { tipo: string; tamanho: string; unidade: string; fornecedorId: number | null };

/** "25,50" -> "25.5"; "" -> ""; inválido -> nulo. Até 7 dígitos e 4 casas, como o servidor. */
export function tamanhoNormalizado(t: string): string | null {
  const v = t.trim().replace(",", ".");
  if (!v) return "";
  if (!/^\d{1,7}(\.\d{1,4})?$/.test(v)) return null;
  const limpo = v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
  const semZeroNaFrente = limpo.replace(/^0+(?=\d)/, "");
  return /^[0.]+$/.test(semZeroNaFrente) ? null : semZeroNaFrente;
}

/** Nome que o banco vai dar ao modelo (minúsculas, vírgula no decimal): "galão 2,5 l". */
export function nomeDoRascunho(r: Pick<Rascunho, "tipo" | "tamanho" | "unidade">): string {
  const tipo = r.tipo.trim().replace(/\s+/g, " ").toLowerCase();
  const tam = tamanhoNormalizado(r.tamanho);
  if (!tam) return tipo;
  return `${tipo} ${comVirgula(tam)} ${r.unidade.toLowerCase()}`;
}

/** O que impede de gravar o rascunho (a primeira coisa), em linguagem simples; nulo = pronto. */
export function problemaDoRascunho(r: Rascunho, unidades: UnidadePadrao[]): string | null {
  const tipo = r.tipo.trim();
  if (!tipo) return "Escolha o tipo da embalagem (saco, caixa, pacote...).";
  if (tipo.length < 2) return "O tipo precisa de pelo menos 2 letras (ex.: saco).";
  if (tipo.length > 24) return "Tipo com no máximo 24 letras.";
  if (/[0-9]/.test(tipo)) return "O tipo é só a palavra (ex.: saco); o tamanho vai no campo de tamanho.";
  if (!/\p{L}/u.test(tipo)) return "O tipo precisa ter letras (ex.: saco).";
  if (unidades.some((u) => normalizar(u.codigo) === normalizar(tipo) || normalizar(u.nome) === normalizar(tipo)))
    return `"${tipo}" é uma unidade, não um tipo de embalagem. Use saco, caixa, pacote...`;
  const tam = tamanhoNormalizado(r.tamanho);
  if (tam === null) return "Confira o tamanho: use só números, com até 4 casas (ex.: 25 ou 2,5).";
  if (tam && !unidades.some((u) => u.codigo === r.unidade)) return "Escolha a unidade do tamanho (kg, g, L, ml, un...).";
  if (nomeDoRascunho(r).length > 40) return "Nome da embalagem longo demais: encurte o tipo.";
  return null;
}

/**
 * Já existe igual no catálogo? Igual = mesmo nome e mesmo fornecedor (ou os dois sem fornecedor),
 * como o banco confere. Também diz se há uma igual desativada (dá para reativar) e se há a mesma
 * "para qualquer fornecedor" (a nova vira o padrão de um fornecedor; pode).
 */
export function procurarIgual(
  r: Rascunho,
  modelos: ModeloDeEmbalagem[],
  idEmEdicao?: number,
): { ativa: ModeloDeEmbalagem | null; desativada: ModeloDeEmbalagem | null; geral: ModeloDeEmbalagem | null } {
  const chave = chaveDoNome(nomeDoRascunho(r));
  const outros = modelos.filter((m) => m.id !== idEmEdicao && chaveDoNome(m.nome) === chave);
  const doFornecedor = outros.filter((m) => (m.fornecedorId ?? null) === (r.fornecedorId ?? null));
  return {
    ativa: doFornecedor.find((m) => m.ativo) ?? null,
    desativada: doFornecedor.find((m) => !m.ativo) ?? null,
    geral: r.fornecedorId ? (outros.find((m) => m.ativo && m.fornecedorId === null) ?? null) : null,
  };
}

/**
 * Lê a busca como uma embalagem nova ("saco 30 kg", "balde 3,5 l", "tonel"), para o atalho
 * "Criar 'saco 30 kg'" quando nada é achado. Nulo se não parece uma embalagem.
 */
export function rascunhoDaBusca(termo: string, unidades: UnidadePadrao[]): Pick<Rascunho, "tipo" | "tamanho" | "unidade"> | null {
  const m = /^\s*([\p{L}][\p{L} ]*?)\s*(?:(\d+(?:[.,]\d+)?)\s*([\p{L}]+)\.?)?\s*$/u.exec(termo);
  if (!m) return null;
  const tipo = m[1]!.trim().toLowerCase();
  const tamanho = m[2] ?? "";
  const codigo = m[3] ? unidades.find((u) => normalizar(u.codigo) === normalizar(m[3]!) || normalizar(u.nome) === normalizar(m[3]!))?.codigo : "";
  if (codigo === undefined) return null;
  const r = { tipo, tamanho, unidade: codigo || "", fornecedorId: null };
  return problemaDoRascunho({ ...r, unidade: r.unidade || "kg" }, unidades) ? null : r;
}

/** Compara dois decimais positivos em texto ("25", "2.5") sem passar por float. */
export function compararDecimal(a: string, b: string): number {
  const [ia = "0", fa = ""] = a.split(".");
  const [ib = "0", fb = ""] = b.split(".");
  const casas = Math.max(fa.length, fb.length);
  const x = BigInt(ia + fa.padEnd(casas, "0"));
  const y = BigInt(ib + fb.padEnd(casas, "0"));
  return x === y ? 0 : x < y ? -1 : 1;
}

// ---------- filtros do catálogo ----------

/** Fornecedor do filtro: todos, só os "para qualquer fornecedor", ou o id de um. */
export type FiltroDeFornecedor = "todos" | "qualquer" | number;
export type Filtros = { tipo: string | null; fornecedor: FiltroDeFornecedor; medida: Medida | null };
export const FILTROS_VAZIOS: Filtros = { tipo: null, fornecedor: "todos", medida: null };

export const filtrosAtivos = (f: Filtros) => f.tipo !== null || f.fornecedor !== "todos" || f.medida !== null;

function passa(m: ModeloDeEmbalagem, f: Filtros, unidades: UnidadePadrao[], ignorar?: keyof Filtros): boolean {
  if (ignorar !== "tipo" && f.tipo !== null && m.tipo !== f.tipo) return false;
  if (ignorar !== "fornecedor") {
    if (f.fornecedor === "qualquer" && m.fornecedorId !== null) return false;
    if (typeof f.fornecedor === "number" && m.fornecedorId !== f.fornecedor) return false;
  }
  if (ignorar !== "medida" && f.medida !== null && medidaDoModelo(m, unidades) !== f.medida) return false;
  return true;
}

export function filtrarModelos(modelos: ModeloDeEmbalagem[], f: Filtros, termo: string, unidades: UnidadePadrao[]): ModeloDeEmbalagem[] {
  return modelos.filter((m) => casaComBusca(m, termo) && passa(m, f, unidades));
}

/**
 * Contadores ao vivo de cada chip: quantos aparecem se a pessoa tocar nele, mantendo a busca e os
 * outros filtros. Chave "" = "Todos".
 */
export function contarParaFiltros(
  modelos: ModeloDeEmbalagem[],
  f: Filtros,
  termo: string,
  unidades: UnidadePadrao[],
): { tipo: Map<string, number>; fornecedor: Map<string, number>; medida: Map<string, number> } {
  const achados = modelos.filter((m) => casaComBusca(m, termo));
  const contar = (campo: keyof Filtros, chave: (m: ModeloDeEmbalagem) => string) => {
    const mapa = new Map<string, number>([["", 0]]);
    for (const m of achados) {
      if (!passa(m, f, unidades, campo)) continue;
      mapa.set("", mapa.get("")! + 1);
      const k = chave(m);
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
      if (campo === "fornecedor" && m.fornecedorId === null) mapa.set("qualquer", (mapa.get("qualquer") ?? 0) + 1);
    }
    return mapa;
  };
  return {
    tipo: contar("tipo", (m) => m.tipo),
    fornecedor: contar("fornecedor", (m) => (m.fornecedorId === null ? "__nenhum" : String(m.fornecedorId))),
    medida: contar("medida", (m) => medidaDoModelo(m, unidades)),
  };
}

/** Tipos na ordem do catálogo (os mais comuns primeiro, depois os criados pela casa, em ordem alfabética). */
const ORDEM_DOS_TIPOS = ["saco", "pacote", "caixa", "fardo", "bandeja", "lata", "garrafa", "galão", "pote", "balde"];
export function ordenarTipos(tipos: Iterable<string>): string[] {
  return [...new Set(tipos)].sort((a, b) => {
    const ia = ORDEM_DOS_TIPOS.indexOf(a);
    const ib = ORDEM_DOS_TIPOS.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, "pt-BR");
  });
}

/** Corredores: um por tipo, cada um com os modelos em ordem de tamanho (sem tamanho primeiro). */
export function agruparPorTipo(modelos: ModeloDeEmbalagem[], unidades: UnidadePadrao[]): { tipo: string; modelos: ModeloDeEmbalagem[] }[] {
  const ordemDaMedida = (m: ModeloDeEmbalagem) => MEDIDAS.indexOf(medidaDoModelo(m, unidades));
  const tamanhoNaBase = (m: ModeloDeEmbalagem) => {
    if (!m.tamanho || !m.unidade) return "0";
    const u = unidades.find((x) => x.codigo === m.unidade);
    return multiplicarDecimal(m.tamanho, u?.fator ?? "1") ?? "0";
  };
  return ordenarTipos(modelos.map((m) => m.tipo)).map((tipo) => ({
    tipo,
    modelos: modelos
      .filter((m) => m.tipo === tipo)
      .sort(
        (a, b) =>
          (a.tamanho === null ? -1 : 0) - (b.tamanho === null ? -1 : 0) ||
          ordemDaMedida(a) - ordemDaMedida(b) ||
          compararDecimal(tamanhoNaBase(a), tamanhoNaBase(b)) ||
          (a.fornecedor ?? "").localeCompare(b.fornecedor ?? "", "pt-BR"),
      ),
  }));
}

// ---------- sugestões no ingrediente ----------

export type MotivoDaSugestao = "fornecedor" | "mais-usada" | "mesma-familia";
export type Sugestao = { modelo: ModeloDeEmbalagem; motivo: MotivoDaSugestao };

/**
 * Sugestões para um ingrediente: primeiro o padrão do fornecedor do item, depois as mais usadas
 * (que fazem a conta sozinha), depois as da mesma família do estoque. Só ativas.
 */
export function sugerirModelos(
  modelos: ModeloDeEmbalagem[],
  contexto: { fornecedorId: number | null; base: UnidadeBase; unidades: UnidadePadrao[]; limite?: number },
): Sugestao[] {
  const limite = contexto.limite ?? 6;
  // Na ordem do catálogo (tipos mais comuns primeiro, tamanhos crescentes).
  const ativos = agruparPorTipo(
    modelos.filter((m) => m.ativo),
    contexto.unidades,
  ).flatMap((g) => g.modelos);
  const mesmaFamilia = (m: ModeloDeEmbalagem) => contaDoModelo(m, contexto.base, contexto.unidades) !== null;
  const doFornecedor = contexto.fornecedorId === null ? [] : ativos.filter((m) => m.fornecedorId === contexto.fornecedorId);
  const usadas = new Set(doFornecedor.map((m) => m.id));
  const resto = ativos.filter((m) => !usadas.has(m.id) && (m.fornecedorId === null || m.fornecedorId === contexto.fornecedorId));
  const maisUsadas = resto.filter((m) => m.emUso > 0 && mesmaFamilia(m)).sort((a, b) => b.emUso - a.emUso || a.id - b.id);
  const ids = new Set(maisUsadas.map((m) => m.id));
  const familia = resto.filter((m) => !ids.has(m.id) && mesmaFamilia(m));
  const lista: Sugestao[] = [
    ...doFornecedor.map((modelo) => ({ modelo, motivo: "fornecedor" as const })),
    ...maisUsadas.map((modelo) => ({ modelo, motivo: "mais-usada" as const })),
    ...familia.map((modelo) => ({ modelo, motivo: "mesma-familia" as const })),
  ];
  // O padrão do fornecedor aparece sempre inteiro; o resto completa até o limite.
  return lista.slice(0, Math.max(limite, doFornecedor.length));
}

/** "2 embalagens: Saco 25 kg, Caixa 12 un" (até 3 nomes, depois "e mais N"); "Nenhuma". */
export function resumoDasEmbalagens(nomes: string[]): string {
  if (nomes.length === 0) return "Nenhuma";
  const mostrados = nomes.slice(0, 3).map(nomeParaMostrar).join(", ");
  const mais = nomes.length > 3 ? ` e mais ${nomes.length - 3}` : "";
  return `${nomes.length} ${nomes.length === 1 ? "embalagem" : "embalagens"}: ${mostrados}${mais}`;
}
