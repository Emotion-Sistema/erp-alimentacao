/**
 * Linhas de reposição e avisos (E10 parte 1; RC-09 seções 3 e 4, critérios 5, 5a, 6, 9 e 10;
 * migração 0025; decisão 0029). Contra PostgreSQL real, com itens inventados.
 * Cobre: um aviso por cruzamento (dez vendas seguintes não repetem; recuperar e cair avisa de novo);
 * primeira venda que usa o guardado = um urgente aos gerentes gerais (e "trazer do guardado" a quem
 * cuida da área); emergência e esgotado urgentes; nível de abastecimento; aviso do guardado
 * desligado ou rebaixado; "a receber" não conta; desfazer que recupera; duas vendas ao mesmo tempo
 * cruzando a linha = um aviso; consumo repetido pela chave não avisa de novo; quem define as linhas
 * (área alheia recusada e auditada); histórico imutável; lista para repor; sugestão de linhas e
 * "dura até" batendo com a conta manual; conferência do estado. Revisão do PR 158: linha definida
 * sobre saldo sem estado avisa (e o começo calado só na área que nunca teve o item); `dados` sem
 * quantidades para quem não compra; lote que vence sem movimento (virada do dia, worker), também
 * com duas reavaliações em paralelo; conferência da reavaliação atrasada.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  bloquear,
  caixaDeAvisos,
  calcularSugestao,
  conferirEstoque,
  confirmarRecebimento,
  consumirNaTransacao,
  definirLinhas,
  desfazerMovimento,
  ErroDeRegra,
  itensParaRepor,
  linhasDoItem,
  reavaliarReposicao,
  registrarEntrada,
  registrarPerda,
  salvarFornecedor,
  salvarIngrediente,
  sugerirLinhas,
  transferir,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
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
});
afterEach(async () => {
  // Depois de cada teste: saldos, totais, movimentos E o estado de reposição batem.
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

const ingrediente = async (base: string, extra: Record<string, unknown> = {}) =>
  (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase: "g", area: "cozinha", ...extra })).id;
const entrada = (ingredienteId: number, quantidade: string, local: "em_uso" | "guardado", area?: string) =>
  registrarEntrada(db, gerente, { itens: [{ ingredienteId, quantidade, local, ...(area ? { area } : {}) }] });
const consumir = (ingredienteId: number, quantidade: string, chave = `teste-${randomUUID()}`) =>
  db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave, itens: [{ ingredienteId, quantidade }] }));
const linhas = (ingredienteId: number, l: Record<string, unknown>, ator = gerente) => definirLinhas(db, ator, { ingredienteId, ...l });

/** Avisos de reposição do ingrediente (pelo `itemId` do `dados`, que todo aviso leva), em ordem. */
async function avisosDe(ingredienteId: number, tipo?: string) {
  const r = await sql<{ id: string; tipo: string; prioridade: string; para_cargos: string[]; texto: string; dados: Record<string, unknown> }>`
    SELECT a.id::text AS id, a.tipo, a.prioridade, a.para_cargos, a.texto, a.dados FROM aviso a
    WHERE a.tipo LIKE 'estoque.%' AND (a.dados->>'itemId')::int = (SELECT id FROM estoque_item WHERE ingrediente_id = ${ingredienteId}) AND (${tipo ?? null}::text IS NULL OR a.tipo = ${tipo ?? null}::text)
    ORDER BY a.id`.execute(db);
  return r.rows;
}
const tipos = async (ingredienteId: number) => (await avisosDe(ingredienteId)).map((a) => a.tipo);
const itemDe = async (ingredienteId: number) => (await sql<{ id: number }>`SELECT id FROM estoque_item WHERE ingrediente_id = ${ingredienteId}`.execute(db)).rows[0]!.id;
const hojeNaLoja = async (mais = 0) => (await sql<{ d: string }>`SELECT to_char(hoje_na_loja() + ${mais}::int, 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
/** Só no teste: faz algo que a trava do banco proíbe (simular dado de antes da migração, ou o tempo passando). */
const semTrava = (tabela: string, gatilho: string, f: (trx: Banco) => Promise<unknown>) =>
  db.transaction().execute(async (trx) => {
    await sql.raw(`ALTER TABLE ${tabela} DISABLE TRIGGER ${gatilho}`).execute(trx);
    await f(trx);
    await sql.raw(`ALTER TABLE ${tabela} ENABLE TRIGGER ${gatilho}`).execute(trx);
  });
/** O item fica como se o saldo fosse de antes da migração 0025 (sem estado de reposição). */
const esquecerEstado = async (ingredienteId: number) => {
  const id = await itemDe(ingredienteId);
  await semTrava("estoque_reposicao_estado", "estoque_reposicao_estado_sem_apagar", (trx) => sql`DELETE FROM estoque_reposicao_estado WHERE item_id = ${id}`.execute(trx));
};
/** As chaves do `dados` de um aviso que vai para quem não compra (cozinheira, supervisor): sem quantidades nem linhas. */
const DADOS_CEGOS = ["acao", "area", "estado", "itemId", "movimentoId"];
async function estado(ingredienteId: number, area = "cozinha") {
  const r = await sql<{ situacao: string; usando_guardado: boolean; abastecer: boolean; quantidade: string; em_uso: string; guardado: string }>`
    SELECT st.situacao, st.usando_guardado, st.abastecer, st.quantidade::text AS quantidade, st.em_uso::text AS em_uso, st.guardado::text AS guardado
    FROM estoque_reposicao_estado st JOIN estoque_item e ON e.id = st.item_id WHERE e.ingrediente_id = ${ingredienteId} AND st.area = ${area}`.execute(db);
  const x = r.rows[0];
  return x && { ...x, quantidade: Number(x.quantidade), em_uso: Number(x.em_uso), guardado: Number(x.guardado) };
}

describe("um aviso por cruzamento (critério 5)", () => {
  it("cruzar a linha saudável gera um aviso; dez vendas seguintes abaixo dela não geram outros", async () => {
    const x = await ingrediente("Farinha");
    await entrada(x, "1000", "em_uso");
    await linhas(x, { saudavel: "500", emergencia: "100" });
    await consumir(x, "400");
    expect(await tipos(x)).toEqual([]);
    expect(await estado(x)).toMatchObject({ situacao: "saudavel", quantidade: 600 });
    await consumir(x, "200"); // 400 < 500
    const [aviso] = await avisosDe(x);
    expect(await tipos(x)).toEqual(["estoque.repor"]);
    expect(aviso).toMatchObject({ prioridade: "normal", para_cargos: ["gerente_geral"] });
    expect(aviso!.texto).toMatch(/entrou em reposição \(Alimentos da cozinha\): há 400 g, linha saudável 500 g/);
    // O `dados` é o que a lista de compras vai ler.
    expect(aviso!.dados).toMatchObject({ ingredienteId: x, area: "cozinha", estado: "repor", quantidade: "400", saudavel: "500", emergencia: "100", paraRepor: "100", acao: "lista_de_compras", itemId: expect.any(Number) });
    for (let k = 0; k < 10; k++) await consumir(x, "10");
    expect(await tipos(x)).toEqual(["estoque.repor"]);
    expect(await estado(x)).toMatchObject({ situacao: "repor", quantidade: 300 });
    // Chega ao gerente geral (no turno), não à cozinheira.
    expect((await caixaDeAvisos(db, gerente)).some((a) => a.id === aviso!.id)).toBe(true);
    expect((await caixaDeAvisos(db, cozinheira)).some((a) => a.id === aviso!.id)).toBe(false);
  });

  it("recuperar e cair de novo avisa de novo", async () => {
    const x = await ingrediente("Açúcar");
    await linhas(x, { saudavel: "500" });
    await entrada(x, "600", "guardado");
    await consumir(x, "200"); // 400: avisa
    await entrada(x, "300", "guardado"); // 700: recuperou (não avisa)
    expect(await estado(x)).toMatchObject({ situacao: "saudavel" });
    await consumir(x, "100"); // 600: ainda acima
    await consumir(x, "150"); // 450: caiu de novo
    expect((await tipos(x)).filter((t) => t === "estoque.repor")).toHaveLength(2);
    // Cada mudança de situação fica num evento imutável, ligado ao movimento e ao aviso.
    const ev = await sql<{ de: string; para: string; tem_aviso: boolean; tem_mov: boolean }>`
      SELECT ev.de, ev.para, ev.aviso_id IS NOT NULL AS tem_aviso, ev.movimento_id IS NOT NULL AS tem_mov
      FROM estoque_reposicao_evento ev JOIN estoque_item e ON e.id = ev.item_id WHERE e.ingrediente_id = ${x} AND ev.tipo = 'situacao' ORDER BY ev.id`.execute(db);
    // A linha definida com o item ainda vazio, na área dele, já é "esgotado" (aviso e evento, sem movimento).
    expect(ev.rows).toEqual([
      { de: "saudavel", para: "esgotado", tem_aviso: true, tem_mov: false },
      { de: "esgotado", para: "saudavel", tem_aviso: false, tem_mov: true },
      { de: "saudavel", para: "repor", tem_aviso: true, tem_mov: true },
      { de: "repor", para: "saudavel", tem_aviso: false, tem_mov: true },
      { de: "saudavel", para: "repor", tem_aviso: true, tem_mov: true },
    ]);
    await expect(sql`UPDATE estoque_reposicao_evento SET para = 'saudavel' WHERE item_id = (SELECT id FROM estoque_item WHERE ingrediente_id = ${x})`.execute(db)).rejects.toThrow(/não muda/);
  });
});

describe("emergência e esgotado (critério 6)", () => {
  it("cruzar a emergência é urgente (um só, sem repetir); zerar é esgotado, urgente também para quem cuida da área", async () => {
    const x = await ingrediente("Óleo");
    await entrada(x, "600", "em_uso");
    await linhas(x, { saudavel: "500", emergencia: "200" });
    await consumir(x, "450"); // 150: pulou direto para emergência (um aviso, o mais grave)
    expect(await tipos(x)).toEqual(["estoque.emergencia"]);
    const [e] = await avisosDe(x, "estoque.emergencia");
    expect(e).toMatchObject({ prioridade: "urgente", para_cargos: ["gerente_geral"] });
    expect(e!.dados).toMatchObject({ estado: "emergencia", quantidade: "150", paraRepor: "350", acao: "comprar_agora" });
    await consumir(x, "50");
    await consumir(x, "50");
    expect(await tipos(x)).toEqual(["estoque.emergencia"]);
    await consumir(x, "50"); // 0
    expect(await tipos(x)).toEqual(["estoque.emergencia", "estoque.esgotado"]);
    const [z] = await avisosDe(x, "estoque.esgotado");
    expect(z).toMatchObject({ prioridade: "urgente", para_cargos: ["gerente_geral", "cozinheira"] });
    // Vai também para a cozinheira: o `dados` não leva quantidades nem linhas.
    expect(Object.keys(z!.dados).sort()).toEqual(DADOS_CEGOS);
    expect(z!.dados).toMatchObject({ itemId: await itemDe(x), area: "cozinha", estado: "esgotado", movimentoId: expect.any(String) });
    // O de emergência (só para o gerente geral) leva tudo.
    expect(e!.dados).toMatchObject({ quantidade: "150", emUso: "150", guardado: "0", saudavel: "500", emergencia: "200" });
    expect(await estado(x)).toMatchObject({ situacao: "esgotado", quantidade: 0 });
    // Saldo que não chega a zerar: da repor para a emergência avisa a emergência.
    const y = await ingrediente("Sal");
    await entrada(y, "600", "em_uso");
    await linhas(y, { saudavel: "500", emergencia: "200" });
    await consumir(y, "200");
    await consumir(y, "250");
    expect(await tipos(y)).toEqual(["estoque.repor", "estoque.emergencia"]);
    // Recuperar em parte (emergência -> repor) não avisa; cair de novo na emergência avisa.
    await entrada(y, "200", "em_uso"); // 350
    expect(await estado(y)).toMatchObject({ situacao: "repor", quantidade: 350 });
    expect(await tipos(y)).toEqual(["estoque.repor", "estoque.emergencia"]);
    await consumir(y, "200"); // 150
    expect(await tipos(y)).toEqual(["estoque.repor", "estoque.emergencia", "estoque.emergencia"]);
  });

  it("sem linhas, só o esgotado avisa; bloqueado e vencido não contam como livre", async () => {
    const x = await ingrediente("Fermento");
    await entrada(x, "100", "em_uso");
    await consumir(x, "60");
    expect(await tipos(x)).toEqual([]);
    // Bloquear o resto: não há livre, então esgotou (o bloqueado não vende).
    await bloquear(db, gerente, { ingredienteId: x, quantidade: "40", area: "cozinha", local: "em_uso", motivo: "quarentena" });
    expect(await tipos(x)).toEqual(["estoque.esgotado"]);
    expect(await estado(x)).toMatchObject({ situacao: "esgotado", quantidade: 0 });
    // No guardado também: o bloqueado não entra no total.
    const y = await ingrediente("Polvilho");
    await entrada(y, "150", "guardado");
    await linhas(y, { saudavel: "100" });
    await bloquear(db, gerente, { ingredienteId: y, quantidade: "100", area: "cozinha", local: "guardado", motivo: "suspeita" });
    expect(await estado(y)).toMatchObject({ situacao: "repor", quantidade: 50, guardado: 50 });
    expect(await tipos(y)).toEqual(["estoque.repor"]);
  });
});

describe("uso do guardado e abastecimento (critérios 2 e 5a)", () => {
  it("primeira venda que usa o guardado: um urgente aos gerentes gerais e 'trazer do guardado' a quem cuida; as seguintes não repetem", async () => {
    const x = await ingrediente("Molho");
    await entrada(x, "6", "em_uso");
    await entrada(x, "40", "guardado");
    const r = await consumir(x, "10");
    expect(r.usouGuardado).toEqual([expect.objectContaining({ quantidade: "4" })]);
    expect(await estado(x)).toMatchObject({ em_uso: 0, guardado: 36, quantidade: 36, usando_guardado: true, abastecer: true });
    expect(await tipos(x)).toEqual(["estoque.usando_guardado", "estoque.abastecer"]);
    const [g] = await avisosDe(x, "estoque.usando_guardado");
    expect(g).toMatchObject({ prioridade: "urgente", para_cargos: ["gerente_geral"] });
    expect(g!.texto).toMatch(/Começou a usar o estoque guardado de .*: restam 36 g no guardado/);
    const [ab] = await avisosDe(x, "estoque.abastecer");
    expect(ab).toMatchObject({ prioridade: "normal", para_cargos: ["cozinheira"] });
    expect(ab!.texto).not.toMatch(/\d+ g/); // para quem cuida: sem quantidades (contagem cega)
    expect(Object.keys(ab!.dados).sort()).toEqual(DADOS_CEGOS); // nem no `dados`
    expect(g!.dados).toMatchObject({ guardado: "36", emUso: "0", quantidade: "36" }); // o do gerente geral leva tudo
    expect((await caixaDeAvisos(db, cozinheira)).some((a) => a.id === ab!.id)).toBe(true);
    await consumir(x, "5");
    await consumir(x, "5");
    expect(await tipos(x)).toEqual(["estoque.usando_guardado", "estoque.abastecer"]);
    // Abasteceu (trouxe do guardado): desliga; a próxima vez que o guardado for usado avisa de novo.
    await transferir(db, cozinheira, { ingredienteId: x, quantidade: "10", de: { area: "cozinha", local: "guardado" }, para: { area: "cozinha", local: "em_uso" } });
    expect(await estado(x)).toMatchObject({ em_uso: 10, guardado: 16, usando_guardado: false, abastecer: false });
    await consumir(x, "8"); // cabe no em uso
    expect((await tipos(x)).filter((t) => t === "estoque.usando_guardado")).toHaveLength(1);
    await consumir(x, "5"); // 2 do em uso + 3 do guardado
    expect((await tipos(x)).filter((t) => t === "estoque.usando_guardado")).toHaveLength(2);
    expect((await tipos(x)).filter((t) => t === "estoque.abastecer")).toHaveLength(2);
  });

  it("aviso do guardado desligado ou rebaixado por item", async () => {
    const x = await ingrediente("Limão");
    await entrada(x, "1", "em_uso");
    await linhas(x, { avisoGuardado: "desligado" });
    await entrada(x, "50", "guardado");
    await consumir(x, "5");
    expect(await estado(x)).toMatchObject({ usando_guardado: true });
    expect(await tipos(x)).toEqual(["estoque.abastecer"]); // a tarefa de trazer continua
    const y = await ingrediente("Hortelã");
    await entrada(y, "1", "em_uso");
    await linhas(y, { avisoGuardado: "normal" });
    await entrada(y, "50", "guardado");
    await consumir(y, "5");
    expect((await avisosDe(y, "estoque.usando_guardado")).map((a) => a.prioridade)).toEqual(["normal"]);
  });

  it("em uso abaixo do nível de abastecimento avisa quem cuida; sem guardado para trazer, não", async () => {
    const x = await ingrediente("Queijo");
    await entrada(x, "100", "em_uso");
    await linhas(x, { abastecimento: "50" });
    await entrada(x, "200", "guardado");
    await consumir(x, "60"); // em uso 40 < 50
    expect(await tipos(x)).toEqual(["estoque.abastecer"]);
    await consumir(x, "10");
    expect(await tipos(x)).toEqual(["estoque.abastecer"]);
    await transferir(db, cozinheira, { ingredienteId: x, quantidade: "100", de: { area: "cozinha", local: "guardado" }, para: { area: "cozinha", local: "em_uso" } });
    expect(await estado(x)).toMatchObject({ em_uso: 130, abastecer: false });
    await consumir(x, "90"); // 40 de novo
    expect(await tipos(x)).toEqual(["estoque.abastecer", "estoque.abastecer"]);
    const y = await ingrediente("Presunto");
    await entrada(y, "100", "em_uso");
    await linhas(y, { abastecimento: "50" });
    await consumir(y, "60");
    expect(await estado(y)).toMatchObject({ em_uso: 40, guardado: 0, abastecer: false });
    expect(await tipos(y)).toEqual([]);
  });
});

describe("o que entra e o que não entra no total", () => {
  it("'a receber' não conta: a área só sai do esgotado quando quem recebe confirma", async () => {
    const x = await ingrediente("Leite");
    await entrada(x, "1000", "guardado");
    await linhas(x, { area: "cafeteria", saudavel: "100" }, supervisor);
    // Linha numa área que nunca teve o item (e não é a dele): o estado começa calado, sem aviso nem evento.
    expect(await estado(x, "cafeteria")).toMatchObject({ situacao: "esgotado" });
    expect(await tipos(x)).toEqual([]);
    const evCafe = await sql<{ n: number }>`SELECT count(*)::int AS n FROM estoque_reposicao_evento WHERE item_id = ${await itemDe(x)} AND area = 'cafeteria'`.execute(db);
    expect(evCafe.rows[0]!.n).toBe(0);
    const t = await transferir(db, gerente, { ingredienteId: x, quantidade: "300", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" }, recebidoPor: supervisor.usuarioId });
    expect(await estado(x, "cafeteria")).toMatchObject({ situacao: "esgotado", quantidade: 0 });
    const lista = await itensParaRepor(db, gerente, { area: "cafeteria" });
    expect(lista.find((i) => i.ingredienteId === x)).toMatchObject({ situacao: "esgotado", quantidade: "0", aReceber: "300", paraRepor: "100", saudavel: "100" });
    await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    expect(await estado(x, "cafeteria")).toMatchObject({ situacao: "saudavel", quantidade: 300 });
    expect((await itensParaRepor(db, gerente)).some((i) => i.ingredienteId === x)).toBe(false);
    // A cozinha (área do item, sem linha) segue saudável com 700.
    expect(await estado(x)).toMatchObject({ situacao: "saudavel", quantidade: 700 });
  });

  it("desfazer que recupera muda o estado; cair depois avisa de novo", async () => {
    const x = await ingrediente("Manteiga");
    await entrada(x, "500", "em_uso");
    await linhas(x, { saudavel: "300" });
    const p = await registrarPerda(db, gerente, { ingredienteId: x, quantidade: "300", area: "cozinha", local: "em_uso", motivo: "estragou" });
    expect(await estado(x)).toMatchObject({ situacao: "repor", quantidade: 200 });
    await desfazerMovimento(db, gerente, { movimentoId: p.movimentoId, observacao: "lançado errado" });
    expect(await estado(x)).toMatchObject({ situacao: "saudavel", quantidade: 500 });
    await consumir(x, "250");
    expect(await tipos(x)).toEqual(["estoque.repor", "estoque.repor"]);
  });
});

describe("concorrência e repetição (critério 10)", () => {
  it("duas vendas ao mesmo tempo cruzando a linha: exatamente um aviso", async () => {
    for (let rodada = 0; rodada < 3; rodada++) {
      const x = await ingrediente("Pão");
      await entrada(x, "600", "em_uso");
      await linhas(x, { saudavel: "500" });
      await Promise.all([consumir(x, "100"), consumir(x, "100")]);
      expect(await estado(x)).toMatchObject({ situacao: "repor", quantidade: 400 });
      expect(await tipos(x)).toEqual(["estoque.repor"]);
    }
  });

  it("dez vendas ao mesmo tempo usando o guardado: um aviso de guardado e um de abastecer", async () => {
    const x = await ingrediente("Carne");
    await entrada(x, "5", "em_uso");
    await entrada(x, "100", "guardado");
    await Promise.all(Array.from({ length: 10 }, () => consumir(x, "3")));
    expect(await estado(x)).toMatchObject({ quantidade: 75, em_uso: 0, usando_guardado: true });
    expect(await tipos(x)).toEqual(["estoque.usando_guardado", "estoque.abastecer"]);
  });

  it("o mesmo consumo de novo (mesma chave) não gera aviso nem evento novo", async () => {
    const x = await ingrediente("Ovo");
    await entrada(x, "60", "em_uso");
    await linhas(x, { saudavel: "50" });
    const chave = `pedido-${randomUUID()}`;
    const eventos = async () =>
      (await sql<{ n: number }>`SELECT count(*)::int AS n FROM estoque_reposicao_evento ev JOIN estoque_item e ON e.id = ev.item_id WHERE e.ingrediente_id = ${x}`.execute(db)).rows[0]!.n;
    await consumir(x, "20", chave);
    const antes = await eventos();
    const r = await consumir(x, "20", chave);
    expect(r.repetido).toBe(true);
    expect(await tipos(x)).toEqual(["estoque.repor"]);
    expect(await estado(x)).toMatchObject({ quantidade: 40 });
    expect(await eventos()).toBe(antes);
  });
});

describe("quem define as linhas e o histórico", () => {
  it("quem cuida da área define; área alheia é recusada e auditada", async () => {
    const x = await ingrediente("Tomate");
    const l = await linhas(x, { saudavel: "500", emergencia: "100", abastecimento: "80" }, cozinheira);
    expect(l).toMatchObject({ area: "cozinha", saudavel: "500", emergencia: "100", abastecimento: "80", avisoGuardado: "urgente", alteradoPor: "Teste cozinheira" });
    const recusas = async (acao: string) =>
      Number((await sql<{ n: string }>`SELECT count(*) AS n FROM auditoria WHERE usuario_id = ${supervisor.usuarioId} AND acao = ${acao} AND resultado = 'recusado'`.execute(db)).rows[0]!.n);
    const antes = await recusas("estoque.cozinha");
    expect((await erroDe(linhas(x, { saudavel: "1" }, supervisor))).codigo).toBe("sem_permissao");
    expect(await recusas("estoque.cozinha")).toBe(antes + 1);
    expect((await erroDe(linhas(x, { area: "cafeteria", saudavel: "1" }, cozinheira))).codigo).toBe("sem_permissao");
    expect((await erroDe(linhas(x, { saudavel: "1" }, atendente))).codigo).toBe("sem_permissao");
    expect((await erroDe(linhasDoItem(db, supervisor, { ingredienteId: x }))).codigo).toBe("sem_permissao");
    // Supervisor cuida do salão.
    expect(await linhas(x, { area: "bebidas_salao", saudavel: "10" }, supervisor)).toMatchObject({ area: "bebidas_salao", saudavel: "10" });
    // Supervisor vê só a área dele; a gestão vê todas.
    expect((await linhasDoItem(db, supervisor, { ingredienteId: x })).areas.map((a) => a.area)).toEqual(["bebidas_salao"]);
    expect((await linhasDoItem(db, gerente, { ingredienteId: x })).areas.map((a) => a.area)).toEqual(["cozinha", "bebidas_salao"]);
    // Regras: emergência até a saudável; número válido.
    expect((await erroDe(linhas(x, { saudavel: "100", emergencia: "101" }))).message).toMatch(/emergência não pode ser maior/);
    expect((await erroDe(linhas(x, { saudavel: "-1" }))).codigo).toBe("dados_invalidos");
    expect((await erroDe(linhas(x, { saudavel: "1.23456" }))).codigo).toBe("dados_invalidos");
    // Em outra unidade (kg -> g).
    expect(await linhas(x, { saudavel: "2", emergencia: "0.5", unidade: "kg" })).toMatchObject({ saudavel: "2000", emergencia: "500", abastecimento: null });
  });

  it("cada mudança fica no histórico (imutável); repetir as mesmas linhas não repete o histórico", async () => {
    const x = await ingrediente("Cebola");
    await linhas(x, { saudavel: "500" }, cozinheira);
    await linhas(x, { saudavel: "500" }, cozinheira);
    await linhas(x, { saudavel: "400", observacao: "menos movimento" });
    const h = await linhasDoItem(db, gerente, { ingredienteId: x });
    expect(h.mudancas.map((m) => [m.saudavel, m.por, m.observacao])).toEqual([
      ["400", "Teste gerente geral", "menos movimento"],
      ["500", "Teste cozinheira", null],
    ]);
    await expect(sql`UPDATE estoque_linha_mudanca SET saudavel = 1 WHERE item_id = (SELECT id FROM estoque_item WHERE ingrediente_id = ${x})`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`DELETE FROM estoque_linha WHERE item_id = (SELECT id FROM estoque_item WHERE ingrediente_id = ${x})`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`DELETE FROM estoque_reposicao_estado WHERE item_id = (SELECT id FROM estoque_item WHERE ingrediente_id = ${x})`.execute(db)).rejects.toThrow(/não muda/);
    await expect(sql`UPDATE estoque_linha SET emergencia = 600 WHERE item_id = (SELECT id FROM estoque_item WHERE ingrediente_id = ${x})`.execute(db)).rejects.toThrow(/emergencia_ate_saudavel/);
  });

  it("subir a linha acima do saldo avisa uma vez; baixar recupera sem aviso", async () => {
    const x = await ingrediente("Alho");
    await entrada(x, "300", "em_uso");
    await linhas(x, { saudavel: "500" });
    expect(await tipos(x)).toEqual(["estoque.repor"]);
    await linhas(x, { saudavel: "200" });
    expect(await estado(x)).toMatchObject({ situacao: "saudavel" });
    expect(await tipos(x)).toEqual(["estoque.repor"]);
  });
});

describe("linha definida sobre saldo sem movimento depois da migração", () => {
  it("item com 300 e linha saudável 500: um aviso de repor, com o 'desde'; a venda seguinte não repete", async () => {
    const x = await ingrediente("Fubá");
    await entrada(x, "300", "em_uso");
    await esquecerEstado(x); // como um saldo de antes da migração 0025
    await linhas(x, { saudavel: "500" });
    expect(await tipos(x)).toEqual(["estoque.repor"]);
    const [a] = await avisosDe(x);
    expect(a!.dados).toMatchObject({ estado: "repor", quantidade: "300", paraRepor: "200", movimentoId: null });
    expect(await estado(x)).toMatchObject({ situacao: "repor", quantidade: 300 });
    const item = (await itensParaRepor(db, gerente)).find((i) => i.ingredienteId === x);
    expect(item).toMatchObject({ situacao: "repor", paraRepor: "200" });
    expect(item!.desde).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await consumir(x, "10");
    expect(await tipos(x)).toEqual(["estoque.repor"]);
  });

  it("área que já teve o item (sem estado, porque não tinha linha): a linha nova avisa", async () => {
    const x = await ingrediente("Canela");
    await entrada(x, "100", "guardado");
    const t = await transferir(db, gerente, { ingredienteId: x, quantidade: "30", de: { area: "cozinha", local: "guardado" }, para: { area: "cafeteria", local: "em_uso" }, recebidoPor: supervisor.usuarioId });
    await confirmarRecebimento(db, supervisor, { recebimentoId: t.aReceber!.recebimentoId, local: "em_uso" });
    expect(await estado(x, "cafeteria")).toBeUndefined(); // sem linha lá, a cafeteria não era avaliada
    await linhas(x, { area: "cafeteria", saudavel: "50" }, supervisor);
    expect(await estado(x, "cafeteria")).toMatchObject({ situacao: "repor", quantidade: 30 });
    expect(await tipos(x)).toEqual(["estoque.repor"]);
  });

  it("item zerado e linha definida: um aviso de esgotado, com o 'desde'; mudar a linha de novo não repete", async () => {
    const x = await ingrediente("Gergelim");
    await entrada(x, "100", "em_uso");
    await consumir(x, "100");
    await esquecerEstado(x);
    const antes = (await tipos(x)).length;
    await linhas(x, { saudavel: "50" });
    expect((await tipos(x)).slice(antes)).toEqual(["estoque.esgotado"]);
    expect(await estado(x)).toMatchObject({ situacao: "esgotado", quantidade: 0 });
    expect((await itensParaRepor(db, gerente)).find((i) => i.ingredienteId === x)!.desde).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await linhas(x, { saudavel: "80" });
    expect((await tipos(x)).slice(antes)).toEqual(["estoque.esgotado"]);
  });
});

describe("virada do dia: lote que vence sem movimento", () => {
  it("o lote venceu: a situação vai para emergência e avisa uma vez; rodar de novo, inclusive em paralelo, não repete", async () => {
    const hoje = await hojeNaLoja();
    const amanha = new Date(Date.now() + 86_400_000);
    const comLote = async (base: string) => {
      const x = await ingrediente(base);
      await registrarEntrada(db, gerente, { itens: [
        { ingredienteId: x, quantidade: "100", local: "em_uso", validade: "2099-01-01" },
        { ingredienteId: x, quantidade: "400", local: "guardado", validade: hoje },
      ] });
      await linhas(x, { saudavel: "500", emergencia: "200" });
      return x;
    };
    const x = await comLote("Iogurte");
    expect(await estado(x)).toMatchObject({ situacao: "saudavel", quantidade: 500 });
    await reavaliarReposicao(db); // hoje o lote ainda vale: nada muda
    expect(await tipos(x)).toEqual([]);
    await reavaliarReposicao(db, { agora: amanha });
    expect(await estado(x)).toMatchObject({ situacao: "emergencia", quantidade: 100, guardado: 0 });
    const [a] = await avisosDe(x);
    expect(a).toMatchObject({ tipo: "estoque.emergencia", prioridade: "urgente", para_cargos: ["gerente_geral"] });
    expect(a!.dados).toMatchObject({ quantidade: "100", movimentoId: null });
    await reavaliarReposicao(db, { agora: amanha });
    expect(await tipos(x)).toEqual(["estoque.emergencia"]);
    // Duas execuções ao mesmo tempo (dois workers, ou a hora cheia junto com a virada): um aviso só.
    for (let rodada = 0; rodada < 3; rodada++) {
      const y = await comLote("Requeijão");
      await Promise.all([reavaliarReposicao(db, { agora: amanha }), reavaliarReposicao(db, { agora: amanha })]);
      expect(await tipos(y)).toEqual(["estoque.emergencia"]);
      const ev = await sql<{ n: number }>`SELECT count(*)::int AS n FROM estoque_reposicao_evento WHERE item_id = ${await itemDe(y)} AND tipo = 'situacao'`.execute(db);
      expect(ev.rows[0]!.n).toBe(1);
    }
    expect(await tipos(x)).toEqual(["estoque.emergencia"]);
  });

  it("a conferência acusa a reavaliação atrasada; a reavaliação de agora corrige", async () => {
    const x = await ingrediente("Ricota");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "50", local: "em_uso", validade: await hojeNaLoja() }] });
    const id = await itemDe(x);
    // O tempo passou: o lote venceu há 3 dias e o estado é de 4 dias atrás (o worker não rodou).
    await semTrava("estoque_lote", "estoque_lote_imutavel", (trx) => sql`UPDATE estoque_lote SET validade = hoje_na_loja() - 3 WHERE item_id = ${id}`.execute(trx));
    await sql`UPDATE estoque_reposicao_estado SET dia = hoje_na_loja() - 4 WHERE item_id = ${id}`.execute(db);
    expect(await conferirEstoque(db)).toEqual([`reposição ${id}/cozinha sem a reavaliação da virada do dia (lote vencido)`]);
    await reavaliarReposicao(db);
    expect(await estado(x)).toMatchObject({ situacao: "esgotado", quantidade: 0 });
    expect(await tipos(x)).toEqual(["estoque.esgotado"]);
  });
});

describe("lista para repor (encaixe com a lista de compras)", () => {
  it("o que está abaixo da linha, o mais grave primeiro, com quanto falta para a saudável; só quem compra", async () => {
    const f = await salvarFornecedor(db, gerente, { nome: nome("Atacado"), prazoEntregaDias: 2 });
    const a = await ingrediente("Arroz", { fornecedorId: f.id });
    const b = await ingrediente("Feijão");
    await linhas(a, { saudavel: "500", emergencia: "100" });
    await linhas(b, { saudavel: "500", emergencia: "100" });
    await entrada(a, "400", "guardado");
    await entrada(b, "50", "guardado");
    const lista = (await itensParaRepor(db, gerente, { area: "cozinha" })).filter((i) => i.ingredienteId === a || i.ingredienteId === b);
    expect(lista.map((i) => [i.ingredienteId, i.situacao, i.quantidade, i.paraRepor])).toEqual([
      [b, "emergencia", "50", "450"],
      [a, "repor", "400", "100"],
    ]);
    expect(lista[1]!.fornecedor).toMatchObject({ id: f.id, prazoEntregaDias: 2 });
    expect((await erroDe(itensParaRepor(db, cozinheira))).codigo).toBe("sem_permissao");
    expect((await erroDe(itensParaRepor(db, supervisor))).codigo).toBe("sem_permissao");
  });
});

describe("sugestão de linhas e 'dura até' (critério 9)", () => {
  it("a conta bate com a conta manual", () => {
    // 7 dias, 700 g consumidos: média 100 g/dia; prazo 2 -> emergência 200; folga 3 -> saudável 200 + 300 = 500.
    expect(calcularSugestao({ consumo: 7_000_000n, dias: 7, prazoDias: 2, folgaDias: 3, total: 4_500_000n })).toEqual({
      mediaDiaria: 1_000_000n,
      emergencia: 2_000_000n,
      saudavel: 5_000_000n,
      duraDias: 4, // 450 / 100 = 4,5 -> 4 dias inteiros
    });
    // Consumo simulado de uma semana (seg a dom), com sábado forte: 80+90+70+100+120+250+190 = 900 g.
    const semana = [80, 90, 70, 100, 120, 250, 190].reduce((t, g) => t + BigInt(g) * 10_000n, 0n);
    // média 900/7 = 128,571428... -> 128,5714; emergência 900*3/7 = 385,714285... -> 385,7143;
    // folga 900*2/7 = 257,142857... -> 257,1429; saudável = 642,8572.
    expect(calcularSugestao({ consumo: semana, dias: 7, prazoDias: 3, folgaDias: 2, total: 1_000_000n })).toEqual({
      mediaDiaria: 1_285_714n,
      emergencia: 3_857_143n,
      saudavel: 6_428_572n,
      duraDias: 0, // 100 g não dura um dia
    });
    expect(calcularSugestao({ consumo: 0n, dias: 7, prazoDias: 3, folgaDias: 2, total: 1n })).toEqual({ mediaDiaria: 0n, emergencia: null, saudavel: null, duraDias: null });
  });

  it("pelo consumo real no banco: prazo do fornecedor, desfazer descontado, nada gravado", async () => {
    const f = await salvarFornecedor(db, gerente, { nome: nome("Distribuidora"), prazoEntregaDias: 2 });
    const x = await ingrediente("Batata", { fornecedorId: f.id });
    await entrada(x, "1000", "em_uso");
    await consumir(x, "30");
    await consumir(x, "40");
    const c = await db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId: x, quantidade: "70" }] }));
    await desfazerMovimento(db, gerente, { movimentoId: c.movimentoId, observacao: "lançado errado" });
    // Perda não é consumo.
    await registrarPerda(db, gerente, { ingredienteId: x, quantidade: "10", area: "cozinha", local: "em_uso", motivo: "estragou" });
    const s = await sugerirLinhas(db, cozinheira, { ingredienteId: x, dias: 7 });
    // 70 g em 7 dias = 10 g/dia; prazo 2 (do fornecedor) -> 20; folga 3 (padrão) -> 20 + 30 = 50.
    expect(s).toMatchObject({ area: "cozinha", dias: 7, consumo: "70", mediaDiaria: "10", prazoDias: 2, prazoDe: "fornecedor", folgaDias: 3, emergencia: "20", saudavel: "50", total: "920", duraDias: 92 });
    expect(s.duraAte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await linhasDoItem(db, gerente, { ingredienteId: x })).areas[0]).toMatchObject({ saudavel: null, emergencia: null });
    // Período que termina ontem: sem consumo, sem sugestão.
    const ontem = new Date(Date.parse(`${s.ate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    expect(await sugerirLinhas(db, gerente, { ingredienteId: x, dias: 7, ate: ontem })).toMatchObject({ consumo: "0", emergencia: null, saudavel: null, duraDias: null });
    // Sem prazo no cadastro: pede o prazo; com ele, usa o informado.
    const y = await ingrediente("Cenoura");
    await entrada(y, "100", "em_uso");
    await consumir(y, "14");
    expect((await erroDe(sugerirLinhas(db, gerente, { ingredienteId: y, dias: 7 }))).message).toMatch(/prazo de entrega/);
    expect(await sugerirLinhas(db, gerente, { ingredienteId: y, dias: 7, prazoDias: 5, folgaDias: 1 })).toMatchObject({ prazoDe: "informado", mediaDiaria: "2", emergencia: "10", saudavel: "12" });
    // Área alheia: recusada.
    expect((await erroDe(sugerirLinhas(db, supervisor, { ingredienteId: y, prazoDias: 1 }))).codigo).toBe("sem_permissao");
  });
});

describe("conferência", () => {
  it("acusa estado de reposição que não bate com o saldo", async () => {
    const x = await ingrediente("Mel");
    await linhas(x, { saudavel: "50" });
    await entrada(x, "100", "em_uso");
    const id = (await sql<{ id: number }>`SELECT id FROM estoque_item WHERE ingrediente_id = ${x}`.execute(db)).rows[0]!.id;
    await sql`UPDATE estoque_reposicao_estado SET situacao = 'repor' WHERE item_id = ${id} AND area = 'cozinha'`.execute(db);
    expect(await conferirEstoque(db)).toEqual([`reposição ${id}/cozinha com situação diferente das linhas`]);
    await sql`UPDATE estoque_reposicao_estado SET situacao = 'saudavel', em_uso = 90, quantidade = 90 WHERE item_id = ${id} AND area = 'cozinha'`.execute(db);
    expect(await conferirEstoque(db)).toEqual([`reposição ${id}/cozinha difere do saldo livre`]);
    await sql`UPDATE estoque_reposicao_estado SET em_uso = 100, quantidade = 100 WHERE item_id = ${id} AND area = 'cozinha'`.execute(db);
  });
});
