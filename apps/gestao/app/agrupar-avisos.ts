import type { AvisoDaCaixa } from "./ItemDeAviso";

/**
 * Avisos que viram um cartão só na central (E10 parte 2, "avisos mais calmos"): vários itens que
 * entraram em reposição aparecem como "5 itens entraram em reposição", com a lista. Só os ainda não
 * resolvidos; o histórico (/avisos) continua mostrando um por um. Urgentes nunca se juntam.
 */
export const TIPOS_QUE_SE_JUNTAM: Readonly<Record<string, (n: number) => string>> = {
  "estoque.repor": (n) => `${n} itens entraram em reposição. Coloque na lista de compras.`,
};

export type CartaoDeAviso = { tipo: "um"; aviso: AvisoDaCaixa } | { tipo: "grupo"; chave: string; titulo: string; avisos: AvisoDaCaixa[] };

/** Junta os avisos do mesmo tipo (dos que se juntam), na posição do mais novo; com um só, fica como está. */
export function agruparAvisos(lista: readonly AvisoDaCaixa[]): CartaoDeAviso[] {
  const juntavel = (a: AvisoDaCaixa) => a.situacao !== "resolvido" && a.prioridade !== "urgente" && a.tipo in TIPOS_QUE_SE_JUNTAM;
  const porTipo = new Map<string, AvisoDaCaixa[]>();
  for (const a of lista) if (juntavel(a)) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a]);
  const saida: CartaoDeAviso[] = [];
  const postos = new Set<string>();
  for (const a of lista) {
    const grupo = juntavel(a) ? porTipo.get(a.tipo)! : null;
    if (!grupo || grupo.length < 2) {
      saida.push({ tipo: "um", aviso: a });
      continue;
    }
    if (postos.has(a.tipo)) continue;
    postos.add(a.tipo);
    saida.push({ tipo: "grupo", chave: `grupo-${a.tipo}`, titulo: TIPOS_QUE_SE_JUNTAM[a.tipo]!(grupo.length), avisos: grupo });
  }
  return saida;
}

