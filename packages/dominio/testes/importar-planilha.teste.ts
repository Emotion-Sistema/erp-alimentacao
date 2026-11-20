/**
 * Importação de planilha (E07 parte 3; migração 0014; decisão 0020). Contra PostgreSQL real.
 * Formatos (.xlsx, .csv, .html), acentos e separadores, cabeçalhos flexíveis, erros por linha com
 * o número e a coluna certos, nada gravado na conferência, tudo ou nada na gravação,
 * idempotência (inclusive clique duplo ao mesmo tempo), permissões, limites de tamanho e tipo.
 * Só dados inventados.
 */
import { createHash, randomUUID } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  ErroDeRegra,
  LIMITE_DE_BYTES,
  conferirPlanilha,
  gravarPlanilha,
  modeloDePlanilha,
  relatorioDeErros,
  salvarCategoria,
  salvarFornecedor,
  sugerirMapa,
  textoDoResumo,
  type Ator,
  type Conferencia,
} from "../src/index";
import { abrirZip, lerArquivoDePlanilha, textoDoNumero } from "../src/planilha-ler";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let supervisor: Ator;
let atendente: Ator;
const S = randomUUID().slice(0, 6).replace(/[0-9]/g, "q");
let categoriaDesativada: string;

const b64 = (b: Uint8Array | string) => Buffer.from(typeof b === "string" ? new TextEncoder().encode(b) : b).toString("base64");
const pedido = (tipo: "produtos" | "ingredientes", nome: string, conteudo: Uint8Array | string, extra: Record<string, unknown> = {}) => ({
  tipo,
  arquivo: { nome, conteudo: b64(conteudo) },
  ...extra,
});
const ler = (conteudo: Uint8Array | string, nome: string) => lerArquivoDePlanilha(typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : conteudo, nome);

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

/** Contagens que não podem mudar quando nada é gravado. */
async function fotografia() {
  const n = async (t: "produto" | "ingrediente" | "importacao_planilha" | "ingrediente_conversao") =>
    Number((await db.selectFrom(t).select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);
  const permitidos = Number(
    (await db.selectFrom("auditoria").select((eb) => eb.fn.countAll().as("n")).where("resultado", "=", "permitido").executeTakeFirstOrThrow()).n,
  );
  return { produtos: await n("produto"), ingredientes: await n("ingrediente"), conversoes: await n("ingrediente_conversao"), importacoes: await n("importacao_planilha"), permitidos };
}

const linha = (c: Conferencia, numero: number) => {
  const l = c.linhas.find((x) => x.numero === numero);
  if (!l) throw new Error(`linha ${numero} não veio na conferência`);
  return l;
};

async function xlsx(linhas: unknown[][], abas: { nome: string; linhas: unknown[][] }[] = []): Promise<Uint8Array> {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet("Planilha");
  for (const l of linhas) aba.addRow(l);
  for (const a of abas) {
    const outra = livro.addWorksheet(a.nome);
    for (const l of a.linhas) outra.addRow(l);
  }
  return new Uint8Array((await livro.xlsx.writeBuffer()) as ArrayBuffer);
}

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  supervisor = await atorDoCargo(db, "supervisor");
  atendente = await atorDoCargo(db, "atendente");
  categoriaDesativada = `Antiga ${S}`;
  const c = await salvarCategoria(db, gerente, { nome: categoriaDesativada });
  await salvarCategoria(db, gerente, { id: c.id, nome: categoriaDesativada, ativo: false });
});
afterAll(() => db.destroy());

