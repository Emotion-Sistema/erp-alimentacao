/**
 * Aplicativos por cargo (RC-03, decisão 0012). A lista ESPERADA fica aqui à parte, de
 * propósito: mudar o que um cargo vê exige mudar o código e este teste no mesmo PR.
 */
import { describe, expect, it } from "vitest";
import { ACOES, ACOES_FINANCEIRAS, APLICATIVOS, CARGOS, aplicativosDoCargo, itensVisiveis, pode, type Cargo } from "../src/index";

const ESPERADO: Record<Cargo, string[]> = {
  dono: ["caixa", "atendimento", "producao", "estoque", "gestao", "financeiro"],
  administrador: ["caixa", "atendimento", "producao", "estoque", "gestao", "financeiro"],
  gerente_geral: ["caixa", "atendimento", "producao", "estoque", "gestao"],
  financeiro: ["estoque", "financeiro"],
  supervisor: ["caixa", "atendimento", "producao", "estoque", "gestao"],
  atendente: ["atendimento"],
  caixa: ["caixa"],
  cozinheira: ["producao", "estoque"],
  auxiliar_cozinha: ["producao"],
  motoboy: ["entregas"],
  contador: ["financeiro"],
};

describe("aplicativos por cargo", () => {
  it.each(CARGOS)("%s vê exatamente os aplicativos esperados", (cargo) => {
    expect(aplicativosDoCargo(cargo).map((a) => a.codigo)).toEqual(ESPERADO[cargo]);
  });

  it("todo cargo tem pelo menos um aplicativo", () => {
    for (const c of CARGOS) expect(aplicativosDoCargo(c).length, c).toBeGreaterThan(0);
  });

  it("sem cargo ativo ou cargo desconhecido não vê nada", () => {
    expect(aplicativosDoCargo(null)).toEqual([]);
    expect(aplicativosDoCargo("chefe")).toEqual([]);
  });

  it("item de menu só aparece para quem tem a ação dele", () => {
    for (const c of CARGOS)
      for (const app of APLICATIVOS)
        for (const i of itensVisiveis(app, c)) expect(pode(c, i.acao), `${c} ${i.caminho}`).toBe(true);
  });

  it("itens do Caixa e do Estoque por cargo (tabela escrita à mão)", () => {
    const itens = (app: string, c: Cargo) => itensVisiveis(APLICATIVOS.find((a) => a.codigo === app)!, c).map((i) => i.caminho);
    expect(itens("caixa", "caixa")).toEqual(["/caixa", "/caixa/mesas", "/caixa/receber", "/caixa/motoboys"]);
    expect(itens("caixa", "dono")).toEqual(["/caixa/mesas", "/caixa/motoboys"]);
    expect(itens("caixa", "gerente_geral")).toEqual(["/caixa/mesas", "/caixa/motoboys"]);
    expect(itens("caixa", "supervisor")).toEqual(["/caixa/mesas"]);
    expect(itens("estoque", "financeiro")).toEqual(["/estoque/materiais", "/estoque/custos"]);
    expect(itens("estoque", "cozinheira")).toEqual(["/estoque"]);
    expect(itens("estoque", "supervisor")).toEqual(["/estoque/salao"]);
    expect(itens("financeiro", "contador")).toEqual(["/financeiro/contabil"]);
    expect(itens("gestao", "dono")).toContain("/comunicados");
    expect(itens("gestao", "gerente_geral")).toContain("/comunicados");
    expect(itens("gestao", "supervisor")).not.toContain("/comunicados");
  });

  it("caixa e gerente geral não veem nenhum item do financeiro", () => {
    for (const c of ["caixa", "gerente_geral"] as const)
      for (const app of aplicativosDoCargo(c))
        for (const i of itensVisiveis(app, c)) expect(ACOES_FINANCEIRAS, `${c} ${i.caminho}`).not.toContain(i.acao);
  });

  it("cada item usa uma ação que existe, códigos e caminhos não se repetem", () => {
    const codigos = APLICATIVOS.map((a) => a.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const app of APLICATIVOS) {
      const caminhos = app.itens.map((i) => i.caminho);
      expect(new Set(caminhos).size, app.codigo).toBe(caminhos.length);
      for (const i of app.itens) expect(ACOES).toContain(i.acao);
    }
  });
});
