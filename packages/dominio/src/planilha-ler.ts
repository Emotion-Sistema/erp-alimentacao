/**
 * Lê o arquivo de uma planilha (E07 parte 3, decisão 0020) e devolve só TEXTO: as linhas com
 * células, cada uma com o número da linha como a pessoa vê na planilha. Nada aqui grava, nada
 * aqui conhece o banco. Roda só no servidor.
 *
 * Formatos (decididos pelo CONTEÚDO, não só pelo nome do arquivo):
 *  - .xlsx (Excel novo): lido com a biblioteca exceljs. Antes, o índice do zip é conferido para
 *    recusar arquivo que "incha" ao abrir (muito maior por dentro do que por fora).
 *  - .csv / .txt: separador ; , ou tabulação, descoberto pela primeira linha; acentos em UTF-8,
 *    UTF-16 (o "Texto Unicode" do Excel) ou Windows-1252 (o .csv do Excel antigo).
 *  - .html / .htm (e o ".xls" que muitos sistemas exportam e que é HTML por dentro): lido como
 *    DADO com o parse5; só o texto das células de <table> é aproveitado. Nada é executado nem
 *    mostrado como HTML.
 * O .xls antigo de verdade (binário) é recusado com a instrução de salvar como .xlsx.
 */
import ExcelJS from "exceljs";
import { parse } from "parse5";
import { ErroDeRegra } from "./erros";
import { LIMITE_DE_BYTES, LIMITE_DE_COLUNAS, LIMITE_DE_LINHAS } from "./importar-comum";

export type FormatoDaPlanilha = "xlsx" | "csv" | "html";
export type LinhaDaPlanilha = { numero: number; celulas: string[] };
export type TabelaLida = {
  formato: FormatoDaPlanilha;
  /** Só as linhas com algum texto, na ordem; a primeira é o cabeçalho. */
  linhas: LinhaDaPlanilha[];
  /** Avisos sobre o arquivo (ex.: "li só a aba Produtos"). */
  avisos: string[];
};

const EXTENSOES = ["xlsx", "csv", "txt", "html", "htm", "xls"] as const;
/** Tamanho máximo do .xlsx aberto (por dentro). Um .xlsx de 2 MB com 2.000 linhas fica bem abaixo disto. */
const LIMITE_ABERTO = 40 * 1024 * 1024;
const LIMITE_DE_ENTRADAS_DO_ZIP = 1000;

const recusar = (texto: string): never => {
  throw new ErroDeRegra("dados_invalidos", texto);
};

