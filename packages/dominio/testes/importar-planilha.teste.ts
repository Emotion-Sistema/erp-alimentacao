/**
 * Importação de planilha (E07 parte 3; migração 0014; decisão 0020). Contra PostgreSQL real.
 * Formatos (.xlsx, .csv, .html), acentos e separadores, cabeçalhos flexíveis, erros por linha com
 * o número e a coluna certos, nada gravado na conferência, tudo ou nada na gravação,
 * idempotência (inclusive clique duplo ao mesmo tempo), permissões, limites de tamanho e tipo.
 * Só dados inventados.
 */
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  ErroDeRegra,
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
import { conferirZip, lerArquivoDePlanilha } from "../src/planilha-ler";
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
      { numero: 2, celulas: ["X-Bacon", "29,9", "12", "19/11/2026"] },
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

  it(".xlsx que incha ao abrir é recusado antes de abrir (índice do zip conferido)", async () => {
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
    expect(() => conferirZip(b)).toThrow(/grande demais por dentro/);
    expect((await erroDe(ler(b, "bomba.xlsx"))).message).toContain("grande demais por dentro");
  });
});

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
    expect(problema(4)).toEqual([{ coluna: "Coluna B (Categoria)", texto: expect.stringContaining("Não existe a categoria") }]);
    expect(problema(5)[0]!.texto).toContain("está desativada");
    expect(problema(6)).toEqual([{ coluna: "Coluna E (Tempo de preparo)", texto: expect.stringContaining("Falta o tempo de preparo") }]);
    expect(problema(7)[0]).toMatchObject({ coluna: "Coluna E (Tempo de preparo)", texto: expect.stringContaining("Sem tipo de produção") });
    expect(problema(8)[0]).toMatchObject({ coluna: "Coluna D (Valor)", texto: expect.stringContaining("Preço inválido") });
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
