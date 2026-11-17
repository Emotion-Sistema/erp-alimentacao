/**
 * Categorias e horários de venda (RC-09 seção 2a, migração 0010, decisão 0016). Contra PostgreSQL
 * real. A regra "pode vender agora" (situacao_de_venda) é testada com instantes fixos numa unidade
 * nova por teste; as funções da tela, na unidade do gerente, cada teste montando o próprio estado.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  cancelarDataEspecial,
  ErroDeRegra,
  listarCategorias,
  pausarVenda,
  retomarVenda,
  salvarCategoria,
  salvarDataDaUnidade,
  salvarDataDeVenda,
  salvarSemanaDaUnidade,
  salvarSemanaDeVenda,
  textoDaSituacao,
  verHorarios,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let supervisor: Ator;
let atendente: Ator;
let dono: Ator;
const sufixo = randomUUID().slice(0, 6).replace(/[0-9]/g, "x");

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  supervisor = await atorDoCargo(db, "supervisor");
  atendente = await atorDoCargo(db, "atendente");
  dono = await atorDoCargo(db, "dono");
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

// ---------- apoio para a regra no banco ----------
async function novaUnidade(): Promise<number> {
  const e = await db.selectFrom("unidade").select("empresa_id").orderBy("id").executeTakeFirstOrThrow();
  return (await db.insertInto("unidade").values({ empresa_id: e.empresa_id, nome: `Loja horário ${randomUUID().slice(0, 8)}` }).returning("id").executeTakeFirstOrThrow()).id;
}
async function novaCategoria(nome = "Cat"): Promise<number> {
  return (await db.insertInto("categoria").values({ nome: `${nome} ${randomUUID().slice(0, 8)}` }).returning("id").executeTakeFirstOrThrow()).id;
}
/** Instante na hora de São Paulo (-03, sem horário de verão). 17/11/2026 é terça. */
const em = (dataHora: string) => `${dataHora}:00-03`;
async function sv(unidade: number, canal: string, categoria: number | null, instante: string) {
  const r = await sql<{ aberta: boolean; motivo: string | null; abre_as: string | null }>`
    SELECT s.aberta, s.motivo, to_char(s.abre_as AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS abre_as
    FROM situacao_de_venda(${unidade}, ${canal}, ${categoria}, ${em(instante)}::timestamptz) s`.execute(db);
  return r.rows[0]!;
}
const janela = (u: number, canal: string, cat: number | null, dia: number, modo: string, inicio: string | null = null, fim: string | null = null) =>
  sql`INSERT INTO horario_venda (unidade_id, canal, categoria_id, dia, modo, inicio, fim) VALUES (${u}, ${canal}, ${cat}, ${dia}, ${modo}, ${inicio}, ${fim})`.execute(db);
async function usuarioId(): Promise<number> {
  return gerente.usuarioId;
}

