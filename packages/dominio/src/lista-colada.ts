/**
 * Lê uma lista colada (WhatsApp, Excel, bloco de notas) e diz, linha por linha, o que entendeu
 * e o que falta (ideia nº 4, 15/11/2026). NÃO grava nada: a tela mostra a prévia, a pessoa
 * confere e só então manda gravar (cadastrarEmLote, que confere tudo de novo no servidor).
 * Exemplos que entende:
 *   "Farinha de trigo - saco 25 kg"      "Ovo; caixa com 30"      "Leite integral | fardo 12 l"
 *   "Refrigerante lata: fardo 12 latas"  "Queijo muçarela 4kg"     "- Cebola"
 * Contas em decimal exato (inteiros escalados), nunca float.
 */
import { NOME_DA_AREA, type AreaEstoque, type UnidadeBase } from "./cadastros";
import {
  CATALOGO_INGREDIENTES,
  chaveDeBusca,
  type ItemDoCatalogo,
} from "./catalogo-ingredientes";

export const MAXIMO_DE_LINHAS = 300;

type Grandeza = "massa" | "volume" | "contagem";
/** Espelho das unidades padrão da migração 0006 (fator em relação a g, ml ou un). */
const UNIDADES: readonly {
  codigo: string;
  grandeza: Grandeza;
  fator: string;
  jeitos: string[];
}[] = [
  {
    codigo: "mg",
    grandeza: "massa",
    fator: "0.001",
    jeitos: ["mg", "mgs", "miligrama", "miligramas"],
  },
  {
    codigo: "g",
    grandeza: "massa",
    fator: "1",
    jeitos: ["g", "gr", "grs", "grama", "gramas"],
  },
  {
    codigo: "kg",
    grandeza: "massa",
    fator: "1000",
    jeitos: [
      "kg",
      "kgs",
      "quilo",
      "quilos",
      "kilo",
      "kilos",
      "quilograma",
      "quilogramas",
      "kilograma",
      "kilogramas",
    ],
  },
  {
    codigo: "ml",
    grandeza: "volume",
    fator: "1",
    jeitos: ["ml", "mls", "cc", "mililitro", "mililitros"],
  },
  {
    codigo: "l",
    grandeza: "volume",
    fator: "1000",
    jeitos: ["l", "lt", "lts", "litro", "litros"],
  },
  {
    codigo: "un",
    grandeza: "contagem",
    fator: "1",
    jeitos: ["un", "und", "unid", "unidade", "unidades"],
  },
  {
    codigo: "dz",
    grandeza: "contagem",
    fator: "12",
    jeitos: ["dz", "duzia", "duzias"],
  },
];
const BASE_DA_GRANDEZA: Record<Grandeza, UnidadeBase> = {
  massa: "g",
  volume: "ml",
  contagem: "un",
};
const GRANDEZA_DA_BASE: Record<UnidadeBase, Grandeza> = {
  g: "massa",
  ml: "volume",
  un: "contagem",
};

/** Tipos de embalagem e abreviações comuns. */
const EMBALAGENS: Record<string, string> = {
  caixa: "caixa",
  cx: "caixa",
  caixas: "caixa",
  pacote: "pacote",
  pct: "pacote",
  pc: "pacote",
  pacotes: "pacote",
  saco: "saco",
  sc: "saco",
  sacos: "saco",
  fardo: "fardo",
  fd: "fardo",
  fardos: "fardo",
  bandeja: "bandeja",
  bdj: "bandeja",
  lata: "lata",
  latas: "lata",
  garrafa: "garrafa",
  gf: "garrafa",
  garrafas: "garrafa",
  galao: "galão",
  galoes: "galão",
  pote: "pote",
  potes: "pote",
  balde: "balde",
  baldes: "balde",
  peca: "peça",
  pecas: "peça",
  maco: "maço",
  macos: "maço",
  bisnaga: "bisnaga",
  vidro: "vidro",
  sache: "sachê",
  saches: "sachê",
  tablete: "tablete",
  bag: "bag",
  engradado: "engradado",
};