export function extensaoDoArquivo(nome: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nome.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/** Lê o arquivo inteiro. Erro vira ErroDeRegra com a explicação para a pessoa. */
export async function lerArquivoDePlanilha(bytes: Uint8Array, nomeDoArquivo: string): Promise<TabelaLida> {
  if (bytes.length === 0) recusar("O arquivo está vazio.");
  if (bytes.length > LIMITE_DE_BYTES) recusar(`Arquivo grande demais: o máximo é ${LIMITE_DE_BYTES / 1024 / 1024} MB. Divida a planilha em partes.`);
  const ext = extensaoDoArquivo(nomeDoArquivo);
  if (!(EXTENSOES as readonly string[]).includes(ext)) recusar("Tipo de arquivo não aceito. Use uma planilha .xlsx, .csv ou uma página .html com tabela.");

  const tipo = tipoPeloConteudo(bytes);
  let tabela: TabelaLida;
  if (tipo === "zip") {
    if (ext !== "xlsx" && ext !== "xls") recusar(`O arquivo diz ser .${ext}, mas por dentro não é. Salve de novo como .xlsx ou .csv.`);
    tabela = await lerXlsx(bytes);
  } else if (tipo === "xls-antigo") {
    return recusar('Planilha no formato antigo do Excel (.xls). Abra no Excel e use "Salvar como" > "Pasta de Trabalho do Excel (.xlsx)".');
  } else if (tipo === "binario") {
    return recusar("Este arquivo não é uma planilha (parece imagem, PDF ou outro tipo). Use .xlsx, .csv ou .html com tabela.");
  } else {
    if (ext === "xlsx") recusar("O arquivo diz ser .xlsx, mas por dentro é texto. Salve de novo como .xlsx ou troque o nome para .csv.");
    const texto = decodificar(bytes);
    if (/<table[\s>]/i.test(texto)) tabela = lerHtml(texto);
    else if (/^\s*<(!doctype\s+html|html[\s>])/i.test(texto) || ext === "html" || ext === "htm") return recusar("A página .html não tem nenhuma tabela (<table>) para ler.");
    else tabela = lerCsv(texto);
  }
  return conferirTamanho(tabela);
}

// ---------- tipo pelo conteúdo ----------

function tipoPeloConteudo(b: Uint8Array): "zip" | "xls-antigo" | "binario" | "texto" {
  const comeca = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (comeca(0x50, 0x4b, 0x03, 0x04)) return "zip";
  if (comeca(0xd0, 0xcf, 0x11, 0xe0)) return "xls-antigo";
  if (comeca(0x25, 0x50, 0x44, 0x46) /* %PDF */ || comeca(0x89, 0x50, 0x4e, 0x47) /* PNG */ || comeca(0xff, 0xd8, 0xff) /* JPEG */ || comeca(0x47, 0x49, 0x46, 0x38) /* GIF */)
    return "binario";
  if (comeca(0x50, 0x4b)) return "binario"; // outro zip (vazio, partido)
  // UTF-16 tem zeros de propósito: decide pela marca no começo.
  if (comeca(0xff, 0xfe) || comeca(0xfe, 0xff)) return "texto";
  const amostra = b.subarray(0, 8192);
  return amostra.includes(0) ? "binario" : "texto";
}

/** UTF-8 (com ou sem marca), UTF-16 com marca, senão Windows-1252 (o .csv do Excel antigo). */
export function decodificar(b: Uint8Array): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder("utf-8").decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
}

// ---------- limpeza de célula ----------

/** Tira caracteres de controle e espaços repetidos; quebra de linha dentro da célula fica. */
export function limparCelula(v: string): string {
  return Array.from(v, (c) => {
    const k = c.charCodeAt(0);
    if (c === "\n") return "\n";
    return k < 32 || k === 127 || k === 160 || (k >= 0x80 && k < 0xa0) ? " " : c;
  })
    .join("")
    .replace(/[ \t\u2000-\u200b\u202f\u205f\u3000\ufeff]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function montarLinha(numero: number, brutas: string[]): LinhaDaPlanilha | null {
  const celulas = brutas.map((c) => limparCelula(c ?? ""));
  while (celulas.length && celulas[celulas.length - 1] === "") celulas.pop();
  return celulas.length ? { numero, celulas } : null;
}

function conferirTamanho(t: TabelaLida): TabelaLida {
  if (t.linhas.length === 0) recusar("A planilha está vazia: nenhuma linha com texto.");
  if (t.linhas.length === 1) recusar("A planilha só tem o cabeçalho. Coloque os itens nas linhas de baixo.");
  const dados = t.linhas.length - 1;
  if (dados > LIMITE_DE_LINHAS) recusar(`A planilha tem ${dados} linhas; o máximo é ${LIMITE_DE_LINHAS.toLocaleString("pt-BR")} por vez. Divida em partes.`);
  const larga = t.linhas.find((l) => l.celulas.length > LIMITE_DE_COLUNAS);
  if (larga) recusar(`A linha ${larga.numero} tem mais de ${LIMITE_DE_COLUNAS} colunas. Deixe só as colunas do modelo.`);
  return t;
}

// ---------- CSV ----------

/** Separador mais usado na primeira linha com texto (fora de aspas). Empate: ; (o do Excel no Brasil). */
function separadorDe(texto: string): string {
  const primeira = (texto.split(/\r?\n|\r/, 50).find((l) => l.trim()) ?? "").replace(/"[^"]*"/g, "");
  const contar = (s: string) => primeira.split(s).length - 1;
  const opcoes = [";", ",", "\t"].map((s) => ({ s, n: contar(s) }));
  const melhor = opcoes.reduce((a, b) => (b.n > a.n ? b : a));
  return melhor.n > 0 ? melhor.s : ";";
}

export function lerCsv(textoOriginal: string): TabelaLida {
  let texto = textoOriginal;
  let sep: string | null = null;
  // "sep=;" na primeira linha (dica que o Excel entende): vale e não conta como linha.
  const dica = /^sep=(.)\r?\n/i.exec(texto);
  if (dica) {
    sep = dica[1]!;
    texto = texto.slice(dica[0].length);
  }
  sep ??= separadorDe(texto);
  const linhas: LinhaDaPlanilha[] = [];
  let celula = "";
  let celulas: string[] = [];
  let numero = 1;
  let aspas = false;
  let aspasDesde = 0;
  const fecharLinha = () => {
    celulas.push(celula);
    const l = montarLinha(numero, celulas);
    if (l) linhas.push(l);
    if (linhas.length > LIMITE_DE_LINHAS + 1) recusar(`A planilha tem mais de ${LIMITE_DE_LINHAS.toLocaleString("pt-BR")} linhas; o máximo é ${LIMITE_DE_LINHAS.toLocaleString("pt-BR")} por vez. Divida em partes.`);
    celula = "";
    celulas = [];
    numero++;
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celula += '"';
          i++;
        } else aspas = false;
      } else celula += c;
      continue;
    }
    if (c === '"' && celula.trim() === "") {
      aspas = true;
      aspasDesde = numero;
      celula = "";
    } else if (c === sep) {
      celulas.push(celula);
      celula = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fecharLinha();
    } else celula += c;
  }
  if (aspas) recusar(`Aspas (") abertas e não fechadas na linha ${aspasDesde}. Confira essa linha da planilha.`);
  if (celula !== "" || celulas.length) fecharLinha();
  return { formato: "csv", linhas, avisos: [] };
}

