/**
 * E05 contra PostgreSQL real (RC-18, decisão 0013): o aviso chega ao cargo ativo, à unidade
 * e ao turno certos; situação novo → visto → resolvido só anda para a frente; comunicado
 * mostra quem leu e quem não leu; entrega repetida ao mesmo tempo não duplica.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBanco, sql, type Banco } from "@erp/banco";
import {
  caixaDeAvisos, continuarNoTurno, criarAviso, mudarMargemDeTroca, verTurnos, criarUsuario, darCargo, enviarComunicado, entrar, ErroDeRegra, listarComunicados, marcarVistos,
  resolverAviso, SENHA_DE_TESTE, situacaoDoTurno, tirarCargo, trocarCargoAtivo, type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let unidadeId: number;
const origem = { ip: "127.0.0.1", agente: "teste" };
const SENHA = "uma-senha-longa";

beforeAll(async () => {
  db = bancoDeTeste();
  ({ unidadeId } = await prepararDados(db));
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

let contador = 0;
/** Pessoa nova, já dentro (sessão aberta = no turno). */
async function pessoa(cargo: string, ...outros: string[]): Promise<Ator> {
  const adm = await atorDoCargo(db, "administrador");
  const login = `e05.${cargo.replace("_", ".")}.${++contador}.${randomUUID().slice(0, 6)}`;
  const u = await criarUsuario(db, adm, { nome: `Pessoa ${login}`, login, senha: SENHA, cargo, unidadeId });
  for (const c of outros) await darCargo(db, adm, u.id, { cargo: c });
  return (await entrar(db, { login, senha: SENHA }, origem)).ator;
}

const marca = () => `[${randomUUID()}]`;
const textos = async (a: Ator) => (await caixaDeAvisos(db, a)).map((x) => x.texto);
const temAviso = async (a: Ator, texto: string) => (await textos(a)).some((t) => t.includes(texto));

async function outraUnidade(): Promise<number> {
  const empresa = await db.selectFrom("empresa").select("id").executeTakeFirstOrThrow();
  const u = await db.insertInto("unidade").values({ empresa_id: empresa.id, nome: `Filial ${randomUUID().slice(0, 6)}` }).returning("id").executeTakeFirstOrThrow();
  return u.id;
}

describe("aviso operacional: cargo, unidade e turno", () => {
  it("chega ao cargo de destino e a nenhum outro", async () => {
    const m = marca();
    const sup = await pessoa("supervisor");
    const caixa = await pessoa("caixa");
    const atendente = await pessoa("atendente");
    await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Para supervisor ${m}` });
    expect(await temAviso(sup, m)).toBe(true);
    expect(await temAviso(caixa, m)).toBe(false);
    expect(await temAviso(atendente, m)).toBe(false);
  });

  it("vale o cargo ATIVO: com dois cargos, só vê o aviso do cargo com que está agindo", async () => {
    const m = marca();
    let p = await pessoa("caixa", "supervisor");
    p = await trocarCargoAtivo(db, p, { cargo: "caixa" });
    await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Cargo ativo ${m}` });
    expect(await temAviso(p, m)).toBe(false);
    p = await trocarCargoAtivo(db, p, { cargo: "supervisor" });
    expect(await temAviso(p, m)).toBe(true);
    // De volta ao caixa, o aviso de supervisor não aparece na caixa do caixa.
    p = await trocarCargoAtivo(db, p, { cargo: "caixa" });
    expect(await temAviso(p, m)).toBe(false);
  });

  it("aviso de outra unidade não chega", async () => {
    const m = marca();
    const sup = await pessoa("supervisor");
    await criarAviso(db, { unidadeId: await outraUnidade(), paraCargos: ["supervisor"], tipo: "teste", texto: `Outra unidade ${m}` });
    expect(await temAviso(sup, m)).toBe(false);
  });

  it("vale até o fim do turno em que nasceu", async () => {
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Validade ${marca()}` });
    const r = await sql<{ ok: boolean }>`
      SELECT expira_em = fim_do_aviso(unidade_id, criado_em) AS ok FROM aviso WHERE id = ${id}`.execute(db);
    expect(r.rows[0]?.ok).toBe(true);
  });

  it("fora do turno não recebe: quem entra depois do fim do turno não recebe; quem recebeu guarda no histórico", async () => {
    const m = marca();
    const antes = await pessoa("supervisor");
    // Aviso que vence em 1 segundo (como se o turno estivesse acabando).
    await db
      .insertInto("aviso")
      .values({ unidade_id: unidadeId, para_cargos: sql<string[]>`ARRAY['supervisor']::text[]`, tipo: "teste", texto: `Fim do turno ${m}`, expira_em: sql<Date>`now() + interval '1 second'` })
      .execute();
    expect(await temAviso(antes, m)).toBe(true);
    await new Promise((r) => setTimeout(r, 1300));
    const depois = await pessoa("supervisor");
    expect(await temAviso(depois, m)).toBe(false);
    expect(await temAviso(antes, m)).toBe(true);
  });

  it("aviso para uma pessoa só: os outros do mesmo cargo não recebem", async () => {
    const m = marca();
    const a = await pessoa("supervisor");
    const b = await pessoa("supervisor");
    await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], paraUsuarioId: a.usuarioId, tipo: "teste", texto: `Só para A ${m}` });
    expect(await temAviso(a, m)).toBe(true);
    expect(await temAviso(b, m)).toBe(false);
  });

  it("sem sessão ou com segundo fator pendente: recusado e registrado", async () => {
    expect((await erroDe(caixaDeAvisos(db, null))).codigo).toBe("nao_autenticado");
    const login = "administrador";
    const pendente = (await entrar(db, { login, senha: "senha-de-teste-123" }, origem)).ator;
    expect(pendente.segundoFator).toBe("pendente");
    expect((await erroDe(caixaDeAvisos(db, pendente))).codigo).toBe("segundo_fator");
    expect((await erroDe(resolverAviso(db, pendente, 1))).codigo).toBe("segundo_fator");
    const reg = await db.selectFrom("auditoria").select("detalhes").where("usuario_id", "=", pendente.usuarioId).where("acao", "=", "avisos.ver").where("resultado", "=", "recusado").orderBy("id", "desc").executeTakeFirst();
    expect(reg?.detalhes.motivo).toBe("segundo_fator_pendente");
  });

  it("muitas consultas ao mesmo tempo: cada aviso entregue uma vez só", async () => {
    const m = marca();
    const sup = await pessoa("supervisor");
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Concorrência ${m}` });
    await Promise.all(Array.from({ length: 12 }, () => caixaDeAvisos(db, sup)));
    const n = await db.selectFrom("aviso_destino").select((eb) => eb.fn.countAll<string>().as("n")).where("aviso_id", "=", id).where("usuario_id", "=", sup.usuarioId).executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1);
  });
});

