/**
 * Ideia nº 6 (migração 0009): catálogo de embalagens com fornecedor opcional e embalagem do
 * ingrediente escolhida do catálogo. Contra PostgreSQL real.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, type Banco } from "@erp/banco";
import {
  converterParaBase,
  ErroDeRegra,
  listarIngredientes,
  listarModelosDeEmbalagem,
  salvarConversao,
  salvarFornecedor,
  salvarIngrediente,
  salvarModeloDeEmbalagem,
  type Ator,
} from "../src/index";
import { atorDoCargo, bancoDeTeste, prepararDados } from "./apoio";

let db: Banco;
let gerente: Ator;
let cozinheira: Ator;
const sufixo = randomUUID().slice(0, 6);
const n = (nome: string) => `${nome} ${sufixo}`;

beforeAll(async () => {
  db = bancoDeTeste();
  await prepararDados(db);
  gerente = await atorDoCargo(db, "gerente_geral");
  cozinheira = await atorDoCargo(db, "cozinheira");
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
// Tipo único por teste (o catálogo é compartilhado entre os testes do arquivo).
const tipo = (t: string) => `${t} ${sufixo.replace(/[0-9]/g, "x")}`;
const ing = async (nome: string, unidadeExibicao: string, fornecedorId?: number) =>
  (await salvarIngrediente(db, gerente, { nome: n(nome), unidadeExibicao, area: "cozinha", fornecedorId })).id;
const conversoes = async (id: number) => (await listarIngredientes(db, gerente)).ingredientes.find((i) => i.id === id)!.conversoes;

describe("catálogo de embalagens", () => {
  it("vem com os modelos comuns prontos, sem fornecedor", async () => {
    const nomes = (await listarModelosDeEmbalagem(db, gerente)).filter((m) => m.ativo && !m.fornecedorId).map((m) => m.nome);
    expect(nomes).toEqual(expect.arrayContaining(["saco 25 kg", "caixa 12 un", "galão 5 l", "pacote 500 g", "caixa 1 l"]));
  });
  it("cria com nome montado e exato; vírgula aceita; sem tamanho também vale", async () => {
    const t = tipo("Balde");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: `  ${t} `, tamanho: "2,5", unidade: "Quilos" });
    expect(m).toMatchObject({ tipo: t.toLowerCase(), tamanho: "2.5", unidade: "kg", nome: `${t.toLowerCase()} 2,5 kg`, fornecedorId: null });
    const s = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Engradado") });
    expect(s.nome).toBe(tipo("engradado"));
    expect(s.tamanho).toBeNull();
  });
  it("o mesmo modelo pode ser geral e de cada fornecedor, mas não repetido no mesmo", async () => {
    const f = await salvarFornecedor(db, gerente, { nome: n("Atacado Exemplo") });
    const t = tipo("Saco");
    await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "25", unidade: "kg" });
    const doF = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "25", unidade: "kg", fornecedorId: f.id });
    expect(doF.fornecedor).toBe(n("Atacado Exemplo"));
    const e = await erroDe(salvarModeloDeEmbalagem(db, gerente, { tipo: t.toUpperCase(), tamanho: "25.0", unidade: "kg", fornecedorId: f.id }));
    expect(e.message).toBe("Essa embalagem já existe no catálogo (para esse fornecedor).");
  });
  it("recusa tipo com número, tipo que é unidade, tamanho sem unidade e unidade desconhecida", async () => {
    expect((await erroDe(salvarModeloDeEmbalagem(db, gerente, { tipo: "saco 25", tamanho: "25", unidade: "kg" }))).message).toContain("o tamanho vai no campo ao lado");
    expect((await erroDe(salvarModeloDeEmbalagem(db, gerente, { tipo: "Quilo" }))).message).toContain("é uma unidade");
    expect((await erroDe(salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Pote"), tamanho: "2" }))).message).toContain("andam juntos");
    expect((await erroDe(salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Pote"), tamanho: "2", unidade: "arroba" }))).message).toContain("desconhecida");
    expect((await erroDe(salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Pote"), tamanho: "-2", unidade: "kg" }))).message).toContain("até 4 casas");
  });
  it("quem só vê não cria; cozinheira vê o catálogo", async () => {
    expect((await listarModelosDeEmbalagem(db, cozinheira)).length).toBeGreaterThan(0);
    const e = await erroDe(salvarModeloDeEmbalagem(db, cozinheira, { tipo: tipo("Lata") }));
    expect(e.codigo).toBe("sem_permissao");
  });
});

describe("embalagem do ingrediente escolhida do catálogo", () => {
  it("mesma família: a conta sai sozinha e exata, e a conversão lembra o modelo", async () => {
    const t = tipo("Saco");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "2,5", unidade: "kg" });
    const farinha = await ing("Farinha", "kg");
    const c = await salvarConversao(db, gerente, farinha, { modeloId: m.id });
    expect(c).toMatchObject({ nome: m.nome, quantidadeBase: "2500", modeloId: m.id });
    expect(await converterParaBase(db, farinha, "2", m.nome)).toBe("5000");
    expect((await listarModelosDeEmbalagem(db, gerente)).find((x) => x.id === m.id)!.emUso).toBe(1);
  });
  it("outra família ou sem tamanho: pede a quantidade e usa a informada", async () => {
    const caixa = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Caixa"), tamanho: "12", unidade: "un" });
    const acucar = await ing("Açúcar sachê", "g");
    const e = await erroDe(salvarConversao(db, gerente, acucar, { modeloId: caixa.id }));
    expect(e.message).toBe(`Quantos gramas (g) vêm em 1 ${caixa.nome}? Informe a quantidade.`);
    const c = await salvarConversao(db, gerente, acucar, { modeloId: caixa.id, quantidadeBase: "60" });
    expect(c.quantidadeBase).toBe("60");
  });
  it("a quantidade informada não vence a conta quando o tamanho é da mesma família", async () => {
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Galão"), tamanho: "5", unidade: "l" });
    const leite = await ing("Leite galão", "l");
    const c = await salvarConversao(db, gerente, leite, { modeloId: m.id, quantidadeBase: "4000" });
    expect(c.quantidadeBase).toBe("5000");
  });
  it("não repete a mesma embalagem no ingrediente; modelo desativado não é escolhido", async () => {
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Pacote"), tamanho: "1", unidade: "kg" });
    const arroz = await ing("Arroz", "kg");
    await salvarConversao(db, gerente, arroz, { modeloId: m.id });
    expect((await erroDe(salvarConversao(db, gerente, arroz, { modeloId: m.id }))).message).toBe("Esse ingrediente já tem essa embalagem.");
    const off = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Fardo"), tamanho: "6", unidade: "un", ativo: false });
    expect((await erroDe(salvarConversao(db, gerente, arroz, { modeloId: off.id, quantidadeBase: "6000" }))).message).toBe("Essa embalagem está desativada no catálogo.");
    expect((await erroDe(salvarConversao(db, gerente, arroz, { modeloId: 2147483647 }))).codigo).toBe("nao_encontrado");
  });
  it("modelo em uso não muda de tamanho (nem direto no banco); fornecedor e ativo podem mudar", async () => {
    const t = tipo("Pote");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "500", unidade: "g" });
    const creme = await ing("Creme", "g");
    await salvarConversao(db, gerente, creme, { modeloId: m.id });
    const e = await erroDe(salvarModeloDeEmbalagem(db, gerente, { id: m.id, tipo: t, tamanho: "400", unidade: "g" }));
    expect(e.message).toContain("já está em uso em ingredientes");
    await expect(sql`UPDATE embalagem_modelo SET tamanho = 450 WHERE id = ${m.id}`.execute(db)).rejects.toThrow(/já está em uso/);
    const f = await salvarFornecedor(db, gerente, { nome: n("Laticínio Exemplo") });
    const mudou = await salvarModeloDeEmbalagem(db, gerente, { id: m.id, tipo: t, tamanho: "500", unidade: "g", fornecedorId: f.id });
    expect(mudou.fornecedorId).toBe(f.id);
    expect((await conversoes(creme)).map((c) => c.nome)).toEqual([m.nome]);
  });
  it("criar e alterar ficam na auditoria com antes e depois", async () => {
    const t = tipo("Bandeja");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "30", unidade: "un" });
    await salvarModeloDeEmbalagem(db, gerente, { id: m.id, tipo: t, tamanho: "30", unidade: "un", ativo: false });
    const r = await sql<{ op: string; antes: { ativo: boolean } | null; depois: { ativo: boolean } }>`
      SELECT detalhes->>'operacao' AS op, detalhes->'antes' AS antes, detalhes->'depois' AS depois FROM auditoria
      WHERE alvo_tipo = 'embalagem_modelo' AND alvo_id = ${String(m.id)} ORDER BY id`.execute(db);
    expect(r.rows.map((x) => x.op)).toEqual(["criar", "alterar"]);
    expect(r.rows[1]!.antes!.ativo).toBe(true);
    expect(r.rows[1]!.depois.ativo).toBe(false);
  });
});

describe("ressalvas da revisão (ideia nº 6)", () => {
  it("renomear a embalagem do ingrediente desfaz o vínculo; reativar depois de o modelo mudar também", async () => {
    const t = tipo("Saco");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "7", unidade: "kg" });
    const milho = await ing("Milho", "kg");
    const c = await salvarConversao(db, gerente, milho, { modeloId: m.id });
    const renomeada = await salvarConversao(db, gerente, milho, { id: c.id, nome: "pacotinho", quantidadeBase: "300" });
    expect(renomeada.modeloId).toBeNull();
    const fuba = await ing("Fubá", "kg");
    const c2 = await salvarConversao(db, gerente, fuba, { modeloId: m.id });
    await salvarConversao(db, gerente, fuba, { id: c2.id, nome: c2.nome, quantidadeBase: c2.quantidadeBase, ativo: false });
    await salvarModeloDeEmbalagem(db, gerente, { id: m.id, tipo: t, tamanho: "8", unidade: "kg", ativo: true });
    const reativada = await salvarConversao(db, gerente, fuba, { id: c2.id, nome: c2.nome, quantidadeBase: c2.quantidadeBase, ativo: true });
    expect(reativada.modeloId).toBeNull();
    expect(reativada.quantidadeBase).toBe("7000");
  });
  it("nome de tamanho inteiro com zero no fim sai certo (saco 10 kg)", async () => {
    const r = await sql<{ n: string }>`SELECT nome_do_modelo('saco', 10, 'kg') AS n`.execute(db);
    expect(r.rows[0]!.n).toBe("saco 10 kg");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Saco"), tamanho: "10", unidade: "kg" });
    expect(m.nome.endsWith(" 10 kg")).toBe(true);
  });
  it("embalagem grande demais ou pequena demais para o ingrediente: mensagem clara", async () => {
    const enorme = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Silo"), tamanho: "1000000", unidade: "t" });
    const sal = await ing("Sal grosso", "g");
    expect((await erroDe(salvarConversao(db, gerente, sal, { modeloId: enorme.id }))).message).toContain("grande demais");
    const mini = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Sachê"), tamanho: "0,1234", unidade: "mg" });
    expect((await erroDe(salvarConversao(db, gerente, sal, { modeloId: mini.id }))).message).toContain("pequena demais");
  });
  it("alterar sem mandar 'ativo' não reativa; id junto de modeloId é recusado", async () => {
    const t = tipo("Lata");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "350", unidade: "ml", ativo: false });
    const editado = await salvarModeloDeEmbalagem(db, gerente, { id: m.id, tipo: t, tamanho: "350", unidade: "ml" });
    expect(editado.ativo).toBe(false);
    const suco = await ing("Suco", "l");
    expect((await erroDe(salvarConversao(db, gerente, suco, { id: 1, modeloId: m.id }))).message).toContain("só se acrescenta");
  });
  it("tipo que é unidade é recusado também direto no banco", async () => {
    await expect(sql`INSERT INTO embalagem_modelo (tipo) VALUES ('litro')`.execute(db)).rejects.toThrow(/é uma unidade/);
  });
  it("'em uso' conta igual ao bloqueio: ingrediente desativado ainda segura o modelo", async () => {
    const t = tipo("Pote");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "300", unidade: "g" });
    const geleia = await ing("Geleia", "g");
    await salvarConversao(db, gerente, geleia, { modeloId: m.id });
    await salvarIngrediente(db, gerente, { id: geleia, nome: n("Geleia"), area: "cozinha", ativo: false });
    expect((await listarModelosDeEmbalagem(db, gerente)).find((x) => x.id === m.id)!.emUso).toBe(1);
  });
  it("criar do catálogo fica na auditoria do ingrediente com o modelo", async () => {
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: tipo("Fardo"), tamanho: "12", unidade: "un" });
    const agua = await ing("Água copo", "un");
    await salvarConversao(db, gerente, agua, { modeloId: m.id });
    const r = await sql<{ d: { depois: { modelo_id: number; quantidade_base: string } } }>`
      SELECT detalhes AS d FROM auditoria WHERE alvo_tipo = 'ingrediente' AND alvo_id = ${String(agua)}
        AND detalhes->>'operacao' = 'criar_conversao_do_catalogo'`.execute(db);
    expect(r.rows[0]!.d.depois.modelo_id).toBe(m.id);
  });
});

describe("concorrência entre catálogo e ingrediente (PostgreSQL real)", () => {
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  it("ligação primeiro: a mudança de tamanho espera e é recusada", async () => {
    const t = tipo("Saco");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "15", unidade: "kg" });
    const aveia = await ing("Aveia", "kg");
    const outro = bancoDeTeste();
    try {
      let mudanca: Promise<unknown> | undefined;
      await db.transaction().execute(async (trx) => {
        await sql`INSERT INTO ingrediente_conversao (ingrediente_id, nome, quantidade_base, modelo_id)
                  VALUES (${aveia}, ${m.nome}, 15000, ${m.id})`.execute(trx);
        mudanca = sql`UPDATE embalagem_modelo SET tamanho = 20 WHERE id = ${m.id}`.execute(outro).then(
          () => "aceito",
          (e: Error) => e.message,
        );
        await espera(300);
      });
      expect(await mudanca).toMatch(/já está em uso/);
    } finally {
      await outro.destroy();
    }
  });
  it("mudança primeiro: a ligação espera e usa o tamanho novo, sem misturar", async () => {
    const t = tipo("Saco");
    const m = await salvarModeloDeEmbalagem(db, gerente, { tipo: t, tamanho: "26", unidade: "kg" });
    const trigo = await ing("Trigo", "kg");
    const outro = bancoDeTeste();
    try {
      let ligacao: Promise<{ nome: string; quantidadeBase: string }> | undefined;
      await outro.transaction().execute(async (trx) => {
        await sql`UPDATE embalagem_modelo SET tamanho = 31 WHERE id = ${m.id}`.execute(trx);
        ligacao = salvarConversao(db, gerente, trigo, { modeloId: m.id });
        await espera(300);
      });
      const c = await ligacao!;
      expect(c.quantidadeBase).toBe("31000");
      expect(c.nome.endsWith(" 31 kg")).toBe(true);
    } finally {
      await outro.destroy();
    }
  });
});
