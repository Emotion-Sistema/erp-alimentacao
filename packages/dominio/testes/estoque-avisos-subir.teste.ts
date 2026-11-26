/**
 * Urgente do estoque não visto sobe para o superior (E10 parte 2; RC-18; migração 0028). Contra
 * PostgreSQL real, com itens inventados. Cobre: antes de 15 minutos não sobe; depois sobe uma vez só
 * (também com duas execuções ao mesmo tempo); visto por alguém não sobe; o problema resolvido não
 * sobe; aviso que já não vale (turno acabou) não sobe; quem é o superior de cada cargo; histórico
 * imutável. O tempo é simulado mudando a data do aviso (só no teste, com a trava desligada).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  consumirNaTransacao,
  definirLinhas,
  MINUTOS_PARA_SUBIR,
  registrarEntrada,
  salvarIngrediente,
  subirAvisosNaoVistos,
  superioresDe,
  transferir,
  TIPO_DO_AVISO_QUE_SUBIU,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
const sufixo = randomUUID().slice(0, 6);
let n = 0;
const nome = (base: string) => `${base} ${sufixo} ${++n}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
});
afterAll(() => db.destroy());

const ingrediente = async (base: string) => (await salvarIngrediente(db, gerente, { nome: nome(base), unidadeBase: "g", area: "cozinha" })).id;
const entrada = (ingredienteId: number, quantidade: string, local: "em_uso" | "guardado") =>
  registrarEntrada(db, gerente, { itens: [{ ingredienteId, quantidade, local }] });
const consumir = (ingredienteId: number, quantidade: string) =>
  db.transaction().execute((trx) => consumirNaTransacao(trx, { autorId: gerente.usuarioId, chave: `teste-${randomUUID()}`, itens: [{ ingredienteId, quantidade }] }));

async function avisosDe(ingredienteId: number, tipo?: string) {
  const r = await sql<{ id: string; tipo: string; prioridade: string; para_cargos: string[]; texto: string; dados: Record<string, unknown> }>`
    SELECT a.id::text AS id, a.tipo, a.prioridade, a.para_cargos, a.texto, a.dados FROM aviso a
    WHERE a.tipo LIKE 'estoque.%' AND (a.dados->>'itemId')::int = (SELECT id FROM estoque_item WHERE ingrediente_id = ${ingredienteId})
      AND (${tipo ?? null}::text IS NULL OR a.tipo = ${tipo ?? null}::text)
    ORDER BY a.id`.execute(db);
  return r.rows;
}

/** Só no teste: o aviso nasceu `minutos` atrás e vale por mais uma hora (o turno real da hora do teste não importa). */
async function envelhecer(ids: string[], minutos: number, valeMaisMinutos = 60) {
  await db.transaction().execute(async (trx) => {
    await sql`ALTER TABLE aviso DISABLE TRIGGER aviso_so_insercao`.execute(trx);
    await sql`UPDATE aviso SET criado_em = now() - make_interval(secs => ${Math.round(minutos * 60)}), expira_em = now() + make_interval(mins => ${valeMaisMinutos})
      WHERE id = ANY(${ids}::bigint[])`.execute(trx);
    await sql`ALTER TABLE aviso ENABLE TRIGGER aviso_so_insercao`.execute(trx);
  });
}

/** Alguém do cargo recebeu e viu o aviso. */
async function viu(avisoId: string, quem: Ator, cargo: string) {
  await sql`INSERT INTO aviso_destino (aviso_id, usuario_id, cargo, entregue_em, visto_em) VALUES (${avisoId}::bigint, ${quem.usuarioId}, ${cargo}, now() - interval '1 minute', now())`.execute(db);
}

/** Emergência do ingrediente: 600 em uso, linhas 500/200, consome 450 (fica 150). */
async function emEmergencia(base: string) {
  const x = await ingrediente(base);
  await entrada(x, "600", "em_uso");
  await definirLinhas(db, gerente, { ingredienteId: x, saudavel: "500", emergencia: "200" });
  await consumir(x, "450");
  const [e] = await avisosDe(x, "estoque.emergencia");
  expect(e).toMatchObject({ prioridade: "urgente", para_cargos: ["gerente_geral"] });
  return { x, e: e! };
}

describe("superior de cada cargo", () => {
  it("cozinha e salão sobem ao gerente geral; o gerente geral ao dono; quem já recebia não recebe de novo", () => {
    expect(superioresDe(["gerente_geral"])).toEqual(["dono"]);
    expect(superioresDe(["cozinheira"])).toEqual(["gerente_geral"]);
    expect(superioresDe(["supervisor"])).toEqual(["gerente_geral"]);
    expect(superioresDe(["gerente_geral", "cozinheira"])).toEqual(["dono"]);
    expect(superioresDe(["dono"])).toEqual([]);
  });
});

