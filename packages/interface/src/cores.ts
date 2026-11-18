/**
 * Cores que arquivos fora do CSS precisam (manifesto, ícones, cor da barra do navegador).
 * Espelho de tema.css e publico.css (marca E-MOTION, decisão 0019); trocar junto.
 * Um teste confere que os valores são os mesmos.
 */
export const CORES_DO_TEMA_CLARO = {
  fundo: "#FDF8F0",
  primaria: "#B8470E",
  primariaTexto: "#FFFDF9",
  marca: "#E77019",
  ambar: "#F6A52B",
  faixaEscura: "#351E17",
  faixaEscuraTexto: "#F6DD8C",
} as const;

/** Modo escuro: só nos apps do cliente (loja e site). */
export const CORES_DO_TEMA_ESCURO = {
  fundo: "#1B1411",
} as const;
