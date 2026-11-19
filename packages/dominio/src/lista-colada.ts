/**
 * Lê uma lista colada (WhatsApp, Excel, bloco de notas) e diz, linha por linha, o que entendeu
 * e o que falta (ideia nº 4, 15/11/2026). NÃO grava nada: a tela mostra a prévia, a pessoa
 * confere e só então manda gravar (cadastrarEmLote, que confere tudo de novo no servidor).
 * Exemplos que entende:
 *   "Farinha de trigo - saco 25 kg"      "Ovo; caixa com 30"      "Leite integral | fardo 12 l"
 *   "Refrigerante lata: fardo 12 latas"  "Queijo muçarela 4kg"     "- Cebola"
 * Regras de segurança (revisão de 15/11/2026): unidade desconhecida é erro, nunca vira "un";
 * número ambíguo ("1.000") é erro; linha longa é recusada antes de qualquer expressão regular;
 * o limite conta só linhas com texto e avisa o que ficou de fora. Decimal exato, nunca float.
 */
import { NOME_DA_AREA, type AreaEstoque, type UnidadeBase } from "./cadastros";
import { CATALOGO_INGREDIENTES, chaveDeBusca, type ItemDoCatalogo } from "./catalogo-ingredientes";

export const MAXIMO_DE_LINHAS = 300;
export const MAXIMO_POR_LINHA = 200;

type Grandeza = "massa" | "volume" | "contagem";
/** Espelho das unidades padrão da migração 0006 (fator em relação a g, ml ou un), com os apelidos. */
const UNIDADES: readonly { codigo: string; grandeza: Grandeza; fator: string; jeitos: readonly string[] }[] = [
  { codigo: "mg", grandeza: "massa", fator: "0.001", jeitos: ["mg", "mgs", "miligrama", "miligramas"] },
  { codigo: "g", grandeza: "massa", fator: "1", jeitos: ["g", "gr", "grs", "grama", "gramas"] },
  { codigo: "kg", grandeza: "massa", fator: "1000", jeitos: ["kg", "kgs", "quilo", "quilos", "kilo", "kilos", "quilograma", "quilogramas", "kilograma", "kilogramas"] },
  { codigo: "t", grandeza: "massa", fator: "1000000", jeitos: ["t", "ton", "tonelada", "toneladas"] },
  { codigo: "ml", grandeza: "volume", fator: "1", jeitos: ["ml", "mls", "cc", "cm3", "mililitro", "mililitros"] },
  { codigo: "cl", grandeza: "volume", fator: "10", jeitos: ["cl", "centilitro", "centilitros"] },
  { codigo: "dl", grandeza: "volume", fator: "100", jeitos: ["dl", "decilitro", "decilitros"] },
  { codigo: "l", grandeza: "volume", fator: "1000", jeitos: ["l", "lt", "lts", "litro", "litros"] },
  { codigo: "un", grandeza: "contagem", fator: "1", jeitos: ["un", "und", "unid", "unidade", "unidades"] },
  { codigo: "dz", grandeza: "contagem", fator: "12", jeitos: ["dz", "duzia", "duzias"] },
];
/** Palavras que contam peças (valem como "un"). Só estas: qualquer outra palavra é erro. */
const PALAVRAS_DE_CONTAGEM = new Set([
  "", "lata", "latas", "garrafa", "garrafas", "ovo", "ovos", "pao", "paes", "pacote", "pacotes", "sache", "saches",
  "pote", "potes", "caixa", "caixas", "caixinha", "caixinhas", "bandeja", "bandejas", "peca", "pecas", "fatia", "fatias",
  "folha", "folhas", "cabeca", "cabecas", "copo", "copos", "saco", "sacos", "tablete", "tabletes", "vidro", "vidros",
  "bisnaga", "bisnagas", "maco", "macos", "pedaco", "pedacos", "rolo", "rolos", "capsula", "capsulas",
]);
const BASE_DA_GRANDEZA: Record<Grandeza, UnidadeBase> = { massa: "g", volume: "ml", contagem: "un" };
const GRANDEZA_DA_BASE: Record<UnidadeBase, Grandeza> = { g: "massa", ml: "volume", un: "contagem" };

/** Tipos de embalagem e abreviações comuns. */
const EMBALAGENS: Record<string, string> = {
  caixa: "caixa", cx: "caixa", caixas: "caixa",
  pacote: "pacote", pct: "pacote", pc: "pacote", pacotes: "pacote",
  saco: "saco", sc: "saco", sacos: "saco",
  fardo: "fardo", fd: "fardo", fardos: "fardo",
  bandeja: "bandeja", bdj: "bandeja",
  lata: "lata", latas: "lata",
  garrafa: "garrafa", gf: "garrafa", garrafas: "garrafa",
  galao: "galão", galoes: "galão",
  pote: "pote", potes: "pote",
  balde: "balde", baldes: "balde",
  peca: "peça", pecas: "peça",
  maco: "maço", macos: "maço",
  bisnaga: "bisnaga",
  vidro: "vidro",
  sache: "sachê", saches: "sachê",
  tablete: "tablete",
  bag: "bag",
  engradado: "engradado",
};

