/**
 * Lê o arquivo de uma planilha (E07 parte 3, decisão 0020) e devolve só TEXTO: as linhas com
 * células, cada uma com o número da linha como a pessoa vê na planilha. Nada aqui grava, nada
 * aqui conhece o banco. Roda só no servidor.
 *
 * Formatos (decididos pelo CONTEÚDO, não só pelo nome do arquivo):
 *  - .xlsx (Excel novo): o zip é aberto aqui, parte por parte, contando os bytes reais e parando
 *    no limite (recusa arquivo que "incha"); a biblioteca exceljs só recebe as partes conferidas.
 *  - .csv / .txt: separador ; , ou tabulação, descoberto pela primeira linha; acentos em UTF-8,
 *    UTF-16 (o "Texto Unicode" do Excel) ou Windows-1252 (o .csv do Excel antigo).
 *  - .html / .htm (e o ".xls" que muitos sistemas exportam e que é HTML por dentro): lido como
 *    DADO com o parse5; só o texto das células de <table> é aproveitado. Nada é executado nem
 *    mostrado como HTML.
 * O .xls antigo de verdade (binário) é recusado com a instrução de salvar como .xlsx.
 */
import { crc32, inflateRawSync } from "node:zlib";
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
/**
 * Tamanho máximo do .xlsx aberto (por dentro), contando os bytes DE VERDADE ao descompactar (o
 * tamanho escrito no índice do zip pode ser mentira). Um .xlsx de 2.000 linhas fica bem abaixo.
 */
export const LIMITE_ABERTO = 10 * 1024 * 1024;
export const LIMITE_ABERTO_POR_PARTE = 6 * 1024 * 1024;
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

// Os três passeios abaixo usam pilha própria (sem recursão): HTML com 300 mil níveis de
// aninhamento não estoura a pilha do servidor.

function textoDoNo(raiz: No): string {
  const partes: string[] = [];
  const pilha: (No | string)[] = [raiz];
  while (pilha.length) {
    const n = pilha.pop()!;
    if (typeof n === "string") {
      partes.push(n);
      continue;
    }
    if (n.nodeName === "#text") partes.push(n.value ?? "");
    else if (n.tagName && SEM_TEXTO.has(n.tagName)) continue;
    else if (n.tagName === "br") partes.push("\n");
    else {
      if (n !== raiz && n.tagName && QUEBRA.has(n.tagName)) pilha.push("\n");
      const filhos = n.childNodes ?? [];
      for (let i = filhos.length - 1; i >= 0; i--) pilha.push(filhos[i]!);
    }
  }
  return partes.join("");
}

/** Linhas (tr) de uma tabela, na ordem, sem entrar em tabela de dentro. */
function linhasDaTabela(tabela: No): No[] {
  const saida: No[] = [];
  const pilha: No[] = [...(tabela.childNodes ?? [])].reverse();
  while (pilha.length) {
    const f = pilha.pop()!;
    if (f.tagName === "tr") saida.push(f);
    else if (f.tagName !== "table") {
      const filhos = f.childNodes ?? [];
      for (let i = filhos.length - 1; i >= 0; i--) pilha.push(filhos[i]!);
    }
  }
  return saida;
}