describe("leitura do arquivo (formato pelo conteúdo, acentos, separadores)", () => {
  it(".csv com ; e com , (descobre o separador), aspas, quebra de linha dentro da célula e linha vazia", async () => {
    const pv = await ler('Nome;Preço;Categoria\n"X-Salada; da casa";"25,90";Hambúrgueres\n\n"Duas\nlinhas";1,00;Bebidas\n', "a.csv");
    expect(pv.formato).toBe("csv");
    expect(pv.linhas).toEqual([
      { numero: 1, celulas: ["Nome", "Preço", "Categoria"] },
      { numero: 2, celulas: ["X-Salada; da casa", "25,90", "Hambúrgueres"] },
      { numero: 4, celulas: ["Duas\nlinhas", "1,00", "Bebidas"] },
    ]);
    const v = await ler('Nome,Preço\r\nSuco,"7,50"\r\n', "b.csv");
    expect(v.linhas[1]).toEqual({ numero: 2, celulas: ["Suco", "7,50"] });
    const tab = await ler("Nome\tPreço\nSuco\t7,50\n", "c.txt");
    expect(tab.linhas[1]!.celulas).toEqual(["Suco", "7,50"]);
    const dica = await ler("sep=,\nNome;x,Preço\nA;b,1\n", "d.csv");
    expect(dica.linhas[0]!.celulas).toEqual(["Nome;x", "Preço"]);
  });

  it("acentos em UTF-8 (com e sem marca), Windows-1252 e UTF-16 (Texto Unicode do Excel)", async () => {
    const esperado = ["Pão de açúcar", "Médio"];
    for (const [nome, bytes] of [
      ["utf8.csv", new TextEncoder().encode("Nome;Tamanho\nPão de açúcar;Médio\n")],
      ["bom.csv", new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Nome;Tamanho\nPão de açúcar;Médio\n")])],
      ["w1252.csv", new Uint8Array(Buffer.from("Nome;Tamanho\nP\xe3o de a\xe7\xfacar;M\xe9dio\n", "latin1"))],
      ["utf16.txt", new Uint8Array([0xff, 0xfe, ...Buffer.from("Nome\tTamanho\r\nPão de açúcar\tMédio\r\n", "utf16le")])],
    ] as const) {
      expect((await ler(bytes, nome)).linhas[1]!.celulas, nome).toEqual(esperado);
    }
  });

  it(".html: lê só o texto das células (script não entra), entidades, colspan e a maior tabela; .xls que é HTML por dentro também", async () => {
    const html = `<!doctype html><html><head><title>x</title><script>document.write("<table><tr><td>mal</td></tr></table>")</script></head><body>
      <table><tr><td>menu</td></tr></table>
      <table><thead><tr><th>Nome</th><th>Preço</th><th>Categoria</th></tr></thead>
      <tbody><tr><td><b>Café</b> &amp; leite<script>alert(1)</script></td><td colspan="1">6,00</td><td>Cafeteria</td></tr>
      <tr><td colspan="2">Só nome</td><td>Bebidas</td></tr>
      <tr><td>Com<br>quebra <table><tr><td>dentro</td></tr></table></td><td>1</td><td>x</td></tr></tbody></table></body></html>`;
    const t = await ler(html, "pagina.html");
    expect(t.formato).toBe("html");
    expect(t.avisos[0]).toContain("li só a maior");
    expect(t.linhas.map((l) => l.celulas)).toEqual([
      ["Nome", "Preço", "Categoria"],
      ["Café & leite", "6,00", "Cafeteria"],
      ["Só nome", "", "Bebidas"],
      ["Com\nquebra dentro", "1", "x"],
    ]);
    const xlsHtml = await ler("<table><tr><td>Nome</td></tr><tr><td>Pão</td></tr></table>", "exportado.xls");
    expect(xlsHtml.formato).toBe("html");
  });

  it(".xlsx: número com vírgula, fórmula pelo resultado, texto rico, data; avisa quando há mais de uma aba com dados", async () => {
    const livro = new ExcelJS.Workbook();
    const aba = livro.addWorksheet("Produtos");
    aba.addRow(["Nome", "Preço", "Tempo", "Data"]);
    aba.addRow([{ richText: [{ text: "X-" }, { text: "Bacon" }] }, 29.9, { formula: "10+2", result: 12 }, new Date(Date.UTC(2026, 10, 19))]);
    aba.addRow(["Só nome"]);
    livro.addWorksheet("Escondida").state = "hidden";
    livro.addWorksheet("Notas").addRow(["anotação"]);
    const t = await ler(new Uint8Array((await livro.xlsx.writeBuffer()) as ArrayBuffer), "p.xlsx");
    expect(t.formato).toBe("xlsx");
    expect(t.linhas).toEqual([
      { numero: 1, celulas: ["Nome", "Preço", "Tempo", "Data"] },
      { numero: 2, celulas: ["X-Bacon", "29,90", "12", "19/11/2026"] },
      { numero: 3, celulas: ["Só nome"] },
    ]);
    expect(t.avisos[0]).toContain('li só a primeira ("Produtos")');
  });

  it("recusa pelo CONTEÚDO, não só pelo nome: PDF, imagem, zip com nome .csv, texto com nome .xlsx, .xls antigo e extensão estranha", async () => {
    const msg = async (b: Uint8Array | string, nome: string) => (await erroDe(ler(b, nome))).message;
    expect(await msg(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), "tabela.csv")).toContain("não é uma planilha");
    expect(await msg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), "foto.xlsx")).toContain("não é uma planilha");
    expect(await msg(await xlsx([["Nome"], ["A"]]), "lista.csv")).toContain("por dentro não é");
    expect(await msg("Nome\nA\n", "lista.xlsx")).toContain("por dentro é texto");
    expect(await msg(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "velha.xls")).toContain("formato antigo");
    expect(await msg("Nome\nA\n", "programa.exe")).toContain("Tipo de arquivo não aceito");
    expect(await msg("Nome\nA\x00B\n", "binario.csv")).toContain("não é uma planilha");
    expect(await msg("<html><body><p>oi</p></body></html>", "sem.html")).toContain("não tem nenhuma tabela");
    expect(await msg(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]), "quebrado.xlsx")).toContain("danificado");
  });

  it("limites: 2 MB, 2.000 linhas, 50 colunas, vazio e só cabeçalho", async () => {
    const msg = async (b: Uint8Array | string, nome: string) => (await erroDe(ler(b, nome))).message;
    expect(await msg(new Uint8Array(2 * 1024 * 1024 + 1).fill(65), "grande.csv")).toContain("máximo é 2 MB");
    const linhas = (n: number) => ["Nome", ...Array.from({ length: n }, (_, i) => `Item ${i}`)].join("\n");
    expect((await ler(linhas(2000), "ok.csv")).linhas).toHaveLength(2001);
    expect(await msg(linhas(2001), "muitas.csv")).toContain("o máximo é 2.000");
    expect(await msg(await xlsx([["Nome"], ...Array.from({ length: 2001 }, (_, i) => [`I${i}`])]), "muitas.xlsx")).toContain("o máximo é 2.000");
    expect(await msg(["Nome", Array.from({ length: 51 }, () => "x").join(";")].join("\n"), "larga.csv")).toContain("mais de 50 colunas");
    expect(await msg("", "vazio.csv")).toContain("vazio");
    expect(await msg(" \n\n", "branco.csv")).toContain("vazia");
    expect(await msg("Nome;Preço\n", "so-cabecalho.csv")).toContain("só tem o cabeçalho");
  });

  it(".xlsx que incha: o tamanho DECLARADO alto é recusado sem abrir", async () => {
    const b = await xlsx([["Nome"], ["A"]]);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let fim = -1;
    for (let i = b.length - 22; i >= 0; i--)
      if (v.getUint32(i, true) === 0x06054b50) {
        fim = i;
        break;
      }
    const inicio = v.getUint32(fim + 16, true);
    v.setUint32(inicio + 24, 900 * 1024 * 1024, true); // a primeira parte "abre" com 900 MB
    expect(() => abrirZip(b)).toThrow(/grande demais por dentro/);
    expect((await erroDe(ler(b, "bomba.xlsx"))).message).toContain("grande demais por dentro");
  });

  it(".xlsx que incha MENTINDO o tamanho (declara 1.000 bytes, tem 60 MB): para de abrir no limite, sem gastar memória", async () => {
    const espacos = 60 * 1024 * 1024;
    const bomba = zipXlsx(" ".repeat(espacos), { declarado: 1000 });
    expect(bomba.length).toBeLessThan(LIMITE_DE_BYTES);
    const antes = process.memoryUsage().rss;
    expect((await erroDe(ler(bomba, "bomba.xlsx"))).message).toContain("grande demais por dentro");
    expect(process.memoryUsage().rss - antes, "memória gasta ao recusar").toBeLessThan(64 * 1024 * 1024);
    // O mesmo zip honesto (sem mentir) também é recusado: passa do limite por parte.
    expect((await erroDe(ler(zipXlsx(" ".repeat(espacos)), "grande.xlsx"))).message).toContain("grande demais por dentro");
    // Índice e cabeçalho da parte que não batem: danificado.
    expect((await erroDe(ler(zipXlsx("", { localDiferente: true }), "torto.xlsx"))).message).toContain("danificado");
    // Várias partes honestas que, somadas, passam de 10 MB.
    expect((await erroDe(ler(zipXlsx("", { extras: 3, tamanhoExtra: 4 * 1024 * 1024 }), "somado.xlsx"))).message).toContain("grande demais por dentro");
    // O zip montado aqui, sem mentira e pequeno, abre normalmente.
    expect((await ler(zipXlsx(""), "honesto.xlsx")).linhas.map((l) => l.celulas)).toEqual([["Nome"], ["x"]]);
  });

  it(".html com 300 mil níveis de aninhamento: lido sem estourar a pilha", async () => {
    const n = 300_000;
    // Só as aberturas (o leitor fecha sozinho): 300 mil níveis cabem em menos de 2 MB.
    const fundo = `<table><tr><td>Nome</td></tr><tr><td>${"<i>".repeat(n)}Pão</td></tr></table>`;
    expect((await ler(fundo, "fundo.html")).linhas.map((l) => l.celulas)).toEqual([["Nome"], ["Pão"]]);
    const fundo2 = `<table>${"<div>".repeat(n)}<tr><td>Nome</td></tr><tr><td>Café</td></tr>`;
    const t = await ler(fundo2, "fundo2.html");
    expect(t.linhas.map((l) => l.celulas)).toEqual([["Nome"], ["Café"]]);
  });

  it("número de célula com imprecisão de conta sai com 2 casas; com mais casas de verdade, sai como está", () => {
    expect(textoDoNumero(32.989999999999995)).toBe("32,99");
    expect(textoDoNumero(0.1 + 0.2)).toBe("0,30");
    expect(textoDoNumero(12.5)).toBe("12,50");
    expect(textoDoNumero(-5.5)).toBe("-5,50");
    expect(textoDoNumero(15)).toBe("15");
    expect(textoDoNumero(1.234)).toBe("1,234");
    expect(textoDoNumero(Number.NaN)).toBe("");
  });
});