const unidadePorJeito = (palavra: string) => UNIDADES.find((u) => u.jeitos.includes(palavra));

// ---------- decimal exato (4 casas) ----------
const ESCALA = 10000n;
function paraInteiro(v: string): bigint | null {
  const m = /^(\d{1,10})(?:\.(\d{1,4}))?$/.exec(v);
  if (!m) return null;
  return BigInt(m[1]!) * ESCALA + BigInt((m[2] ?? "").padEnd(4, "0"));
}
function paraTexto(n: bigint): string {
  const inteiro = n / ESCALA;
  const resto = (n % ESCALA).toString().padStart(4, "0").replace(/0+$/, "");
  return resto ? `${inteiro}.${resto}` : `${inteiro}`;
}
/** a × b, cada um com até 4 casas (mais que isso é recusado); arredonda a 4 casas (meio para cima), como o banco. */
function multiplicar(a: string, b: string): string | null {
  const x = paraInteiro(a);
  const y = paraInteiro(b);
  if (x === null || y === null) return null;
  const arred = (x * y + ESCALA / 2n) / ESCALA; // x*y tem escala 10^8
  return arred === 0n ? null : paraTexto(arred);
}

// ---------- leitura ----------

export type EmbalagemLida = {
  nome: string;
  /** Quantidade na unidade do estoque; null quando não dá para saber (falta dizer). */
  quantidadeBase: string | null;
  doCatalogo: boolean;
  problema?: string;
};

export type LinhaLida = {
  numero: number;
  texto: string;
  nome: string;
  unidadeBase: UnidadeBase | null;
  area: AreaEstoque;
  embalagens: EmbalagemLida[];
  /** Item do catálogo que casou (unidade, área e embalagens vieram dele). */
  catalogo: string | null;
  situacao: "pronto" | "conferir" | "erro";
  avisos: string[];
  erros: string[];
};

type TamanhoLido = { tipo: string | null; numero: string; palavra: string; com: boolean } | { erro: string };