describe("regra no banco: pode vender agora?", () => {
  it("unidade nova já nasce com a semana do responsável (segunda fechado; ter 10h; sex 9h; cozinha até 23h)", async () => {
    const u = await novaUnidade();
    const semana = await db.selectFrom("horario_unidade").selectAll().where("unidade_id", "=", u).orderBy("dia").execute();
    expect(semana.map((d) => [d.dia, d.aberta, d.abre, d.ultimo_pedido, d.fecha])).toEqual([
      [1, false, null, null, null],
      [2, true, "10:00:00", "23:00:00", "23:30:00"],
      [3, true, "10:00:00", "23:00:00", "23:30:00"],
      [4, true, "10:00:00", "23:00:00", "23:30:00"],
      [5, true, "09:00:00", "23:00:00", "23:30:00"],
      [6, true, "09:00:00", "23:00:00", "23:30:00"],
      [7, true, "09:00:00", "23:00:00", "23:30:00"],
    ]);
    expect(await sv(u, "loja", null, "2026-11-16 13:00")).toEqual({ aberta: false, motivo: "unidade_fechada", abre_as: null }); // segunda
    expect(await sv(u, "loja", null, "2026-11-17 09:30")).toEqual({ aberta: false, motivo: "antes_de_abrir", abre_as: "10:00" }); // terça
    expect(await sv(u, "loja", null, "2026-11-20 09:30")).toMatchObject({ aberta: true }); // sexta
    expect(await sv(u, "delivery", null, "2026-11-17 10:00")).toMatchObject({ aberta: true }); // sem horário próprio: segue a loja
    expect(await sv(u, "loja", null, "2026-11-17 22:59")).toMatchObject({ aberta: true });
    expect(await sv(u, "loja", null, "2026-11-17 23:00")).toEqual({ aberta: false, motivo: "cozinha_fechada", abre_as: null });
  });

  it("a hora é a local da unidade, não a do servidor", async () => {
    const u = await novaUnidade();
    // 13h UTC = 10h em São Paulo (abre) e 08h em Manaus (ainda não abriu).
    expect((await sql<{ aberta: boolean }>`SELECT aberta FROM situacao_de_venda(${u}, 'loja', NULL, '2026-11-17 13:00Z')`.execute(db)).rows[0]!.aberta).toBe(true);
    await db.updateTable("unidade").set({ fuso_horario: "America/Manaus" }).where("id", "=", u).execute();
    expect((await sql<{ motivo: string }>`SELECT motivo FROM situacao_de_venda(${u}, 'loja', NULL, '2026-11-17 13:00Z')`.execute(db)).rows[0]!.motivo).toBe("antes_de_abrir");
  });

  it("delivery com janela própria; a loja não muda", async () => {
    const u = await novaUnidade();
    await janela(u, "delivery", null, 2, "aberto", "18:00", "22:30");
    expect(await sv(u, "delivery", null, "2026-11-17 17:00")).toEqual({ aberta: false, motivo: "fora_do_horario", abre_as: "18:00" });
    expect(await sv(u, "delivery", null, "2026-11-17 18:00")).toMatchObject({ aberta: true });
    expect(await sv(u, "delivery", null, "2026-11-17 22:30")).toMatchObject({ aberta: false, motivo: "fora_do_horario" });
    expect(await sv(u, "loja", null, "2026-11-17 17:00")).toMatchObject({ aberta: true });
    // Outro dia sem linha: segue a loja.
    expect(await sv(u, "delivery", null, "2026-11-18 11:00")).toMatchObject({ aberta: true });
  });

  it("janela além da cozinha é cortada no último pedido; janela fechada no dia", async () => {
    const u = await novaUnidade();
    await janela(u, "delivery", null, 2, "aberto", "18:00", "24:00");
    await janela(u, "delivery", null, 3, "fechado");
    expect(await sv(u, "delivery", null, "2026-11-17 23:15")).toMatchObject({ aberta: false, motivo: "cozinha_fechada" });
    expect(await sv(u, "delivery", null, "2026-11-18 12:00")).toEqual({ aberta: false, motivo: "canal_fechado", abre_as: null });
  });

  it("categoria: interseção com o canal; fechada no dia; sem linha segue o canal", async () => {
    const u = await novaUnidade();
    const almoco = await novaCategoria("Almoço");
    const cafe = await novaCategoria("Café");
    await janela(u, "loja", almoco, 2, "aberto", "11:00", "15:00");
    await janela(u, "delivery", null, 2, "aberto", "12:00", "22:00");
    await janela(u, "delivery", almoco, 2, "aberto", "11:00", "15:00");
    await janela(u, "loja", cafe, 3, "fechado");
    expect(await sv(u, "loja", almoco, "2026-11-17 10:30")).toEqual({ aberta: false, motivo: "fora_do_horario", abre_as: "11:00" });
    expect(await sv(u, "loja", almoco, "2026-11-17 14:59")).toMatchObject({ aberta: true });
    expect(await sv(u, "loja", almoco, "2026-11-17 15:00")).toMatchObject({ aberta: false, motivo: "fora_do_horario", abre_as: null });
    // No delivery o almoço só começa quando o delivery começa (12h).
    expect(await sv(u, "delivery", almoco, "2026-11-17 11:30")).toEqual({ aberta: false, motivo: "fora_do_horario", abre_as: "12:00" });
    expect(await sv(u, "loja", cafe, "2026-11-18 10:30")).toEqual({ aberta: false, motivo: "categoria_fechada", abre_as: null });
    expect(await sv(u, "loja", cafe, "2026-11-17 10:30")).toMatchObject({ aberta: true });
    // Canal fechado vence a categoria.
    await janela(u, "delivery", null, 4, "fechado");
    await janela(u, "delivery", almoco, 4, "aberto", "11:00", "15:00");
    expect(await sv(u, "delivery", almoco, "2026-11-19 12:00")).toMatchObject({ aberta: false, motivo: "canal_fechado" });
  });

  it("janelas que não se cruzam = fora do horário o dia todo", async () => {
    const u = await novaUnidade();
    const c = await novaCategoria();
    await janela(u, "delivery", null, 2, "aberto", "18:00", "22:00");
    await janela(u, "delivery", c, 2, "aberto", "11:00", "15:00");
    expect(await sv(u, "delivery", c, "2026-11-17 12:00")).toEqual({ aberta: false, motivo: "fora_do_horario", abre_as: null });
    expect(await sv(u, "delivery", c, "2026-11-17 19:00")).toEqual({ aberta: false, motivo: "fora_do_horario", abre_as: null });
  });

  it("data especial vence o dia da semana e, cancelada, volta o padrão", async () => {
    const u = await novaUnidade();
    const c = await novaCategoria();
    const feriado = (
      await db.insertInto("horario_unidade_data").values({ unidade_id: u, data: "2026-11-17", aberta: false, motivo: "Feriado" }).returning("id").executeTakeFirstOrThrow()
    ).id;
    expect(await sv(u, "loja", null, "2026-11-17 12:00")).toMatchObject({ aberta: false, motivo: "unidade_fechada" });
    await db.updateTable("horario_unidade_data").set({ ativo: false }).where("id", "=", feriado).execute();
    expect(await sv(u, "loja", null, "2026-11-17 12:00")).toMatchObject({ aberta: true });
    // Segunda aberta por evento.
    await db.insertInto("horario_unidade_data").values({ unidade_id: u, data: "2026-11-16", aberta: true, abre: "17:00", ultimo_pedido: "21:00", fecha: "22:00", motivo: "Evento" }).execute();
    expect(await sv(u, "loja", null, "2026-11-16 16:00")).toEqual({ aberta: false, motivo: "antes_de_abrir", abre_as: "17:00" });
    expect(await sv(u, "loja", null, "2026-11-16 18:00")).toMatchObject({ aberta: true });
    expect(await sv(u, "loja", null, "2026-11-16 21:00")).toMatchObject({ aberta: false, motivo: "cozinha_fechada" });
    // Data especial da categoria vence a semana da categoria.
    await janela(u, "loja", c, 3, "fechado");
    await db.insertInto("horario_venda_data").values({ unidade_id: u, canal: "loja", categoria_id: c, data: "2026-11-18", modo: "aberto", inicio: "14:00", fim: "16:00", motivo: "Degustação" }).execute();
    expect(await sv(u, "loja", c, "2026-11-18 15:00")).toMatchObject({ aberta: true });
    expect(await sv(u, "loja", c, "2026-11-25 15:00")).toMatchObject({ aberta: false, motivo: "categoria_fechada" });
  });

  it("pausa: do canal pega todas as categorias; da categoria só ela; sem canal pega os dois; vence e se encerra", async () => {
    const u = await novaUnidade();
    const a = await novaCategoria();
    const b = await novaCategoria();
    const quem = await usuarioId();
    const pausa = (canal: string | null, cat: number | null, inicio: string, ate: string | null) =>
      db
        .insertInto("pausa_venda")
        .values({ unidade_id: u, canal: canal as "loja" | null, categoria_id: cat, inicio: em(inicio), ate: ate ? new Date(em(ate)) : null, motivo: "Teste", criada_por: quem })
        .returning("id")
        .executeTakeFirstOrThrow();
    await pausa("loja", a, "2026-11-17 12:00", "2026-11-17 12:40");
    expect(await sv(u, "loja", a, "2026-11-17 12:10")).toEqual({ aberta: false, motivo: "pausado", abre_as: "12:40" });
    expect(await sv(u, "loja", b, "2026-11-17 12:10")).toMatchObject({ aberta: true });
    expect(await sv(u, "delivery", a, "2026-11-17 12:10")).toMatchObject({ aberta: true });
    expect(await sv(u, "loja", null, "2026-11-17 12:10")).toMatchObject({ aberta: true }); // o canal segue vendendo
    expect(await sv(u, "loja", a, "2026-11-17 12:40")).toMatchObject({ aberta: true }); // venceu
    await pausa("delivery", null, "2026-11-18 12:00", null);
    expect(await sv(u, "delivery", b, "2026-11-18 13:00")).toEqual({ aberta: false, motivo: "pausado", abre_as: null });
    expect(await sv(u, "loja", b, "2026-11-18 13:00")).toMatchObject({ aberta: true });
    const geral = await pausa(null, null, "2026-11-19 12:00", "2026-11-19 14:00");
    expect(await sv(u, "loja", null, "2026-11-19 13:00")).toMatchObject({ aberta: false, motivo: "pausado", abre_as: "14:00" });
    expect(await sv(u, "delivery", a, "2026-11-19 13:00")).toMatchObject({ aberta: false, motivo: "pausado" });
    // Pausa que vai além do último pedido não promete hora de volta.
    await pausa("loja", b, "2026-11-20 22:00", "2026-11-21 02:00");
    expect(await sv(u, "loja", b, "2026-11-20 22:30")).toEqual({ aberta: false, motivo: "pausado", abre_as: null });
    // Encerrada (retomada) não vale mais.
    await db.updateTable("pausa_venda").set({ encerrada_em: new Date(), encerrada_por: quem }).where("id", "=", geral.id).execute();
    expect(await sv(u, "loja", null, "2026-11-19 13:00")).toMatchObject({ aberta: true });
    // Antes de abrir com pausa já marcada: não promete a hora de abrir, e sim o fim da pausa.
    await pausa(null, null, "2026-11-24 09:00", "2026-11-24 12:00");
    expect(await sv(u, "loja", null, "2026-11-24 09:30")).toEqual({ aberta: false, motivo: "antes_de_abrir", abre_as: "12:00" });
    await pausa("delivery", null, "2026-11-25 08:00", null);
    expect(await sv(u, "delivery", null, "2026-11-25 09:30")).toEqual({ aberta: false, motivo: "antes_de_abrir", abre_as: null });
    expect(await sv(u, "loja", null, "2026-11-25 09:30")).toEqual({ aberta: false, motivo: "antes_de_abrir", abre_as: "10:00" });
    // Pausa que acaba antes de abrir não muda a promessa.
    await pausa("loja", null, "2026-11-26 08:00", "2026-11-26 09:00");
    expect(await sv(u, "loja", null, "2026-11-26 08:30")).toEqual({ aberta: false, motivo: "antes_de_abrir", abre_as: "10:00" });
    // Pausa não vale fora do horário: o motivo continua sendo o horário.
    expect(await sv(u, "delivery", b, "2026-11-18 09:00")).toMatchObject({ motivo: "antes_de_abrir" });
  });

  it("categoria desativada não vende; canal desconhecido é recusado", async () => {
    const u = await novaUnidade();
    const c = await novaCategoria();
    await db.updateTable("categoria").set({ ativo: false }).where("id", "=", c).execute();
    expect(await sv(u, "loja", c, "2026-11-17 12:00")).toMatchObject({ aberta: false, motivo: "categoria_inativa" });
    await expect(sv(u, "ifood", null, "2026-11-17 12:00")).rejects.toThrow(/Canal desconhecido/);
    // Canal ou instante vazio nunca vira "aberto".
    await expect(sql`SELECT * FROM situacao_de_venda(${u}, NULL, NULL, '2026-11-17 12:00-03')`.execute(db)).rejects.toThrow(/Canal desconhecido/);
    await expect(sql`SELECT * FROM situacao_de_venda(${u}, 'loja', NULL, NULL)`.execute(db)).rejects.toThrow(/Instante vazio/);
  });

  it("o banco recusa horário fora de ordem e janela sem hora", async () => {
    const u = await novaUnidade();
    await expect(db.updateTable("horario_unidade").set({ abre: "23:10" }).where("unidade_id", "=", u).where("dia", "=", 2).execute()).rejects.toMatchObject({ code: "23514" });
    await expect(db.updateTable("horario_unidade").set({ aberta: false }).where("unidade_id", "=", u).where("dia", "=", 2).execute()).rejects.toMatchObject({ code: "23514" });
    await expect(janela(u, "loja", null, 2, "aberto", "15:00", "11:00")).rejects.toMatchObject({ code: "23514" });
    await expect(janela(u, "loja", null, 2, "fechado", "11:00", "15:00")).rejects.toMatchObject({ code: "23514" });
    await janela(u, "loja", null, 2, "fechado");
    await expect(janela(u, "loja", null, 2, "fechado")).rejects.toMatchObject({ code: "23505" }); // categoria nula igual a nula
    await db.insertInto("horario_unidade_data").values({ unidade_id: u, data: "2026-12-25", aberta: false, motivo: "Natal" }).execute();
    await expect(db.insertInto("horario_unidade_data").values({ unidade_id: u, data: "2026-12-25", aberta: false, motivo: "Natal" }).execute()).rejects.toMatchObject({ code: "23505" });
  });
});