/** Zip de .xlsx mínimo montado à mão (para mentir no tamanho, como faria um ataque). */
function zipXlsx(espacos: string, o: { declarado?: number; localDiferente?: boolean; extras?: number; tamanhoExtra?: number } = {}): Uint8Array {
  const partes: [string, string][] = [
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nome</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>x${espacos}</t></is></c></row></sheetData></worksheet>`],
  ];
  for (let i = 0; i < (o.extras ?? 0); i++) partes.push([`xl/media/extra${i}.txt`, "a".repeat(o.tamanhoExtra ?? 0)]);
  const locais: Buffer[] = [];
  const indice: Buffer[] = [];
  let pos = 0;
  for (const [nome, texto] of partes) {
    const dados = Buffer.from(texto);
    const comp = deflateRawSync(dados, { level: 9 });
    const n = Buffer.from(nome);
    // A mentira vai só na parte grande (a planilha), como num ataque de verdade.
    const aberto = nome === "xl/worksheets/sheet1.xml" && o.declarado !== undefined ? o.declarado : dados.length;
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc32(dados), 14);
    l.writeUInt32LE(comp.length, 18);
    l.writeUInt32LE(o.localDiferente ? aberto + 1 : aberto, 22);
    l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(dados), 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(aberto, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(pos, 42);
    locais.push(l, n, comp);
    indice.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(partes.length, 8);
  fim.writeUInt16LE(partes.length, 10);
  fim.writeUInt32LE(indice.reduce((s, x) => s + x.length, 0), 12);
  fim.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...locais, ...indice, fim]));
}

describe("cabeçalhos flexíveis", () => {
  it("entende os nomes comuns sem ligar para acento e maiúscula; cada coluna serve a um campo", () => {
    expect(sugerirMapa("produtos", ["PRODUTO", "Valor", "categoria", "Tipo de Produção", "TEMPO DE PREPARO (MIN)", "Descrição"])).toEqual({
      nome: 0,
      preco: 1,
      categoria: 2,
      tipo: 3,
      tempo: 4,
      descricao: 5,
    });
    expect(sugerirMapa("produtos", ["Nome", "Preço (R$)", "Seção", "Obs"])).toEqual({ nome: 0, preco: 1, categoria: 2, tipo: null, tempo: null, descricao: null });
    // "Nome" ganha de "Descrição" para o nome do ingrediente, mesmo vindo depois.
    expect(sugerirMapa("ingredientes", ["Descrição", "Nome", "Unidade", "Área do estoque", "Embalagem"])).toMatchObject({ nome: 1, unidade: 2, area: 3, embalagens: 4, fornecedor: null });
  });
});

describe("produtos: conferir (não grava) e gravar (tudo ou nada)", () => {
  const nomes = { a: `Burger planilha ${S}`, b: `Suco planilha ${S}`, c: `Porção planilha ${S}` };
  const planilha = () =>
    [
      "Produto;Categoria;Tipo de produção;Valor;Tempo de preparo;Descrição",
      `${nomes.a};hamburgueres;Hambúrgueres;R$ 1.234,50;15 min;Pão e carne (exemplo).`, // 2: ok (milhar e "15 min")
      `${nomes.b};Bebidas;;7,5;;`, // 3: ok, sem produção
      `Prato ${S};Categoria Inexistente ${S};;10,00;;`, // 4: categoria não existe
      `Velho ${S};${categoriaDesativada};;10,00;;`, // 5: categoria desativada
      `Sem tempo ${S};Almoço;Pratos e grelhados;30,00;;`, // 6: falta tempo
      `Tempo demais ${S};Bebidas;;5,00;3;`, // 7: tempo sem tipo
      `Caro ${S};Bebidas;;12,345;;`, // 8: preço inválido
      `X-Salada;Hambúrgueres;Hambúrgueres;25,90;12;`, // 9: já existe (semente)
      `${nomes.a.toUpperCase()};Bebidas;;3,00;;`, // 10: repetido da linha 2
      `Tipo ruim ${S};Bebidas;Forno a lenha ${S};3,00;5;`, // 11: tipo não existe
      `${nomes.c};Porções;Porções;34,90;20;`, // 12: ok
    ].join("\n");

  it("aponta cada erro com a linha e a coluna da planilha, e NADA é gravado", async () => {
    const antes = await fotografia();
    const c = await conferirPlanilha(db, gerente, pedido("produtos", "cardapio.csv", planilha()));
    expect(await fotografia()).toEqual(antes);
    expect(c.chave).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.formato).toBe("csv");
    expect(c.linhaDoCabecalho).toBe(1);
    expect(c.mapa).toEqual({ nome: 0, categoria: 1, tipo: 2, preco: 3, tempo: 4, descricao: 5 });
    expect(c.resumo).toEqual({ total: 11, prontas: 3, erros: 7, jaExistem: 1, puladas: 0 });
    expect(textoDoResumo(c.resumo)).toBe("3 prontas, 7 com erro, 1 já cadastrada");
    expect(linha(c, 2)).toMatchObject({ situacao: "ok", resumo: ["Hambúrgueres", "R$ 1.234,50", "Tipo: Hambúrgueres", "15 min"] });
    expect(linha(c, 3)).toMatchObject({ situacao: "ok", resumo: ["Bebidas", "R$ 7,50", "Não passa pela produção"] });
    const problema = (n: number) => linha(c, n).problemas;
    expect(problema(4)).toEqual([{ coluna: "Coluna B (Categoria)", indice: 1, texto: expect.stringContaining("Não existe a categoria") }]);
    expect(problema(5)[0]!.texto).toContain("está desativada");
    expect(problema(6)).toEqual([{ coluna: "Coluna E (Tempo de preparo)", indice: 4, texto: expect.stringContaining("Falta o tempo de preparo") }]);
    expect(problema(7)[0]).toMatchObject({ coluna: "Coluna E (Tempo de preparo)", texto: expect.stringContaining("Sem tipo de produção") });
    expect(problema(8)[0]).toMatchObject({ coluna: "Coluna D (Valor)", texto: expect.stringContaining("mais de 2 casas decimais") });
    expect(linha(c, 9).situacao).toBe("ja_existe");
    expect(problema(10)[0]).toMatchObject({ coluna: "Coluna A (Produto)", texto: "Repetido: o mesmo produto já está na linha 2 da planilha." });
    expect(problema(11)[0]).toMatchObject({ coluna: "Coluna C (Tipo de produção)", texto: expect.stringContaining("Não existe o tipo de produção") });
    expect(linha(c, 12).situacao).toBe("ok");
    // O relatório para baixar traz linha, coluna e motivo; texto que começa com = não vira fórmula.
    const rel = relatorioDeErros(c);
    expect(rel.startsWith("\ufeffLinha da planilha;Situação;Nome;Coluna;O que corrigir\r\n")).toBe(true);
    expect(rel).toContain("8;Com erro;Caro");
    expect(rel).toContain("9;Já cadastrada;X-Salada");
    expect(relatorioDeErros({ linhas: [{ ...linha(c, 4), nome: "=1+1" }] })).toContain(";'=1+1;");
  });

  it("com erro (sem pular) a gravação recusa e nada é gravado; pulando as linhas com erro, grava tudo de uma vez", async () => {
    const p = pedido("produtos", "cardapio.csv", planilha());
    const c = await conferirPlanilha(db, gerente, p);
    const antes = await fotografia();
    const e = await erroDe(gravarPlanilha(db, gerente, { ...p, chave: c.chave }));
    expect(e.message).toMatch(/^Nada foi gravado: 7 linha\(s\) com erro\. linha 4: /);
    expect(await fotografia()).toEqual(antes);

    const pular = c.linhas.filter((l) => l.situacao === "erro").map((l) => l.numero);
    const c2 = await conferirPlanilha(db, gerente, { ...p, pular });
    expect(c2.resumo).toEqual({ total: 11, prontas: 3, erros: 0, jaExistem: 1, puladas: 7 });
    const r = await gravarPlanilha(db, gerente, { ...p, pular, chave: c2.chave });
    expect(r).toMatchObject({ criados: 3, jaExistiam: 1, puladas: 7, repetida: false });
    const depois = await fotografia();
    expect(depois.produtos - antes.produtos).toBe(3);
    expect(depois.importacoes - antes.importacoes).toBe(1);

    const gravados = await db.selectFrom("produto").select(["nome", "preco_centavos", "tempo_preparo_min", "tipo_producao_id", "descricao"]).where("nome", "in", Object.values(nomes)).orderBy("nome").execute();
    expect(gravados.map((g) => [g.nome, g.preco_centavos, g.tempo_preparo_min])).toEqual([
      [nomes.a, 123450, 15],
      [nomes.c, 3490, 20],
      [nomes.b, 750, null],
    ]);
    // Registro da importação e auditoria: quem, arquivo, quantas linhas; cada produto com a linha.
    const imp = await db.selectFrom("importacao_planilha").selectAll().where("id", "=", r.importacaoId).executeTakeFirstOrThrow();
    expect(imp).toMatchObject({ chave: c2.chave, tipo: "produtos", arquivo: "cardapio.csv", formato: "csv", linhas_lidas: 11, criados: 3, ja_existiam: 1, puladas: 7, usuario_id: gerente.usuarioId });
    const aud = await db.selectFrom("auditoria").select(["usuario_id", "detalhes"]).where("alvo_tipo", "=", "importacao_planilha").where("alvo_id", "=", String(r.importacaoId)).executeTakeFirstOrThrow();
    expect(aud.usuario_id).toBe(gerente.usuarioId);
    expect(aud.detalhes).toMatchObject({ operacao: "importar_planilha", arquivo: "cardapio.csv", linhasLidas: 11, criados: 3 });
    const doProduto = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "produto").where("alvo_id", "=", String(imp.ids[0])).executeTakeFirstOrThrow();
    expect(doProduto.detalhes).toMatchObject({ operacao: "importar_planilha", importacao: c2.chave, linha: 2 });
    // O registro da importação não se altera nem se apaga.
    await expect(sql`UPDATE importacao_planilha SET criados = 0 WHERE id = ${r.importacaoId}`.execute(db)).rejects.toThrow();
  });

  it("idempotência: a mesma chave não importa de novo (nem com dois cliques ao mesmo tempo); chave usada para outra coisa é recusada", async () => {
    const nome = (i: number) => `Duplo ${S} ${i}`;
    const p = pedido("produtos", "duplo.csv", ["Nome;Categoria;Preço", `${nome(1)};Bebidas;4,00`, `${nome(2)};Bebidas;4,50`].join("\n"));
    const c = await conferirPlanilha(db, gerente, p);
    const antes = await fotografia();
    const [r1, r2] = await Promise.all([gravarPlanilha(db, gerente, { ...p, chave: c.chave }), gravarPlanilha(db, gerente, { ...p, chave: c.chave })]);
    expect([r1.repetida, r2.repetida].sort()).toEqual([false, true]);
    expect(r1.importacaoId).toBe(r2.importacaoId);
    const r3 = await gravarPlanilha(db, gerente, { ...p, chave: c.chave });
    expect(r3).toMatchObject({ repetida: true, criados: 2 });
    const depois = await fotografia();
    expect(depois.produtos - antes.produtos).toBe(2);
    expect(depois.importacoes - antes.importacoes).toBe(1);
    // A mesma chave para outro arquivo: conflito, nada gravado.
    const outro = pedido("produtos", "outro.csv", ["Nome;Categoria;Preço", `Outro ${S};Bebidas;4,00`].join("\n"));
    expect((await erroDe(gravarPlanilha(db, gerente, { ...outro, chave: c.chave }))).codigo).toBe("conflito");
    expect(await fotografia()).toEqual(depois);
  });

  it("revalida no servidor: categoria desativada depois da conferência faz a gravação recusar sem gravar nada", async () => {
    const cat = await salvarCategoria(db, gerente, { nome: `Some ${S}` });
    const p = pedido("produtos", "muda.csv", ["Nome;Categoria;Preço", `Primeiro ${S};Bebidas;4,00`, `Segundo ${S};Some ${S};4,00`].join("\n"));
    const c = await conferirPlanilha(db, gerente, p);
    expect(c.resumo.prontas).toBe(2);
    await salvarCategoria(db, gerente, { id: cat.id, nome: `Some ${S}`, ativo: false });
    const antes = await fotografia();
    const e = await erroDe(gravarPlanilha(db, gerente, { ...p, chave: c.chave }));
    expect(e.message).toContain("linha 3: A categoria");
    expect(await fotografia()).toEqual(antes);
    // A tela também não manda nada que o servidor aceite sem conferir: sem chave, recusa.
    expect((await erroDe(gravarPlanilha(db, gerente, p))).message).toContain("Confira a planilha antes de gravar");
  });

  it("tudo ou nada: se o banco recusar a 3ª linha, as duas primeiras também não ficam", async () => {
    const falha = `Falha ${S}`;
    await sql
      .raw(
        `CREATE FUNCTION pg_temp_falhar_${S}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.nome = '${falha}' THEN RAISE EXCEPTION 'teste' USING ERRCODE = 'check_violation'; END IF; RETURN NEW; END $$;
         CREATE TRIGGER falhar_${S} BEFORE INSERT ON produto FOR EACH ROW EXECUTE FUNCTION pg_temp_falhar_${S}();`,
      )
      .execute(db);
    try {
      const p = pedido("produtos", "falha.csv", ["Nome;Categoria;Preço", `Fica ${S} 1;Bebidas;4,00`, `Fica ${S} 2;Bebidas;4,00`, `${falha};Bebidas;4,00`].join("\n"));
      const c = await conferirPlanilha(db, gerente, p);
      expect(c.resumo.prontas).toBe(3);
      const antes = await fotografia();
      const e = await erroDe(gravarPlanilha(db, gerente, { ...p, chave: c.chave }));
      expect(e.message).toContain(`Nada foi gravado. Linha 4 (${falha})`);
      expect(await fotografia()).toEqual(antes);
      expect(await db.selectFrom("produto").select("id").where("nome", "like", `Fica ${S}%`).execute()).toEqual([]);
    } finally {
      await sql.raw(`DROP TRIGGER falhar_${S} ON produto; DROP FUNCTION pg_temp_falhar_${S}();`).execute(db);
    }
  });

  it("mapa de colunas escolhido pela pessoa: troca o entendido; coluna repetida ou que não existe é recusada", async () => {
    const p = pedido("produtos", "mapa.csv", ["Coluna 1;Coluna 2;Coluna 3", `Bebidas;Mapa ${S};4,00`].join("\n"));
    const sugerido = await conferirPlanilha(db, gerente, p);
    expect(sugerido.mapa).toMatchObject({ nome: null, categoria: null, preco: null });
    expect(sugerido.faltamColunas).toEqual(["Nome", "Categoria", "Preço (R$)"]);
    expect(linha(sugerido, 2).situacao).toBe("erro");
    const escolhido = await conferirPlanilha(db, gerente, { ...p, mapa: { nome: 1, categoria: 0, preco: 2, tipo: null, tempo: null, descricao: null } });
    expect(linha(escolhido, 2)).toMatchObject({ situacao: "ok", nome: `Mapa ${S}` });
    expect((await erroDe(conferirPlanilha(db, gerente, { ...p, mapa: { nome: 1, categoria: 1, preco: 2 } }))).message).toContain("Cada coluna vale para um campo só");
    expect((await erroDe(conferirPlanilha(db, gerente, { ...p, mapa: { nome: 7 } }))).message).toContain("A coluna H não existe");
    expect((await erroDe(conferirPlanilha(db, gerente, { ...p, mapa: { senha: 1 } }))).message).toContain("Campo desconhecido");
  });

  it("preço vindo do Excel com imprecisão de conta vira centavos certos; com mais de 2 casas é erro claro", async () => {
    const x = await xlsx([
      ["Nome", "Categoria", "Preço"],
      [`Conta ${S}`, "Bebidas", 32.989999999999995],
      [`Casas ${S}`, "Bebidas", 1.234],
    ]);
    const c = await conferirPlanilha(db, gerente, pedido("produtos", "contas.xlsx", x));
    expect(linha(c, 2)).toMatchObject({ situacao: "ok", resumo: ["Bebidas", "R$ 32,99", "Não passa pela produção"] });
    expect(linha(c, 3).problemas[0]).toMatchObject({ coluna: "Coluna C (Preço)", texto: expect.stringContaining("mais de 2 casas decimais") });
    const r = await gravarPlanilha(db, gerente, { ...pedido("produtos", "contas.xlsx", x), pular: [3], chave: c.chave });
    expect(r.criados).toBe(1);
    const p = await db.selectFrom("produto").select("preco_centavos").where("nome", "=", `Conta ${S}`).executeTakeFirstOrThrow();
    expect(p.preco_centavos).toBe(3299);
  });

  it(".xlsx e .html chegam ao mesmo resultado que o .csv", async () => {
    const x = await xlsx([
      ["Nome", "Categoria", "Preço", "Tipo", "Tempo"],
      [`Excel ${S}`, "Bebidas", 8.5, null, null],
      [`Excel quente ${S}`, "Cafeteria", 6, "Cafeteria", 4],
    ]);
    const cx = await conferirPlanilha(db, gerente, pedido("produtos", "cardapio.xlsx", x));
    expect(cx.formato).toBe("xlsx");
    expect(cx.linhas.map((l) => [l.numero, l.situacao, l.resumo])).toEqual([
      [2, "ok", ["Bebidas", "R$ 8,50", "Não passa pela produção"]],
      [3, "ok", ["Cafeteria", "R$ 6,00", "Tipo: Cafeteria", "4 min"]],
    ]);
    const h = `<table><tr><th>Nome</th><th>Categoria</th><th>Preço</th></tr><tr><td>Html ${S}</td><td>Bebidas</td><td>3,00</td></tr></table>`;
    const ch = await conferirPlanilha(db, gerente, pedido("produtos", "cardapio.html", h));
    expect(ch.formato).toBe("html");
    expect(linha(ch, 2).situacao).toBe("ok");
  });
});

describe("ingredientes: a regra do cadastro em lote", () => {
  it("unidade, área, fornecedor e embalagens; catálogo completa o que falta; erros com coluna; grava com as embalagens", async () => {
    const forn = `Fornecedor planilha ${S}`;
    const f = await salvarFornecedor(db, gerente, { nome: forn });
    await salvarFornecedor(db, gerente, { id: f.id, nome: forn, ativo: false });
    const ok = `Farinha planilha ${S}`;
    const csv = [
      "Ingrediente,Unidade,Área,Fornecedor,Embalagens",
      `${ok},Quilos (kg),Cozinha,Atacado Exemplo (fictício),"saco 25 kg; pacote 1 kg"`, // 2: ok
      `Tomate,,,,`, // 3: catálogo completa (se ainda não existe) ou já existe
      `Coisa ${S},caixa,Cozinha,,`, // 4: unidade desconhecida
      `Outra ${S},kg,Depósito,,`, // 5: área desconhecida
      `Ovo,un,Cozinha,,`, // 6: já existe (semente)
      `Limão ${S},un,Cozinha,,saco 3 kg`, // 7: embalagem de outra grandeza
      `Mais ${S},g,Cafeteria,${forn},`, // 8: fornecedor desativado
      `Sem área ${S},ml,,,`, // 9: falta área (não está no catálogo)
    ].join("\n");
    const p = pedido("ingredientes", "insumos.csv", csv);
    const antes = await fotografia();
    const c = await conferirPlanilha(db, gerente, p);
    expect(await fotografia()).toEqual(antes);
    expect(linha(c, 2)).toMatchObject({ situacao: "ok", resumo: ["Quilos (kg)", "Alimentos da cozinha", "Fornecedor: Atacado Exemplo (fictício)", "Embalagens: saco 25 kg, pacote 1 kg"] });
    const tomate = linha(c, 3);
    if (tomate.situacao === "ok") expect(tomate.avisos.join(" ")).toContain("usei a do catálogo");
    else expect(tomate.situacao).toBe("ja_existe");
    expect(linha(c, 4).problemas[0]).toMatchObject({ coluna: "Coluna B (Unidade)", texto: expect.stringContaining('Unidade "caixa" desconhecida') });
    expect(linha(c, 5).problemas[0]).toMatchObject({ coluna: "Coluna C (Área)", texto: expect.stringContaining("desconhecida") });
    expect(linha(c, 6).situacao).toBe("ja_existe");
    expect(linha(c, 7).problemas[0]).toMatchObject({ coluna: "Coluna E (Embalagens)", texto: expect.stringContaining("não dá para saber quantas un") });
    expect(linha(c, 8).problemas[0]).toMatchObject({ coluna: "Coluna D (Fornecedor)", texto: expect.stringContaining("está desativado") });
    expect(linha(c, 9).problemas[0]).toMatchObject({ coluna: "Coluna C (Área)", texto: expect.stringContaining("Falta a área") });

    const pular = c.linhas.filter((l) => l.situacao === "erro").map((l) => l.numero);
    const c2 = await conferirPlanilha(db, gerente, { ...p, pular });
    const r = await gravarPlanilha(db, gerente, { ...p, pular, chave: c2.chave });
    expect(r.criados).toBe(c2.resumo.prontas);
    const ing = await db
      .selectFrom("ingrediente")
      .select(["id", "unidade_base", "unidade_exibicao", "area_estoque", "fornecedor_id"])
      .where("nome", "=", ok)
      .executeTakeFirstOrThrow();
    expect(ing).toMatchObject({ unidade_base: "g", unidade_exibicao: "kg", area_estoque: "cozinha" });
    const conv = await db.selectFrom("ingrediente_conversao").select(["nome", "quantidade_base"]).where("ingrediente_id", "=", ing.id).orderBy("nome").execute();
    expect(conv.map((x) => [x.nome, Number(x.quantidade_base)])).toEqual([
      ["pacote 1 kg", 1000],
      ["saco 25 kg", 25000],
    ]);
    const aud = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "ingrediente").where("alvo_id", "=", String(ing.id)).executeTakeFirstOrThrow();
    expect(aud.detalhes).toMatchObject({ operacao: "importar_planilha", importacao: c2.chave, linha: 2 });
  });
});

describe("ingredientes: dois cliques ao mesmo tempo", () => {
  it("a mesma chave grava uma vez só (trava por chave, sem a trava da lista de produtos)", async () => {
    const p = pedido("ingredientes", "duplo.csv", ["Nome;Unidade;Área;Embalagens", `Duplo ingrediente ${S};kg;Cozinha;saco 5 kg`, `Outro duplo ${S};un;Cafeteria;`].join("\n"));
    const c = await conferirPlanilha(db, gerente, p);
    expect(c.resumo.prontas).toBe(2);
    const antes = await fotografia();
    const rs = await Promise.all([1, 2, 3].map(() => gravarPlanilha(db, gerente, { ...p, chave: c.chave })));
    expect(rs.filter((r) => !r.repetida)).toHaveLength(1);
    expect(new Set(rs.map((r) => r.importacaoId)).size).toBe(1);
    const depois = await fotografia();
    expect(depois.ingredientes - antes.ingredientes).toBe(2);
    expect(depois.conversoes - antes.conversoes).toBe(1);
    expect(depois.importacoes - antes.importacoes).toBe(1);
    // Mesma chave com outras linhas puladas: conflito (a assinatura não bate), nada gravado.
    expect((await erroDe(gravarPlanilha(db, gerente, { ...p, pular: [3], chave: c.chave }))).codigo).toBe("conflito");
    expect(await fotografia()).toEqual(depois);
  });
});

describe("permissões e modelo", () => {
  it("supervisor e atendente não importam nem baixam o modelo (recusa na auditoria); nada é gravado", async () => {
    const p = pedido("produtos", "x.csv", "Nome;Categoria;Preço\nA;Bebidas;1,00\n");
    const antes = await fotografia();
    for (const quem of [supervisor, atendente]) {
      expect((await erroDe(conferirPlanilha(db, quem, p))).codigo).toBe("sem_permissao");
      expect((await erroDe(gravarPlanilha(db, quem, { ...p, chave: randomUUID() }))).codigo).toBe("sem_permissao");
      expect((await erroDe(modeloDePlanilha(db, quem, "produtos", "csv"))).codigo).toBe("sem_permissao");
      const recusa = await db
        .selectFrom("auditoria")
        .select(["resultado", "acao"])
        .where("usuario_id", "=", quem.usuarioId)
        .where("alvo_tipo", "=", "importacao_planilha")
        .orderBy("id", "desc")
        .executeTakeFirstOrThrow();
      expect(recusa).toEqual({ resultado: "recusado", acao: "cadastros.gerenciar" });
    }
    expect((await erroDe(conferirPlanilha(db, null, p))).codigo).toBe("nao_autenticado");
    expect(await fotografia()).toEqual(antes);
  });

  it("os modelos (.xlsx e .csv) têm as colunas certas e as 2 linhas de exemplo entram sem erro de coluna", async () => {
    for (const tipo of ["produtos", "ingredientes"] as const) {
      for (const formato of ["xlsx", "csv"] as const) {
        const m = await modeloDePlanilha(db, gerente, tipo, formato);
        expect(m.nome).toBe(`modelo-${tipo}.${formato}`);
        const c = await conferirPlanilha(db, gerente, pedido(tipo, m.nome, m.bytes));
        expect(c.faltamColunas, `${tipo} ${formato}`).toEqual([]);
        expect(Object.values(c.mapa).every((v) => v !== null), `${tipo} ${formato}: todas as colunas entendidas`).toBe(true);
        expect(c.linhas.map((l) => l.situacao), `${tipo} ${formato}`).toEqual(["ok", "ok"]);
      }
    }
    expect((await erroDe(modeloDePlanilha(db, gerente, "senhas", "csv"))).codigo).toBe("dados_invalidos");
  });

  it("pedido malformado: tipo, base64 e chave inválidos são recusados com mensagem simples", async () => {
    expect((await erroDe(conferirPlanilha(db, gerente, {}))).message).toContain("Escolha o que vai importar");
    expect((await erroDe(conferirPlanilha(db, gerente, { tipo: "produtos", arquivo: { nome: "a.csv", conteudo: "não é base64!" } }))).message).toContain("formato inválido");
    expect((await erroDe(gravarPlanilha(db, gerente, { ...pedido("produtos", "a.csv", "Nome\nA\n"), chave: "123" }))).message).toContain("Confira a planilha");
  });
});

describe("corrigir no painel (ideia nº 13): correções por célula, conferidas de novo no servidor", () => {
  const nomes = { a: `Corrige A ${S}`, b: `Corrige B ${S}`, c: `Corrige C ${S}` };
  const planilha = () =>
    [
      "Nome;Categoria;Preço", // 1: cabeçalho
      `${nomes.a};Bebidas;4,00`, // 2: ok
      `${nomes.b};Categoria Errada ${S};sete reais`, // 3: categoria e preço com erro
      `${nomes.c};Bebidas`, // 4: linha curta, falta o preço
    ].join("\n");
  const p = () => pedido("produtos", "corrigir.csv", planilha());
  const consertos = [
    { linha: 3, coluna: 1, valor: "Bebidas" },
    { linha: 3, coluna: 2, valor: "7,77" },
    { linha: 4, coluna: 2, valor: " 5,25 " }, // cria a célula (a linha era mais curta); espaços são limpos
  ];

  it("a conferência traz as células e o índice da coluna de cada problema; a correção resolve o erro e nada é gravado", async () => {
    const c = await conferirPlanilha(db, gerente, p());
    expect(c.resumo).toMatchObject({ prontas: 1, erros: 2 });
    expect(c.correcoes).toBe(0);
    expect(linha(c, 2).celulas).toBeUndefined(); // linha pronta não precisa das células
    expect(linha(c, 3).celulas).toEqual([nomes.b, `Categoria Errada ${S}`, "sete reais"]);
    expect(linha(c, 3).problemas.map((x) => x.indice)).toEqual([1, 2]);
    expect(linha(c, 4).celulas).toEqual([nomes.c, "Bebidas", ""]);
    expect(linha(c, 4).problemas).toEqual([{ coluna: "Coluna C (Preço)", indice: 2, texto: "Falta o preço." }]);
    // Opções para escolher ao corrigir: as categorias e os tipos ativos (a desativada não aparece).
    expect(c.opcoes.categoria).toContain("Bebidas");
    expect(c.opcoes.categoria).not.toContain(categoriaDesativada);
    expect(c.opcoes.tipo).toContain("Hambúrgueres");
    expect(c.tipoSugerido).toBeNull();

    const antes = await fotografia();
    const corrigida = await conferirPlanilha(db, gerente, { ...p(), correcoes: consertos });
    expect(await fotografia()).toEqual(antes);
    expect(corrigida.correcoes).toBe(3);
    expect(corrigida.resumo).toMatchObject({ prontas: 3, erros: 0 });
    expect(linha(corrigida, 3).resumo).toEqual(["Bebidas", "R$ 7,77", "Não passa pela produção"]);
    expect(linha(corrigida, 4).resumo).toContain("R$ 5,25");
    // A mesma célula corrigida duas vezes: vale a última (e conta uma vez só).
    const duas = await conferirPlanilha(db, gerente, { ...p(), correcoes: [...consertos, { linha: 3, coluna: 2, valor: "9,99" }] });
    expect(duas.correcoes).toBe(3);
    expect(linha(duas, 3).resumo).toContain("R$ 9,99");
    // A planilha inteira já corrigida, só quando a tela pede (para baixar o .csv corrigido).
    expect(corrigida.tabela).toBeUndefined();
    const comTabela = await conferirPlanilha(db, gerente, { ...p(), correcoes: consertos, devolverTabela: true });
    expect(comTabela.tabela).toEqual([
      ["Nome", "Categoria", "Preço"],
      [nomes.a, "Bebidas", "4,00"],
      [nomes.b, "Bebidas", "7,77"],
      [nomes.c, "Bebidas", "5,25"],
    ]);
  });

  it("correção que cria erro novo é pega pelo servidor, ao conferir e ao gravar", async () => {
    const piora = [...consertos, { linha: 2, coluna: 2, valor: "abc" }];
    const c = await conferirPlanilha(db, gerente, { ...p(), correcoes: piora });
    expect(linha(c, 2)).toMatchObject({ situacao: "erro", celulas: [nomes.a, "Bebidas", "abc"] });
    expect(linha(c, 2).problemas[0]).toMatchObject({ indice: 2, texto: expect.stringContaining('Preço inválido: "abc"') });
    const antes = await fotografia();
    // A tela não decide: mesmo com a chave, a gravação confere de novo e recusa.
    const e = await erroDe(gravarPlanilha(db, gerente, { ...p(), correcoes: piora, chave: c.chave }));
    expect(e.message).toContain("linha 2: Preço inválido");
    // E apagar o nome (célula vazia) também vira erro, nunca um produto sem nome.
    const semNome = await conferirPlanilha(db, gerente, { ...p(), correcoes: [...consertos, { linha: 4, coluna: 0, valor: "" }] });
    expect(linha(semNome, 4).problemas[0]).toMatchObject({ indice: 0, texto: "Falta o nome do produto." });
    expect(await fotografia()).toEqual(antes);
  });

  it("linha que não existe, cabeçalho, coluna fora da planilha e valor inválido: erro claro, nada gravado", async () => {
    const antes = await fotografia();
    const msg = async (correcoes: unknown) => (await erroDe(conferirPlanilha(db, gerente, { ...p(), correcoes }))).message;
    expect(await msg([{ linha: 9, coluna: 0, valor: "x" }])).toContain("linha 9: essa linha não existe na planilha");
    expect(await msg([{ linha: 1, coluna: 0, valor: "Produto" }])).toContain("A linha 1 é o cabeçalho");
    expect(await msg([{ linha: 3, coluna: 3, valor: "x" }])).toContain("a coluna D não existe nesta planilha");
    expect(await msg([{ linha: 3, coluna: 50, valor: "x" }])).toContain("Coluna inválida");
    expect(await msg([{ linha: 3, coluna: 1, valor: "a".repeat(501) }])).toContain("máximo 500 letras");
    expect(await msg([{ linha: 3, coluna: 1, valor: "Bebi\u0000das" }])).toContain("caractere inválido");
    expect(await msg([{ linha: 3, coluna: 1, valor: "linha\rquebrada" }])).toContain("caractere inválido");
    // Quebra de linha dentro da célula vale, como na planilha.
    expect((await conferirPlanilha(db, gerente, { ...p(), correcoes: [{ linha: 2, coluna: 0, valor: "Nome com\nquebra" }] })).correcoes).toBe(1);
    expect(await msg([{ linha: 0, coluna: 1, valor: "x" }])).toContain("Número de linha inválido");
    expect(await msg([{ linha: 3, coluna: 1 }])).toContain("Correção sem o valor");
    expect(await msg(Array.from({ length: 2001 }, (_, i) => ({ linha: 3, coluna: i % 3, valor: "x" })))).toContain("Correções demais");
    // Ao gravar, a mesma regra: a linha que não existe é recusada antes de qualquer coisa.
    expect((await erroDe(gravarPlanilha(db, gerente, { ...p(), correcoes: [{ linha: 9, coluna: 0, valor: "x" }], chave: randomUUID() }))).message).toContain("não existe");
    expect(await fotografia()).toEqual(antes);
  });

  it("idempotência: a chave vale para as MESMAS correções; outras correções (ou nenhuma) com a mesma chave são recusadas", async () => {
    const c = await conferirPlanilha(db, gerente, { ...p(), correcoes: consertos });
    const antes = await fotografia();
    // Gravar sem as correções da conferência: confere de novo e recusa (as linhas 3 e 4 voltam a ter erro).
    expect((await erroDe(gravarPlanilha(db, gerente, { ...p(), chave: c.chave }))).message).toMatch(/^Nada foi gravado: 2 linha\(s\) com erro/);
    expect(await fotografia()).toEqual(antes);
    const [r1, r2] = await Promise.all([
      gravarPlanilha(db, gerente, { ...p(), correcoes: consertos, chave: c.chave }),
      gravarPlanilha(db, gerente, { ...p(), correcoes: consertos, chave: c.chave }),
    ]);
    expect([r1.repetida, r2.repetida].sort()).toEqual([false, true]);
    expect(r1.criados).toBe(3);
    const depois = await fotografia();
    expect(depois.produtos - antes.produtos).toBe(3);
    expect(depois.importacoes - antes.importacoes).toBe(1);
    const gravados = await db.selectFrom("produto").select(["nome", "preco_centavos"]).where("nome", "in", Object.values(nomes)).orderBy("nome").execute();
    expect(gravados.map((g) => [g.nome, g.preco_centavos])).toEqual([
      [nomes.a, 400],
      [nomes.b, 777],
      [nomes.c, 525],
    ]);
    // A mesma chave sem as correções, ou com outras: não devolve o resultado antigo; conflito, nada gravado.
    expect((await erroDe(gravarPlanilha(db, gerente, { ...p(), chave: c.chave }))).codigo).toBe("conflito");
    expect((await erroDe(gravarPlanilha(db, gerente, { ...p(), correcoes: [...consertos, { linha: 2, coluna: 2, valor: "4,50" }], chave: c.chave }))).codigo).toBe("conflito");
    expect(await fotografia()).toEqual(depois);
    // As mesmas correções em outra ordem (e a mesma célula repetida com o mesmo valor final): é a mesma importação.
    const r3 = await gravarPlanilha(db, gerente, { ...p(), correcoes: [{ linha: 3, coluna: 2, valor: "1,00" }, ...[...consertos].reverse()], chave: c.chave });
    expect(r3).toMatchObject({ repetida: true, importacaoId: r1.importacaoId });
    // A auditoria registra QUANTAS correções vieram, nunca o conteúdo delas.
    const aud = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "importacao_planilha").where("alvo_id", "=", String(r1.importacaoId)).executeTakeFirstOrThrow();
    expect(aud.detalhes).toMatchObject({ operacao: "importar_planilha", correcoes: 3, criados: 3 });
    expect(JSON.stringify(aud.detalhes)).not.toContain("7,77");
    expect(JSON.stringify(aud.detalhes)).not.toContain("5,25");
  });

  it("tipo trocado: planilha de produtos com Ingredientes escolhido (e o contrário) traz o aviso com o tipo certo", async () => {
    const deProdutos = ["Nome;Categoria;Tipo de produção;Preço;Tempo de preparo (min);Descrição", `Lanche trocado ${S};Bebidas;;4,00;;`].join("\n");
    const c = await conferirPlanilha(db, gerente, pedido("ingredientes", "produtos.csv", deProdutos));
    expect(c.resumo).toMatchObject({ prontas: 0, erros: 1 });
    expect(linha(c, 2).problemas.map((x) => x.texto).join(" ")).toContain("Falta a unidade do estoque");
    expect(c.tipoSugerido).toBe("produtos");
    expect(c.avisoDoTipo).toBe("Esta planilha parece de produtos. Trocar para Produtos?");
    // Com o tipo certo, o aviso some.
    const certo = await conferirPlanilha(db, gerente, pedido("produtos", "produtos.csv", deProdutos));
    expect(certo).toMatchObject({ tipoSugerido: null, avisoDoTipo: null });
    expect(certo.resumo.prontas).toBe(1);
    // Planilha de ingredientes com Produtos escolhido.
    const deIngredientes = ["Nome;Unidade;Área;Fornecedor;Embalagens", `Insumo trocado ${S};kg;Cozinha;;`].join("\n");
    const i = await conferirPlanilha(db, gerente, pedido("produtos", "insumos.csv", deIngredientes));
    expect(i).toMatchObject({ tipoSugerido: "ingredientes", avisoDoTipo: "Esta planilha parece de ingredientes. Trocar para Ingredientes?" });
    const iCerta = await conferirPlanilha(db, gerente, pedido("ingredientes", "insumos.csv", deIngredientes));
    expect(iCerta.tipoSugerido).toBeNull();
    expect(iCerta.opcoes.unidade).toEqual(["kg", "g", "L", "ml", "un", "dz"]);
    expect(iCerta.opcoes.area).toEqual(["Alimentos da cozinha", "Bebidas do salão", "Cafeteria", "Potes de sorvete (60 Sabores)"]);
    // Só o nome: nenhum dos dois tipos acha tudo, então não sugere troca.
    const soNome = await conferirPlanilha(db, gerente, pedido("produtos", "nomes.csv", `Nome\nAlgo ${S}\n`));
    expect(soNome.tipoSugerido).toBeNull();
  });
});

describe("teto da resposta da conferência (xlsx com texto compartilhado)", () => {
  /** .xlsx com o MESMO texto longo em muitas células: no arquivo ele fica uma vez só (texto compartilhado). */
  async function xlsxInchado(linhas: number, colunas: number, tamanho: number): Promise<Uint8Array> {
    const longo = "Texto repetido de exemplo ".repeat(Math.ceil(tamanho / 26)).slice(0, tamanho);
    const cab = ["Nome", "Categoria", "Preço", ...Array.from({ length: colunas - 3 }, (_, i) => `Extra ${i + 1}`)];
    return xlsx([cab, ...Array.from({ length: linhas }, () => Array.from({ length: colunas }, () => longo))]);
  }

  it("só as primeiras 200 linhas com erro levam as células, cada uma cortada em 500 letras e marcada", async () => {
    const bytes = await xlsxInchado(300, 3, 5000);
    expect(bytes.length).toBeLessThan(200 * 1024); // o arquivo é pequeno; o texto lido é de 4,5 milhões de letras
    const c = await conferirPlanilha(db, gerente, pedido("produtos", "inchado.xlsx", bytes));
    expect(c.resumo.erros).toBe(300);
    const comCelulas = c.linhas.filter((l) => l.celulas);
    expect(comCelulas).toHaveLength(200);
    expect(comCelulas[0]!.numero).toBe(2);
    expect(comCelulas[199]!.numero).toBe(201);
    expect(comCelulas.every((l) => l.truncada && l.celulas!.every((x) => x.length === 500) && l.colunasTruncadas!.join() === "0,1,2")).toBe(true);
    expect(c.avisoDasCelulas).toContain("só as primeiras 200");
    expect(Buffer.byteLength(JSON.stringify(c))).toBeLessThan(1.5 * 1024 * 1024);
  });

  it("passou de 1 MB de células: para de mandar e avisa; a planilha corrigida acima de 2 MB é recusada", async () => {
    const bytes = await xlsxInchado(400, 12, 5000);
    const c = await conferirPlanilha(db, gerente, pedido("produtos", "inchado.xlsx", bytes));
    const comCelulas = c.linhas.filter((l) => l.celulas).length;
    expect(comCelulas).toBeGreaterThan(100);
    expect(comCelulas).toBeLessThan(200);
    expect(c.avisoDasCelulas).toBe("Muitas linhas com erro (texto demais para mostrar aqui); corrija a planilha ou pule as linhas.");
    const tamanho = Buffer.byteLength(JSON.stringify(c));
    expect(tamanho).toBeLessThan(1.5 * 1024 * 1024);
    expect(tamanho).toBeGreaterThan(1024 * 1024 - 100 * 1024); // as células usam o teto de 1 MB, não mais
    const e = await erroDe(conferirPlanilha(db, gerente, pedido("produtos", "inchado.xlsx", bytes, { devolverTabela: true })));
    expect(e.message).toContain("passa de 2 MB de texto");
  });

  it("sem correções, a assinatura da importação é igual à de antes (importações antigas continuam valendo)", async () => {
    const csv = ["Nome;Categoria;Preço", `Assinado ${S};Bebidas;3,00`, `Pulado ${S};Inexistente ${S};1,00`].join("\n");
    const p = pedido("produtos", "assinatura.csv", csv, { pular: [3] });
    const c = await conferirPlanilha(db, gerente, p);
    const r = await gravarPlanilha(db, gerente, { ...p, chave: c.chave });
    const imp = await db.selectFrom("importacao_planilha").select("assinatura").where("id", "=", r.importacaoId).executeTakeFirstOrThrow();
    // A conta antiga, escrita aqui de novo: tipo, sha256 do arquivo, mapa em ordem e as linhas puladas.
    const arquivo = createHash("sha256").update(new TextEncoder().encode(csv)).digest("hex");
    const mapa = Object.keys(c.mapa)
      .sort()
      .map((k) => `${k}=${c.mapa[k] ?? ""}`)
      .join(",");
    expect(imp.assinatura).toBe(createHash("sha256").update(`produtos\n${arquivo}\n${mapa}\n3`).digest("hex"));
    // Lista de correções vazia é o mesmo que não mandar.
    expect(await gravarPlanilha(db, gerente, { ...p, correcoes: [], chave: c.chave })).toMatchObject({ repetida: true, importacaoId: r.importacaoId });
  });
});