/** "saco 25kg", "caixa com 30", "fardo 12 latas", "12 x 1 l", "25 kg" -> partes. Texto já curto. */
function lerTamanho(t: string): TamanhoLido | null {
  // "1.000" (ponto e 3 dígitos, sem vírgula) pode ser mil ou um: não adivinha.
  if (/\d\.\d{3}(?!\d)/.test(t) && !t.includes(",")) return { erro: `"${t}" é ambíguo: escreva 1000 (mil) ou 1,5 (um e meio).` };
  // Decimal com vírgula ou ponto vira ponto; o resto passa pela chave de busca (sem acento, sem pontuação).
  const decimais: string[] = [];
  const marcado = t.replace(/(\d)([a-zA-Zà-úÀ-Ú])/g, "$1 $2").replace(/(\d+)[.,](\d+)/g, (_, a: string, b: string) => {
    decimais.push(`${a}.${b}`);
    return ` #${decimais.length - 1} `;
  });
  const s = chaveDeBusca(marcado.replace(/#(\d+)/g, "n$1n")).replace(/\s+/g, " ").trim();
  const numero = (pedaco: string): string => {
    const m = /^n(\d+)n$/.exec(pedaco);
    return m ? decimais[Number(m[1])]! : pedaco;
  };
  const NUM = "(n\\d+n|\\d+)";
  const multi = new RegExp(`^(?:([a-z]+) )?${NUM} ?x ?${NUM} ?([a-z]+)$`).exec(s);
  if (multi) {
    const total = multiplicar(numero(multi[2]!), numero(multi[3]!));
    if (!total) return { erro: `Quantidade inválida em "${t}".` };
    return { tipo: multi[1] ? (EMBALAGENS[multi[1]] ?? multi[1]) : "fardo", numero: total, palavra: multi[4]!, com: false };
  }
  const m = new RegExp(`^(?:(?!(?:com|c|de) )([a-z]+) )?(?:(com|c|de) )?${NUM}(?: ([a-z]+))?$`).exec(s);
  if (!m) return null;
  return { tipo: m[1] ? (EMBALAGENS[m[1]] ?? m[1]) : null, numero: numero(m[3]!), palavra: m[4] ?? "", com: !!m[2] };
}

function achaNoCatalogo(nome: string): ItemDoCatalogo | undefined {
  const k = chaveDeBusca(nome);
  return CATALOGO_INGREDIENTES.find((c) => [c.nome, ...(c.sinonimos ?? [])].some((n) => chaveDeBusca(n) === k));
}

const TIPOS = Object.keys(EMBALAGENS).join("|");
// Só roda sobre linha curta (≤ 200) e com espaços já juntados: sem retrocesso explosivo.
const TAMANHO_NO_FIM = new RegExp(
  `^(.{2,}?) ((?:(?:${TIPOS}) )?(?:(?:com|c/|de) )?\\d+(?:[.,]\\d+)?(?: ?x ?\\d+(?:[.,]\\d+)?)? ?[a-zà-ú0-9]*)$`,
  "i",
);

function separar(linha: string): { nome: string; resto: string } {
  const partes = linha.split(/ [-–—] |[;|\t:]/).map((p) => p.trim()).filter(Boolean);
  if (partes.length >= 2) return { nome: partes[0]!, resto: partes.slice(1).join(" ") };
  // Sem separador: procura o tamanho no fim ("Queijo muçarela 4kg", "Ovo caixa com 30").
  const m = TAMANHO_NO_FIM.exec(linha);
  if (m) return { nome: m[1]!.trim(), resto: m[2]!.trim() };
  return { nome: linha, resto: "" };
}

function linhaDeErro(numero: number, texto: string, erro: string): LinhaLida {
  return { numero, texto, nome: texto.slice(0, 120), unidadeBase: null, area: "cozinha", embalagens: [], catalogo: null, situacao: "erro", avisos: [], erros: [erro] };
}

export type EmbalagemDoTexto = {
  /** Unidade do estoque depois da leitura (a embalagem pode dizer qual é, quando ainda não se sabia). */
  unidadeBase: UnidadeBase | null;
  embalagem: EmbalagemLida | null;
  erros: string[];
  avisos: string[];
};

/**
 * Lê UMA embalagem escrita como texto ("saco 25 kg", "caixa com 30", "fardo 12 latas") para um
 * ingrediente que conta em `unidadeBase` (ou ainda sem unidade: a embalagem diz). É a mesma regra
 * da lista colada; a importação de planilha (decisão 0020) usa esta função para a coluna Embalagens.
 * O texto precisa vir curto (até MAXIMO_POR_LINHA) e com espaços já juntados.
 */
export function lerEmbalagemDoTexto(resto: string, unidadeInicial: UnidadeBase | null, nome: string): EmbalagemDoTexto {
  let unidadeBase = unidadeInicial;
  let embalagem: EmbalagemLida | null = null;
  const erros: string[] = [];
  const avisos: string[] = [];
  const t = lerTamanho(resto);
  if (!t) {
    erros.push(`Não entendi "${resto}". Escreva assim: saco 25 kg, caixa com 30, fardo 12 latas.`);
  } else if ("erro" in t) {
    erros.push(t.erro);
  } else {
    const u = unidadePorJeito(t.palavra);
    // Número sem unidade só é contagem com "com"/"c/" ("caixa com 30") ou se o item já é contado em un.
    if (!u && t.palavra === "" && !t.com && unidadeBase !== "un") {
      erros.push(`Diga a unidade de "${resto}" (ex.: ${resto} kg, ${resto} un ou "com ${t.numero.replace(".", ",")}").`);
    } else if (!u && !PALAVRAS_DE_CONTAGEM.has(t.palavra)) {
      erros.push(`Não conheço a unidade "${t.palavra}". Use g, kg, ml, l, un ou dz (ex.: saco 25 kg).`);
    } else {
      const grandeza: Grandeza = u?.grandeza ?? "contagem";
      const curta = u?.codigo ?? "un";
      if (!unidadeBase) unidadeBase = BASE_DA_GRANDEZA[grandeza];
      const nomeEmb = `${t.tipo ? `${t.tipo} ` : ""}${t.numero.replace(".", ",")} ${curta}`;
      if (GRANDEZA_DA_BASE[unidadeBase] === grandeza) {
        const q = multiplicar(t.numero, u?.fator ?? "1");
        if (!q) erros.push(`Quantidade inválida em "${resto}".`);
        else if (q.split(".")[0]!.length > 10) erros.push(`Quantidade grande demais em "${resto}".`);
        else if (t.tipo) embalagem = { nome: nomeEmb, quantidadeBase: q, doCatalogo: false };
        // Sem tipo de embalagem e na mesma grandeza ("Sal 1 kg", "Leite 1 l"): o sistema já
        // converte sozinho; só serviu para dizer a unidade do estoque.
      } else {
        embalagem = {
          nome: nomeEmb,
          quantidadeBase: null,
          doCatalogo: false,
          problema: `Quanto ${nomeEmb} dá em ${unidadeBase}? Preencha antes de gravar.`,
        };
        avisos.push(`"${nome}" é contado em ${unidadeBase}: diga quanto ${nomeEmb} dá em ${unidadeBase}.`);
      }
    }
  }
  return { unidadeBase, embalagem, erros, avisos };
}

/**
 * Lê o texto colado. `jaCadastrados`: nomes de ingredientes ATIVOS que já existem (a tela
 * recebe do servidor), para avisar repetido antes de gravar.
 */
export function lerListaColada(texto: string, jaCadastrados: readonly string[] = []): LinhaLida[] {
  const existentes = new Set(jaCadastrados.map(chaveDeBusca));
  const vistos = new Map<string, number>();
  const saida: LinhaLida[] = [];
  const comTexto: { numero: number; bruta: string }[] = [];
  texto.split(/\r?\n/).forEach((bruta, idx) => {
    if (bruta.trim()) comTexto.push({ numero: idx + 1, bruta });
  });
  const lidas = comTexto.slice(0, MAXIMO_DE_LINHAS);
  for (const { numero, bruta } of lidas) {
    if (bruta.length > MAXIMO_POR_LINHA * 2) {
      saida.push(linhaDeErro(numero, bruta.slice(0, 60) + "…", `Linha longa demais (máximo ${MAXIMO_POR_LINHA} letras).`));
      continue;
    }
    // Caracteres de controle e espaço especial viram espaço; espaços repetidos viram um.
    const original = Array.from(bruta, (c) => {
      const k = c.charCodeAt(0);
      return k < 32 || k === 127 || k === 160 ? " " : c;
    })
      .join("")
      .replace(/\s+/g, " ");
    const limpa = original.replace(/^ ?(?:[-•*·]|\d+[.)]) /, "").trim();
    if (!limpa) continue;
    if (limpa.length > MAXIMO_POR_LINHA) {
      saida.push(linhaDeErro(numero, limpa.slice(0, 60) + "…", `Linha longa demais (máximo ${MAXIMO_POR_LINHA} letras).`));
      continue;
    }
    const avisos: string[] = [];
    const erros: string[] = [];
    const { nome: nomeLido, resto } = separar(limpa);
    const cat = achaNoCatalogo(nomeLido);
    // Nome do catálogo quando o que foi digitado é apelido ("Mussarela" -> "Queijo muçarela"):
    // evita o mesmo produto cadastrado duas vezes com nomes diferentes.
    let nome = nomeLido.slice(0, 120);
    if (cat && chaveDeBusca(cat.nome) !== chaveDeBusca(nome)) {
      avisos.push(`Usei o nome do catálogo: "${cat.nome}" (você escreveu "${nome}"). Troque se quiser.`);
      nome = cat.nome;
    }
    let unidadeBase: UnidadeBase | null = cat?.unidadeBase ?? null;
    const area: AreaEstoque = cat?.area ?? "cozinha";
    const embalagens: EmbalagemLida[] = [];

    if (resto) {
      const r = lerEmbalagemDoTexto(resto, unidadeBase, nome);
      unidadeBase = r.unidadeBase;
      if (r.embalagem) embalagens.push(r.embalagem);
      erros.push(...r.erros);
      avisos.push(...r.avisos);
    }
    if (cat) {
      for (const [n, q] of cat.embalagens) {
        if (!embalagens.some((e) => chaveDeBusca(e.nome) === chaveDeBusca(n))) embalagens.push({ nome: n, quantidadeBase: q, doCatalogo: true });
      }
    } else {
      avisos.push(`Área não informada: ficou "${NOME_DA_AREA[area]}". Troque se for de outra área.`);
    }
    if (!unidadeBase && !erros.length) erros.push('Diga como o estoque conta: g, ml ou un (ex.: "Cebola - saco 20 kg").');
    if (nome.length < 2) erros.push("Nome curto demais.");
    const chave = chaveDeBusca(nome);
    if (existentes.has(chave) || existentes.has(chaveDeBusca(nomeLido))) erros.push("Já está cadastrado.");
    const repetida = vistos.get(chave);
    if (repetida) erros.push(`Repetido: igual à linha ${repetida}.`);
    else vistos.set(chave, numero);

    saida.push({
      numero,
      texto: limpa,
      nome,
      unidadeBase,
      area,
      embalagens,
      catalogo: cat?.nome ?? null,
      situacao: erros.length ? "erro" : avisos.length ? "conferir" : "pronto",
      avisos,
      erros,
    });
  }
  const fora = comTexto.length - lidas.length;
  if (fora > 0) {
    const primeira = comTexto[MAXIMO_DE_LINHAS]!.numero;
    saida.push(
      linhaDeErro(
        primeira,
        `${fora} linha(s) a partir da linha ${primeira}`,
        `Cole no máximo ${MAXIMO_DE_LINHAS} linhas por vez: ${fora} linha(s) a partir da linha ${primeira} não foram lidas. Cole o resto depois.`,
      ),
    );
  }
  return saida;
}
