/**
 * Tipos de produção (RC-10 seção 1, migração 0011, decisão 0017). Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Banco } from "@erp/banco";
import { ErroDeRegra, listarTiposDeProducao, salvarTipoDeProducao, type Ator } from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let supervisor: Ator;
let atendente: Ator;
const sufixo = randomUUID().slice(0, 6).replace(/[0-9]/g, "x");

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  supervisor = await atorDoCargo(db, "supervisor");
  atendente = await atorDoCargo(db, "atendente");
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

async function ultimaAuditoria(alvoId: number) {
  return db
    .selectFrom("auditoria")
    .select(["acao", "usuario_id", "detalhes"])
    .where("alvo_tipo", "=", "tipo_producao")
    .where("alvo_id", "=", String(alvoId))
    .orderBy("id", "desc")
    .executeTakeFirstOrThrow();
}

describe("tipos de produção", () => {
  it("vêm os do RC-10, com área e capacidade 1", async () => {
    const tipos = await listarTiposDeProducao(db, supervisor);
    expect(tipos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nome: "Hambúrgueres", area: "cozinha", capacidade: 1, ativo: true }),
        expect.objectContaining({ nome: "Pratos e grelhados", area: "cozinha", capacidade: 1, ativo: true }),
        expect.objectContaining({ nome: "Cafeteria", area: "cafeteria", capacidade: 1, ativo: true }),
      ]),
    );
  });

  it("cria, altera mantendo o que não veio, e registra antes e depois", async () => {
    const t = await salvarTipoDeProducao(db, gerente, { nome: `  Porções   ${sufixo} `, area: "cozinha", capacidade: 3, ordem: 40 });
    expect(t).toMatchObject({ nome: `Porções ${sufixo}`, area: "cozinha", capacidade: 3, ordem: 40, ativo: true });
    const a1 = await ultimaAuditoria(t.id);
    expect(a1).toMatchObject({ acao: "cadastros.gerenciar", usuario_id: gerente.usuarioId, detalhes: { operacao: "criar", antes: null, depois: { id: t.id, nome: t.nome, area: "cozinha", capacidade: 3, ordem: 40, ativo: true } } });

    const t2 = await salvarTipoDeProducao(db, gerente, { id: t.id, nome: t.nome, area: "cafeteria" });
    expect(t2).toMatchObject({ area: "cafeteria", capacidade: 3, ordem: 40, ativo: true });
    const a2 = await ultimaAuditoria(t.id);
    expect(a2.detalhes).toMatchObject({ operacao: "alterar", antes: { area: "cozinha" }, depois: { area: "cafeteria" } });

    // Desativar só com id e ativo: não volta a área nem o nome que outra pessoa mudou.
    await salvarTipoDeProducao(db, gerente, { id: t.id, nome: `${t.nome} novo` });
    const t3 = await salvarTipoDeProducao(db, gerente, { id: t.id, ativo: false });
    expect(t3).toMatchObject({ nome: `${t.nome} novo`, area: "cafeteria", capacidade: 3, ordem: 40, ativo: false });
    // Alterar sem mandar ativo mantém o ativo.
    expect(await salvarTipoDeProducao(db, gerente, { id: t.id, capacidade: 4 })).toMatchObject({ capacidade: 4, ativo: false });
  });

  it("nome único entre os ativos (sem ligar para acento e maiúscula); desativar libera o nome", async () => {
    const t = await salvarTipoDeProducao(db, gerente, { nome: `Salgados ${sufixo}`, area: "cozinha" });
    expect((await erroDe(salvarTipoDeProducao(db, gerente, { nome: `SALGADOS ${sufixo.toUpperCase()}`, area: "cafeteria" }))).codigo).toBe("conflito");
    await salvarTipoDeProducao(db, gerente, { id: t.id, nome: t.nome, area: t.area, ativo: false });
    const outro = await salvarTipoDeProducao(db, gerente, { nome: `Salgados ${sufixo}`, area: "cozinha" });
    expect(outro.id).not.toBe(t.id);
    // Reativar o antigo com o nome em uso é recusado.
    expect((await erroDe(salvarTipoDeProducao(db, gerente, { id: t.id, nome: t.nome, area: t.area, ativo: true }))).codigo).toBe("conflito");
    // Inativo continua na lista, depois dos ativos.
    const lista = await listarTiposDeProducao(db, gerente);
    const posInativo = lista.findIndex((x) => x.id === t.id);
    expect(posInativo).toBeGreaterThan(lista.findIndex((x) => x.id === outro.id));
    expect(lista.slice(posInativo).every((x) => !x.ativo)).toBe(true);
  });

  it("recusa dado errado com frase clara", async () => {
    const msg = async (d: unknown) => (await erroDe(salvarTipoDeProducao(db, gerente, d))).message;
    expect(await msg({ nome: "x", area: "cozinha" })).toMatch(/2 letras/);
    expect(await msg({ nome: "Tipo bom", area: "sorveteria" })).toMatch(/cozinha ou cafeteria/);
    expect(await msg({ nome: "Tipo bom" })).toMatch(/cozinha ou cafeteria/);
    expect(await msg({ nome: "Tipo bom", area: "cozinha", capacidade: 0 })).toMatch(/pelo menos 1/);
    expect(await msg({ nome: "Tipo bom", area: "cozinha", capacidade: 51 })).toMatch(/até 50/);
    expect(await msg({ nome: "Tipo bom", area: "cozinha", capacidade: 1.5 })).toMatch(/inteiro/);
    expect(await msg({ nome: "Tipo\u0007ruim", area: "cozinha" })).toMatch(/inválido/);
    expect(await msg({ area: "cozinha" })).toMatch(/Informe o nome/);
    expect(await msg({ nome: "Tipo bom", area: "cozinha", ordem: 10000 })).toBeTruthy();
    expect(await msg({ nome: "Tipo bom", area: "cozinha", ordem: -1 })).toBeTruthy();
    expect(await msg({ nome: "Tipo bom", area: "cozinha", ativo: "sim" })).toBeTruthy();
    expect(await msg({ id: "1", ativo: false })).toBeTruthy();
    expect(await msg({ id: 0, ativo: false })).toBeTruthy();
    const n = await db.selectFrom("tipo_producao").select("id").where("nome", "=", "Tipo bom").execute();
    expect(n).toHaveLength(0);
    expect((await erroDe(salvarTipoDeProducao(db, gerente, { id: 999999, nome: "Fantasma", area: "cozinha" }))).codigo).toBe("nao_encontrado");
  });

  it("supervisor vê, mas não cria nem altera; atendente nem vê; sem login não vê", async () => {
    expect((await listarTiposDeProducao(db, supervisor)).length).toBeGreaterThan(0);
    expect((await erroDe(listarTiposDeProducao(db, atendente))).codigo).toBe("sem_permissao");
    for (const quem of [supervisor, atendente]) {
      expect((await erroDe(salvarTipoDeProducao(db, quem, { nome: `Proibido ${sufixo}`, area: "cozinha" }))).codigo).toBe("sem_permissao");
    }
    expect((await erroDe(listarTiposDeProducao(db, null))).codigo).toBe("nao_autenticado");
    const n = await db.selectFrom("tipo_producao").select("id").where("nome", "=", `Proibido ${sufixo}`).execute();
    expect(n).toHaveLength(0);
  });

  it("duas pessoas criando o mesmo nome ao mesmo tempo: só uma consegue", async () => {
    const nome = `Grill ${sufixo}`;
    const r = await Promise.allSettled([1, 2, 3].map(() => salvarTipoDeProducao(db, gerente, { nome, area: "cozinha" })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r) if (x.status === "rejected") expect((x.reason as ErroDeRegra).codigo).toBe("conflito");
  });
});
