/** Preferências de tela de cada pessoa (decisão 0030). Sem nada do servidor: serve também à tela. */
export const TEMAS = ["claro", "escuro"] as const;
export const LETRAS = ["normal", "grande"] as const;
export type Tema = (typeof TEMAS)[number];
export type Letra = (typeof LETRAS)[number];
export type Preferencias = { tema: Tema; letra: Letra };
/** Quem nunca escolheu (e a tela de entrada, sem ninguém dentro). */
export const PREFERENCIAS_PADRAO: Preferencias = { tema: "claro", letra: "normal" };