// ---------- HTML ----------

type No = { nodeName: string; tagName?: string; value?: string; childNodes?: No[]; content?: No; attrs?: { name: string; value: string }[] };
const SEM_TEXTO = new Set(["script", "style", "template", "noscript", "head", "title", "select", "button", "iframe", "object"]);
const QUEBRA = new Set(["br", "p", "div", "li", "tr"]);

function textoDoNo(n: No): string {
  if (n.nodeName === "#text") return n.value ?? "";
  if (n.tagName && SEM_TEXTO.has(n.tagName)) return "";
  if (n.tagName === "br") return "\n";
  const dentro = (n.childNodes ?? []).map(textoDoNo).join("");
  return n.tagName && QUEBRA.has(n.tagName) ? `${dentro}\n` : dentro;
}

/** Linhas (tr) de uma tabela, sem entrar em tabela de dentro. */
function linhasDaTabela(tabela: No): No[] {
  const saida: No[] = [];
  const andar = (n: No) => {
    for (const f of n.childNodes ?? []) {
      if (f.tagName === "tr") saida.push(f);
      else if (f.tagName !== "table") andar(f);
    }
  };
  andar(tabela);
  return saida;
}

function tabelasDe(raiz: No): No[] {
  const saida: No[] = [];
  const andar = (n: No) => {
    if (n.tagName && SEM_TEXTO.has(n.tagName)) return;
    if (n.tagName === "table") saida.push(n);
    for (const f of n.childNodes ?? []) andar(f);
  };
  andar(raiz);
  return saida;
}

export function lerHtml(texto: string): TabelaLida {
  const doc = parse(texto, { scriptingEnabled: false }) as unknown as No;
  const tabelas = tabelasDe(doc)
    .map((t) => ({ t, linhas: linhasDaTabela(t) }))
    .filter((x) => x.linhas.length > 0);
  if (!tabelas.length) recusar("A página .html não tem nenhuma tabela com linhas para ler.");
  const escolhida = tabelas.reduce((a, b) => (b.linhas.length > a.linhas.length ? b : a));
  const avisos = tabelas.length > 1 ? [`A página tem ${tabelas.length} tabelas; li só a maior (${escolhida.linhas.length} linhas).`] : [];
  const linhas: LinhaDaPlanilha[] = [];
  escolhida.linhas.forEach((tr, i) => {
    const celulas: string[] = [];
    for (const td of tr.childNodes ?? []) {
      if (td.tagName !== "td" && td.tagName !== "th") continue;
      celulas.push(textoDoNo(td));
      // Célula que ocupa várias colunas: as outras ficam vazias, para as colunas não andarem.
      const junta = Number(td.attrs?.find((a) => a.name === "colspan")?.value ?? 1);
      for (let k = 1; k < Math.min(Number.isFinite(junta) ? junta : 1, LIMITE_DE_COLUNAS + 1); k++) celulas.push("");
    }
    const l = montarLinha(i + 1, celulas);
    if (l) linhas.push(l);
  });
  return { formato: "html", linhas, avisos };
}

