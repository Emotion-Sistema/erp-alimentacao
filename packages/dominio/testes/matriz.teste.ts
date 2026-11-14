/**
 * Matriz de permissões (RC-12, decisão 0011). A tabela ESPERADA está escrita aqui à parte,
 * de propósito: mudar a matriz exige mudar o código e este teste no mesmo PR (skill
 * `matriz-de-permissoes`). O teste pela API, cargo por cargo, está em apps/gestao/testes.
 */
import { describe, expect, it } from "vitest";
import { ACOES, ACOES_EXCLUSIVAS, ACOES_FINANCEIRAS, CARGOS, PERMISSOES, QUEM_ATRIBUI, exigeSegundoFator, pode, podeAtribuir, type Acao, type Cargo } from "../src/index";

const GESTAO_SEM_FINANCEIRO: Acao[] = [
  "usuarios.ver", "usuarios.gerenciar", "codigos.desbloquear", "estacoes.gerenciar", "estacoes.ver", "auditoria.ver",
  "pedidos.lancar", "pedidos.ver_proprios", "pedidos.ver_todos", "pedidos.alterar", "pedidos.cancelar",
  "producao.ver", "estoque.cozinha", "estoque.salao", "compras.gerenciar", "compras.materiais", "custos.ver",
  "caixa.autorizar", "motoboys.organizar",
];
const FINANCEIRO: Acao[] = ["financeiro.ver", "financeiro.gerenciar", "faturamento.ver", "caixa.fechamentos_ver", "contabil.ver"];

const ESPERADO: Record<Cargo, Acao[]> = {
  dono: [...GESTAO_SEM_FINANCEIRO, "configuracao.gerenciar", ...FINANCEIRO],
  administrador: [...GESTAO_SEM_FINANCEIRO, "configuracao.gerenciar", ...FINANCEIRO],
  gerente_geral: GESTAO_SEM_FINANCEIRO,
  financeiro: [...FINANCEIRO, "custos.ver", "compras.materiais"],
  supervisor: ["usuarios.ver", "codigos.desbloquear", "estacoes.ver", "pedidos.lancar", "pedidos.ver_todos", "pedidos.alterar", "pedidos.cancelar", "producao.ver", "estoque.salao", "caixa.autorizar"],
  atendente: ["pedidos.lancar", "pedidos.ver_proprios", "pedidos.alterar", "pedidos.marcar_entregue"],
  caixa: ["caixa.operar", "pagamento.marcar_pago", "motoboys.organizar", "pedidos.ver_todos"],
  cozinheira: ["producao.ver", "producao.operar", "producao.sensivel", "estoque.cozinha"],
  auxiliar_cozinha: ["producao.ver", "producao.operar"],
  motoboy: ["entregas.proprias", "pedidos.marcar_entregue"],
  contador: ["contabil.ver"],
};

describe("matriz de permissões", () => {
  it.each(CARGOS)("%s tem exatamente as ações esperadas", (cargo) => {
    expect([...PERMISSOES[cargo]].sort()).toEqual([...ESPERADO[cargo]].sort());
  });

  it("cada cargo x cada ação: pode() segue a matriz (o que não está listado é recusado)", () => {
    for (const c of CARGOS) for (const a of ACOES) expect(pode(c, a), `${c} ${a}`).toBe(ESPERADO[c].includes(a));
  });

  it("caixa e gerente geral não têm nenhuma ação do financeiro", () => {
    for (const c of ["caixa", "gerente_geral"] as const) for (const a of ACOES_FINANCEIRAS) expect(pode(c, a), `${c} ${a}`).toBe(false);
  });

  it("só o caixa marca Pago; atendente marca Entregue e não marca Pago", () => {
    expect(CARGOS.filter((c) => pode(c, "pagamento.marcar_pago"))).toEqual(["caixa"]);
    expect(pode("atendente", "pedidos.marcar_entregue")).toBe(true);
    expect(pode("atendente", "pagamento.marcar_pago")).toBe(false);
  });

  it("supervisor vê a cozinha mas não muda a situação da produção", () => {
    expect(pode("supervisor", "producao.ver")).toBe(true);
    expect(pode("supervisor", "producao.operar")).toBe(false);
    expect(pode("supervisor", "producao.sensivel")).toBe(false);
  });

  it("ações exclusivas ficam só com quem faz o trabalho (nem o dono as tem pelo cargo)", () => {
    for (const [acao, donos] of Object.entries(ACOES_EXCLUSIVAS)) {
      expect(CARGOS.filter((c) => pode(c, acao as Acao)).sort(), acao).toEqual([...donos!].sort());
    }
  });

  it("motoboy e contador só têm o que é deles", () => {
    expect(ESPERADO.motoboy).not.toContain("pedidos.ver_todos");
    expect(PERMISSOES.contador).toEqual(["contabil.ver"]);
  });

  it("quem dá um cargo já tem todo o poder dele (fora as ações exclusivas de quem faz o trabalho)", () => {
    for (const quem of CARGOS) {
      for (const alvo of QUEM_ATRIBUI[quem]) {
        const aMais = PERMISSOES[alvo].filter((a) => !pode(quem, a) && !(a in ACOES_EXCLUSIVAS));
        expect(aMais, `${quem} dá ${alvo}`).toEqual([]);
      }
    }
  });

  it("quem atribui cada cargo", () => {
    expect(CARGOS.filter((c) => podeAtribuir(c, ["dono"]))).toEqual(["dono"]);
    for (const alvo of ["administrador", "financeiro", "contador", "gerente_geral"]) {
      expect(CARGOS.filter((c) => podeAtribuir(c, [alvo])), alvo).toEqual(["dono", "administrador"]);
    }
    for (const alvo of ["supervisor", "atendente", "caixa", "cozinheira", "auxiliar_cozinha", "motoboy"]) {
      expect(CARGOS.filter((c) => podeAtribuir(c, [alvo])), alvo).toEqual(["dono", "administrador", "gerente_geral"]);
    }
  });

  it("segundo fator: obrigatório para quem tem cargo de dono ou administrador, mesmo agindo com outro cargo", () => {
    expect(exigeSegundoFator(["dono"])).toBe(true);
    expect(exigeSegundoFator(["caixa", "administrador"])).toBe(true);
    expect(exigeSegundoFator(["gerente_geral", "caixa"])).toBe(false);
  });
});