// ---------- funções da tela (unidade do gerente) ----------
const semanaPadrao = () =>
  [1, 2, 3, 4, 5, 6, 7].map((dia) =>
    dia === 1 ? { dia, aberta: false } : { dia, aberta: true, abre: dia <= 4 ? "10:00" : "09:00", ultimoPedido: "23:00", fecha: "23:30" },
  );
const amanha = async () =>
  (await sql<{ d: string }>`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1, 'YYYY-MM-DD') AS d`.execute(db)).rows[0]!.d;
const ultimaAuditoria = async (alvoTipo: string) =>
  db.selectFrom("auditoria").select(["usuario_id", "acao", "resultado", "alvo_id", "detalhes"]).where("alvo_tipo", "=", alvoTipo).orderBy("id", "desc").executeTakeFirstOrThrow();

describe("quem pode ver e mudar", () => {
  it("gerente geral e dono mudam; supervisor só vê; atendente nem vê", async () => {
    expect((await verHorarios(db, gerente)).podeMudar).toBe(true);
    expect((await verHorarios(db, dono)).podeMudar).toBe(true);
    const v = await verHorarios(db, supervisor);
    expect(v.podeMudar).toBe(false);
    expect(v.semana).toHaveLength(7);
    for (const f of [
      () => salvarSemanaDaUnidade(db, supervisor, { dias: semanaPadrao() }),
      () => salvarSemanaDeVenda(db, supervisor, { canal: "delivery", categoriaId: null, dias: [] }),
      () => pausarVenda(db, supervisor, { canal: "delivery", motivo: "teste" }),
      () => retomarVenda(db, supervisor, { id: 1 }),
      () => cancelarDataEspecial(db, supervisor, { tipo: "unidade", id: 1 }),
      () => salvarCategoria(db, supervisor, { nome: "Nada" }),
    ])
      expect((await erroDe(f())).codigo).toBe("sem_permissao");
    expect((await erroDe(verHorarios(db, atendente))).codigo).toBe("sem_permissao");
    expect((await erroDe(verHorarios(db, null))).codigo).toBe("nao_autenticado");
    const recusa = await db.selectFrom("auditoria").select(["resultado", "acao"]).where("usuario_id", "=", supervisor.usuarioId).orderBy("id", "desc").executeTakeFirstOrThrow();
    expect(recusa).toMatchObject({ resultado: "recusado", acao: "cadastros.gerenciar" });
  });
});

