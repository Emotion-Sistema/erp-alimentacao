/**
 * Etiqueta com código em cada lote (ideia nº 16, versão 1; migração 0030). Contra PostgreSQL real,
 * com itens inventados. Cobre: a regra do código (3 letras, iniciais, consoantes, letras + número;
 * sem acento), o código ao cadastrar por qualquer caminho e para os já cadastrados, a etiqueta do
 * lote (compra, saldo inicial, produção; nunca a sobra de contagem; nada com a etiqueta desligada),
 * número que nunca se repete (também com o código trocado e com dois lançamentos ao mesmo tempo),
 * reenvio sem número novo, trocar o código no cadastro (formato, repetido com o dono, já impresso em
 * outro produto, permissão), achar o lote pela etiqueta (só nas áreas da pessoa), o código no
 * painel e nos avisos, e o histórico que não muda.
 *
 * Nomes de teste começam com "Xq" + letras sorteadas: os outros testes do mesmo banco não geram
 * códigos começando por XQ, então a disputa de código aqui é só a que o teste monta.
 */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  acharPelaEtiqueta,
  avisarValidades,
  ErroDeRegra,
  estoqueDoItem,
  listarIngredientes,
  mudarCodigoDaEtiqueta,
  normalizarEtiqueta,
  leiturasDaEtiqueta,
  abrirContagem,
  transferir,
  painelDeFichas,
  painelDoEstoque,
  produzirPreparo,
  registrarEntrada,
  registrarPerda,
  registrarSaldoInicial,
  salvarFicha,
  salvarIngrediente,
  TIPOS_DE_AVISO_DE_VALIDADE,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let supervisor: Ator;
let hoje: string;
let meioDia: Date;

const CONSOANTES = "BCDFGHJKLMNPRSTVWZ";
/** Raiz sorteada só de consoantes, começando com XQ: "Xqkdm". */
const raiz = () => "Xq" + Array.from({ length: 3 }, () => CONSOANTES[randomInt(CONSOANTES.length)]!.toLowerCase()).join("");
const mais = (iso: string, dias: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  supervisor = await atorDoCargo(db, "supervisor");
  const r = await sql<{ hoje: string; meio_dia: Date }>`
    SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS hoje, (hoje_na_loja() + time '12:00') AT TIME ZONE u.fuso_horario AS meio_dia
    FROM unidade u ORDER BY u.id LIMIT 1`.execute(db);
  hoje = r.rows[0]!.hoje;
  meioDia = r.rows[0]!.meio_dia;
});
afterAll(() => db.destroy());

const ingrediente = async (nome: string, area: "cozinha" | "bebidas_salao" = "cozinha") =>
  (await salvarIngrediente(db, gerente, { nome, unidadeBase: "g", area })).id;
const codigoDe = async (ingredienteId: number) =>
  (await db.selectFrom("etiqueta_produto").select("codigo").where("ingrediente_id", "=", ingredienteId).executeTakeFirstOrThrow()).codigo;
const entrada = (ingredienteId: number, extra: Record<string, unknown> = {}, ator: Ator = gerente) =>
  registrarEntrada(db, ator, { itens: [{ ingredienteId, quantidade: "1000", local: "em_uso", valorCentavos: 1000, ...extra }] });
const candidatos = async (nome: string, quantos = 8) =>
  (await sql<{ c: string }>`SELECT c FROM etiqueta_candidatos(${nome}) c LIMIT ${quantos}`.execute(db)).rows.map((x) => x.c);
/** O que a regra deve escolher agora: o primeiro candidato que nenhum produto tem nem foi impresso. */
async function primeiroLivre(nome: string): Promise<string> {
  const usados = await sql<{ c: string }>`SELECT codigo AS c FROM etiqueta_produto UNION SELECT codigo FROM etiqueta_sequencia`.execute(db);
  const u = new Set(usados.rows.map((x) => x.c));
  return (await candidatos(nome, 2000)).find((c) => !u.has(c))!;
}

