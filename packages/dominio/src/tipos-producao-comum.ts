/**
 * Parte dos tipos de produção que a tela também usa (sem banco). Decisão 0017.
 */
export const AREAS_DE_PRODUCAO = ["cozinha", "cafeteria"] as const;
export type AreaDeProducao = (typeof AREAS_DE_PRODUCAO)[number];

export const NOME_DA_AREA_DE_PRODUCAO: Record<AreaDeProducao, string> = { cozinha: "Cozinha", cafeteria: "Cafeteria" };
/** De onde sai o que o tipo produz (RC-10 seção 1). */
export const SAIDA_DA_AREA_DE_PRODUCAO: Record<AreaDeProducao, string> = { cozinha: "sai pelo elevador", cafeteria: "sai no balcão da cafeteria" };

export const CAPACIDADE_MAXIMA = 50;

export type TipoDeProducao = { id: number; nome: string; area: AreaDeProducao; capacidade: number; ordem: number; ativo: boolean };
