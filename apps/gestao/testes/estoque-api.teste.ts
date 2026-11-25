/**
 * Estoque pela API (E09, decisão 0027): as rotas chamam o domínio e devolvem o que a tela usa.
 * Caminho principal (entrada, painel, contagem cega, fechar) e os casos de erro que a tela mostra:
 * mensagem do servidor, toque duplo (mesma chave), quem não cuida de área recusado antes de o pedido
 * ser lido, filtro da URL, foto da nota. Só dados fictícios.
 */
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBanco, sql, type Banco } from "@erp/banco";
import { conferirEstoque, semear, SENHA_DE_TESTE } from "@erp/dominio";
import * as r from "../src/servidor/rotas";

const BASE = "http://gestao.teste";
let db: Banco;
const S = Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "q");
const NOME = `Arroz api ${S}`;
let ingredienteId = 0;
let gerente = "";
let cozinheira = "";
let supervisor = "";
let caixa = "";

function req(caminho: string, metodo: string, cookie?: string, corpo?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (corpo !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}

async function entrarComo(login: string): Promise<string> {
  const e = await r.entrarNaSessao(req("/api/sessao", "POST", undefined, { login, senha: SENHA_DE_TESTE }));
  expect(e.status, login).toBe(200);
  return (e.headers.get("set-cookie") ?? "").split(";")[0]!;
}

/** PNG liso gerado aqui (sem foto real). */
function png(w: number, h: number): Buffer {
  const crcTab = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTab[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo), dados]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 90)]);
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(cru)), bloco("IEND", Buffer.alloc(0))]);
}