describe("regra do código", () => {
  it("3 letras, depois iniciais, depois consoantes, por último 2 letras + número; sem acento", async () => {
    expect((await candidatos("Bacalhau", 3))[0]).toBe("BAC");
    expect((await candidatos("Queijo minas", 2))).toEqual(["QUE", "QMI"]);
    expect((await candidatos("Bacon", 3))).toEqual(["BAC", "BCN", "BA1"]);
    expect((await candidatos("Açúcar", 1))).toEqual(["ACU"]);
    expect((await candidatos("Pão de queijo", 2))).toEqual(["PAO", "PDQ"]);
    // Nome curto: direto para letras + número.
    expect((await candidatos("Ló", 2))).toEqual(["LO1", "LO2"]);
    // Número e sinais do nome não entram.
    expect((await candidatos("7Up 350ml", 1))).toEqual(["UPM"]);
  });

  it("cadastro novo pega o primeiro livre; o repetido vai para a alternativa", async () => {
    const r = raiz(); // Xqkdm
    // Outros testes deste arquivo também usam XQ?: o esperado é o primeiro candidato livre.
    const esperadoA = await primeiroLivre(r);
    const a = await ingrediente(r);
    const codA = await codigoDe(a);
    expect(codA).toBe(esperadoA);
    // Mesmo começo: o código de "a" não volta; vai para o próximo da regra.
    const b = await ingrediente(`${codA.charAt(0)}${codA.slice(1).toLowerCase()} Bola`);
    const codB = await codigoDe(b);
    expect(codB).not.toBe(codA);
    expect((await candidatos(`${codA} Bola`, 2))).toEqual([codA, "XBO"]);
    // Uma palavra só: pula as iniciais e vai para a primeira letra + consoantes (X, Q, K...).
    const nomeC = `${codA.charAt(0)}${codA.slice(1).toLowerCase()}ab`;
    const esperadoC = await primeiroLivre(nomeC);
    expect(esperadoC).not.toBe(codA);
    expect(await codigoDe(await ingrediente(nomeC))).toBe(esperadoC);
    // Nenhum código repete, nem com o ingrediente desativado.
    await salvarIngrediente(db, gerente, { id: a, nome: r, unidadeBase: "g", area: "cozinha", ativo: false });
    const d = await ingrediente(r);
    expect(await codigoDe(d)).not.toBe(codA);
  });

  it("preparo da casa também ganha código ao ser criado", async () => {
    const r = raiz();
    const tomate = await ingrediente(`${r} tomate`);
    const f = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: `${r} Molho`,
      unidadeRendimento: "g",
      receita: { rende: "1000", validadeDias: 3, itens: [{ ingredienteId: tomate, quantidade: "500" }] },
    });
    const painel = await painelDeFichas(db, gerente);
    const meu = painel.etiquetasDosPreparos.find((e) => e.preparoId === f.resumo.id);
    expect(meu?.codigo).toMatch(/^X[A-Z0-9]{2}$/);
    expect(meu?.usaEtiqueta).toBe(true);
  });

  it("dois cadastros ao mesmo tempo com o mesmo começo ficam com códigos diferentes", async () => {
    const r = raiz();
    const ids = await Promise.all([ingrediente(`${r}a`), ingrediente(`${r}e`), ingrediente(`${r}i`)]);
    const codigos = await Promise.all(ids.map(codigoDe));
    expect(new Set(codigos).size).toBe(3);
  });
});