describe("semana da unidade e dos canais", () => {
  it("grava os 7 dias com auditoria de antes e depois; recusa semana incompleta e ordem errada", async () => {
    await salvarSemanaDaUnidade(db, gerente, { dias: semanaPadrao() });
    const nova = semanaPadrao().map((d) => (d.dia === 2 ? { ...d, abre: "11:30" } : d));
    const v = await salvarSemanaDaUnidade(db, gerente, { dias: nova });
    expect(v.semana.find((d) => d.dia === 2)).toEqual({ dia: 2, aberta: true, abre: "11:30", ultimoPedido: "23:00", fecha: "23:30" });
    expect(v.semana.find((d) => d.dia === 1)).toEqual({ dia: 1, aberta: false, abre: null, ultimoPedido: null, fecha: null });
    const a = await ultimaAuditoria("horario_unidade");
    expect(a).toMatchObject({ usuario_id: gerente.usuarioId, acao: "horarios.gerenciar", resultado: "permitido" });
    const det = a.detalhes as { antes: { dia: number; abre: string }[]; depois: { dia: number; abre: string }[] };
    expect(det.antes.find((d) => d.dia === 2)!.abre).toBe("10:00");
    expect(det.depois.find((d) => d.dia === 2)!.abre).toBe("11:30");

    expect((await erroDe(salvarSemanaDaUnidade(db, gerente, { dias: semanaPadrao().slice(1) }))).message).toMatch(/7 dias/);
    const repetido = semanaPadrao().map((d) => (d.dia === 7 ? { ...d, dia: 6 } : d));
    expect((await erroDe(salvarSemanaDaUnidade(db, gerente, { dias: repetido }))).message).toMatch(/uma vez só/);
    const foraDeOrdem = semanaPadrao().map((d) => (d.dia === 3 ? { ...d, ultimoPedido: "23:45" } : d));
    expect((await erroDe(salvarSemanaDaUnidade(db, gerente, { dias: foraDeOrdem }))).message).toMatch(/A ordem é/);
    const semHora = semanaPadrao().map((d) => (d.dia === 3 ? { dia: 3, aberta: true, abre: "10:00" } : d));
    expect((await erroDe(salvarSemanaDaUnidade(db, gerente, { dias: semHora }))).message).toMatch(/abertura, último pedido e fechamento/);
    const horaRuim = semanaPadrao().map((d) => (d.dia === 3 ? { ...d, abre: "24:00" } : d));
    expect((await erroDe(salvarSemanaDaUnidade(db, gerente, { dias: horaRuim }))).codigo).toBe("dados_invalidos");
    // Dia fechado com horas: as horas são descartadas.
    const fechadoComHora = semanaPadrao().map((d) => (d.dia === 1 ? { dia: 1, aberta: false, abre: "10:00", ultimoPedido: "11:00", fecha: "12:00" } : d));
    expect((await salvarSemanaDaUnidade(db, gerente, { dias: fechadoComHora })).semana[0]).toMatchObject({ aberta: false, abre: null });
  });

  it("delivery e categoria: grava, volta a seguir, e mostra só o que não segue", async () => {
    const cat = await salvarCategoria(db, gerente, { nome: `Almoço ${sufixo}` });
    const dias = (modo: (d: number) => object) => [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, ...modo(dia) }));
    let v = await salvarSemanaDeVenda(db, gerente, {
      canal: "delivery",
      categoriaId: null,
      dias: dias((d) => (d === 1 ? { modo: "fechado" } : { modo: "aberto", inicio: "18:00", fim: "22:30" })),
    });
    expect(v.venda.filter((j) => j.canal === "delivery" && j.categoriaId === null)).toHaveLength(7);
    v = await salvarSemanaDeVenda(db, gerente, { canal: "loja", categoriaId: cat.id, dias: dias((d) => (d === 2 ? { modo: "aberto", inicio: "11:00", fim: "15:00" } : { modo: "segue" })) });
    expect(v.venda.filter((j) => j.categoriaId === cat.id)).toEqual([{ canal: "loja", categoriaId: cat.id, dia: 2, modo: "aberto", inicio: "11:00", fim: "15:00" }]);
    expect(v.agora.categorias.find((c) => c.categoriaId === cat.id)).toBeDefined();
    const a = await ultimaAuditoria("horario_venda");
    expect(a.alvo_id).toBe(`loja:${cat.id}`);
    // Volta tudo a seguir a loja.
    v = await salvarSemanaDeVenda(db, gerente, { canal: "delivery", categoriaId: null, dias: dias(() => ({ modo: "segue" })) });
    expect(v.venda.filter((j) => j.canal === "delivery" && j.categoriaId === null)).toHaveLength(0);
    // Erros.
    expect((await erroDe(salvarSemanaDeVenda(db, gerente, { canal: "loja", categoriaId: cat.id, dias: dias(() => ({ modo: "aberto", inicio: "15:00", fim: "11:00" })) }))).message).toMatch(/antes do fim/);
    expect((await erroDe(salvarSemanaDeVenda(db, gerente, { canal: "ifood", categoriaId: null, dias: dias(() => ({ modo: "segue" })) }))).message).toMatch(/loja ou delivery/);
    await salvarCategoria(db, gerente, { id: cat.id, nome: cat.nome, ativo: false });
    expect((await erroDe(salvarSemanaDeVenda(db, gerente, { canal: "loja", categoriaId: cat.id, dias: dias(() => ({ modo: "segue" })) }))).message).toMatch(/desativada/);
    expect((await erroDe(salvarSemanaDeVenda(db, gerente, { canal: "loja", categoriaId: 999999, dias: dias(() => ({ modo: "segue" })) }))).message).toMatch(/não encontrada/);
  });

  it("duas pessoas salvando a semana ao mesmo tempo: as duas entram, uma depois da outra", async () => {
    await salvarSemanaDaUnidade(db, gerente, { dias: semanaPadrao() });
    const a = semanaPadrao().map((d) => (d.dia === 5 ? { ...d, abre: "08:00" } : d));
    const b = semanaPadrao().map((d) => (d.dia === 5 ? { ...d, abre: "08:30" } : d));
    await Promise.all([salvarSemanaDaUnidade(db, gerente, { dias: a }), salvarSemanaDaUnidade(db, dono, { dias: b })]);
    const ultimas = await db.selectFrom("auditoria").select("detalhes").where("alvo_tipo", "=", "horario_unidade").orderBy("id", "desc").limit(2).execute();
    const sexta = (l: { dia: number; abre: string }[]) => l.find((d) => d.dia === 5)!.abre;
    const [segunda, primeira] = ultimas.map((u) => u.detalhes as { antes: { dia: number; abre: string }[]; depois: { dia: number; abre: string }[] });
    // O "antes" da segunda é o "depois" da primeira: nada se perdeu na auditoria.
    expect(sexta(segunda!.antes)).toBe(sexta(primeira!.depois));
    const final = (await verHorarios(db, gerente)).semana.find((d) => d.dia === 5)!.abre;
    expect(final).toBe(sexta(segunda!.depois));
    await salvarSemanaDaUnidade(db, gerente, { dias: semanaPadrao() });
  });
});