beforeAll(async () => {
  db = criarBanco(process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste", 5);
  r.usarBanco(() => db);
  await semear(db);
  const i = await db.insertInto("ingrediente").values({ nome: NOME, unidade_base: "g", unidade_exibicao: "kg", area_estoque: "cozinha" }).returning("id").executeTakeFirstOrThrow();
  ingredienteId = i.id;
  gerente = await entrarComo("gerente.geral");
  cozinheira = await entrarComo("cozinheira");
  supervisor = await entrarComo("supervisor");
  caixa = await entrarComo("caixa");
});
afterAll(async () => {
  expect(await conferirEstoque(db)).toEqual([]);
  await db.destroy();
});

describe("estoque pela API", () => {
  it("entrada com a mesma chave grava uma vez; o painel mostra; o erro do domínio chega com a mensagem", async () => {
    const chave = `tela-${S}-1`;
    const corpo = { chave, notaNumero: "123", itens: [{ ingredienteId, quantidade: "2", unidade: "kg", local: "guardado", valorCentavos: 2000 }] };
    const a = await r.darEntrada(req("/api/estoque/entradas", "POST", gerente, corpo));
    expect(a.status).toBe(201);
    const primeira = (await a.json()) as { movimentoId: string; repetido: boolean };
    expect(primeira.repetido).toBe(false);
    const b = await r.darEntrada(req("/api/estoque/entradas", "POST", gerente, corpo));
    expect(((await b.json()) as { movimentoId: string; repetido: boolean })).toEqual({ movimentoId: primeira.movimentoId, repetido: true });
    // Mesma chave com outro conteúdo: recusa com a mensagem do servidor.
    const c = await r.darEntrada(req("/api/estoque/entradas", "POST", gerente, { ...corpo, notaNumero: "999" }));
    expect(c.status).toBe(409);
    expect(((await c.json()) as { mensagem: string }).mensagem).toMatch(/já foi gravado com outros dados/);
    // Cozinheira não informa valor (custos.ver): 403.
    const d = await r.darEntrada(req("/api/estoque/entradas", "POST", cozinheira, { itens: [{ ingredienteId, quantidade: "1", local: "em_uso", valorCentavos: 100 }] }));
    expect(d.status).toBe(403);

    const painel = (await (await r.verPainelDoEstoque(req("/api/estoque?area=cozinha", "GET", gerente))).json()) as { nome: string; total: string; valorCentavos: string | null; areas: { guardado: string }[] }[];
    const item = painel.find((x) => x.nome === NOME)!;
    expect(item).toMatchObject({ total: "2000", valorCentavos: "2000" });
    expect(item.areas[0]!.guardado).toBe("2000");
    // Cozinheira vê o item, sem valor.
    const daCozinha = (await (await r.verPainelDoEstoque(req("/api/estoque", "GET", cozinheira))).json()) as { nome: string; valorCentavos: string | null }[];
    expect(daCozinha.find((x) => x.nome === NOME)!.valorCentavos).toBeNull();
    // Supervisor (salão) não pede a cozinha.
    expect((await r.verPainelDoEstoque(req("/api/estoque?area=cozinha", "GET", supervisor))).status).toBe(403);
  });

  it("entre áreas: a lista de quem recebe e a mudança com recebidoPor", async () => {
    const quem = await r.verQuemRecebe(req("/api/estoque/quem-recebe?area=cafeteria", "GET", cozinheira));
    expect(quem.status).toBe(200);
    const lista = (await quem.json()) as { usuarioId: number; nome: string }[];
    const sup = lista.find((x) => x.nome === "Teste supervisor")!;
    expect(sup).toBeDefined();
    expect(lista.some((x) => x.nome === "Teste cozinheira")).toBe(false);
    expect((await r.verQuemRecebe(req("/api/estoque/quem-recebe?area=cafeteria", "GET", caixa))).status).toBe(403);
    // Sem quem recebeu: a mensagem do domínio.
    const corpo = { ingredienteId, quantidade: "100", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" } };
    const sem = await r.transferirNoEstoque(req("/api/estoque/transferir", "POST", cozinheira, corpo));
    expect(((await sem.json()) as { mensagem: string }).mensagem).toBe("Entre áreas, informe quem recebeu.");
    const feita = await r.transferirNoEstoque(req("/api/estoque/transferir", "POST", cozinheira, { ...corpo, recebidoPor: sup.usuarioId }));
    expect(feita.status).toBe(200);
    // Fica a receber na cafeteria até o supervisor confirmar (decisão do responsável, 25/11/2026).
    const { aReceber } = (await feita.json()) as { aReceber: { recebimentoId: number; area: string; recebidoPor: { nome: string } } };
    expect(aReceber).toMatchObject({ area: "cafeteria", recebidoPor: { nome: "Teste supervisor" } });
    const pendentes = await r.verRecebimentos(req("/api/estoque/recebimentos?area=cafeteria", "GET", supervisor));
    expect(pendentes.status).toBe(200);
    expect(((await pendentes.json()) as { recebimentoId: number; quantidade: string; podeConfirmar: boolean }[]).find((x) => x.recebimentoId === aReceber.recebimentoId)).toMatchObject({ quantidade: "100", podeConfirmar: true });
    // A cozinheira não cuida da cafeteria: nem a lista dela nem a confirmação.
    expect((await r.verRecebimentos(req("/api/estoque/recebimentos?area=cafeteria", "GET", cozinheira))).status).toBe(403);
    expect((await r.confirmarUmRecebimento(req("/api/estoque/recebimentos/confirmar", "POST", cozinheira, { recebimentoId: aReceber.recebimentoId, local: "em_uso" }))).status).toBe(403);
    // Sem o local: a mensagem do domínio.
    const semLocal = await r.confirmarUmRecebimento(req("/api/estoque/recebimentos/confirmar", "POST", supervisor, { recebimentoId: aReceber.recebimentoId }));
    expect(semLocal.status).toBe(400);
    expect(((await semLocal.json()) as { mensagem: string }).mensagem).toBe("Escolha onde fica: em uso ou guardado.");
    // O supervisor recusa: volta para a cozinha (para o resto dos testes contar só a cozinha).
    const recusa = await r.recusarUmRecebimento(req("/api/estoque/recebimentos/recusar", "POST", supervisor, { recebimentoId: aReceber.recebimentoId, observacao: "Não pedi leite" }));
    expect(recusa.status).toBe(200);
    expect(await recusa.json()).toMatchObject({ situacao: "recusado", repetido: false });
    const outra = await r.recusarUmRecebimento(req("/api/estoque/recebimentos/recusar", "POST", supervisor, { recebimentoId: aReceber.recebimentoId, observacao: "de novo" }));
    expect(outra.status).toBe(409);
  });

  it("detalhe, histórico e lista de entradas leem o filtro da URL", async () => {
    const det = await r.verItemDoEstoque(req(`/api/estoque/item?ingredienteId=${ingredienteId}`, "GET", cozinheira));
    expect(det.status).toBe(200);
    const item = (await det.json()) as { lotes: { saldos: { local: string; quantidade: string }[] }[] };
    expect(item.lotes[0]!.saldos[0]).toMatchObject({ local: "guardado", quantidade: "2000" });
    const hist = (await (await r.verHistoricoDoItem(req(`/api/estoque/item/historico?ingredienteId=${ingredienteId}&limite=5`, "GET", gerente))).json()) as { tipo: string; quantidadeDepois: string }[];
    // Mais novo primeiro: a recusa (voltou), a mudança entre áreas e, antes delas, a entrada.
    expect(hist.map((h) => h.tipo)).toEqual(["transferencia", "transferencia", "entrada"]);
    expect(hist[2]).toMatchObject({ tipo: "entrada", quantidadeDepois: "2000" });
    // Sem item: a mensagem do domínio.
    const sem = await r.verItemDoEstoque(req("/api/estoque/item", "GET", gerente));
    expect(sem.status).toBe(400);
    expect(((await sem.json()) as { mensagem: string }).mensagem).toBe("Escolha um ingrediente ou um preparo.");
    const so = (await (await r.verEntradas(req("/api/estoque/entradas?soEstimadas=true", "GET", gerente))).json()) as { notaNumero: string | null }[];
    const lista = (await (await r.verEntradas(req("/api/estoque/entradas?limite=10", "GET", gerente))).json()) as { notaNumero: string | null; itens: { ingredienteId: number | null }[] }[];
    expect(lista.find((e) => e.notaNumero === "123")!.itens[0]!.ingredienteId).toBe(ingredienteId);
    expect(so.some((e) => e.notaNumero === "123")).toBe(false);
    const todas = (await (await r.verEntradas(req("/api/estoque/entradas?soEstimadas=false&limite=10", "GET", gerente))).json()) as { notaNumero: string | null; movimentoId: string }[];
    expect(todas.some((e) => e.notaNumero === "123")).toBe(true);
  });

  it("foto da nota: anexa, a mesma foto não duplica, sai como WebP; quem não cuida de área é recusado", async () => {
    const lista = (await (await r.verEntradas(req("/api/estoque/entradas?limite=10", "GET", gerente))).json()) as { notaNumero: string | null; movimentoId: string }[];
    const movimentoId = lista.find((e) => e.notaNumero === "123")!.movimentoId;
    const arquivo = png(400, 300).toString("base64");
    const a = await r.enviarFotoDaNota(req("/api/estoque/entradas/foto", "POST", gerente, { movimentoId, arquivo }));
    expect(a.status).toBe(201);
    const foto = (await a.json()) as { id: number; repetida: boolean };
    expect(foto.repetida).toBe(false);
    expect(((await (await r.enviarFotoDaNota(req("/api/estoque/entradas/foto", "POST", gerente, { movimentoId, arquivo }))).json()) as { repetida: boolean }).repetida).toBe(true);
    const ver = await r.verFotoDaNota(req(`/api/estoque/entradas/foto/${foto.id}`, "GET", cozinheira), { id: String(foto.id) });
    expect(ver.status).toBe(200);
    expect(ver.headers.get("content-type")).toBe("image/webp");
    expect((await r.verFotoDaNota(req(`/api/estoque/entradas/foto/${foto.id}`, "GET", caixa), { id: String(foto.id) })).status).toBe(403);
    expect((await r.enviarFotoDaNota(req("/api/estoque/entradas/foto", "POST", caixa, { movimentoId, arquivo }))).status).toBe(403);
  });

  it("contagem cega: aberta não traz o esperado; fechar lança a diferença e mostra", async () => {
    const aberta = await r.novaContagem(req("/api/estoque/contagens", "POST", cozinheira, { tipo: "item", area: "cozinha", itens: [{ ingredienteId, local: "guardado" }] }));
    expect(aberta.status).toBe(201);
    const c = (await aberta.json()) as { id: number; linhas: { contagemItemId: number; esperado: string | null }[] };
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]!.esperado).toBeNull();
    expect((await r.contarItem(req("/api/estoque/contagens/contar", "POST", cozinheira, { contagemId: c.id, contagemItemId: c.linhas[0]!.contagemItemId, quantidade: "1,5", unidade: "kg" }))).status).toBe(200);
    const vista = await r.verUmaContagem(req(`/api/estoque/contagens/${c.id}`, "GET", cozinheira), { id: String(c.id) });
    const texto = await vista.text();
    expect(texto).not.toMatch(/"esperado":"/);
    expect(JSON.parse(texto)).toMatchObject({ situacao: "aberta", contados: 1 });
    // Cancelar sem motivo: a mensagem do domínio.
    const semMotivo = await r.cancelarUmaContagem(req("/api/estoque/contagens/cancelar", "POST", cozinheira, { contagemId: c.id }));
    expect(semMotivo.status).toBe(400);
    expect(((await semMotivo.json()) as { mensagem: string }).mensagem).toBe("Escreva por que está cancelando.");
    const fim = await r.fecharUmaContagem(req("/api/estoque/contagens/fechar", "POST", cozinheira, { contagemId: c.id }));
    expect(fim.status).toBe(200);
    expect(((await fim.json()) as { ajustes: { diferenca: string }[] }).ajustes).toEqual([expect.objectContaining({ diferenca: "-500" })]);
    const fechada = (await (await r.verUmaContagem(req(`/api/estoque/contagens/${c.id}`, "GET", cozinheira), { id: String(c.id) })).json()) as { linhas: { esperado: string; diferenca: string }[] };
    expect(fechada.linhas[0]).toMatchObject({ esperado: "2000", diferenca: "-500" });
    const lista = (await (await r.verContagens(req("/api/estoque/contagens?situacao=fechada&limite=5", "GET", cozinheira))).json()) as { id: number }[];
    expect(lista.map((x) => x.id)).toContain(c.id);
    // Fechar de novo: recusa.
    expect((await r.fecharUmaContagem(req("/api/estoque/contagens/fechar", "POST", cozinheira, { contagemId: c.id }))).status).toBe(409);
  });

  it("relatórios leem o período da URL; valor por área só com custos.ver", async () => {
    const hoje = (await sql<{ d: string }>`SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
    const dif = (await (await r.verRelatorioDeContagens(req(`/api/estoque/relatorios/contagens?desde=${hoje}&ate=${hoje}&area=cozinha`, "GET", gerente))).json()) as { linhas: { nome: string; diferenca: string }[] };
    expect(dif.linhas.find((l) => l.nome === NOME)?.diferenca).toBe("-500");
    expect((await r.verRelatorioDePerdas(req(`/api/estoque/relatorios/perdas?desde=${hoje}&ate=${hoje}`, "GET", cozinheira))).status).toBe(200);
    const invertido = await r.verRelatorioDePerdas(req(`/api/estoque/relatorios/perdas?desde=${hoje}&ate=2000-01-01`, "GET", cozinheira));
    expect(((await invertido.json()) as { mensagem: string }).mensagem).toBe("A data inicial vem antes da final.");
    expect((await r.verValorDoEstoque(req("/api/estoque/relatorios/valor", "GET", gerente))).status).toBe(200);
    expect((await r.verValorDoEstoque(req("/api/estoque/relatorios/valor", "GET", cozinheira))).status).toBe(403);
  });

  it("desfazer: só com estoque.desfazer e com motivo; a mensagem do domínio chega", async () => {
    const hist = (await (await r.verHistoricoDoItem(req(`/api/estoque/item/historico?ingredienteId=${ingredienteId}`, "GET", gerente))).json()) as { movimentoId: string; tipo: string }[];
    const ajuste = hist.find((h) => h.tipo === "ajuste")!;
    expect((await r.desfazerUmMovimento(req("/api/estoque/desfazer", "POST", cozinheira, { movimentoId: ajuste.movimentoId, observacao: "errado" }))).status).toBe(403);
    const sem = await r.desfazerUmMovimento(req("/api/estoque/desfazer", "POST", gerente, { movimentoId: ajuste.movimentoId }));
    expect(((await sem.json()) as { mensagem: string }).mensagem).toBe("Escreva por que está desfazendo.");
    const ok = await r.desfazerUmMovimento(req("/api/estoque/desfazer", "POST", gerente, { movimentoId: ajuste.movimentoId, observacao: "contagem errada", chave: `tela-${S}-d` }));
    expect(ok.status).toBe(200);
    const de_novo = await r.desfazerUmMovimento(req("/api/estoque/desfazer", "POST", gerente, { movimentoId: ajuste.movimentoId, observacao: "contagem errada" }));
    expect(((await de_novo.json()) as { mensagem: string }).mensagem).toBe("Este movimento já foi desfeito.");
  });
});