describe("etiqueta do lote", () => {
  it("cada entrada ganha código + número, sempre crescente; a tela recebe para escrever no pacote", async () => {
    const r = raiz();
    const x = await ingrediente(r);
    const cod = await codigoDe(x);
    const v = mais(hoje, 5);
    const e1 = await entrada(x, { validade: v });
    expect(e1.etiquetas).toEqual([{ itemId: expect.any(Number), nome: r, etiqueta: `${cod}-001`, dia: hoje, validade: v }]);
    const e2 = await registrarEntrada(db, gerente, {
      itens: [
        { ingredienteId: x, quantidade: "500", local: "guardado" },
        { ingredienteId: x, quantidade: "500", local: "em_uso", validade: v },
      ],
    });
    expect(e2.etiquetas.map((e) => e.etiqueta)).toEqual([`${cod}-002`, `${cod}-003`]);
    // Saldo inicial também.
    const s = await registrarSaldoInicial(db, gerente, { itens: [{ ingredienteId: x, quantidade: "10", local: "em_uso" }] });
    expect(s.etiquetas.map((e) => e.etiqueta)).toEqual([`${cod}-004`]);
    const item = await estoqueDoItem(db, gerente, { ingredienteId: x });
    expect(item.lotes.map((l) => l.etiqueta).sort()).toEqual([`${cod}-001`, `${cod}-002`, `${cod}-003`, `${cod}-004`]);
  });

  it("reenvio (mesma chave) devolve a mesma etiqueta e não gasta número", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    const chave = `teste-${randomUUID()}`;
    const a = await entrada(x, { validade: mais(hoje, 4) }, gerente);
    const p = { itens: [{ ingredienteId: x, quantidade: "200", local: "em_uso" as const }], chave };
    const b1 = await registrarEntrada(db, gerente, p);
    const b2 = await registrarEntrada(db, gerente, p);
    expect(a.etiquetas[0]!.etiqueta).toBe(`${cod}-001`);
    expect(b1.etiquetas.map((e) => e.etiqueta)).toEqual([`${cod}-002`]);
    expect(b2).toMatchObject({ repetido: true, etiquetas: b1.etiquetas });
    expect((await entrada(x)).etiquetas[0]!.etiqueta).toBe(`${cod}-003`);
  });

  it("duas entradas do mesmo produto ao mesmo tempo nunca repetem o número", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    const rs = await Promise.all(Array.from({ length: 6 }, () => entrada(x)));
    const todas = rs.flatMap((r) => r.etiquetas.map((e) => e.etiqueta)).sort();
    expect(todas).toEqual([1, 2, 3, 4, 5, 6].map((n) => `${cod}-00${n}`));
  });

  it("produção de preparo ganha etiqueta com o dia em que foi feito e a validade", async () => {
    const r = raiz();
    const tomate = await ingrediente(`${r} tomate`);
    await entrada(tomate);
    const f = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: `${r} Molho`,
      unidadeRendimento: "g",
      receita: { rende: "1000", validadeDias: 3, itens: [{ ingredienteId: tomate, quantidade: "500" }] },
    });
    const cod = (await db.selectFrom("etiqueta_produto").select("codigo").where("preparo_id", "=", f.resumo.id).executeTakeFirstOrThrow()).codigo;
    const p = await produzirPreparo(db, gerente, { preparoId: f.resumo.id, previsto: "1000", rendimento: "950" });
    expect(p.etiquetas).toEqual([{ itemId: expect.any(Number), nome: `${r} Molho`, etiqueta: `${cod}-001`, dia: hoje, validade: mais(hoje, 3) }]);
  });

  it("reenvio da produção e do saldo inicial devolve a mesma etiqueta; preparo com etiqueta desligada entra sem", async () => {
    const r = raiz();
    const tomate = await ingrediente(`${r} tomate`);
    await entrada(tomate);
    const f = await salvarFicha(db, gerente, {
      tipo: "preparo",
      nome: `${r} Molho`,
      unidadeRendimento: "g",
      receita: { rende: "1000", validadeDias: 3, itens: [{ ingredienteId: tomate, quantidade: "100" }] },
    });
    const pedido = { preparoId: f.resumo.id, previsto: "1000", rendimento: "1000", chave: `teste-${randomUUID()}` };
    const p1 = await produzirPreparo(db, gerente, pedido);
    const p2 = await produzirPreparo(db, gerente, pedido);
    expect(p1.etiquetas).toHaveLength(1);
    expect(p2).toMatchObject({ repetido: true, etiquetas: p1.etiquetas });
    const si = { itens: [{ ingredienteId: tomate, quantidade: "10", local: "em_uso" as const }], chave: `teste-${randomUUID()}` };
    const s1 = await registrarSaldoInicial(db, gerente, si);
    const s2 = await registrarSaldoInicial(db, gerente, si);
    expect(s1.etiquetas).toHaveLength(1);
    expect(s2).toMatchObject({ repetido: true, etiquetas: s1.etiquetas });
    await mudarCodigoDaEtiqueta(db, gerente, { preparoId: f.resumo.id, usaEtiqueta: false });
    expect((await produzirPreparo(db, gerente, { preparoId: f.resumo.id, previsto: "1000", rendimento: "1000" })).etiquetas).toEqual([]);
  });

  it("a peça mandada para outro lugar continua com a mesma etiqueta", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    await entrada(x);
    await transferir(db, cozinheira, { ingredienteId: x, quantidade: "400", de: { area: "cozinha", local: "em_uso" }, para: { area: "cozinha", local: "guardado" } });
    const item = await estoqueDoItem(db, gerente, { ingredienteId: x });
    expect(item.lotes).toHaveLength(1);
    expect(item.lotes[0]).toMatchObject({ etiqueta: `${cod}-001` });
    expect(item.lotes[0]!.saldos.map((x) => x.local).sort()).toEqual(["em_uso", "guardado"]);
  });

  it("produto com etiqueta desligada entra sem código; ligado de novo continua a numeração", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    expect((await entrada(x)).etiquetas.map((e) => e.etiqueta)).toEqual([`${cod}-001`]);
    await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: x, usaEtiqueta: false });
    const sem = await entrada(x);
    expect(sem.etiquetas).toEqual([]);
    const lote = await db.selectFrom("estoque_lote").select("etiqueta").where("movimento_id", "=", sem.movimentoId).executeTakeFirstOrThrow();
    expect(lote.etiqueta).toBeNull();
    expect((await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)).toMatchObject({ codigoEtiqueta: cod, usaEtiqueta: false });
    await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: x, usaEtiqueta: true });
    expect((await entrada(x)).etiquetas.map((e) => e.etiqueta)).toEqual([`${cod}-002`]);
  });

  it("ninguém escolhe a etiqueta à mão nem apaga o código; a etiqueta do lote não muda", async () => {
    const x = await ingrediente(raiz());
    const e = await entrada(x);
    const lote = await db.selectFrom("estoque_lote").select(["id", "item_id", "etiqueta"]).where("movimento_id", "=", e.movimentoId).executeTakeFirstOrThrow();
    await expect(sql`UPDATE estoque_lote SET etiqueta = 'ZZZ-001' WHERE id = ${lote.id}`.execute(db)).rejects.toThrow();
    await expect(sql`DELETE FROM etiqueta_produto WHERE ingrediente_id = ${x}`.execute(db)).rejects.toThrow();
    await expect(sql`UPDATE etiqueta_produto SET ingrediente_id = NULL, preparo_id = 1 WHERE ingrediente_id = ${x}`.execute(db)).rejects.toThrow();
    await expect(sql`DELETE FROM etiqueta_sequencia`.execute(db)).rejects.toThrow();
    // O número só anda para a frente (voltar repetiria etiqueta).
    await expect(sql`UPDATE etiqueta_sequencia SET ultimo = 1 WHERE codigo = ${await codigoDe(x)}`.execute(db)).rejects.toThrow(/só anda para a frente/);
    // Inserir um lote com etiqueta escolhida: o banco ignora e numera ele mesmo.
    const forjado = await sql<{ etiqueta: string | null }>`
      INSERT INTO estoque_lote (item_id, movimento_id, etiqueta) VALUES (${lote.item_id}, ${e.movimentoId}::bigint, 'ZZZ-001') RETURNING etiqueta`.execute(db);
    expect(forjado.rows[0]!.etiqueta).toBe(`${await codigoDe(x)}-002`);
    // Lote de outro tipo de movimento (como a sobra de contagem, que é ajuste) não ganha etiqueta.
    const perda = await registrarPerda(db, gerente, { ingredienteId: x, quantidade: "1", area: "cozinha", local: "em_uso", motivo: "caiu_ou_quebrou" });
    const deAjuste = await sql<{ etiqueta: string | null }>`
      INSERT INTO estoque_lote (item_id, movimento_id) VALUES (${lote.item_id}, ${perda.movimentoId}::bigint) RETURNING etiqueta`.execute(db);
    expect(deAjuste.rows[0]!.etiqueta).toBeNull();
    // Com a etiqueta desligada, a forjada também não fica (o lote entra sem etiqueta).
    await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: x, usaEtiqueta: false });
    const semEtiqueta = await sql<{ etiqueta: string | null }>`
      INSERT INTO estoque_lote (item_id, movimento_id, etiqueta) VALUES (${lote.item_id}, ${e.movimentoId}::bigint, 'ZZY-001') RETURNING etiqueta`.execute(db);
    expect(semEtiqueta.rows[0]!.etiqueta).toBeNull();
  });
});