const unidadePorJeito = (palavra: string) =>
  UNIDADES.find((u) => u.jeitos.includes(palavra));

// ---------- decimal exato (4 casas) ----------
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
/** a × b, cada um com até 4 casas; arredonda a 4 casas (meio para cima), como o banco. */
function multiplicar(a: string, b: string): string | null {
  const x = paraInteiro(a);
  const y = paraInteiro(
    b.includes(".") && b.split(".")[1]!.length > 4
      ? b.slice(0, b.indexOf(".") + 5)
      : b,
  );
  if (x === null || y === null) return null;
  const p = x * y; // escala 10^8
  const arred = (p + ESCALA / 2n) / ESCALA;
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

type TamanhoLido = { tipo: string | null; numero: string; palavra: string };

/** "saco 25kg", "caixa com 30", "fardo 12 latas", "12 x 1 l", "25 kg" -> partes. */
function lerTamanho(t: string): TamanhoLido | null {
  const s = chaveDeBusca(t.replace(/(\d),(\d)/g, "$1.$2")).replace(
    /(\d) (\d)/g,
    "$1.$2",
  );
  // "12 x 1 l" (fardo com 12 de 1 litro)
  const multi = /^(?:([a-z]+) )?(\d+) ?x ?(\d+(?:\.\d+)?) ?([a-z]+)$/.exec(s);
  if (multi) {
    const total = multiplicar(multi[2]!, multi[3]!);
    if (total)
      return {
        tipo: multi[1] ? (EMBALAGENS[multi[1]] ?? multi[1]) : "fardo",
        numero: total,
        palavra: multi[4]!,
      };
  }
  const m = /^(?:([a-z]+) )?(?:(?:com|c|de) )?(\d+(?:\.\d+)?) ?([a-z]+)?$/.exec(
    s,
  );
  if (!m) return null;
  const tipo = m[1] ? (EMBALAGENS[m[1]] ?? m[1]) : null;
  return { tipo, numero: m[2]!, palavra: m[3] ?? "" };
}

const SEPARADORES = /\s+[-–—]\s+|\s*[;|\t:]\s*/;

function achaNoCatalogo(nome: string): ItemDoCatalogo | undefined {
  const k = chaveDeBusca(nome);
  return CATALOGO_INGREDIENTES.find((c) =>
    [c.nome, ...(c.sinonimos ?? [])].some((n) => chaveDeBusca(n) === k),
  );
}

function separar(linha: string): { nome: string; resto: string } {
  const partes = linha.split(SEPARADORES).filter((p) => p.trim());
  if (partes.length >= 2)
    return { nome: partes[0]!.trim(), resto: partes.slice(1).join(" ").trim() };
  // Sem separador: procura o tamanho no fim ("Queijo muçarela 4kg", "Ovo caixa com 30").
  const tipos = Object.keys(EMBALAGENS).join("|");
  const re = new RegExp(
    `^(.*?)\\s+((?:(?:${tipos})\\s+)?(?:(?:com|c/|de)\\s+)?\\d+(?:[.,]\\d+)?\\s*(?:x\\s*\\d+(?:[.,]\\d+)?\\s*)?[a-zà-ú]*)$`,
    "i",
  );
  const m = re.exec(linha.normalize("NFC"));
  if (m && m[1]!.trim().length >= 2)
    return { nome: m[1]!.trim(), resto: m[2]!.trim() };
  return { nome: linha.trim(), resto: "" };
}

/**
 * Lê o texto colado. `jaCadastrados`: nomes de ingredientes ATIVOS que já existem (a tela
 * recebe do servidor), para avisar repetido antes de gravar.
 */
export function lerListaColada(
  texto: string,
  jaCadastrados: readonly string[] = [],
): LinhaLida[] {
  const existentes = new Set(jaCadastrados.map(chaveDeBusca));
  const vistos = new Map<string, number>();
  const linhas = texto.split(/\r?\n/).slice(0, MAXIMO_DE_LINHAS + 1);
  const saida: LinhaLida[] = [];
  linhas.forEach((bruta, idx) => {
    // Caracteres de controle e espaço especial (copiados do WhatsApp/Excel) viram espaço.
    const original = Array.from(bruta, (c) => {
      const k = c.charCodeAt(0);
      return k < 32 || k === 127 || k === 160 ? " " : c;
    }).join("");
    const limpa = original.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, "").trim();
    if (!limpa) return;
    const numero = idx + 1;
    const avisos: string[] = [];
    const erros: string[] = [];
    if (saida.length >= MAXIMO_DE_LINHAS) {
      saida.push({
        numero,
        texto: limpa,
        nome: limpa,
        unidadeBase: null,
        area: "cozinha",
        embalagens: [],
        catalogo: null,
        situacao: "erro",
        avisos: [],
        erros: [`Cole no máximo ${MAXIMO_DE_LINHAS} linhas por vez.`],
      });
      return;
    }
    const { nome: nomeLido, resto } = separar(limpa);
    const nome = nomeLido.replace(/\s+/g, " ").slice(0, 120);
    const cat = achaNoCatalogo(nome);
    let unidadeBase: UnidadeBase | null = cat?.unidadeBase ?? null;
    const area: AreaEstoque = cat?.area ?? "cozinha";
    const embalagens: EmbalagemLida[] = [];

    if (resto) {
      const t = lerTamanho(resto);
      if (!t) {
        erros.push(
          `Não entendi "${resto}". Escreva assim: saco 25 kg, caixa com 30, fardo 12 latas.`,
        );
      } else {
        const u = unidadePorJeito(t.palavra);
        // Palavra que não é unidade ("latas", "ovos", "pães", vazio): é contagem.
        const grandeza: Grandeza = u?.grandeza ?? "contagem";
        const fator = u?.fator ?? "1";
        const curta = u?.codigo ?? "un";
        if (!unidadeBase) unidadeBase = BASE_DA_GRANDEZA[grandeza];
        const nomeEmb = `${t.tipo ? `${t.tipo} ` : ""}${t.numero.replace(".", ",")} ${curta}`;
        if (GRANDEZA_DA_BASE[unidadeBase] === grandeza) {
          const q = multiplicar(t.numero, fator);
          if (!q) erros.push(`Quantidade inválida em "${resto}".`);
          else if (!t.tipo && u && u.codigo === unidadeBase) {
            // "Sal 500 g" sem embalagem: só diz a unidade do estoque; nada a converter.
          } else
            embalagens.push({
              nome: nomeEmb,
              quantidadeBase: q,
              doCatalogo: false,
            });
        } else {
          embalagens.push({
            nome: nomeEmb,
            quantidadeBase: null,
            doCatalogo: false,
            problema: `Quanto ${nomeEmb} dá em ${unidadeBase}? Preencha antes de gravar.`,
          });
          avisos.push(
            `"${cat?.nome ?? nome}" é contado em ${unidadeBase}: diga quanto ${nomeEmb} dá em ${unidadeBase}.`,
          );
        }
      }
    }
    if (cat) {
      for (const [n, q] of cat.embalagens) {
        if (!embalagens.some((e) => chaveDeBusca(e.nome) === chaveDeBusca(n)))
          embalagens.push({ nome: n, quantidadeBase: q, doCatalogo: true });
      }
    } else {
      avisos.push(
        `Área não informada: ficou "${NOME_DA_AREA[area]}". Troque se for de outra área.`,
      );
    }
    if (!unidadeBase)
      erros.push(
        'Diga como o estoque conta: g, ml ou un (ex.: "Cebola - saco 20 kg").',
      );
    if (nome.length < 2) erros.push("Nome curto demais.");
    const chave = chaveDeBusca(nome);
    if (existentes.has(chave)) erros.push("Já está cadastrado.");
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
  });
  return saida;
}