describe("situação de cada aviso: novo, visto, resolvido", () => {
  it("anda para a frente; repetir não muda; aviso de outra pessoa não é tocado", async () => {
    const m = marca();
    const a = await pessoa("supervisor");
    const b = await pessoa("supervisor");
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Situação ${m}`, prioridade: "urgente" });
    const doA = async () => (await caixaDeAvisos(db, a)).find((x) => x.id === id)!;
    expect((await doA()).situacao).toBe("novo");
    expect((await doA()).prioridade).toBe("urgente");
    expect(await marcarVistos(db, a, { ids: [Number(id)] })).toBe(1);
    const visto = await doA();
    expect(visto.situacao).toBe("visto");
    expect(await marcarVistos(db, a, { ids: [Number(id)] })).toBe(0); // data gravada uma vez
    expect((await doA()).vistoEm?.getTime()).toBe(visto.vistoEm?.getTime());
    await resolverAviso(db, a, Number(id));
    const resolvido = await doA();
    expect(resolvido.situacao).toBe("resolvido");
    await resolverAviso(db, a, Number(id));
    expect((await doA()).resolvidoEm?.getTime()).toBe(resolvido.resolvidoEm?.getTime());
    // B ainda não abriu: nada é dele, e nada do A muda pelo B.
    expect(await marcarVistos(db, b, { ids: [Number(id)] })).toBe(0);
    expect((await caixaDeAvisos(db, b)).find((x) => x.id === id)!.situacao).toBe("novo");
  });

  it("resolver sem ter recebido: não encontrado", async () => {
    const caixa = await pessoa("caixa");
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Não é seu ${marca()}` });
    expect((await erroDe(resolverAviso(db, caixa, Number(id)))).codigo).toBe("nao_encontrado");
    expect((await erroDe(marcarVistos(db, caixa, { ids: [] }))).codigo).toBe("dados_invalidos");
  });

  it("resolver direto marca também como visto", async () => {
    const a = await pessoa("supervisor");
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Direto ${marca()}` });
    await caixaDeAvisos(db, a);
    await resolverAviso(db, a, Number(id));
    const x = (await caixaDeAvisos(db, a)).find((v) => v.id === id)!;
    expect(x.vistoEm).not.toBeNull();
    expect(x.situacao).toBe("resolvido");
  });

  it("o banco não deixa voltar atrás nem apagar (RC-17)", async () => {
    const a = await pessoa("supervisor");
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Banco ${marca()}` });
    await caixaDeAvisos(db, a);
    await resolverAviso(db, a, Number(id));
    const onde = sql`aviso_id = ${id} AND usuario_id = ${a.usuarioId}`;
    await expect(sql`UPDATE aviso_destino SET visto_em = NULL WHERE ${onde}`.execute(db)).rejects.toThrow(/só anda para a frente/);
    await expect(sql`UPDATE aviso_destino SET resolvido_em = now() + interval '1 hour' WHERE ${onde}`.execute(db)).rejects.toThrow(/só anda para a frente/);
    await expect(sql`UPDATE aviso_destino SET cargo = 'caixa' WHERE ${onde}`.execute(db)).rejects.toThrow(/só anda para a frente/);
    await expect(sql`DELETE FROM aviso_destino WHERE ${onde}`.execute(db)).rejects.toThrow(/não pode ser alterado/);
    await expect(sql`UPDATE aviso SET texto = 'x' WHERE id = ${id}`.execute(db)).rejects.toThrow(/não pode ser alterado/);
    // Resolvido sem visto: o banco recusa.
    const b = await pessoa("supervisor");
    await expect(
      sql`INSERT INTO aviso_destino (aviso_id, usuario_id, cargo, resolvido_em) VALUES (${id}, ${b.usuarioId}, 'supervisor', now())`.execute(db),
    ).rejects.toThrow();
  });

  it("aviso operacional novo sem validade: o banco recusa", async () => {
    await expect(
      sql`INSERT INTO aviso (unidade_id, para_cargos, tipo, texto) VALUES (${unidadeId}, ARRAY['supervisor'], 'teste', 'sem validade')`.execute(db),
    ).rejects.toThrow(/aviso_operacional_tem_validade/);
  });
});