describe("trocar o código no cadastro", () => {
  it("aceita minúscula, recusa formato errado e código de outro produto (dizendo de quem é)", async () => {
    const r1 = raiz();
    const a = await ingrediente(r1);
    const b = await ingrediente(raiz());
    const codA = await codigoDe(a);
    const novo = `XZ${CONSOANTES[randomInt(CONSOANTES.length)]}${CONSOANTES[randomInt(CONSOANTES.length)]}`;
    expect(await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: b, codigo: ` ${novo.toLowerCase()} ` })).toMatchObject({ codigo: novo, usaEtiqueta: true });
    const rep = await erroDe(mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: b, codigo: codA }));
    expect(rep.codigo).toBe("conflito");
    expect(rep.message).toContain(`"${r1}"`);
    for (const ruim of ["BÁC", "1AB", "A", "ABCDEF", "AB-1", ""])
      expect((await erroDe(mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: b, codigo: ruim }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: b }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: 999999, codigo: "ZZQ" }))).codigo).toBe("nao_encontrado");
  });

  it("só quem edita o cadastro troca", async () => {
    const a = await ingrediente(raiz());
    expect((await erroDe(mudarCodigoDaEtiqueta(db, cozinheira, { ingredienteId: a, usaEtiqueta: false }))).codigo).toBe("sem_permissao");
    expect((await erroDe(mudarCodigoDaEtiqueta(db, null, { ingredienteId: a, usaEtiqueta: false }))).codigo).toBe("nao_autenticado");
  });

  it("trocar o código espera a entrada que ainda está gravando; o código dela não vai para outro produto", async () => {
    const a = await ingrediente(raiz());
    const antigo = await codigoDe(a);
    await entrada(a); // 001 gravado (o item de estoque existe)
    const item = (await db.selectFrom("estoque_item").select("id").where("ingrediente_id", "=", a).executeTakeFirstOrThrow()).id;
    const novo = `XW${CONSOANTES[randomInt(CONSOANTES.length)]}${CONSOANTES[randomInt(CONSOANTES.length)]}${CONSOANTES[randomInt(CONSOANTES.length)]}`;
    let trocou = false;
    let troca: Promise<unknown> | undefined;
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    // Uma entrada que gera o lote 002 e segura a transação aberta.
    const lancamento = db.transaction().execute(async (trx) => {
      const m = await sql<{ id: string }>`INSERT INTO estoque_movimento (tipo, autor_id) VALUES ('entrada', ${gerente.usuarioId}) RETURNING id::text`.execute(trx);
      const l = await sql<{ etiqueta: string }>`INSERT INTO estoque_lote (item_id, movimento_id) VALUES (${item}, ${m.rows[0]!.id}::bigint) RETURNING etiqueta`.execute(trx);
      expect(l.rows[0]!.etiqueta).toBe(`${antigo}-002`);
      troca = mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: a, codigo: novo }).then(() => (trocou = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(trocou).toBe(false); // esperando a entrada
      soltar();
    });
    await espera;
    await lancamento;
    await troca;
    expect(trocou).toBe(true);
    // O código antigo já tem o 002 gravado: outro produto não fica com ele.
    const b = await ingrediente(raiz());
    expect((await erroDe(mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: b, codigo: antigo }))).codigo).toBe("conflito");
    // Nem direto no banco.
    await expect(sql`UPDATE etiqueta_produto SET codigo = ${antigo} WHERE ingrediente_id = ${b}`.execute(db)).rejects.toThrow(/já foi usado/);
  });

  it("com código novo, os lotes antigos ficam com a etiqueta antiga; o novo começa do 001; o antigo não vai para outro produto", async () => {
    const a = await ingrediente(raiz());
    const antigo = await codigoDe(a);
    await entrada(a);
    const novo = `XY${CONSOANTES[randomInt(CONSOANTES.length)]}${CONSOANTES[randomInt(CONSOANTES.length)]}${CONSOANTES[randomInt(CONSOANTES.length)]}`;
    await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: a, codigo: novo });
    expect((await entrada(a)).etiquetas.map((e) => e.etiqueta)).toEqual([`${novo}-001`]);
    const item = await estoqueDoItem(db, gerente, { ingredienteId: a });
    expect(item.lotes.map((l) => l.etiqueta).sort()).toEqual([`${antigo}-001`, `${novo}-001`].sort());
    // O código antigo está livre no cadastro, mas já foi impresso: outro produto não pega.
    const b = await ingrediente(raiz());
    const e = await erroDe(mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: b, codigo: antigo }));
    expect(e.codigo).toBe("conflito");
    expect(e.message).toContain("etiquetas");
    // Nem o cadastro automático: um nome que daria o código antigo vai para a alternativa.
    const c = await ingrediente(antigo.charAt(0) + antigo.slice(1).toLowerCase());
    expect(await codigoDe(c)).not.toBe(antigo);
    // O próprio produto pode voltar ao antigo: a numeração continua (nunca repete).
    await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: a, codigo: antigo });
    expect((await entrada(a)).etiquetas.map((x) => x.etiqueta)).toEqual([`${antigo}-002`]);
  });
});