describe("urgente não visto sobe (RC-18)", () => {
  it(`antes de ${MINUTOS_PARA_SUBIR} minutos não sobe; depois sobe uma vez só, ao dono, com o mesmo texto`, async () => {
    const { x, e } = await emEmergencia("Fermento");
    await envelhecer([e.id], MINUTOS_PARA_SUBIR - 5 / 60); // 5 segundos antes do prazo
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU)).toEqual([]);
    await envelhecer([e.id], MINUTOS_PARA_SUBIR); // no prazo exato já sobe
    await subirAvisosNaoVistos(db);
    await subirAvisosNaoVistos(db);
    const subiu = await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU);
    expect(subiu).toHaveLength(1);
    expect(subiu[0]).toMatchObject({ prioridade: "urgente", para_cargos: ["dono"] });
    expect(subiu[0]!.texto).toBe(`Ninguém viu este aviso em ${MINUTOS_PARA_SUBIR} minutos: ${e.texto}`);
    expect(subiu[0]!.dados).toMatchObject({ ...e.dados, avisoDeOrigem: e.id, tipoDeOrigem: "estoque.emergencia", cargosDeOrigem: ["gerente_geral"] });
    // O aviso que subiu não sobe de novo (o dono não tem superior, e o tipo não é dos que sobem).
    await envelhecer([subiu[0]!.id], MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU)).toHaveLength(1);
    // Histórico imutável.
    await expect(sql`DELETE FROM aviso_subida WHERE aviso_id = ${e.id}::bigint`.execute(db)).rejects.toThrow();
  });

  it("duas execuções ao mesmo tempo sobem uma vez só, sem erro (a trava faz a segunda esperar)", async () => {
    const { x, e } = await emEmergencia("Polvilho");
    await envelhecer([e.id], MINUTOS_PARA_SUBIR + 5);
    // Uma transação de fora segura a vaga do aviso em aviso_subida (sem gravar): as execuções que
    // chegarem a gravar esperam por ela. Assim as duas se sobrepõem de verdade. Desfeita, só uma grava;
    // sem a trava, a segunda já teria lido e falharia com chave repetida.
    const [outro] = await avisosDe(x, "estoque.repor").then(async (l) => (l.length ? l : await avisosDe(x)));
    let soltar!: () => void;
    let segurou!: () => void;
    const segurando = new Promise<void>((r) => (segurou = r));
    const fora = db
      .transaction()
      .execute(async (trx) => {
        await sql`INSERT INTO aviso_subida (aviso_id, novo_aviso_id) VALUES (${e.id}::bigint, ${outro!.id}::bigint)`.execute(trx);
        segurou();
        await new Promise<void>((r) => (soltar = r));
        throw new Error("desfaz");
      })
      .catch(() => undefined);
    await segurando;
    const execucoes = Promise.all([subirAvisosNaoVistos(db), subirAvisosNaoVistos(db)]);
    await new Promise((r) => setTimeout(r, 300));
    soltar();
    await fora;
    const r = await execucoes;
    expect(r.reduce((t, k) => t + k.subiram, 0)).toBe(1);
    expect(await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU)).toHaveLength(1);
  });

  it("esgotou e voltou só até a emergência: continua urgente e sobe", async () => {
    const x = await ingrediente("Sagu");
    await entrada(x, "300", "em_uso");
    await definirLinhas(db, gerente, { ingredienteId: x, saudavel: "500", emergencia: "200" });
    await consumir(x, "300"); // esgotou
    await entrada(x, "100", "em_uso"); // 100: emergência (melhora, sem aviso novo)
    const [g] = await avisosDe(x, "estoque.esgotado");
    await envelhecer([g!.id], MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    expect((await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU)).map((k) => k.dados.avisoDeOrigem)).toEqual([g!.id]);
  });

  it("emergência e 'usando o guardado' do mesmo movimento: sobe um só (o mais novo)", async () => {
    const x = await ingrediente("Canjica");
    await entrada(x, "100", "em_uso");
    await entrada(x, "200", "guardado");
    await definirLinhas(db, gerente, { ingredienteId: x, saudavel: "500", emergencia: "200" });
    const antes = (await avisosDe(x)).map((a) => a.id);
    await consumir(x, "150"); // 150: emergência, e o em uso acabou (usando o guardado)
    const novos = (await avisosDe(x)).filter((a) => !antes.includes(a.id) && a.prioridade === "urgente");
    expect(novos.map((a) => a.tipo).sort()).toEqual(["estoque.emergencia", "estoque.usando_guardado"]);
    await envelhecer(novos.map((a) => a.id), MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    const subiu = await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU);
    expect(subiu).toHaveLength(1);
    expect(subiu[0]!.dados.avisoDeOrigem).toBe(novos.map((a) => a.id).sort((a, b) => Number(b) - Number(a))[0]);
  });

  it("um aviso mais novo do mesmo item já visto: o antigo não sobe", async () => {
    const { x, e } = await emEmergencia("Tapioca");
    await entrada(x, "1000", "em_uso"); // recuperou
    await consumir(x, "1000"); // caiu de novo: emergência (150) com aviso novo
    const emerg = await avisosDe(x, "estoque.emergencia");
    expect(emerg).toHaveLength(2);
    await viu(emerg[1]!.id, gerente, "gerente_geral");
    await envelhecer([e.id, emerg[1]!.id], MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU)).toEqual([]);
  });

  it("visto por alguém não sobe (entregue e não visto, sobe)", async () => {
    const a = await emEmergencia("Gergelim");
    const b = await emEmergencia("Linhaça");
    await envelhecer([a.e.id, b.e.id], MINUTOS_PARA_SUBIR + 1);
    await viu(a.e.id, gerente, "gerente_geral");
    // b foi entregue mas ninguém abriu.
    await sql`INSERT INTO aviso_destino (aviso_id, usuario_id, cargo, entregue_em) VALUES (${b.e.id}::bigint, ${gerente.usuarioId}, 'gerente_geral', now())`.execute(db);
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(a.x, TIPO_DO_AVISO_QUE_SUBIU)).toEqual([]);
    expect(await avisosDe(b.x, TIPO_DO_AVISO_QUE_SUBIU)).toHaveLength(1);
  });

  it("o problema resolvido não sobe; o que piorou sobe", async () => {
    const a = await emEmergencia("Aveia");
    await entrada(a.x, "1000", "guardado"); // voltou a ficar saudável
    const b = await emEmergencia("Chia");
    await consumir(b.x, "150"); // de emergência para esgotou: continua (pior)
    await envelhecer([a.e.id, b.e.id], MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(a.x, TIPO_DO_AVISO_QUE_SUBIU)).toEqual([]);
    expect((await avisosDe(b.x, TIPO_DO_AVISO_QUE_SUBIU)).map((k) => k.dados.avisoDeOrigem)).toContain(b.e.id);
  });

  it("aviso que já não vale (o turno acabou) não sobe", async () => {
    const { x, e } = await emEmergencia("Quinoa");
    await envelhecer([e.id], MINUTOS_PARA_SUBIR + 1, -1);
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU)).toEqual([]);
  });

  it("esgotou (gerente geral e cozinheira) sobe ao dono, sem quantidades no que já ia sem elas", async () => {
    const x = await ingrediente("Fubá");
    await entrada(x, "300", "em_uso");
    await definirLinhas(db, gerente, { ingredienteId: x, saudavel: "100" });
    await consumir(x, "300");
    const [e] = await avisosDe(x, "estoque.esgotado");
    expect(e!.para_cargos).toEqual(["gerente_geral", "cozinheira"]);
    await envelhecer([e!.id], MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    const [s] = await avisosDe(x, TIPO_DO_AVISO_QUE_SUBIU);
    expect(s).toMatchObject({ para_cargos: ["dono"] });
    expect(s!.dados).not.toHaveProperty("quantidade");
  });

  it("começou a usar o guardado (urgente) sobe enquanto continua usando; trazido para o em uso, não sobe", async () => {
    const mk = async (base: string) => {
      const x = await ingrediente(base);
      await entrada(x, "100", "em_uso");
      await entrada(x, "1000", "guardado");
      await consumir(x, "150"); // acabou o em uso: começou a usar o guardado
      const [g] = await avisosDe(x, "estoque.usando_guardado");
      expect(g).toMatchObject({ prioridade: "urgente" });
      return { x, g: g! };
    };
    const a = await mk("Coco ralado");
    const b = await mk("Amendoim");
    // b: trouxeram do guardado para o em uso (deixou de usar o guardado).
    await transferir(db, cozinheira, { ingredienteId: b.x, quantidade: "300", de: { area: "cozinha", local: "guardado" }, para: { area: "cozinha", local: "em_uso" } });
    await envelhecer([a.g.id, b.g.id], MINUTOS_PARA_SUBIR + 1);
    await subirAvisosNaoVistos(db);
    expect(await avisosDe(a.x, TIPO_DO_AVISO_QUE_SUBIU)).toHaveLength(1);
    expect(await avisosDe(b.x, TIPO_DO_AVISO_QUE_SUBIU)).toEqual([]);
  });
});
