/**
 * Recebimento da transferência entre áreas (E09; migração 0024; decisão 0027, item 9; decisão do
 * responsável em 25/11/2026: quem recebe confirma). Contra PostgreSQL real, com itens inventados.
 * Cobre: "a receber" não é vendável, consumido, contado, perdido, bloqueado nem transferido;
 * confirmar move; recusar devolve aos mesmos lotes, área e local; uma vez só (repetição e
 * concorrência); quem pode; área alheia; contagem cega; desfazer; custo médio inalterado; contagem
 * recusada com recebimento pendente (sem estoque em dobro); quem manda não recebe.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  abrirContagem,
  bloquear,
  cancelarContagem,
  conferirEstoque,
  confirmarRecebimento,
  consumirNaTransacao,
  contagemRapidaDoDia,
  criarUsuario,
  desfazerMovimento,
  ErroDeRegra,
  estoqueDoItem,
  fecharContagem,
  historicoDoItem,
  MSG_A_RECEBER,
  painelDoEstoque,
  quemRecebeNaArea,
  recebimentosPendentes,
  recusarRecebimento,
  registrarContagem,
  registrarEntrada,
  registrarPerda,
  salvarIngrediente,
  SENHA_DE_TESTE,
  transferir,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let cozinheira2: Ator;
let supervisor: Ator;
let atendente: Ator;
const sufixo = randomUUID().slice(0, 6);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${++n}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  supervisor = await atorDoCargo(db, "supervisor");
  atendente = await atorDoCargo(db, "atendente");
  // Outra cozinheira (cuida da cozinha, mas não foi indicada nem é supervisão).
  const login = `coz2-${sufixo}`;
  await criarUsuario(db, gerente, { nome: `Cozinheira dois ${sufixo}`, login, senha: SENHA_DE_TESTE, cargo: "cozinheira" });
  cozinheira2 = await atorDoCargo(db, "cozinheira", login);
});
afterEach(async () => {
  // Depois de cada teste, tudo fecha: linhas = saldos = totais = soma dos movimentos.
  expect(await conferirEstoque(db)).toEqual([]);
});
afterAll(() => db.destroy());

async function erroDe(p: Promise<unknown>): Promise<ErroDeRegra> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ErroDeRegra) return e;
    throw e;
  }
  throw new Error("era esperado um erro e a ação foi aceita");
}

const ingrediente = async (base: string, area = "cozinha") => (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase: "g", area })).id;
const entrada = (ingredienteId: number, quantidade: string, local: "em_uso" | "guardado", extra: Record<string, unknown> = {}, area?: string) =>
  registrarEntrada(db, gerente, { itens: [{ ingredienteId, quantidade, local, ...(area ? { area } : {}), ...extra }] });
const consumir = (ingredienteId: number, quantidade: string, area: "cozinha" | "cafeteria", permitirFalta = false) =>
  db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId, quantidade, area }], permitirFalta }));
const paraCafeteria = (ingredienteId: number, quantidade: string, extra: Record<string, unknown> = {}, ator = gerente) =>
  transferir(db, ator, { ingredienteId, quantidade, de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" }, recebidoPor: supervisor.usuarioId, ...extra });

/** Saldo por lote, área, local e situação (só o que tem quantidade). */
async function saldos(ingredienteId: number) {
  const r = await sql<{ lote_id: number; area: string; local: string; bloqueado: boolean; q: string }>`
    SELECT s.lote_id, s.area, s.local, s.bloqueado, s.quantidade::text AS q FROM estoque_saldo s JOIN estoque_item e ON e.id = s.item_id
    WHERE e.ingrediente_id = ${ingredienteId} AND s.quantidade > 0 ORDER BY 1, 2, 3, 4`.execute(db);
  return r.rows.map((x) => `${x.lote_id}/${x.area}/${x.local}/${x.bloqueado ? "b" : "l"}=${Number(x.q)}`);
}
const areaNoPainel = async (ator: Ator, ingredienteId: number, area: string) => (await painelDoEstoque(db, ator)).find((x) => x.ingredienteId === ingredienteId)?.areas.find((a) => a.area === area);
const totalEValor = async (ingredienteId: number) => {
  const i = await estoqueDoItem(db, gerente, { ingredienteId });
  return [i.total, i.valorCentavos];
};