describe("datas especiais", () => {
  it("cria, troca a mesma data (uma só), cancela; recusa data passada e inexistente", async () => {
    const d = await amanha();
    let v = await salvarDataDaUnidade(db, gerente, { data: d, aberta: false, motivo: "Feriado" });
    const criada = v.datas.find((x) => x.data === d)!;
    expect(criada).toMatchObject({ aberta: false, motivo: "Feriado", abre: null });
    v = await salvarDataDaUnidade(db, gerente, { data: d, aberta: true, abre: "12:00", ultimoPedido: "20:00", fecha: "21:00", motivo: "Evento" });
    expect(v.datas.filter((x) => x.data === d)).toEqual([expect.objectContaining({ id: criada.id, aberta: true, abre: "12:00", motivo: "Evento" })]);
    const a = await ultimaAuditoria("horario_unidade_data");
    expect(a.detalhes).toMatchObject({ operacao: "alterar", antes: { aberta: false, motivo: "Feriado" }, depois: { aberta: true, motivo: "Evento" } });
    v = await cancelarDataEspecial(db, gerente, { tipo: "unidade", id: criada.id });
    expect(v.datas.find((x) => x.data === d)).toBeUndefined();
    expect((await erroDe(cancelarDataEspecial(db, gerente, { tipo: "unidade", id: criada.id }))).codigo).toBe("nao_encontrado");
    // Fica guardada, desativada.
    expect((await db.selectFrom("horario_unidade_data").select("ativo").where("id", "=", criada.id).executeTakeFirstOrThrow()).ativo).toBe(false);

    expect((await erroDe(salvarDataDaUnidade(db, gerente, { data: "2020-01-01", aberta: false, motivo: "Velho" }))).message).toMatch(/de hoje até/);
    expect((await erroDe(salvarDataDaUnidade(db, gerente, { data: "2027-02-30", aberta: false, motivo: "Não existe" }))).message).toMatch(/Data inválida/);
    expect((await erroDe(salvarDataDaUnidade(db, gerente, { data: d, aberta: false, motivo: "" }))).message).toMatch(/motivo/);
  });

  it("data especial de canal e de categoria; cancelar de outra unidade não acha", async () => {
    const d = await amanha();
    const cat = await salvarCategoria(db, gerente, { nome: `Porções ${sufixo}` });
    await salvarDataDeVenda(db, gerente, { canal: "delivery", categoriaId: null, data: d, modo: "fechado", motivo: "Sem motoboy" });
    let v = await salvarDataDeVenda(db, gerente, { canal: "loja", categoriaId: cat.id, data: d, modo: "aberto", inicio: "14:00", fim: "18:00", motivo: "Degustação" });
    const minhas = v.datasVenda.filter((x) => x.data === d && (x.categoriaId === cat.id || (x.canal === "delivery" && x.categoriaId === null)));
    expect(minhas).toHaveLength(2);
    // Troca a do delivery: continua uma só.
    v = await salvarDataDeVenda(db, gerente, { canal: "delivery", categoriaId: null, data: d, modo: "aberto", inicio: "19:00", fim: "22:00", motivo: "Só à noite" });
    expect(v.datasVenda.filter((x) => x.data === d && x.canal === "delivery" && x.categoriaId === null)).toEqual([expect.objectContaining({ modo: "aberto", inicio: "19:00" })]);
    // Outra unidade.
    const outra = await novaUnidade();
    const id = (await db.insertInto("horario_venda_data").values({ unidade_id: outra, canal: "loja", data: d, modo: "fechado", motivo: "Outra loja" }).returning("id").executeTakeFirstOrThrow()).id;
    expect((await erroDe(cancelarDataEspecial(db, gerente, { tipo: "venda", id }))).codigo).toBe("nao_encontrado");
    for (const x of v.datasVenda.filter((x) => x.data === d)) await cancelarDataEspecial(db, gerente, { tipo: "venda", id: x.id });
  });

  it("duas pessoas criando a mesma data ao mesmo tempo: fica uma só, sem erro", async () => {
    const d = await amanha();
    await Promise.all([
      salvarDataDaUnidade(db, gerente, { data: d, aberta: false, motivo: "Feriado A" }),
      salvarDataDaUnidade(db, dono, { data: d, aberta: false, motivo: "Feriado B" }),
    ]);
    const ativas = await db.selectFrom("horario_unidade_data").select("id").where("unidade_id", "=", gerente.unidadeId!).where(sql<boolean>`data = ${d}::date`).where("ativo", "=", true).execute();
    expect(ativas).toHaveLength(1);
    await cancelarDataEspecial(db, gerente, { tipo: "unidade", id: ativas[0]!.id });
    // O mesmo para a data de um canal.
    await Promise.all([
      salvarDataDeVenda(db, gerente, { canal: "delivery", categoriaId: null, data: d, modo: "fechado", motivo: "Sem motoboy A" }),
      salvarDataDeVenda(db, dono, { canal: "delivery", categoriaId: null, data: d, modo: "fechado", motivo: "Sem motoboy B" }),
    ]);
    const doCanal = await db.selectFrom("horario_venda_data").select("id").where("unidade_id", "=", gerente.unidadeId!).where("canal", "=", "delivery").where("categoria_id", "is", null).where(sql<boolean>`data = ${d}::date`).where("ativo", "=", true).execute();
    expect(doCanal).toHaveLength(1);
    await cancelarDataEspecial(db, gerente, { tipo: "venda", id: doCanal[0]!.id });
    const a = await ultimaAuditoria("horario_venda_data");
    expect(a.detalhes).toMatchObject({ operacao: "cancelar", antes: { ativo: true, canal: "delivery" }, depois: { ativo: false } });
  });
});