describe("comunicados da gerência", () => {
  it("só dono, administrador e gerente geral enviam e acompanham; a recusa fica registrada", async () => {
    for (const cargo of ["supervisor", "caixa", "atendente", "financeiro", "cozinheira", "motoboy", "contador"]) {
      const p = await pessoa(cargo);
      expect((await erroDe(enviarComunicado(db, p, { texto: "Oi pessoal", cargos: ["caixa"] }))).codigo, cargo).toBe("sem_permissao");
      expect((await erroDe(listarComunicados(db, p))).codigo, cargo).toBe("sem_permissao");
    }
    const sup = await pessoa("supervisor");
    await erroDe(enviarComunicado(db, sup, { texto: "Oi pessoal", cargos: ["caixa"] }));
    const reg = await db.selectFrom("auditoria").select("resultado").where("usuario_id", "=", sup.usuarioId).where("acao", "=", "comunicados.enviar").executeTakeFirst();
    expect(reg?.resultado).toBe("recusado");
  });

  it("dados inválidos são recusados", async () => {
    const g = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    for (const dados of [
      {},
      { texto: "oi", cargos: ["caixa"] },
      { texto: "x".repeat(501), cargos: ["caixa"] },
      { texto: "Recado válido", cargos: [] },
      { texto: "Recado válido", cargos: ["chefe"] },
      { texto: "Recado válido", cargos: ["caixa", "caixa"] },
      { texto: "Recado válido", cargos: ["caixa"], validade: "sempre" },
    ]) {
      expect((await erroDe(enviarComunicado(db, g, dados))).codigo, JSON.stringify(dados).slice(0, 60)).toBe("dados_invalidos");
    }
  });

  it("chega aos cargos escolhidos, mostra quem leu e quem não leu", async () => {
    const m = marca();
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    const at1 = await pessoa("atendente");
    const at2 = await pessoa("atendente");
    const cx = await pessoa("caixa");
    const sup = await pessoa("supervisor");
    const { id } = await enviarComunicado(db, gerente, { texto: `Reunião amanhã ${m}`, cargos: ["atendente", "caixa"] });

    const recebido = (await caixaDeAvisos(db, at1)).find((x) => x.id === id)!;
    expect(recebido.natureza).toBe("comunicado");
    expect(recebido.autorNome).toBe(gerente.nome);
    expect(await temAviso(sup, m)).toBe(false);
    await resolverAviso(db, at1, Number(id)); // "Li e entendi"
    await caixaDeAvisos(db, at2); // recebeu, não abriu

    const c = (await listarComunicados(db, gerente)).find((x) => x.id === id)!;
    const sit = (u: Ator) => c.pessoas.find((p) => p.usuarioId === u.usuarioId)?.situacao;
    expect(sit(at1)).toBe("resolvido");
    expect(sit(at2)).toBe("novo");
    expect(sit(cx)).toBe("nao_recebeu");
    expect(sit(sup)).toBeUndefined();
    // Todo atendente e todo caixa ativo da unidade conta (incluindo os da semente).
    const deve = await db
      .selectFrom("usuario_perfil as up")
      .innerJoin("usuario as u", "u.id", "up.usuario_id")
      .select((eb) => eb.fn.count<string>("up.usuario_id").distinct().as("n"))
      .where("up.perfil_codigo", "in", ["atendente", "caixa"])
      .where("up.unidade_id", "=", unidadeId)
      .where("up.removido_em", "is", null)
      .where("u.ativo", "=", true)
      .executeTakeFirstOrThrow();
    expect(c.total).toBe(Number(deve.n));
    expect(c.confirmaram).toBe(1);
    expect(c.validade).toBe("ate_ler");

    const reg = await db.selectFrom("auditoria").select(["resultado", "detalhes"]).where("acao", "=", "comunicados.enviar").where("alvo_id", "=", String(id)).executeTakeFirstOrThrow();
    expect(reg.resultado).toBe("permitido");
    expect(reg.detalhes.cargos).toEqual(["atendente", "caixa"]);
  });

  it("quem recebeu e depois perdeu o cargo continua na lista de leitura", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    const at = await pessoa("atendente", "caixa");
    const { id } = await enviarComunicado(db, gerente, { texto: `Perdeu o cargo ${marca()}`, cargos: ["atendente"] });
    await caixaDeAvisos(db, at);
    await tirarCargo(db, gerente, at.usuarioId, { cargo: "atendente" });
    const c = (await listarComunicados(db, gerente)).find((x) => x.id === id)!;
    expect(c.pessoas.find((p) => p.usuarioId === at.usuarioId)?.situacao).toBe("novo");
  });

  it("comunicado 'só neste turno' vence no fim do turno; 'até ler' não vence", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    const turno = await enviarComunicado(db, gerente, { texto: `Hoje ${marca()}`, cargos: ["caixa"], validade: "turno" });
    const ateLer = await enviarComunicado(db, gerente, { texto: `Sempre ${marca()}`, cargos: ["caixa"] });
    const r = await db.selectFrom("aviso").select(["id", "expira_em"]).where("id", "in", [turno.id, ateLer.id]).execute();
    expect(r.find((x) => x.id === turno.id)!.expira_em).not.toBeNull();
    expect(r.find((x) => x.id === ateLer.id)!.expira_em).toBeNull();
    // Um comunicado do turno que já venceu não chega a quem entra depois.
    const m = marca();
    await db
      .insertInto("aviso")
      .values({ unidade_id: unidadeId, para_cargos: sql<string[]>`ARRAY['caixa']::text[]`, tipo: "comunicado", natureza: "comunicado", autor_id: gerente.usuarioId, texto: `Vencido ${m}`, expira_em: sql<Date>`now() - interval '1 minute'` })
      .execute();
    expect(await temAviso(await pessoa("caixa"), m)).toBe(false);
  });
});