describe("a receber: fora do livre, do consumo, da contagem e dos outros lançamentos", () => {
  it("entre áreas fica a receber no destino; não é vendável nem consumido", async () => {
    const x = await ingrediente("Leite");
    await entrada(x, "1000", "guardado", { valorCentavos: 1000 });
    const t = await paraCafeteria(x, "400");
    expect(t.aReceber).toEqual({ recebimentoId: expect.any(Number), area: "cafeteria", recebidoPor: { usuarioId: supervisor.usuarioId, nome: "Teste supervisor" } });
    expect(await areaNoPainel(supervisor, x, "cafeteria")).toMatchObject({ emUso: "0", guardado: "0", livre: "0", aReceber: "400" });
    expect(await areaNoPainel(gerente, x, "cozinha")).toMatchObject({ guardado: "600", livre: "600", aReceber: "0" });
    // Total e valor do item não mudam (só mudou de lugar).
    expect(await totalEValor(x)).toEqual(["1000", "1000"]);
    // Venda na cafeteria: não há saldo livre (o a receber não conta).
    expect((await erroDe(consumir(x, "100", "cafeteria"))).message).toMatch(/Sem saldo/);
    const r = await consumir(x, "100", "cafeteria", true);
    expect(r.faltas).toEqual([expect.objectContaining({ quantidade: "100" })]);
    expect(await areaNoPainel(supervisor, x, "cafeteria")).toMatchObject({ aReceber: "400" });
    // Ninguém escolhe "a receber" num lançamento.
    const doReceber = { ingredienteId: x, quantidade: "1", area: "cafeteria", local: "a_receber" };
    expect((await erroDe(registrarPerda(db, gerente, { ...doReceber, motivo: "estragou" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(bloquear(db, gerente, { ...doReceber, motivo: "quarentena" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(transferir(db, gerente, { ingredienteId: x, quantidade: "1", de: { area: "cafeteria", local: "a_receber" }, para: { area: "cafeteria", local: "em_uso" } }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(transferir(db, gerente, { ingredienteId: x, quantidade: "1", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "a_receber" }, recebidoPor: supervisor.usuarioId }))).codigo).toBe("dados_invalidos");
    // Pelos caminhos de sempre (em uso e guardado da cafeteria) não há o que tirar.
    expect((await erroDe(registrarPerda(db, supervisor, { ingredienteId: x, quantidade: "1", area: "cafeteria", local: "em_uso", motivo: "estragou" }))).message).toMatch(/há 0 g/);
    expect((await erroDe(transferir(db, supervisor, { ingredienteId: x, quantidade: "1", de: { area: "cafeteria", local: "em_uso" }, para: { area: "cafeteria", local: "guardado" } }))).message).toMatch(/há 0 g/);
    // Item e lotes mostram onde está.
    const item = await estoqueDoItem(db, supervisor, { ingredienteId: x });
    expect(item.lotes.flatMap((l) => l.saldos)).toEqual([{ area: "cafeteria", local: "a_receber", bloqueado: false, quantidade: "400" }]);
  });

  it("mesma área continua na hora, sem recebimento", async () => {
    const x = await ingrediente("Arroz");
    await entrada(x, "1000", "guardado");
    const t = await transferir(db, cozinheira, { ingredienteId: x, quantidade: "200", de: { area: "cozinha", local: "guardado" }, para: { area: "cozinha", local: "em_uso" } });
    expect(t.aReceber).toBeNull();
    expect(await areaNoPainel(cozinheira, x, "cozinha")).toMatchObject({ emUso: "200", guardado: "800", aReceber: "0" });
    expect(await db.selectFrom("estoque_recebimento").select("id").where("movimento_id", "=", t.movimentoId).execute()).toEqual([]);
    // E continua se desfazendo.
    await desfazerMovimento(db, gerente, { movimentoId: t.movimentoId, observacao: "lançado errado" });
  });
});

describe("contagem com recebimento pendente (sem estoque em dobro)", () => {
  type Aberta = { id: number; linhas: { contagemItemId: number; local: string }[] };
  const contar = (c: Aberta, local: "em_uso" | "guardado", quantidade: string) =>
    registrarContagem(db, supervisor, { contagemId: c.id, contagemItemId: c.linhas.find((l) => l.local === local)!.contagemItemId, quantidade });
  const doCozinhaEmUso = (ingredienteId: number, quantidade: string) =>
    paraCafeteria(ingredienteId, quantidade, { de: { area: "cozinha", local: "em_uso" } });
  const total = async (x: number) => (await estoqueDoItem(db, gerente, { ingredienteId: x })).total;

  it("cenário da revisão: 300 g a receber na cafeteria; contar é recusado; depois de confirmar, conta e o total fica 500", async () => {
    const x = await ingrediente("Creme");
    await entrada(x, "500", "em_uso");
    // Contagem aberta antes de a transferência chegar (abrir depois já é recusado; ver abaixo).
    const c = await abrirContagem(db, supervisor, { tipo: "item", area: "cafeteria", itens: [{ ingredienteId: x }] });
    const t = await doCozinhaEmUso(x, "300");
    // Os 300 g já estão no balcão, mas ainda "a receber": contar é recusado.
    const e = await erroDe(contar(c, "em_uso", "300"));
    expect([e.codigo, e.message]).toEqual(["conflito", MSG_A_RECEBER]);
    // Abrir outra contagem com o item é recusado com a mesma mensagem.
    const e2 = await erroDe(abrirContagem(db, supervisor, { tipo: "item", area: "cafeteria", itens: [{ ingredienteId: x, local: "em_uso" }] }));
    expect([e2.codigo, e2.message]).toEqual(["conflito", MSG_A_RECEBER]);
    // Na cozinha (origem) o item conta normalmente.
    const cz = await abrirContagem(db, gerente, { tipo: "item", area: "cozinha", itens: [{ ingredienteId: x, local: "em_uso" }] });
    await cancelarContagem(db, gerente, { contagemId: cz.id, observacao: "só para ver que abre" });
    await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    await contar(c, "em_uso", "300");
    await contar(c, "guardado", "0");
    const f = await fecharContagem(db, supervisor, { contagemId: c.id });
    expect(f.ajustes).toEqual([]);
    expect(await total(x)).toBe("500");
    expect(await areaNoPainel(gerente, x, "cafeteria")).toMatchObject({ emUso: "300", aReceber: "0" });
    expect(await areaNoPainel(gerente, x, "cozinha")).toMatchObject({ emUso: "200" });
  });

  it("contou antes da transferência chegar: fechar recusa com pendente e, depois de confirmado, pede recontagem", async () => {
    const x = await ingrediente("Requeijão");
    await entrada(x, "500", "em_uso");
    const c = await abrirContagem(db, supervisor, { tipo: "item", area: "cafeteria", itens: [{ ingredienteId: x }] });
    // A mercadoria chegou ao balcão antes de alguém lançar a transferência: conta 300.
    await contar(c, "em_uso", "300");
    await contar(c, "guardado", "0");
    const t = await doCozinhaEmUso(x, "300");
    // Fechar agora criaria sobra de 300 e a confirmação somaria mais 300 (800 no total).
    const e = await erroDe(fecharContagem(db, supervisor, { contagemId: c.id }));
    expect([e.codigo, e.message]).toEqual(["conflito", MSG_A_RECEBER]);
    // Recebimento confirmado durante a contagem aberta: o que foi contado antes não vale mais.
    await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    expect((await erroDe(fecharContagem(db, supervisor, { contagemId: c.id }))).message).toMatch(/Conte de novo: .*\(em uso\).*recebido depois da contagem/);
    await contar(c, "em_uso", "300");
    const f = await fecharContagem(db, supervisor, { contagemId: c.id });
    expect(f.ajustes).toEqual([]);
    expect(await total(x)).toBe("500");
  });

  it("contagem rápida e inventário pulam o item com algo a receber na área", async () => {
    const area = "sorvete";
    const pendente = await ingrediente("Calda pendente", area);
    const livre = await ingrediente("Calda livre", area);
    for (const x of [pendente, livre]) {
      await entrada(x, "100", "em_uso", {}, area);
      await entrada(x, "500", "guardado", {}, "cozinha");
    }
    const t = await transferir(db, gerente, { ingredienteId: pendente, quantidade: "300", de: { area: "cozinha", local: "guardado" }, para: { area, local: "em_uso" }, recebidoPor: supervisor.usuarioId });
    // Os dois faltam numa venda do sorvete (vêm primeiro na rápida); o a receber não é consumido.
    for (const x of [pendente, livre])
      await db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "150", area }], permitirFalta: true }));
    const nomes = async (ids: number[]) => Promise.all(ids.map(async (i) => (await estoqueDoItem(db, gerente, { ingredienteId: i })).nome));
    const [nmPendente, nmLivre] = await nomes([pendente, livre]);
    const r = await contagemRapidaDoDia(db, supervisor, { area, quantos: 20 });
    expect(r.linhas.some((l) => l.nome === nmLivre)).toBe(true);
    expect(r.linhas.some((l) => l.nome === nmPendente)).toBe(false);
    const inv = await abrirContagem(db, supervisor, { tipo: "inventario", area });
    expect(inv.linhas.some((l) => l.nome === nmLivre)).toBe(true);
    expect(inv.linhas.some((l) => l.nome === nmPendente)).toBe(false);
    await cancelarContagem(db, supervisor, { contagemId: inv.id, observacao: "fim do teste" });
    await recusarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, observacao: "fim do teste" });
  });

  it("a conferência acusa a receber sem recebimento pendente", async () => {
    const x = await ingrediente("Doce");
    await entrada(x, "100", "guardado");
    const t = await paraCafeteria(x, "40");
    class Desfazer extends Error {}
    const achado = await db
      .transaction()
      .execute(async (trx) => {
        // Marca o recebimento como terminado sem mover nada: o "a receber" fica sem dono.
        await trx.insertInto("estoque_recebimento_fim").values({ recebimento_id: t.aReceber!.recebimentoId, situacao: "confirmado", movimento_id: t.movimentoId, local: "em_uso", observacao: null, por: supervisor.usuarioId }).execute();
        const p = await conferirEstoque(trx);
        throw Object.assign(new Desfazer(), { p });
      })
      .catch((e: unknown) => (e instanceof Desfazer ? (e as Desfazer & { p: string[] }).p : Promise.reject(e)));
    expect(achado).toEqual([expect.stringMatching(/^a receber \d+\/cafeteria difere dos recebimentos pendentes$/)]);
    await recusarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, observacao: "fim do teste" });
  });
});