// ---------- XLSX ----------

/**
 * Confere o índice do zip ANTES de abrir: soma o tamanho aberto de cada parte. Recusa o que
 * passar do limite (arquivo que "incha") e o zip64 (não é preciso para 2 MB).
 */
export function conferirZip(b: Uint8Array): void {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) recusar("O arquivo .xlsx está danificado (não deu para abrir). Salve de novo no Excel.");
  const entradas = v.getUint16(fim + 10, true);
  const inicio = v.getUint32(fim + 16, true);
  if (entradas === 0xffff || inicio === 0xffffffff) recusar("O arquivo .xlsx é grande demais por dentro.");
  if (entradas > LIMITE_DE_ENTRADAS_DO_ZIP) recusar("O arquivo .xlsx tem partes demais por dentro. Salve de novo só com a planilha.");
  let p = inicio;
  let total = 0;
  for (let k = 0; k < entradas; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) recusar("O arquivo .xlsx está danificado (não deu para abrir). Salve de novo no Excel.");
    const aberto = v.getUint32(p + 24, true);
    if (aberto === 0xffffffff) recusar("O arquivo .xlsx é grande demais por dentro.");
    total += aberto;
    if (total > LIMITE_ABERTO) recusar("O arquivo .xlsx é grande demais por dentro (muito mais do que parece). Salve de novo só com a planilha.");
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Valor de uma célula do Excel como texto. Número sai com vírgula decimal ("12,5"), como a pessoa escreve. */
export function textoDoValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${doisDigitos(v.getUTCDate())}/${doisDigitos(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  if (typeof v === "object") {
    const o = v as { richText?: { text?: string }[]; result?: unknown; formula?: unknown; sharedFormula?: unknown; text?: unknown; error?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r?.text ?? "").join("");
    if ("formula" in o || "sharedFormula" in o || "result" in o) return textoDoValor(o.result);
    if ("error" in o) return "";
    if ("text" in o) return textoDoValor(o.text);
  }
  return "";
}

async function lerXlsx(bytes: Uint8Array): Promise<TabelaLida> {
  conferirZip(bytes);
  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as ArrayBuffer);
  } catch {
    return recusar("Não deu para abrir o arquivo .xlsx (danificado ou protegido por senha). Salve de novo no Excel, sem senha.");
  }
  const abas = livro.worksheets.filter((a) => a.state !== "hidden" && a.state !== "veryHidden");
  const comDados = abas.filter((a) => a.actualRowCount > 0);
  const aba = comDados[0];
  if (!aba) return recusar("A planilha está vazia: nenhuma linha com texto.");
  if (aba.actualRowCount > LIMITE_DE_LINHAS + 1) recusar(`A planilha tem ${aba.actualRowCount - 1} linhas; o máximo é ${LIMITE_DE_LINHAS.toLocaleString("pt-BR")} por vez. Divida em partes.`);
  const avisos = comDados.length > 1 ? [`O arquivo tem ${comDados.length} abas com dados; li só a primeira ("${aba.name.slice(0, 40)}").`] : [];
  const linhas: LinhaDaPlanilha[] = [];
  aba.eachRow({ includeEmpty: false }, (linha, numero) => {
    const celulas: string[] = [];
    linha.eachCell({ includeEmpty: false }, (celula, coluna) => {
      if (coluna > LIMITE_DE_COLUNAS + 1) return;
      // Célula mesclada: só a principal tem o valor (as outras ficam vazias, como a pessoa vê).
      const valor = celula.isMerged && celula.master !== celula ? null : celula.value;
      while (celulas.length < coluna - 1) celulas.push("");
      celulas[coluna - 1] = textoDoValor(valor);
    });
    const l = montarLinha(numero, celulas);
    if (l) linhas.push(l);
  });
  return { formato: "xlsx", linhas, avisos };
}