describe("correções da revisão (fora do turno)", () => {
  it("sessão aberta desde ontem: fora do turno, não recebe aviso operacional nem comunicado do turno", async () => {
    const m = marca();
    const sup = await pessoa("supervisor");
    const agora = await pessoa("supervisor"); // entrou agora, já com o cargo
    // Entrou há dois dias e a sessão ainda vale: o turno dele já acabou.
    await db.updateTable("sessao").set({ criada_em: sql<Date>`now() - interval '2 days'` }).where("id", "=", sup.sessaoId!).execute();
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Operacional ${m}` });
    await enviarComunicado(db, gerente, { texto: `Só hoje ${m}`, cargos: ["supervisor"], validade: "turno" });
    await enviarComunicado(db, gerente, { texto: `Até ler ${m}`, cargos: ["supervisor"] });
    const t = (await textos(sup)).filter((x) => x.includes(m));
    expect(t).toEqual([`Até ler ${m}`]);
    // Quem entrou agora, no mesmo cargo, recebe os três.
    expect((await textos(agora)).filter((x) => x.includes(m))).toHaveLength(3);
  });

  it("comunicado 'até confirmar' antigo não chega a quem ganhou o cargo depois, nem conta na lista", async () => {
    const m = marca();
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    const { id } = await enviarComunicado(db, gerente, { texto: `Antigo ${m}`, cargos: ["caixa"] });
    const novato = await pessoa("caixa");
    expect(await temAviso(novato, m)).toBe(false);
    const c = (await listarComunicados(db, gerente)).find((x) => x.id === id)!;
    expect(c.pessoas.some((p) => p.usuarioId === novato.usuarioId)).toBe(false);
  });

  it("só mexe no aviso do cargo ativo: agindo como caixa, não confirma o que recebeu como supervisor", async () => {
    let p = await pessoa("caixa", "supervisor");
    p = await trocarCargoAtivo(db, p, { cargo: "supervisor" });
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Cargo ${marca()}` });
    await caixaDeAvisos(db, p);
    p = await trocarCargoAtivo(db, p, { cargo: "caixa" });
    expect(await marcarVistos(db, p, { ids: [Number(id)] })).toBe(0);
    expect((await erroDe(resolverAviso(db, p, Number(id)))).codigo).toBe("nao_encontrado");
    p = await trocarCargoAtivo(db, p, { cargo: "supervisor" });
    expect(await marcarVistos(db, p, { ids: [Number(id)] })).toBe(1);
  });

  it("vistos sem sessão: recusado", async () => {
    expect((await erroDe(marcarVistos(db, null, { ids: [1] }))).codigo).toBe("nao_autenticado");
  });

  it("histórico em páginas: 'antesDe' traz os mais antigos; valor inválido é recusado", async () => {
    const sup = await pessoa("supervisor");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Página ${i} ${marca()}` }));
    await caixaDeAvisos(db, sup);
    const antes = await caixaDeAvisos(db, sup, { antesDe: ids[2] });
    expect(antes.map((a) => a.id)).not.toContain(ids[2]);
    expect(antes.map((a) => a.id)).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    expect((await erroDe(caixaDeAvisos(db, sup, { antesDe: "abc" }))).codigo).toBe("dados_invalidos");
  });

  it("o banco recusa data de visto antes da entrega", async () => {
    const a = await pessoa("supervisor");
    const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Data ${marca()}` });
    await caixaDeAvisos(db, a);
    await expect(
      sql`UPDATE aviso_destino SET visto_em = entregue_em - interval '1 hour' WHERE aviso_id = ${id} AND usuario_id = ${a.usuarioId}`.execute(db),
    ).rejects.toThrow();
  });
});

