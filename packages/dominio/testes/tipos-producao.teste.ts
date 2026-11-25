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
const sufixo = randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!);

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
  it("vêm os do RC-10 e os três da 0013, com área e capacidade 1", async () => {
    const tipos = await listarTiposDeProducao(db, supervisor);
    expect(tipos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nome: "Hambúrgueres", area: "cozinha", capacidade: 1, ativo: true }),
        expect.objectContaining({ nome: "Pratos e grelhados", area: "cozinha", capacidade: 1, ativo: true }),
        expect.objectContaining({ nome: "Cafeteria", area: "cafeteria", capacidade: 1, ativo: true }),
        // Migração 0013 (resposta do responsável, 19/11/2026): um tipo para cada local da cozinha.
        expect.objectContaining({ nome: "Porções", area: "cozinha", capacidade: 1, ativo: true }),
        expect.objectContaining({ nome: "Salgados", area: "cozinha", capacidade: 1, ativo: true }),
        expect.objectContaining({ nome: "Almoço", area: "cozinha", capacidade: 1, ativo: true }),
      ]),
    );
    // Entram depois dos três primeiros, nesta ordem.
    const cozinha = tipos.filter((t) => t.ativo && ["Hambúrgueres", "Pratos e grelhados", "Porções", "Salgados", "Almoço"].includes(t.nome));
    expect(cozinha.map((t) => t.nome)).toEqual(["Hambúrgueres", "Pratos e grelhados", "Porções", "Salgados", "Almoço"]);
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

  it("posição na lista: escolhe o lugar e o sistema renumera de 10 em 10, com auditoria", async () => {
    const ativos = async () => (await listarTiposDeProducao(db, gerente)).filter((x) => x.ativo);
    const a = await salvarTipoDeProducao(db, gerente, { nome: `Primeiro ${sufixo}`, area: "cozinha", posicao: 1 });
    let lista = await ativos();
    expect(lista[0]!.id).toBe(a.id);
    expect(lista.map((x) => x.ordem)).toEqual(lista.map((_, i) => (i + 1) * 10));
    expect(a.ordem).toBe(10);
    const auditoria = await ultimaAuditoria(a.id);
    expect((auditoria.detalhes as { reordenados?: unknown[] }).reordenados?.length).toBeGreaterThan(0);

    const b = await salvarTipoDeProducao(db, gerente, { nome: `Segundo ${sufixo}`, area: "cafeteria", posicao: 2 });
    lista = await ativos();
    expect(lista.slice(0, 2).map((x) => x.id)).toEqual([a.id, b.id]);
    // Mover o primeiro para o fim (posição maior que a lista vira "último").
    await salvarTipoDeProducao(db, gerente, { id: a.id, posicao: 9999 });
    lista = await ativos();
    expect(lista.at(-1)!.id).toBe(a.id);
    expect(lista[0]!.id).toBe(b.id);
    expect(lista.map((x) => x.ordem)).toEqual(lista.map((_, i) => (i + 1) * 10));
    expect((await erroDe(salvarTipoDeProducao(db, gerente, { id: a.id, posicao: 0 }))).message).toMatch(/1 em diante/);
  });

  it("muitas pessoas criando e mudando posição ao mesmo tempo: sem deadlock e sem número repetido", async () => {
    const semRepetido = async () => {
      const lista = (await listarTiposDeProducao(db, gerente)).filter((t) => t.ativo);
      expect(lista.map((t) => t.ordem)).toEqual(lista.map((_, i) => (i + 1) * 10));
      return lista;
    };
    const x = await salvarTipoDeProducao(db, gerente, { nome: `Corrida A ${sufixo}`, area: "cozinha" });
    const y = await salvarTipoDeProducao(db, gerente, { nome: `Corrida B ${sufixo}`, area: "cozinha" });
    for (let rodada = 0; rodada < 8; rodada++) {
      // Duas linhas diferentes travadas e reposicionadas ao mesmo tempo (antes, dava deadlock),
      // mais duas criações com posição (antes, uma ficava de fora da renumeração).
      await Promise.all([
        salvarTipoDeProducao(db, gerente, { id: x.id, posicao: 1 }),
        salvarTipoDeProducao(db, gerente, { id: y.id, posicao: 2 }),
        salvarTipoDeProducao(db, gerente, { nome: `Corrida C${rodada} ${sufixo}`, area: "cafeteria", posicao: 1 }),
        salvarTipoDeProducao(db, gerente, { nome: `Corrida D${rodada} ${sufixo}`, area: "cozinha" }),
      ]);
      await semRepetido();
    }
  });

  it("novo sem posição vai para o fim; reativado volta no fim; inativo não mexe na lista", async () => {
    const novo = await salvarTipoDeProducao(db, gerente, { nome: `Fim ${sufixo}`, area: "cozinha" });
    let lista = (await listarTiposDeProducao(db, gerente)).filter((t) => t.ativo);
    expect(lista.at(-1)!.id).toBe(novo.id);
    await salvarTipoDeProducao(db, gerente, { id: novo.id, ativo: false });
    const outro = await salvarTipoDeProducao(db, gerente, { nome: `Depois ${sufixo}`, area: "cozinha" });
    // Inativo com posição: aceita e não renumera.
    const antesDoInativo = (await listarTiposDeProducao(db, gerente)).filter((t) => t.ativo).map((t) => [t.id, t.ordem]);
    await salvarTipoDeProducao(db, gerente, { id: novo.id, posicao: 1 });
    expect((await listarTiposDeProducao(db, gerente)).filter((t) => t.ativo).map((t) => [t.id, t.ordem])).toEqual(antesDoInativo);
    await salvarTipoDeProducao(db, gerente, { id: novo.id, ativo: true });
    lista = (await listarTiposDeProducao(db, gerente)).filter((t) => t.ativo);
    expect(lista.at(-1)!.id).toBe(novo.id);
    expect(lista.at(-2)!.id).toBe(outro.id);
    expect(lista.map((t) => t.ordem)).toEqual(lista.map((_, i) => (i + 1) * 10));
  });

  it("duas pessoas criando o mesmo nome ao mesmo tempo: só uma consegue", async () => {
    const nome = `Grill ${sufixo}`;
    const r = await Promise.allSettled([1, 2, 3].map(() => salvarTipoDeProducao(db, gerente, { nome, area: "cozinha" })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r) if (x.status === "rejected") expect((x.reason as ErroDeRegra).codigo).toBe("conflito");
  });
});
