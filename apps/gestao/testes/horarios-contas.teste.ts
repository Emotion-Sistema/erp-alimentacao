/** Funções puras das telas de horário (apps/gestao/app/cadastros/horarios/contas.ts). Sem banco. */
import { describe, expect, it } from "vitest";
import {
  arrumarHora,
  corpoDaSemana,
  corpoDaVenda,
  dataCurta,
  datasEmOrdem,
  efetivoDoDia,
  mesmaSemana,
  nomeDoAlvo,
  problemaDoDiaDaLoja,
  problemaDoDiaDeVenda,
  quandoLocal,
  semanaParaEditar,
  somarDias,
  textoDoEfetivo,
  vendaParaEditar,
} from "../app/cadastros/horarios/contas";

const loja = { dia: 5, aberta: true, abre: "09:00", ultimoPedido: "23:00", fecha: "23:30" };
const segue = { modo: "segue" as const, inicio: null, fim: null };

describe("arrumarHora", () => {
  it.each([
    ["11", "11:00"],
    ["9", "09:00"],
    ["11h", "11:00"],
    ["11h30", "11:30"],
    ["1130", "11:30"],
    ["930", "09:30"],
    ["11.30", "11:30"],
    [" 11:30 ", "11:30"],
    ["24", "24:00"],
    ["", ""],
    ["abc", "abc"],
  ])("%s -> %s", (de, para) => expect(arrumarHora(de)).toBe(para));
});

describe("semana da loja", () => {
  it("dia fechado não tem problema; aberto confere formato e ordem", () => {
    expect(problemaDoDiaDaLoja({ dia: 1, aberta: false, abre: "", ultimoPedido: "", fecha: "" })).toBeNull();
    expect(problemaDoDiaDaLoja({ dia: 2, aberta: true, abre: "10:00", ultimoPedido: "23:00", fecha: "23:30" })).toBeNull();
    expect(problemaDoDiaDaLoja({ dia: 2, aberta: true, abre: "00:00", ultimoPedido: "24:00", fecha: "24:00" })).toBeNull();
    expect(problemaDoDiaDaLoja({ dia: 2, aberta: true, abre: "", ultimoPedido: "23:00", fecha: "23:30" })).toMatch(/Preencha/);
    expect(problemaDoDiaDaLoja({ dia: 2, aberta: true, abre: "24:00", ultimoPedido: "23:00", fecha: "23:30" })).toMatch(/Abre/);
    expect(problemaDoDiaDaLoja({ dia: 2, aberta: true, abre: "23:00", ultimoPedido: "23:00", fecha: "23:30" })).toMatch(/depois de abrir/);
    expect(problemaDoDiaDaLoja({ dia: 2, aberta: true, abre: "10:00", ultimoPedido: "23:40", fecha: "23:30" })).toMatch(/depois de fechar/);
  });
  it("monta os 7 dias e manda nulo nas horas do dia fechado", () => {
    const dias = semanaParaEditar([{ dia: 1, aberta: false, abre: null, ultimoPedido: null, fecha: null }, { ...loja }]);
    expect(dias).toHaveLength(7);
    expect(dias[4]).toEqual({ ...loja });
    const fechadoComHora = dias.map((d) => (d.dia === 5 ? { ...d, aberta: false } : d));
    expect(corpoDaSemana(fechadoComHora).dias[4]).toEqual({ dia: 5, aberta: false, abre: null, ultimoPedido: null, fecha: null });
    // Hora esquecida num dia fechado não conta como mudança.
    expect(mesmaSemana(dias.map((d) => (d.dia === 1 ? { ...d, abre: "10:00" } : d)), dias)).toBe(true);
    expect(mesmaSemana(dias.map((d) => (d.dia === 5 ? { ...d, abre: "10:00" } : d)), dias)).toBe(false);
  });
});