describe("turnos da equipe (horas fixas, São Paulo): Turno 1 08h-15h30, Turno 2 15h30-23h30", () => {
  let un: number;
  beforeAll(async () => {
    un = await outraUnidade();
    await db
      .insertInto("turno")
      .values([
        { unidade_id: un, nome: "Turno 1", inicio: "08:00", fim: "15:30" },
        { unidade_id: un, nome: "Turno 2", inicio: "15:30", fim: "23:30" },
      ])
      .execute();
  });
  // 10/11/2026, terça; São Paulo = UTC-3.
  const turno = async (local: string) =>
    (await sql<{ nome: string; fim: Date }>`SELECT nome, fim FROM turno_em(${un}, ${local + "-03:00"}::timestamptz)`.execute(db)).rows[0];
  const fimDoAviso = async (local: string) =>
    (await sql<{ f: Date }>`SELECT fim_do_aviso(${un}, ${local + "-03:00"}::timestamptz) AS f`.execute(db)).rows[0]!.f.toISOString();
  const ts = (local: string | null) => (local ? local + "-03:00" : null);
  const noTurno = async (entrou: string, agora: string, continuou: string | null = null) =>
    (await sql<{ ok: boolean }>`SELECT pessoa_no_turno(${un}, ${ts(entrou)}::timestamptz, ${ts(continuou)}::timestamptz, ${ts(agora)}::timestamptz) AS ok`.execute(db)).rows[0]!.ok;

  it("qual turno está em andamento", async () => {
    expect(await turno("2026-11-10T07:59:00")).toBeUndefined();
    expect((await turno("2026-11-10T08:00:00"))?.nome).toBe("Turno 1");
    expect((await turno("2026-11-10T15:29:00"))?.nome).toBe("Turno 1");
    expect((await turno("2026-11-10T15:30:00"))?.nome).toBe("Turno 2");
    expect((await turno("2026-11-10T23:29:00"))?.nome).toBe("Turno 2");
    expect(await turno("2026-11-10T23:30:00")).toBeUndefined();
    expect(await turno("2026-11-11T02:00:00")).toBeUndefined();
  });

  it("aviso vale até o fim do turno em que nasceu mais a margem de troca (30 min); fora de turno, só a margem", async () => {
    expect(await fimDoAviso("2026-11-10T09:00:00")).toBe("2026-11-10T19:00:00.000Z"); // 15h30 + 30 = 16h
    expect(await fimDoAviso("2026-11-10T15:25:00")).toBe("2026-11-10T19:00:00.000Z"); // perto do fim: quem chega recebe
    expect(await fimDoAviso("2026-11-10T15:30:00")).toBe("2026-11-11T03:00:00.000Z"); // 23h30 + 30 = 0h
    expect(await fimDoAviso("2026-11-10T23:40:00")).toBe("2026-11-11T03:10:00.000Z"); // fora de turno: +30 min
  });

  it("cada um fica no turno em que entrou (15h10 é Turno 1), mais a margem de troca de 30 min", async () => {
    expect(await noTurno("2026-11-10T09:00:00", "2026-11-10T15:29:00")).toBe(true);
    expect(await noTurno("2026-11-10T09:00:00", "2026-11-10T15:45:00")).toBe(true); // passando o turno
    expect(await noTurno("2026-11-10T09:00:00", "2026-11-10T16:00:00")).toBe(false); // acabou a margem
    expect(await noTurno("2026-11-10T15:10:00", "2026-11-10T15:50:00")).toBe(true); // 15h10 = Turno 1
    expect(await noTurno("2026-11-10T15:10:00", "2026-11-10T17:00:00")).toBe(false); // não é contado como Turno 2
    expect(await noTurno("2026-11-10T15:30:00", "2026-11-10T22:00:00")).toBe(true); // entrou no Turno 2
    expect(await noTurno("2026-11-10T16:00:00", "2026-11-10T23:45:00")).toBe(true); // fechando, na margem
    expect(await noTurno("2026-11-10T16:00:00", "2026-11-11T00:05:00")).toBe(false);
    expect(await noTurno("2026-11-10T08:00:00", "2026-11-10T19:00:00")).toBe(false); // esqueceu de sair
    expect(await noTurno("2026-11-10T07:40:00", "2026-11-10T09:00:00")).toBe(true); // antes do primeiro turno: Turno 1
    expect(await noTurno("2026-11-10T06:30:00", "2026-11-10T09:00:00")).toBe(false); // cedo demais: sem turno
    expect(await noTurno("2026-11-09T22:00:00", "2026-11-10T09:00:00")).toBe(false); // sessão de ontem
  });

  it("'Continuo no turno' vale até o fim do turno em que foi tocado, mais a margem", async () => {
    expect(await noTurno("2026-11-10T09:00:00", "2026-11-10T20:00:00", "2026-11-10T23:30:00")).toBe(true);
    expect(await noTurno("2026-11-10T09:00:00", "2026-11-10T23:50:00", "2026-11-10T23:30:00")).toBe(true);
    expect(await noTurno("2026-11-10T09:00:00", "2026-11-11T00:00:00", "2026-11-10T23:30:00")).toBe(false);
    expect(await noTurno("2026-11-10T06:30:00", "2026-11-10T10:00:00", "2026-11-10T15:30:00")).toBe(true);
  });

  it("turnos que se sobrepõem são recusados", async () => {
    await expect(db.insertInto("turno").values({ unidade_id: un, nome: "Extra", inicio: "09:00", fim: "20:00" }).execute()).rejects.toThrow(/sobrepõe/);
    await expect(db.insertInto("turno").values({ unidade_id: un, nome: "Ao contrário", inicio: "20:00", fim: "09:00" }).execute()).rejects.toThrow();
  });

  it("unidade sem turno cadastrado: ninguém está no turno", async () => {
    const vazia = await outraUnidade();
    expect((await sql<{ ok: boolean }>`SELECT pessoa_no_turno(${vazia}, now(), NULL, now()) AS ok`.execute(db)).rows[0]!.ok).toBe(false);
  });
});