describe("pausa manual", () => {
  it("pausa o delivery, aparece na situação de agora, retoma uma vez só", async () => {
    let v = await pausarVenda(db, gerente, { canal: "delivery", minutos: 30, motivo: "Chuva forte" });
    const p = v.pausas.find((x) => x.motivo === "Chuva forte")!;
    expect(p).toMatchObject({ canal: "delivery", categoriaId: null, criadaPor: expect.any(String) });
    expect(new Date(p.ate!).getTime() - new Date(p.inicio).getTime()).toBe(30 * 60 * 1000);
    const agora = v.agora.canais.delivery;
    // Se o delivery estava em horário, agora está pausado.
    if (agora.motivo !== null && agora.motivo !== "pausado") expect(["unidade_fechada", "antes_de_abrir", "cozinha_fechada", "canal_fechado", "fora_do_horario"]).toContain(agora.motivo);
    else expect(agora).toMatchObject({ aberta: false, motivo: "pausado" });
    v = await retomarVenda(db, gerente, { id: p.id });
    expect(v.pausas.find((x) => x.id === p.id)).toBeUndefined();
    expect((await erroDe(retomarVenda(db, gerente, { id: p.id }))).codigo).toBe("nao_encontrado");
    const r = await db.selectFrom("pausa_venda").select(["encerrada_por"]).where("id", "=", p.id).executeTakeFirstOrThrow();
    expect(r.encerrada_por).toBe(gerente.usuarioId);
    expect((await ultimaAuditoria("pausa_venda")).detalhes).toMatchObject({ operacao: "retomar" });
    // Pausa de outra unidade não é achada.
    const outra = await novaUnidade();
    const alheia = await db.insertInto("pausa_venda").values({ unidade_id: outra, canal: "loja", motivo: "Outra loja", criada_por: gerente.usuarioId }).returning("id").executeTakeFirstOrThrow();
    expect((await erroDe(retomarVenda(db, gerente, { id: alheia.id }))).codigo).toBe("nao_encontrado");
    expect((await db.selectFrom("pausa_venda").select("encerrada_em").where("id", "=", alheia.id).executeTakeFirstOrThrow()).encerrada_em).toBeNull();
  });

  it("recusa pausa sem motivo, curta ou longa demais", async () => {
    expect((await erroDe(pausarVenda(db, gerente, { canal: "loja", motivo: " " }))).message).toMatch(/motivo/);
    expect((await erroDe(pausarVenda(db, gerente, { canal: "loja", minutos: 2, motivo: "Rápida" }))).message).toMatch(/5 minutos/);
    expect((await erroDe(pausarVenda(db, gerente, { canal: "loja", minutos: 3000, motivo: "Longa" }))).message).toMatch(/24 horas/);
  });
});