describe("semana de venda", () => {
  it("dia ausente é 'segue'; aberto confere início antes do fim e aceita 24:00", () => {
    const dias = vendaParaEditar([{ canal: "delivery", categoriaId: null, dia: 5, modo: "aberto", inicio: "18:00", fim: "23:00" }], "delivery", null);
    expect(dias.map((d) => d.modo)).toEqual(["segue", "segue", "segue", "segue", "aberto", "segue", "segue"]);
    expect(vendaParaEditar([{ canal: "delivery", categoriaId: 3, dia: 5, modo: "fechado", inicio: null, fim: null }], "delivery", null)[4]!.modo).toBe("segue");
    expect(problemaDoDiaDeVenda({ dia: 1, modo: "aberto", inicio: "18:00", fim: "24:00" })).toBeNull();
    expect(problemaDoDiaDeVenda({ dia: 1, modo: "aberto", inicio: "18:00", fim: "18:00" })).toMatch(/antes do fim/);
    expect(problemaDoDiaDeVenda({ dia: 1, modo: "aberto", inicio: "", fim: "18:00" })).toMatch(/Preencha/);
    expect(corpoDaVenda("loja", 2, [{ dia: 1, modo: "fechado", inicio: "10:00", fim: "11:00" }]).dias[0]).toEqual({ dia: 1, modo: "fechado", inicio: null, fim: null });
  });
});

describe("o que vale de fato (mesma conta da situacao_de_venda)", () => {
  it("segue: da abertura ao último pedido da cozinha", () => {
    expect(textoDoEfetivo(efetivoDoDia(loja, [{ camada: segue, fechadoTexto: "x" }]))).toBe("9h às 23h");
  });
  it("horário próprio é cortado pelo último pedido e pela abertura", () => {
    const e = efetivoDoDia(loja, [{ camada: { modo: "aberto", inicio: "08:00", fim: "23:30" }, fechadoTexto: "x" }]);
    expect(e).toEqual({ vende: true, inicio: "09:00", fim: "23:00" });
  });
  it("categoria dentro do canal: interseção das duas", () => {
    const e = efetivoDoDia(loja, [
      { camada: { modo: "aberto", inicio: "18:00", fim: "23:00" }, fechadoTexto: "Delivery fechado" },
      { camada: { modo: "aberto", inicio: "11:00", fim: "19:30" }, fechadoTexto: "Não vende" },
    ]);
    expect(textoDoEfetivo(e)).toBe("18h às 19h30");
  });
  it("loja fechada, camada fechada e janela que não sobra", () => {
    expect(textoDoEfetivo(efetivoDoDia({ ...loja, aberta: false, abre: null, ultimoPedido: null, fecha: null }, []))).toBe("Loja fechada");
    expect(textoDoEfetivo(efetivoDoDia(loja, [{ camada: { modo: "fechado", inicio: null, fim: null }, fechadoTexto: "Delivery fechado" }]))).toBe("Delivery fechado");
    expect(textoDoEfetivo(efetivoDoDia(loja, [{ camada: { modo: "aberto", inicio: "23:10", fim: "23:50" }, fechadoTexto: "x" }]))).toBe("Não sobra horário");
  });
});

describe("datas e nomes", () => {
  it("data curta, soma de dias e ordem das datas", () => {
    expect(dataCurta("2026-12-25")).toBe("sex, 25/12");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    const ordem = datasEmOrdem({
      datas: [{ id: 1, data: "2026-12-25", dia: 5, aberta: false, abre: null, ultimoPedido: null, fecha: null, motivo: "Natal" }],
      datasVenda: [
        { id: 9, canal: "delivery", categoriaId: null, data: "2026-12-24", modo: "fechado", inicio: null, fim: null, motivo: "Véspera" },
        { id: 8, canal: "loja", categoriaId: null, data: "2026-12-25", modo: "fechado", inicio: null, fim: null, motivo: "Natal" },
      ],
    });
    expect(ordem.map((i) => `${i.tipo}-${i.id}`)).toEqual(["venda-9", "unidade-1", "venda-8"]);
  });
  it("nome do alvo", () => {
    const cats = [{ id: 4, nome: "Hambúrgueres", descricao: null, ordem: 40, ativo: true }];
    expect(nomeDoAlvo(null, null, cats)).toBe("Tudo (loja e delivery)");
    expect(nomeDoAlvo("delivery", null, cats)).toBe("Delivery");
    expect(nomeDoAlvo("delivery", 4, cats)).toBe("Hambúrgueres no delivery");
    expect(nomeDoAlvo("loja", 4, cats)).toBe("Hambúrgueres na loja");
  });
  it("hora local da unidade (fuso dela, não o do aparelho)", () => {
    expect(quandoLocal("2026-11-17T15:40:00.000Z", "America/Sao_Paulo", "2026-11-17")).toBe("12h40");
    expect(quandoLocal("2026-11-18T15:00:00.000Z", "America/Sao_Paulo", "2026-11-17")).toBe("qua, 18/11 às 12h");
  });
});