describe("entrega de verdade fora do turno (o caminho da caixa de avisos)", () => {
  // Põe a unidade de teste num turno que NÃO contém a hora atual e volta ao dia todo depois.
  async function foraDeTurno<T>(fn: () => Promise<T>): Promise<T> {
    const h = (await sql<{ h: number }>`SELECT extract(hour FROM now() AT TIME ZONE u.fuso_horario)::int AS h FROM unidade u WHERE u.id = ${unidadeId}`.execute(db)).rows[0]!.h;
    const [inicio, fim] = h < 12 ? ["20:00", "21:00"] : ["02:00", "03:00"];
    await db.deleteFrom("turno").where("unidade_id", "=", unidadeId).execute();
    await db.insertInto("turno").values({ unidade_id: unidadeId, nome: "Longe", inicio, fim }).execute();
    try {
      return await fn();
    } finally {
      await db.deleteFrom("turno").where("unidade_id", "=", unidadeId).execute();
      await db.insertInto("turno").values([
        { unidade_id: unidadeId, nome: "Teste manhã", inicio: "00:00", fim: "12:00" },
        { unidade_id: unidadeId, nome: "Teste tarde", inicio: "12:00", fim: "24:00" },
      ]).execute();
    }
  }

  it("sem turno em andamento: quem acabou de entrar não recebe o operacional, mas recebe o comunicado 'até confirmar'", async () => {
    const m = marca();
    const sup = await pessoa("supervisor");
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    await foraDeTurno(async () => {
      await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Fora operacional ${m}` });
      await enviarComunicado(db, gerente, { texto: `Fora até ler ${m}`, cargos: ["supervisor"] });
      expect((await textos(sup)).filter((x) => x.includes(m))).toEqual([`Fora até ler ${m}`]);
      // Comunicado "só neste turno" fora de turno é recusado (não chegaria a ninguém).
      expect((await erroDe(enviarComunicado(db, gerente, { texto: `Fora turno ${m}`, cargos: ["supervisor"], validade: "turno" }))).codigo).toBe("dados_invalidos");
      const s = await situacaoDoTurno(db, sup);
      expect(s.noTurno).toBe(false);
      expect(s.turnoAtual).toBeNull();
      expect((await erroDe(continuarNoTurno(db, sup, { senha: SENHA }, origem))).codigo).toBe("dados_invalidos");
    });
  });

  it("turno acabou: a tela pede para sair; 'Continuo no turno' volta a entregar e fica na auditoria", async () => {
    const m = marca();
    const sup = await pessoa("supervisor");
    // Entrou há dois dias (esqueceu de sair): o turno dele acabou.
    await db.updateTable("sessao").set({ criada_em: sql<Date>`now() - interval '2 days'` }).where("id", "=", sup.sessaoId!).execute();
    await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Antes de continuar ${m}` });
    expect(await temAviso(sup, m)).toBe(false);
    const antes = await situacaoDoTurno(db, sup);
    expect(antes).toMatchObject({ noTurno: false, turnoAcabou: true, podeContinuar: true });
    // Senha errada (ex.: a próxima pessoa pegou o celular): não continua e fica registrado.
    expect((await erroDe(continuarNoTurno(db, sup, { senha: "nao-e-a-senha" }, origem))).codigo).toBe("nao_autenticado");
    expect((await erroDe(continuarNoTurno(db, sup, {}, origem))).codigo).toBe("dados_invalidos");
    expect((await situacaoDoTurno(db, sup)).noTurno).toBe(false);
    const novo = await continuarNoTurno(db, sup, { senha: SENHA }, origem);
    const depois = await situacaoDoTurno(db, novo.ator);
    expect(depois).toMatchObject({ noTurno: true, turnoAcabou: false, podeContinuar: false });
    expect(novo.ator.cargoAtivo).toBe("supervisor");
    expect(await temAviso(novo.ator, m)).toBe(true);
    // A sessão antiga (a esquecida) foi encerrada.
    const antiga = await db.selectFrom("sessao").select("revogada_em").where("id", "=", sup.sessaoId!).executeTakeFirstOrThrow();
    expect(antiga.revogada_em).not.toBeNull();
    const reg = await db.selectFrom("auditoria").select("detalhes").where("usuario_id", "=", sup.usuarioId).where("acao", "=", "turno.continuar").executeTakeFirst();
    expect(reg?.detalhes.turno).toBe(depois.turnoAtual?.nome);
    expect((await erroDe(situacaoDoTurno(db, null))).codigo).toBe("nao_autenticado");
  });

  it("comunicado 'só neste turno' vale até o fim do turno em andamento mais a margem", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    const { id } = await enviarComunicado(db, gerente, { texto: `Neste turno ${marca()}`, cargos: ["caixa"], validade: "turno" });
    const r = await sql<{ ok: boolean }>`SELECT a.expira_em = (SELECT fim FROM turno_em(a.unidade_id, a.criado_em)) + u.margem_troca_turno AS ok FROM aviso a JOIN unidade u ON u.id = a.unidade_id WHERE a.id = ${id}`.execute(db);
    expect(r.rows[0]?.ok).toBe(true);
  });

  it("turnosDoDiaTodo se recusa a rodar em banco que não termina em _teste", async () => {
    const { turnosDoDiaTodo } = await import("../src/semente");
    const nome = `erp_guarda_${randomUUID().slice(0, 8)}`;
    await sql.raw(`CREATE DATABASE ${nome}`).execute(db);
    const url = (process.env.DATABASE_URL_TESTE ?? "postgres://erp:erp@localhost:5432/erp_teste").replace(/\/[a-z0-9_]+$/, `/${nome}`);
    const outro = criarBanco(url, 1);
    try {
      await expect(turnosDoDiaTodo(outro, 1)).rejects.toThrow(/_teste/);
    } finally {
      await outro.destroy();
      await sql.raw(`DROP DATABASE ${nome}`).execute(db);
    }
  });
});

