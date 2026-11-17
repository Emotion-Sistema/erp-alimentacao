/**
 * Parte dos tipos de produção que a tela também usa (sem banco). Decisão 0017.
 */
export const AREAS = ["cozinha", "cafeteria"] as const;
export type Area = (typeof AREAS)[number];

export const NOME_DA_AREA: Record<Area, string> = { cozinha: "Cozinha", cafeteria: "Cafeteria" };
/** De onde sai o que o tipo produz (RC-10 seção 1). */
export const SAIDA_DA_AREA: Record<Area, string> = { cozinha: "sai pelo elevador", cafeteria: "sai no balcão da cafeteria" };

export const CAPACIDADE_MAXIMA = 50;

export type TipoDeProducao = { id: number; nome: string; area: Area; capacidade: number; ordem: number; ativo: boolean };