describe("achar pela etiqueta", () => {
  it("acha do jeito que estiver escrito, só nas áreas da pessoa; o que não existe e o que não é dela respondem igual", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    await entrada(x);
    const e2 = await entrada(x);
    const loteId = (await db.selectFrom("estoque_lote").select("id").where("movimento_id", "=", e2.movimentoId).executeTakeFirstOrThrow()).id;
    for (const escrito of [`${cod}-002`, `${cod.toLowerCase()} 2`, `${cod}002`, ` ${cod}-0002 `])
      expect(await acharPelaEtiqueta(db, cozinheira, escrito)).toMatchObject({ ingredienteId: x, loteId, etiqueta: `${cod}-002` });
    // O supervisor cuida só do salão: o lote da cozinha "não existe" para ele.
    const fora = await erroDe(acharPelaEtiqueta(db, supervisor, `${cod}-002`));
    const nada = await erroDe(acharPelaEtiqueta(db, supervisor, "ZQZ-999"));
    expect([fora.codigo, nada.codigo]).toEqual(["nao_encontrado", "nao_encontrado"]);
    expect(fora.message.replace(`${cod}-002`, "X")).toBe(nada.message.replace("ZQZ-999", "X"));
    expect((await erroDe(acharPelaEtiqueta(db, cozinheira, "isso não é etiqueta"))).codigo).toBe("dados_invalidos");
    // Quem não cuida de estoque é recusado antes de qualquer busca.
    expect((await erroDe(acharPelaEtiqueta(db, await atorDoCargo(db, "atendente"), `${cod}-002`))).codigo).toBe("sem_permissao");
  });

  it("lê o que foi digitado, também sem o traço e com código que tem número", () => {
    expect(normalizarEtiqueta("bac 2")).toBe("BAC-002");
    expect(normalizarEtiqueta("BAC-1234")).toBe("BAC-1234");
    expect(normalizarEtiqueta("ba1-005")).toBe("BA1-005");
    expect(normalizarEtiqueta("BAC002")).toBe("BAC-002");
    expect(normalizarEtiqueta("bac2")).toBe("BAC-002");
    expect(leiturasDaEtiqueta("BA1005").sort()).toEqual(["BA-1005", "BA1-005"]);
    expect(leiturasDaEtiqueta("LO1007")).toContain("LO1-007");
    expect(normalizarEtiqueta("BAC-0")).toBeNull();
    expect(normalizarEtiqueta("BAC")).toBeNull();
    expect(normalizarEtiqueta(12)).toBeNull();
  });

  it("sem o traço, acha o lote do código com número (LO1-005)", async () => {
    const x = await ingrediente(raiz());
    const cod = `X${CONSOANTES[randomInt(CONSOANTES.length)]}${randomInt(10)}`;
    await mudarCodigoDaEtiqueta(db, gerente, { ingredienteId: x, codigo: cod });
    for (let i = 0; i < 5; i++) await entrada(x);
    expect(await acharPelaEtiqueta(db, cozinheira, `${cod.toLowerCase()}005`)).toMatchObject({ ingredienteId: x, etiqueta: `${cod}-005` });
  });

  it("com contagem cega aberta, a etiqueta some da gaveta e a busca não confere lote a lote", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    await entrada(x);
    await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    const gaveta = await estoqueDoItem(db, cozinheira, { ingredienteId: x });
    expect(gaveta.lotes.map((l) => l.etiqueta)).toEqual([null]);
    expect((await painelDoEstoque(db, cozinheira)).find((i) => i.ingredienteId === x)!.etiquetas).toEqual([]);
    // O lote que existe responde "em contagem" (sem olhar o saldo); a etiqueta que nunca existiu, "não encontrado".
    const existe = await erroDe(acharPelaEtiqueta(db, cozinheira, `${cod}-001`));
    await entrada(x); // 002, entra depois de aberta a contagem
    const outro = await erroDe(acharPelaEtiqueta(db, cozinheira, `${cod}-009`));
    expect(existe.codigo).toBe("conflito");
    expect(existe.message).toContain("está em contagem");
    expect(outro.codigo).toBe("nao_encontrado");
  });
});