describe("margem de troca de turno: gerentes mudam quando quiserem", () => {
  it("só gerente geral, dono e administrador veem e mudam; recusa registrada", async () => {
    for (const cargo of ["supervisor", "caixa", "atendente", "financeiro", "cozinheira", "motoboy", "contador"]) {
      const p = await pessoa(cargo);
      expect((await erroDe(verTurnos(db, p))).codigo, cargo).toBe("sem_permissao");
      expect((await erroDe(mudarMargemDeTroca(db, p, { minutos: 10 }))).codigo, cargo).toBe("sem_permissao");
      const reg = await db.selectFrom("auditoria").select("resultado").where("usuario_id", "=", p.usuarioId).where("acao", "=", "horarios.gerenciar").execute();
      expect(reg.map((r) => r.resultado), cargo).toEqual(["recusado", "recusado"]);
    }
  });

  it("muda a margem, vale na hora para a entrega e fica na auditoria com o antes e o depois", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    const antes = await verTurnos(db, gerente);
    expect(antes.margemMinutos).toBe(30);
    expect(antes.turnos.length).toBeGreaterThan(0);
    try {
      const depois = await mudarMargemDeTroca(db, gerente, { minutos: 45 });
      expect(depois.margemMinutos).toBe(45);
      const id = await criarAviso(db, { unidadeId, paraCargos: ["supervisor"], tipo: "teste", texto: `Margem ${marca()}` });
      const r = await sql<{ ok: boolean }>`
        SELECT a.expira_em = (SELECT fim FROM turno_em(a.unidade_id, a.criado_em)) + interval '45 minutes' AS ok FROM aviso a WHERE a.id = ${id}`.execute(db);
      expect(r.rows[0]?.ok).toBe(true);
      const reg = await db.selectFrom("auditoria").select("detalhes").where("usuario_id", "=", gerente.usuarioId).where("acao", "=", "horarios.gerenciar").orderBy("id", "desc").executeTakeFirstOrThrow();
      expect(reg.detalhes).toMatchObject({ campo: "margem_troca_turno", de: 30, para: 45 });
    } finally {
      await mudarMargemDeTroca(db, gerente, { minutos: 30 });
    }
  });

  it("valor fora de 0 a 120 minutos é recusado (pela regra e pelo banco)", async () => {
    const gerente = await atorDoCargo(db, "gerente_geral", "gerente.geral");
    for (const minutos of [-1, 121, 1.5, "30", null]) {
      expect((await erroDe(mudarMargemDeTroca(db, gerente, { minutos }))).codigo, String(minutos)).toBe("dados_invalidos");
    }
    await expect(sql`UPDATE unidade SET margem_troca_turno = interval '3 hours' WHERE id = ${unidadeId}`.execute(db)).rejects.toThrow();
  });
});