describe("categorias", () => {
  it("vêm as da casa; nome único entre as ativas (sem ligar para acento e maiúscula); desativar libera o nome", async () => {
    const nomes = (await listarCategorias(db, supervisor)).map((c) => c.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Cafeteria", "Almoço", "Porções", "Hambúrgueres", "Salgados", "Bebidas"]));
    const c = await salvarCategoria(db, gerente, { nome: `  Sobremesas   ${sufixo} `, descricao: "Doces", ordem: 70 });
    expect(c).toMatchObject({ nome: `Sobremesas ${sufixo}`, descricao: "Doces", ordem: 70, ativo: true });
    expect((await erroDe(salvarCategoria(db, gerente, { nome: `SOBREMESAS ${sufixo.toUpperCase()}` }))).codigo).toBe("conflito");
    // Alterar sem mandar ordem e ativo mantém os dois.
    // Sem mandar a descrição, ela fica; nula limpa.
    expect(await salvarCategoria(db, gerente, { id: c.id, nome: c.nome })).toMatchObject({ ordem: 70, ativo: true, descricao: "Doces" });
    expect(await salvarCategoria(db, gerente, { id: c.id, nome: c.nome, descricao: null })).toMatchObject({ ordem: 70, ativo: true, descricao: null });
    await salvarCategoria(db, gerente, { id: c.id, nome: c.nome, ativo: false });
    const outra = await salvarCategoria(db, gerente, { nome: `Sobremesas ${sufixo}` });
    expect(outra.id).not.toBe(c.id);
    const a = await ultimaAuditoria("categoria");
    expect(a).toMatchObject({ acao: "cadastros.gerenciar", detalhes: { operacao: "criar" } });
    expect((await erroDe(salvarCategoria(db, gerente, { nome: "x" }))).message).toMatch(/2 letras/);
    expect((await erroDe(salvarCategoria(db, gerente, { id: 999999, nome: "Fantasma" }))).codigo).toBe("nao_encontrado");
  });
});

describe("texto para quem vende", () => {
  it("cada motivo vira uma frase curta", () => {
    expect(textoDaSituacao({ aberta: true, motivo: null, abreAs: null }, "loja")).toBe("Vendendo agora");
    expect(textoDaSituacao({ aberta: false, motivo: "fora_do_horario", abreAs: "11:00" }, "loja")).toBe("Disponível a partir das 11h");
    expect(textoDaSituacao({ aberta: false, motivo: "antes_de_abrir", abreAs: "09:30" }, "loja")).toBe("Disponível a partir das 9h30");
    expect(textoDaSituacao({ aberta: false, motivo: "canal_fechado", abreAs: null }, "delivery")).toBe("Sem delivery hoje");
    expect(textoDaSituacao({ aberta: false, motivo: "pausado", abreAs: "12:40" }, "loja")).toBe("Pausado até 12h40");
    expect(textoDaSituacao({ aberta: false, motivo: "cozinha_fechada", abreAs: null }, "loja")).toBe("A cozinha já fechou por hoje");
  });
});