describe("código no painel e nos avisos", () => {
  it("o painel mostra o código do produto e as etiquetas com saldo", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    await entrada(x);
    const meu = (await painelDoEstoque(db, cozinheira)).find((i) => i.ingredienteId === x)!;
    expect(meu).toMatchObject({ codigo: cod, usaEtiqueta: true, etiquetas: [`${cod}-001`] });
  });

  it("o aviso 'perto do vencimento' diz qual pacote usar primeiro", async () => {
    const x = await ingrediente(raiz());
    const cod = await codigoDe(x);
    const e = await entrada(x, { validade: mais(hoje, 5) });
    const item = (await db.selectFrom("estoque_item").select("id").where("ingrediente_id", "=", x).executeTakeFirstOrThrow()).id;
    await avisarValidades(db, { dia: mais(hoje, 4), agora: meioDia });
    const r = await sql<{ texto: string; dados: Record<string, unknown> }>`
      SELECT texto, dados FROM aviso WHERE tipo = ${TIPOS_DE_AVISO_DE_VALIDADE.perto} AND (dados->>'itemId')::int = ${item}`.execute(db);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.texto).toContain(`(${cod}-001)`);
    expect(r.rows[0]!.texto).toContain(`Use primeiro o ${cod}-001`);
    expect(r.rows[0]!.dados).toMatchObject({ etiqueta: `${cod}-001` });
    expect(e.etiquetas[0]!.etiqueta).toBe(`${cod}-001`);
  });
});