describe("confirmar e recusar", () => {
  it("confirmar leva para o local escolhido (a sugestão não manda); custo médio inalterado", async () => {
    const x = await ingrediente("Café");
    await entrada(x, "1000", "guardado", { valorCentavos: 3000 });
    const t = await paraCafeteria(x, "250");
    expect((await erroDe(confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId }))).codigo).toBe("dados_invalidos");
    const c = await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "guardado" });
    expect(c).toMatchObject({ repetido: false, situacao: "confirmado", recebimentoId: t.aReceber!.recebimentoId });
    expect(await areaNoPainel(supervisor, x, "cafeteria")).toMatchObject({ emUso: "0", guardado: "250", livre: "250", aReceber: "0" });
    expect(await totalEValor(x)).toEqual(["1000", "3000"]);
    const m = await db.selectFrom("estoque_movimento_item").select(["quantidade", "valor_centavos"]).where("movimento_id", "=", c.movimentoId).executeTakeFirstOrThrow();
    expect([Number(m.quantidade), m.valor_centavos]).toEqual([0, "0"]);
    // Agora é da cafeteria: vende (passando do guardado para o em uso).
    const v = await consumir(x, "50", "cafeteria");
    expect(v.usouGuardado).toEqual([expect.objectContaining({ quantidade: "50" })]);
    // Uma vez só: confirmar ou recusar de novo é recusado.
    expect((await erroDe(confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" }))).message).toMatch(/já foi confirmado por Teste supervisor/);
    expect((await erroDe(recusarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, observacao: "não chegou" }))).codigo).toBe("conflito");
    expect(await recebimentosPendentes(db, supervisor)).not.toContainEqual(expect.objectContaining({ recebimentoId: t.aReceber!.recebimentoId }));
    const h = await historicoDoItem(db, gerente, { ingredienteId: x });
    expect(h.slice(1, 3).map((x) => x.recebimento)).toEqual(["confirmacao", "confirmado"]);
  });

  it("recusar devolve aos mesmos lotes, área e local; motivo obrigatório", async () => {
    const x = await ingrediente("Manteiga");
    const hoje = new Date();
    const dia = (d: number) => new Date(hoje.getTime() + d * 86_400_000).toISOString().slice(0, 10);
    await entrada(x, "300", "guardado", { validade: dia(10), valorCentavos: 900 });
    await entrada(x, "300", "guardado", { validade: dia(20), valorCentavos: 1200 });
    const antes = await saldos(x);
    // 450: o que vence primeiro inteiro (300) e 150 do outro lote.
    const t = await paraCafeteria(x, "450");
    expect((await saldos(x)).filter((s) => s.includes("a_receber"))).toHaveLength(2);
    expect((await erroDe(recusarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId }))).message).toMatch(/por que está recusando/);
    expect((await erroDe(recusarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, observacao: "  " }))).codigo).toBe("dados_invalidos");
    const r = await recusarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, observacao: "Chegou estragada" });
    expect(r.situacao).toBe("recusado");
    expect(await saldos(x)).toEqual(antes);
    expect(await totalEValor(x)).toEqual(["600", "2100"]);
    const fim = await db.selectFrom("estoque_recebimento_fim").selectAll().where("recebimento_id", "=", t.aReceber!.recebimentoId).executeTakeFirstOrThrow();
    expect(fim).toMatchObject({ situacao: "recusado", local: null, observacao: "Chegou estragada", por: supervisor.usuarioId });
    expect((await erroDe(confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" }))).message).toMatch(/já foi recusado/);
  });

  it("dois do mesmo lote para a mesma área: cada um move só o seu", async () => {
    const x = await ingrediente("Açúcar");
    await entrada(x, "1000", "guardado");
    const a = await paraCafeteria(x, "100");
    const b = await paraCafeteria(x, "200");
    await recusarRecebimento(db, supervisor, { recebimentoId: a.aReceber!.recebimentoId, observacao: "não pedi" });
    expect(await areaNoPainel(gerente, x, "cafeteria")).toMatchObject({ aReceber: "200" });
    await confirmarRecebimento(db, supervisor, { recebimentoId: b.aReceber!.recebimentoId, local: "em_uso" });
    expect(await areaNoPainel(gerente, x, "cafeteria")).toMatchObject({ emUso: "200", aReceber: "0" });
    expect(await areaNoPainel(gerente, x, "cozinha")).toMatchObject({ guardado: "800" });
  });
});