describe("'Continuo no turno' não renova a sessão nem o segundo fator", () => {
  it("administrador: a sessão nova herda o vencimento e o segundo fator da antiga; não dá para repetir", async () => {
    const adm = await atorDoCargo(db, "administrador");
    expect(adm.segundoFator).toBe("ok");
    // Esqueceu a sessão aberta: entrou há 2 dias e ela vence daqui a 1 h.
    await db
      .updateTable("sessao")
      .set({ criada_em: sql<Date>`now() - interval '2 days'`, expira_em: sql<Date>`now() + interval '1 hour'` })
      .where("id", "=", adm.sessaoId!)
      .execute();
    const antiga = await db.selectFrom("sessao").select("expira_em").where("id", "=", adm.sessaoId!).executeTakeFirstOrThrow();
    const novo = await continuarNoTurno(db, adm, { senha: SENHA_DE_TESTE }, origem);
    const nova = await db.selectFrom("sessao").select(["expira_em", "segundo_fator_ok"]).where("id", "=", novo.ator.sessaoId!).executeTakeFirstOrThrow();
    expect(new Date(nova.expira_em).getTime()).toBeLessThanOrEqual(new Date(antiga.expira_em).getTime());
    expect(novo.expiraEm.getTime()).toBe(new Date(nova.expira_em).getTime());
    expect(nova.segundo_fator_ok).toBe(true);
    expect(novo.ator.segundoFator).toBe("ok");
    // Já no turno: o servidor recusa outro "Continuo" (sem cadeia de renovações).
    expect((await erroDe(continuarNoTurno(db, novo.ator, { senha: SENHA_DE_TESTE }, origem))).codigo).toBe("dados_invalidos");
  });

  it("quem está no próprio turno não pode tocar 'Continuo'", async () => {
    const sup = await pessoa("supervisor");
    expect((await erroDe(continuarNoTurno(db, sup, { senha: SENHA }, origem))).codigo).toBe("dados_invalidos");
    const reg = await db.selectFrom("auditoria").select("id").where("usuario_id", "=", sup.usuarioId).where("acao", "=", "sessao.entrar").execute();
    expect(reg.length).toBe(1); // nem conferiu a senha: só a entrada inicial
  });
});
