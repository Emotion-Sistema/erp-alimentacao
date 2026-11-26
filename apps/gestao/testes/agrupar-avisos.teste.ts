/** Central de avisos: vários itens em reposição viram um cartão só (E10 parte 2). */
import { describe, expect, it } from "vitest";
import { agruparAvisos } from "../app/agrupar-avisos";
import type { AvisoDaCaixa } from "../app/ItemDeAviso";

let n = 0;
const aviso = (tipo: string, extra: Partial<AvisoDaCaixa> = {}): AvisoDaCaixa => ({
  id: String(++n),
  criadoEm: "2026-11-26T12:00:00Z",
  tipo,
  texto: `texto ${n}`,
  prioridade: "normal",
  natureza: "operacional",
  autorNome: null,
  situacao: "novo",
  vistoEm: null,
  resolvidoEm: null,
  ...extra,
});

describe("agruparAvisos", () => {
  it("junta os 'entrou em reposição' não resolvidos na posição do mais novo; o resto fica como está", () => {
    const urgente = aviso("estoque.emergencia", { prioridade: "urgente" });
    const r1 = aviso("estoque.repor");
    const outro = aviso("caixa.sangria");
    const r2 = aviso("estoque.repor", { situacao: "visto" });
    const resolvido = aviso("estoque.repor", { situacao: "resolvido" });
    const r3 = aviso("estoque.repor");
    const c = agruparAvisos([urgente, r1, outro, r2, resolvido, r3]);
    expect(c.map((x) => (x.tipo === "um" ? x.aviso.id : x.avisos.map((a) => a.id).join("+")))).toEqual([urgente.id, `${r1.id}+${r2.id}+${r3.id}`, outro.id, resolvido.id]);
    const g = c[1]!;
    expect(g.tipo === "grupo" && g.titulo).toBe("3 itens entraram em reposição. Coloque na lista de compras.");
  });

  it("um só fica sozinho; urgente nunca se junta", () => {
    const r = aviso("estoque.repor");
    const u1 = aviso("estoque.repor", { prioridade: "urgente" });
    const u2 = aviso("estoque.repor", { prioridade: "urgente" });
    expect(agruparAvisos([r, u1, u2]).every((x) => x.tipo === "um")).toBe(true);
  });
});