describe("uma vez só (repetição e concorrência)", () => {
  it("mesma chave devolve o já gravado; chave com outro conteúdo é recusada", async () => {
    const x = await ingrediente("Chá");
    await entrada(x, "500", "guardado");
    const t = await paraCafeteria(x, "100");
    const chave = `receb-${randomUUID()}`;
    const c1 = await confirmarRecebimento(db, supervisor, { chave, recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    const c2 = await confirmarRecebimento(db, gerente, { chave, recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    expect(c2).toEqual({ ...c1, repetido: true });
    expect((await erroDe(confirmarRecebimento(db, supervisor, { chave, recebimentoId: t.aReceber!.recebimentoId, local: "guardado" }))).codigo).toBe("conflito");
    // A transferência repetida devolve o mesmo recebimento (sem outro).
    const tc = `transf-${randomUUID()}`;
    const t1 = await paraCafeteria(x, "50", { chave: tc });
    const t2 = await paraCafeteria(x, "50", { chave: tc });
    expect(t2).toEqual({ ...t1, repetido: true });
    await recusarRecebimento(db, supervisor, { recebimentoId: t1.aReceber!.recebimentoId, observacao: "teste de repetição" });
  });

  it("duas confirmações ao mesmo tempo: só uma aplica; confirmar e recusar juntos: só um vence", async () => {
    const x = await ingrediente("Mel");
    await entrada(x, "1000", "guardado");
    for (let i = 0; i < 3; i++) {
      const t = await paraCafeteria(x, "100");
      const id = t.aReceber!.recebimentoId;
      const r = await Promise.allSettled([
        confirmarRecebimento(db, supervisor, { recebimentoId: id, local: "em_uso" }),
        i === 0 ? confirmarRecebimento(db, gerente, { recebimentoId: id, local: "guardado" }) : recusarRecebimento(db, gerente, { recebimentoId: id, observacao: "ao mesmo tempo" }),
      ]);
      const ok = r.filter((x) => x.status === "fulfilled");
      const nao = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(nao).toHaveLength(1);
      expect(nao[0]!.reason).toBeInstanceOf(ErroDeRegra);
      expect((nao[0]!.reason as ErroDeRegra).codigo).toBe("conflito");
      const fins = await db.selectFrom("estoque_recebimento_fim").select("movimento_id").where("recebimento_id", "=", id).execute();
      expect(fins).toHaveLength(1);
    }
    // Nada ficou a receber nem foi movido duas vezes: 1000 no total, nada a receber.
    const p = await painelDoEstoque(db, gerente);
    const item = p.find((y) => y.ingredienteId === x)!;
    expect(item.total).toBe("1000");
    expect(item.areas.every((a) => a.aReceber === "0")).toBe(true);
  });
});

describe("quem pode confirmar", () => {
  it("a pessoa indicada ou a supervisão da área; área alheia e outro cargo não", async () => {
    const x = await ingrediente("Suco", "cafeteria");
    await entrada(x, "1000", "guardado", {}, "cafeteria");
    // Da cafeteria para a cozinha, indicada a cozinheira.
    const t = await transferir(db, supervisor, { ingredienteId: x, quantidade: "100", de: { area: "cafeteria", local: "guardado" }, para: { area: "cozinha", local: "guardado" }, recebidoPor: cozinheira.usuarioId });
    const id = t.aReceber!.recebimentoId;
    // O supervisor não cuida da cozinha: nem vê nem confirma, e a resposta é a mesma de um id que
    // não existe (não descobre que o recebimento existe).
    const alheio = await erroDe(confirmarRecebimento(db, supervisor, { recebimentoId: id, local: "em_uso" }));
    const inexistente = await erroDe(confirmarRecebimento(db, supervisor, { recebimentoId: 2_000_000_000, local: "em_uso" }));
    expect([alheio.codigo, alheio.message]).toEqual(["nao_encontrado", "Recebimento não encontrado."]);
    expect([inexistente.codigo, inexistente.message]).toEqual([alheio.codigo, alheio.message]);
    expect((await erroDe(recusarRecebimento(db, supervisor, { recebimentoId: id, observacao: "não é meu" }))).codigo).toBe("nao_encontrado");
    expect((await erroDe(recebimentosPendentes(db, supervisor, { area: "cozinha" }))).codigo).toBe("sem_permissao");
    expect(await recebimentosPendentes(db, supervisor)).not.toContainEqual(expect.objectContaining({ recebimentoId: id }));
    // A atendente não cuida de área nenhuma.
    expect((await erroDe(confirmarRecebimento(db, atendente, { recebimentoId: id, local: "em_uso" }))).codigo).toBe("sem_permissao");
    expect((await erroDe(recebimentosPendentes(db, atendente))).codigo).toBe("sem_permissao");
    // Outra cozinheira cuida da cozinha, mas não foi indicada nem é supervisão.
    const e = await erroDe(recusarRecebimento(db, cozinheira2, { recebimentoId: id, observacao: "não é meu" }));
    expect(e.codigo).toBe("sem_permissao");
    expect(e.message).toBe("Quem confirma este recebimento é Teste cozinheira ou a supervisão de Alimentos da cozinha.");
    const audit = await sql<{ n: number }>`SELECT count(*)::int AS n FROM auditoria WHERE usuario_id = ${cozinheira2.usuarioId} AND resultado = 'recusado' AND alvo_tipo = 'estoque_recebimento'`.execute(db);
    expect(audit.rows[0]!.n).toBeGreaterThanOrEqual(1);
    // Na lista, a outra cozinheira vê mas não pode confirmar; a indicada pode.
    expect((await recebimentosPendentes(db, cozinheira2)).find((r) => r.recebimentoId === id)).toMatchObject({ podeConfirmar: false });
    expect((await recebimentosPendentes(db, cozinheira, { area: "cozinha" })).find((r) => r.recebimentoId === id)).toMatchObject({
      podeConfirmar: true,
      quantidade: "100",
      areaOrigem: "cafeteria",
      localSugerido: "guardado",
      enviadoPor: "Teste supervisor",
      recebidoPor: { usuarioId: cozinheira.usuarioId, nome: "Teste cozinheira" },
    });
    // Não existe: "não encontrado" (só para quem cuida de alguma área).
    expect((await erroDe(confirmarRecebimento(db, cozinheira, { recebimentoId: 2_000_000_000, local: "em_uso" }))).codigo).toBe("nao_encontrado");
    await confirmarRecebimento(db, cozinheira, { recebimentoId: id, local: "em_uso" });
    expect(await areaNoPainel(cozinheira, x, "cozinha")).toMatchObject({ emUso: "100", aReceber: "0" });
  });

  it("quem manda não pode ser quem recebe; a lista de quem recebe não traz quem pergunta", async () => {
    const x = await ingrediente("Fermento");
    await entrada(x, "100", "guardado");
    const e = await erroDe(paraCafeteria(x, "10", { recebidoPor: gerente.usuarioId }));
    expect([e.codigo, e.message]).toEqual(["dados_invalidos", "Quem manda não pode ser quem recebe."]);
    const doGerente = (await quemRecebeNaArea(db, gerente, { area: "cafeteria" })).map((q) => q.usuarioId);
    expect(doGerente).toContain(supervisor.usuarioId);
    expect(doGerente).not.toContain(gerente.usuarioId);
    const doSupervisor = (await quemRecebeNaArea(db, supervisor, { area: "cafeteria" })).map((q) => q.usuarioId);
    expect(doSupervisor).toContain(gerente.usuarioId);
    expect(doSupervisor).not.toContain(supervisor.usuarioId);
    expect(await areaNoPainel(gerente, x, "cozinha")).toMatchObject({ guardado: "100" });
  });

  it("supervisão confirma por quem foi indicado", async () => {
    const x = await ingrediente("Gelo");
    await entrada(x, "500", "guardado");
    const t = await transferir(db, cozinheira, { ingredienteId: x, quantidade: "100", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" }, recebidoPor: gerente.usuarioId });
    expect((await recebimentosPendentes(db, supervisor, { area: "cafeteria" })).find((r) => r.recebimentoId === t.aReceber!.recebimentoId)).toMatchObject({ podeConfirmar: true });
    await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    const fim = await db.selectFrom("estoque_recebimento_fim").select(["por", "local"]).where("recebimento_id", "=", t.aReceber!.recebimentoId).executeTakeFirstOrThrow();
    expect(fim).toEqual({ por: supervisor.usuarioId, local: "em_uso" });
  });
});

describe("contagem cega e desfazer", () => {
  it("com contagem aberta, quem não é da gestão não vê quanto há a receber", async () => {
    const x = await ingrediente("Biscoito");
    await entrada(x, "800", "guardado");
    // A contagem abre antes (com o item a receber, abrir é recusado) e a transferência chega durante.
    const c = await abrirContagem(db, supervisor, { tipo: "item", area: "cafeteria", itens: [{ ingredienteId: x }] });
    await paraCafeteria(x, "120");
    const doSup = (await recebimentosPendentes(db, supervisor)).find((r) => r.itemId !== undefined && r.nome.startsWith("Biscoito"))!;
    expect(doSup).toMatchObject({ quantidade: null, emContagem: true });
    expect(JSON.stringify(doSup)).not.toContain("120");
    expect(await areaNoPainel(supervisor, x, "cafeteria")).toMatchObject({ aReceber: null, livre: null, emContagem: true });
    // A gestão continua vendo (confirmado pelo responsável em 25/11/2026).
    expect((await recebimentosPendentes(db, gerente, { area: "cafeteria" })).find((r) => r.recebimentoId === doSup.recebimentoId)).toMatchObject({ quantidade: "120", emContagem: false });
    await cancelarContagem(db, supervisor, { contagemId: c.id, observacao: "fim do teste" });
    expect((await recebimentosPendentes(db, supervisor)).find((r) => r.recebimentoId === doSup.recebimentoId)).toMatchObject({ quantidade: "120" });
    await recusarRecebimento(db, supervisor, { recebimentoId: doSup.recebimentoId, observacao: "fim do teste" });
  });

  it("desfazer: recusado enquanto pendente e depois de confirmar ou recusar", async () => {
    const x = await ingrediente("Farinha");
    await entrada(x, "1000", "guardado");
    const t = await paraCafeteria(x, "300");
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: t.movimentoId, observacao: "errado" }))).message).toMatch(/peça para recusar/);
    const c = await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: t.movimentoId, observacao: "errado" }))).message).toMatch(/mude de lugar de novo/);
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: c.movimentoId, observacao: "errado" }))).message).toMatch(/mude de lugar de novo/);
    const t2 = await paraCafeteria(x, "100");
    const r = await recusarRecebimento(db, supervisor, { recebimentoId: t2.aReceber!.recebimentoId, observacao: "não pedi" });
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: t2.movimentoId, observacao: "errado" }))).codigo).toBe("conflito");
    expect((await erroDe(desfazerMovimento(db, gerente, { movimentoId: r.movimentoId, observacao: "errado" }))).codigo).toBe("conflito");
    expect(await areaNoPainel(gerente, x, "cozinha")).toMatchObject({ guardado: "700" });
    expect(await areaNoPainel(gerente, x, "cafeteria")).toMatchObject({ emUso: "300", aReceber: "0" });
  });

  it("histórico imutável: recebimento e fim não mudam nem somem; a receber nunca é bloqueado", async () => {
    const x = await ingrediente("Sal");
    await entrada(x, "100", "guardado");
    const t = await paraCafeteria(x, "10");
    const id = t.aReceber!.recebimentoId;
    await expect(sql`UPDATE estoque_recebimento SET quantidade = 1 WHERE id = ${id}`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`DELETE FROM estoque_recebimento WHERE id = ${id}`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`TRUNCATE estoque_recebimento CASCADE`.execute(db)).rejects.toThrow();
    await expect(sql`TRUNCATE estoque_recebimento_fim`.execute(db)).rejects.toThrow();
    const lote = await sql<{ lote_id: number; item_id: number }>`SELECT lote_id, item_id FROM estoque_saldo WHERE local = 'a_receber' AND quantidade > 0 AND item_id = (SELECT id FROM estoque_item WHERE ingrediente_id = ${x})`.execute(db);
    await expect(
      sql`INSERT INTO estoque_saldo (lote_id, area, local, bloqueado, item_id, quantidade) VALUES (${lote.rows[0]!.lote_id}, 'cafeteria', 'a_receber', true, ${lote.rows[0]!.item_id}, 0)`.execute(db),
    ).rejects.toThrow(/a_receber_livre/);
    await recusarRecebimento(db, supervisor, { recebimentoId: id, observacao: "fim do teste" });
    await expect(sql`UPDATE estoque_recebimento_fim SET situacao = 'confirmado' WHERE recebimento_id = ${id}`.execute(db)).rejects.toThrow(/não muda/);
  });
});
