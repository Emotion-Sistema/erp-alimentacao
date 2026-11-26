/**
 * Desperdício por vencimento (ideia nº 15: D1, D7 e D4a; migração 0029). Contra PostgreSQL real, com
 * itens inventados. Cobre: dinheiro em risco em 3 e 7 dias (lote x custo médio, sem o bloqueado,
 * vencido à parte, só com custos.ver); aviso "perto do vencimento" uma vez por lote e área, não para
 * o lote que já entrou perto, só em turno; "vencido sem perda" depois de 2 dias, não quando a perda
 * foi registrada; duas execuções ao mesmo tempo; histórico imutável; validade curta na entrada (alerta
 * na resposta, aviso ao gerente quando quem deu entrada não é de compras, nada no reenvio).
 * O dia é simulado pelo parâmetro `dia` (o lote nasce hoje de verdade).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  avisarValidades,
  bloquear,
  dinheiroEmRisco,
  listarIngredientes,
  registrarEntrada,
  registrarPerda,
  registrarSaldoInicial,
  salvarIngrediente,
  TIPO_DO_AVISO_DE_VALIDADE_CURTA,
  TIPOS_DE_AVISO_DE_VALIDADE,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
let hoje: string;
let meioDia: Date;
let madrugada: Date;
const sufixo = randomUUID().slice(0, 6);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${++n}`;

const mais = (iso: string, dias: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
  const r = await sql<{ hoje: string; meio_dia: Date; madrugada: Date }>`
    SELECT to_char(hoje_na_loja(), 'YYYY-MM-DD') AS hoje,
      (hoje_na_loja() + time '12:00') AT TIME ZONE u.fuso_horario AS meio_dia,
      (hoje_na_loja() + time '03:00') AT TIME ZONE u.fuso_horario AS madrugada
    FROM unidade u ORDER BY u.id LIMIT 1`.execute(db);
  hoje = r.rows[0]!.hoje;
  meioDia = r.rows[0]!.meio_dia;
  madrugada = r.rows[0]!.madrugada;
});
afterAll(() => db.destroy());

const ingrediente = async (base: string, extra: Record<string, unknown> = {}) =>
  (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase: "g", area: "cozinha", ...extra })).id;
const itemDe = async (ingredienteId: number) => (await db.selectFrom("estoque_item").select("id").where("ingrediente_id", "=", ingredienteId).executeTakeFirstOrThrow()).id;

async function avisosDoItem(itemId: number, tipo: string) {
  const r = await sql<{ id: string; prioridade: string; para_cargos: string[]; texto: string; dados: Record<string, unknown> }>`
    SELECT a.id::text AS id, a.prioridade, a.para_cargos, a.texto, a.dados FROM aviso a
    WHERE a.tipo = ${tipo} AND (a.dados->>'itemId')::int = ${itemId} ORDER BY a.id`.execute(db);
  return r.rows;
}

describe("D1: dinheiro em risco", () => {
  it("soma em 3 e 7 dias pelo custo médio, sem o bloqueado; o vencido fica à parte; por área e no total", async () => {
    const x = await ingrediente("Muçarela");
    // 3 lotes de 1000 g a R$ 100,00 cada: vence em 2 dias, em 6 dias e em 20 dias.
    await registrarEntrada(db, gerente, {
      itens: [
        { ingredienteId: x, quantidade: "1000", local: "guardado", validade: mais(hoje, 2), valorCentavos: 10000 },
        { ingredienteId: x, quantidade: "1000", local: "guardado", validade: mais(hoje, 6), valorCentavos: 10000 },
        { ingredienteId: x, quantidade: "1000", local: "em_uso", validade: mais(hoje, 20), valorCentavos: 10000 },
      ],
    });
    const item = await itemDe(x);
    const r = await dinheiroEmRisco(db, gerente, { dia: hoje });
    expect(r.hoje).toBe(hoje);
    const meu = r.itens.find((i) => i.itemId === item)!;
    expect(meu).toMatchObject({
      area: "cozinha",
      quantidade3: "1000",
      quantidade7: "2000",
      valor3Centavos: "10000",
      valor7Centavos: "20000",
      quantidadeVencida: "0",
      valorVencidoCentavos: "0",
      primeiraValidade: mais(hoje, 2),
    });
    // O total e a área somam todos os itens (outros testes também têm lotes): no mínimo o deste.
    expect(BigInt(r.em7DiasCentavos)).toBeGreaterThanOrEqual(20000n);
    expect(BigInt(r.porArea.find((a) => a.area === "cozinha")!.em7DiasCentavos)).toBeGreaterThanOrEqual(20000n);

    // Três dias depois: o primeiro lote venceu (à parte); o segundo vence em 3 dias.
    const depois = await dinheiroEmRisco(db, gerente, { dia: mais(hoje, 3) });
    expect(depois.itens.find((i) => i.itemId === item)).toMatchObject({
      quantidade3: "1000",
      quantidade7: "1000",
      valor3Centavos: "10000",
      quantidadeVencida: "1000",
      valorVencidoCentavos: "10000",
      primeiraValidade: mais(hoje, 2),
    });

    // Bloqueado (quarentena) não entra no "vence em": já não vai ser usado.
    await bloquear(db, gerente, { ingredienteId: x, quantidade: "400", area: "cozinha", local: "guardado", motivo: "suspeita" });
    const semBloqueado = (await dinheiroEmRisco(db, gerente, { dia: hoje })).itens.find((i) => i.itemId === item)!;
    expect(semBloqueado.quantidade7).toBe("1600");
    expect(semBloqueado.valor7Centavos).toBe("16000");
  });

  it("item sem nada vencendo em 7 dias não aparece", async () => {
    const x = await ingrediente("Arroz");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "500", local: "guardado", validade: mais(hoje, 30), valorCentavos: 500 }] });
    const item = await itemDe(x);
    expect((await dinheiroEmRisco(db, gerente, { dia: hoje })).itens.find((i) => i.itemId === item)).toBeUndefined();
  });

  it("só com custos.ver: a cozinheira é recusada e a recusa fica na auditoria", async () => {
    await expect(dinheiroEmRisco(db, cozinheira)).rejects.toMatchObject({ codigo: "sem_permissao" });
    const r = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM auditoria WHERE usuario_id = ${cozinheira.usuarioId} AND acao = 'custos.ver' AND resultado = 'recusado'`.execute(db);
    expect(r.rows[0]!.n).toBeGreaterThan(0);
  });
});

describe("D1: aviso de lote perto do vencimento", () => {
  it("avisa uma vez por lote, quando faltam 2 dias, à cozinheira e ao gerente, sem quantidade no texto", async () => {
    const x = await ingrediente("Presunto");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "800", local: "guardado", validade: mais(hoje, 5), lote: "L77" }] });
    const item = await itemDe(x);
    await avisarValidades(db, { dia: hoje, agora: meioDia });
    await avisarValidades(db, { dia: mais(hoje, 2), agora: meioDia }); // faltam 3 dias: ainda não
    expect(await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.perto)).toEqual([]);
    await avisarValidades(db, { dia: mais(hoje, 3), agora: meioDia });
    await avisarValidades(db, { dia: mais(hoje, 4), agora: meioDia });
    await avisarValidades(db, { dia: mais(hoje, 5), agora: meioDia });
    const a = await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.perto);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ prioridade: "normal", para_cargos: ["cozinheira", "gerente_geral"] });
    expect(a[0]!.texto).toMatch(new RegExp(`^Perto do vencimento: ".*Presunto.*" \\(lote L77\\) vence em 2 dias \\(${ddmm(mais(hoje, 5))}\\), em Alimentos da cozinha\\. Use primeiro ou registre o descarte\\.$`));
    expect(a[0]!.texto).not.toMatch(/800/);
    expect(a[0]!.dados).toMatchObject({ itemId: item, area: "cozinha", validade: mais(hoje, 5), codigo: "L77", acao: "usar_primeiro" });
  });

  it("o lote que já entrou perto do vencimento (vale 2 dias) não avisa; o bloqueado também não", async () => {
    const x = await ingrediente("Molho");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "300", local: "em_uso", validade: mais(hoje, 2) }] });
    const y = await ingrediente("Ricota");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: y, quantidade: "300", local: "guardado", validade: mais(hoje, 6) }] });
    await bloquear(db, gerente, { ingredienteId: y, quantidade: "300", area: "cozinha", local: "guardado", motivo: "suspeita", observacao: "cheiro estranho" });
    await avisarValidades(db, { dia: hoje, agora: meioDia });
    await avisarValidades(db, { dia: mais(hoje, 1), agora: meioDia });
    await avisarValidades(db, { dia: mais(hoje, 5), agora: meioDia });
    expect(await avisosDoItem(await itemDe(x), TIPOS_DE_AVISO_DE_VALIDADE.perto)).toEqual([]);
    expect(await avisosDoItem(await itemDe(y), TIPOS_DE_AVISO_DE_VALIDADE.perto)).toEqual([]);
  });

  it("fora do turno não avisa (o aviso morreria antes de alguém ver); no turno seguinte avisa", async () => {
    const x = await ingrediente("Creme");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "200", local: "guardado", validade: mais(hoje, 4) }] });
    // Os testes têm turnos no dia todo: abre um vão das 00h às 04h só neste teste.
    const manha = await db.selectFrom("turno").select(["id", "inicio"]).where("inicio", "=", "00:00:00").executeTakeFirstOrThrow();
    await db.updateTable("turno").set({ inicio: "04:00" }).where("id", "=", manha.id).execute();
    let r;
    try {
      r = await avisarValidades(db, { dia: mais(hoje, 3), agora: madrugada });
    } finally {
      await db.updateTable("turno").set({ inicio: manha.inicio }).where("id", "=", manha.id).execute();
    }
    expect(r).toEqual({ perto: 0, vencidos: 0, foraDoTurno: true });
    expect(await avisosDoItem(await itemDe(x), TIPOS_DE_AVISO_DE_VALIDADE.perto)).toEqual([]);
    await avisarValidades(db, { dia: mais(hoje, 3), agora: meioDia });
    expect(await avisosDoItem(await itemDe(x), TIPOS_DE_AVISO_DE_VALIDADE.perto)).toHaveLength(1);
  });
});

describe("D7: vencido parado sem perda registrada", () => {
  it("avisa a cozinheira uma vez, 2 dias depois da validade; a perda registrada antes não avisa", async () => {
    // No saldo inicial o vencido entra bloqueado (já estava na loja).
    const x = await ingrediente("Frango");
    await registrarSaldoInicial(db, gerente, { itens: [{ ingredienteId: x, quantidade: "1000", local: "guardado", validade: mais(hoje, -1) }] });
    const y = await ingrediente("Peixe");
    await registrarSaldoInicial(db, gerente, { itens: [{ ingredienteId: y, quantidade: "500", local: "guardado", validade: mais(hoje, -1) }] });
    await registrarPerda(db, cozinheira, { ingredienteId: y, quantidade: "500", area: "cozinha", local: "guardado", motivo: "venceu", doBloqueado: true });
    const item = await itemDe(x);
    await avisarValidades(db, { dia: hoje, agora: meioDia }); // 1 dia depois da validade: ainda não
    expect(await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.vencido)).toEqual([]);
    await avisarValidades(db, { dia: mais(hoje, 1), agora: meioDia });
    await avisarValidades(db, { dia: mais(hoje, 2), agora: meioDia });
    const a = await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.vencido);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ prioridade: "normal", para_cargos: ["cozinheira"] });
    expect(a[0]!.texto).toMatch(new RegExp(`^Vencido parado: ".*Frango.*" venceu em ${ddmm(mais(hoje, -1))} e continua em Alimentos da cozinha\\. Registre a perda com o motivo "Venceu"`));
    expect(a[0]!.dados).toMatchObject({ itemId: item, acao: "registrar_perda" });
    expect(await avisosDoItem(await itemDe(y), TIPOS_DE_AVISO_DE_VALIDADE.vencido)).toEqual([]);
    // Nunca avisou "perto" (já entrou vencido).
    expect(await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.perto)).toEqual([]);
  });

  it("lote que avisou perto avisa também o vencido (são dois tipos); duas execuções juntas avisam uma vez", async () => {
    const x = await ingrediente("Iogurte");
    await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "600", local: "em_uso", validade: mais(hoje, 4) }] });
    const item = await itemDe(x);
    await Promise.all([avisarValidades(db, { dia: mais(hoje, 3), agora: meioDia }), avisarValidades(db, { dia: mais(hoje, 3), agora: meioDia })]);
    await Promise.all([avisarValidades(db, { dia: mais(hoje, 6), agora: meioDia }), avisarValidades(db, { dia: mais(hoje, 6), agora: meioDia })]);
    expect(await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.perto)).toHaveLength(1);
    expect(await avisosDoItem(item, TIPOS_DE_AVISO_DE_VALIDADE.vencido)).toHaveLength(1);
    const marcas = await db.selectFrom("estoque_lote_aviso as m").innerJoin("estoque_lote as l", "l.id", "m.lote_id").select(["m.tipo", "m.lote_id"]).where("l.item_id", "=", item).orderBy("m.tipo").execute();
    expect(marcas.map((m) => m.tipo)).toEqual(["perto_do_vencimento", "vencido_sem_perda"]);
    // Histórico imutável.
    await expect(sql`DELETE FROM estoque_lote_aviso WHERE lote_id = ${marcas[0]!.lote_id}`.execute(db)).rejects.toThrow();
    await expect(sql`UPDATE estoque_lote_aviso SET em = now() WHERE lote_id = ${marcas[0]!.lote_id}`.execute(db)).rejects.toThrow();
  });
});

describe("D4a: validade curta na entrada", () => {
  it("cadastro: guarda, mantém quando não vem, limpa com nulo e recusa fora de 1 a 365", async () => {
    const x = await ingrediente("Queijo minas", { validadeMinimaDias: 5 });
    const ver = async () => (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === x)!.validadeMinimaDias;
    expect(await ver()).toBe(5);
    const base = { id: x, nome: (await db.selectFrom("ingrediente").select("nome").where("id", "=", x).executeTakeFirstOrThrow()).nome, area: "cozinha" };
    await salvarIngrediente(db, gerente, base);
    expect(await ver()).toBe(5);
    await salvarIngrediente(db, gerente, { ...base, validadeMinimaDias: 7 });
    expect(await ver()).toBe(7);
    await salvarIngrediente(db, gerente, { ...base, validadeMinimaDias: null });
    expect(await ver()).toBeNull();
    await expect(salvarIngrediente(db, gerente, { ...base, validadeMinimaDias: 0 })).rejects.toMatchObject({ codigo: "dados_invalidos" });
    await expect(salvarIngrediente(db, gerente, { ...base, validadeMinimaDias: 366 })).rejects.toMatchObject({ codigo: "dados_invalidos" });
  });

  it("alerta na resposta; avisa o gerente quando a cozinheira dá entrada; a entrada vale; reenvio não repete", async () => {
    const x = await ingrediente("Requeijão", { validadeMinimaDias: 5 });
    const item = (await registrarEntrada(db, gerente, { itens: [{ ingredienteId: x, quantidade: "1", local: "guardado", validade: mais(hoje, 10) }] })) && (await itemDe(x));
    const chave = `teste-${randomUUID()}`;
    const dados = {
      chave,
      itens: [
        { ingredienteId: x, quantidade: "200", local: "guardado", validade: mais(hoje, 3) },
        { ingredienteId: x, quantidade: "200", local: "guardado", validade: mais(hoje, 5) }, // no mínimo: ok
      ],
    };
    const r = await registrarEntrada(db, cozinheira, dados);
    expect(r.repetido).toBe(false);
    expect(r.validadeCurta).toEqual([{ itemId: item, nome: expect.stringContaining("Requeijão"), validade: mais(hoje, 3), dias: 3, minimoDias: 5 }]);
    const avisos = await sql<{ para_cargos: string[]; texto: string; dados: Record<string, unknown> }>`
      SELECT para_cargos, texto, dados FROM aviso WHERE tipo = ${TIPO_DO_AVISO_DE_VALIDADE_CURTA} AND dados->>'movimentoId' = ${r.movimentoId}`.execute(db);
    expect(avisos.rows).toHaveLength(1);
    expect(avisos.rows[0]!.para_cargos).toEqual(["gerente_geral"]);
    expect(avisos.rows[0]!.texto).toMatch(new RegExp(`^Entrada com validade curta: ".*Requeijão.*" vence ${ddmm(mais(hoje, 3))} \\(mínimo 5 dias\\)\\. Fale com o fornecedor\\.$`));
    // A entrada valeu (2 lotes novos).
    const lotes = await db.selectFrom("estoque_lote").select("id").where("item_id", "=", item).execute();
    expect(lotes).toHaveLength(3);
    // Reenvio (toque duplo): mesmo movimento, sem alerta e sem aviso novo.
    const de_novo = await registrarEntrada(db, cozinheira, dados);
    expect(de_novo).toEqual({ movimentoId: r.movimentoId, repetido: true, validadeCurta: [] });
    const total = await sql<{ n: number }>`SELECT count(*)::int AS n FROM aviso WHERE tipo = ${TIPO_DO_AVISO_DE_VALIDADE_CURTA} AND dados->>'movimentoId' = ${r.movimentoId}`.execute(db);
    expect(total.rows[0]!.n).toBe(1);
  });

  it("quem compra (gerente) vê o alerta na tela, sem aviso extra; sem mínimo ou sem validade, nada", async () => {
    const x = await ingrediente("Nata", { validadeMinimaDias: 4 });
    const y = await ingrediente("Sal");
    const r = await registrarEntrada(db, gerente, {
      itens: [
        { ingredienteId: x, quantidade: "100", local: "guardado", validade: mais(hoje, 1) },
        { ingredienteId: x, quantidade: "100", local: "guardado" },
        { ingredienteId: y, quantidade: "100", local: "guardado", validade: mais(hoje, 1) },
      ],
    });
    expect(r.validadeCurta.map((c) => [c.itemId, c.dias, c.minimoDias])).toEqual([[await itemDe(x), 1, 4]]);
    const n = await sql<{ n: number }>`SELECT count(*)::int AS n FROM aviso WHERE tipo = ${TIPO_DO_AVISO_DE_VALIDADE_CURTA} AND dados->>'movimentoId' = ${r.movimentoId}`.execute(db);
    expect(n.rows[0]!.n).toBe(0);
  });
});