function tabelasDe(raiz: No): No[] {
  const saida: No[] = [];
  const pilha: No[] = [raiz];
  while (pilha.length) {
    const n = pilha.pop()!;
    if (n.tagName && SEM_TEXTO.has(n.tagName)) continue;
    if (n.tagName === "table") saida.push(n);
    const filhos = n.childNodes ?? [];
    for (let i = filhos.length - 1; i >= 0; i--) pilha.push(filhos[i]!);
  }
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

type ParteDoZip = { nome: Uint8Array; dados: Uint8Array };
const danificado = () => recusar("O arquivo .xlsx está danificado (não deu para abrir). Salve de novo no Excel.");
const inchado = () => recusar("O arquivo .xlsx é grande demais por dentro (muito mais do que parece). Salve de novo só com a planilha.");

/**
 * Abre o zip do .xlsx com as próprias mãos, parte por parte, CONTANDO os bytes reais ao
 * descompactar e parando no limite (o tamanho escrito no índice pode ser mentira: um arquivo de
 * 1 MB pode ter 1,5 GB dentro). Recusa: índice que não bate com o cabeçalho de cada parte, parte
 * que abre com tamanho diferente do declarado, senha, compressão desconhecida e zip64.
 * Devolve as partes já abertas; o exceljs só recebe um zip novo montado com elas (sem compressão).
 */
export function abrirZip(b: Uint8Array): ParteDoZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return danificado();
  const entradas = v.getUint16(fim + 10, true);
  const inicio = v.getUint32(fim + 16, true);
  if (entradas === 0xffff || inicio === 0xffffffff) return inchado();
  if (entradas > LIMITE_DE_ENTRADAS_DO_ZIP) recusar("O arquivo .xlsx tem partes demais por dentro. Salve de novo só com a planilha.");
  const partes: ParteDoZip[] = [];
  let p = inicio;
  let total = 0;
  for (let k = 0; k < entradas; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) return danificado();
    const marcas = v.getUint16(p + 8, true);
    const metodo = v.getUint16(p + 10, true);
    const compactado = v.getUint32(p + 20, true);
    const aberto = v.getUint32(p + 24, true);
    const tamNome = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const nome = b.subarray(p + 46, p + 46 + tamNome);
    p += 46 + tamNome + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (marcas & 1) recusar("O arquivo .xlsx está protegido por senha. Salve de novo no Excel, sem senha.");
    if (metodo !== 0 && metodo !== 8) return danificado();
    if (compactado === 0xffffffff || aberto === 0xffffffff) return inchado();
    if (aberto > LIMITE_ABERTO_POR_PARTE || total + aberto > LIMITE_ABERTO) return inchado();
    // Cabeçalho local da parte: tem de bater com o índice.
    if (local + 30 > b.length || v.getUint32(local, true) !== 0x04034b50) return danificado();
    const tamNomeLocal = v.getUint16(local + 26, true);
    const nomeLocal = b.subarray(local + 30, local + 30 + tamNomeLocal);
    if (v.getUint16(local + 8, true) !== metodo || Buffer.compare(Buffer.from(nomeLocal), Buffer.from(nome)) !== 0) return danificado();
    // Sem "descritor de dados" (bit 3), os tamanhos do cabeçalho local também têm de bater.
    if (!(v.getUint16(local + 6, true) & 8) && (v.getUint32(local + 18, true) !== compactado || v.getUint32(local + 22, true) !== aberto)) return danificado();
    const comeco = local + 30 + tamNomeLocal + v.getUint16(local + 28, true);
    if (comeco + compactado > b.length) return danificado();
    const bruto = b.subarray(comeco, comeco + compactado);
    let dados: Uint8Array;
    if (metodo === 0) dados = bruto;
    else {
      try {
        // Para de descompactar no tamanho declarado: passou disso, é mentira (e não gasta memória).
        dados = inflateRawSync(bruto, { maxOutputLength: Math.max(aberto, 1) });
      } catch (e) {
        if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return inchado();
        return danificado();
      }
    }
    if (dados.length !== aberto) return danificado();
    total += dados.length;
    partes.push({ nome, dados });
  }
  return partes;
}

/** Monta um zip novo, sem compressão, só com as partes já abertas e conferidas. */
function zipGuardado(partes: readonly ParteDoZip[]): Buffer {
  const locais: Buffer[] = [];
  const indice: Buffer[] = [];
  let pos = 0;
  for (const { nome, dados } of partes) {
    const crc = crc32(dados);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(dados.length, 18);
    l.writeUInt32LE(dados.length, 22);
    l.writeUInt16LE(nome.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(dados.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(pos, 42);
    locais.push(l, Buffer.from(nome), Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength));
    indice.push(c, Buffer.from(nome));
    pos += 30 + nome.length + dados.length;
  }
  const tamIndice = indice.reduce((s, x) => s + x.length, 0);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(partes.length, 8);
  e.writeUInt16LE(partes.length, 10);
  e.writeUInt32LE(tamIndice, 12);
  e.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, ...indice, e]);
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Número de célula do Excel como texto com vírgula. O Excel guarda número "quebrado" com
 * imprecisão de conta (32,99 pode vir 32.989999999999995): quando a diferença para os centavos é só
 * isso (menos de um milionésimo de centavo), sai com 2 casas ("32,99"). Se tiver mais casas de
 * verdade (1,234), sai como está e o campo de preço diz que passou de 2 casas. A conta é só para
 * escrever o texto; o valor gravado continua vindo de centavosDoTexto (inteiro).
 */
export function textoDoNumero(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Number.isInteger(v)) return String(v);
  const centavos = v * 100;
  const inteiro = Math.round(centavos);
  if (Math.abs(v) < 1e12 && Math.abs(centavos - inteiro) < 1e-6) {
    const a = Math.abs(inteiro);
    return `${inteiro < 0 ? "-" : ""}${Math.trunc(a / 100)},${String(a % 100).padStart(2, "0")}`;
  }
  return String(v).replace(".", ",");
}

/** Valor de uma célula do Excel como texto. Número sai com vírgula decimal ("12,5"), como a pessoa escreve. */
export function textoDoValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return textoDoNumero(v);
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
  const conferido = zipGuardado(abrirZip(bytes));
  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(conferido as unknown as ArrayBuffer);
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
