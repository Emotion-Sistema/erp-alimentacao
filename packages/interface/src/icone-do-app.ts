import { CORES_DO_TEMA_CLARO } from "./cores";
import { SIMBOLO_PROPORCAO, SIMBOLO_WEBP_BASE64 } from "./simbolo-base64";

/**
 * Ícone SVG de um aplicativo interno (atalho na tela do celular): faixa de café da marca, o símbolo
 * E-MOTION em cima e a inicial do aplicativo em dourado, para cada um ser reconhecido de longe.
 * Decisão 0019. `nome` vai escapado (só aparece no aria-label).
 */
export function iconeDoAplicativo(nome: string): string {
  const inicial = escapar(nome.charAt(0).toUpperCase());
  const c = CORES_DO_TEMA_CLARO;
  const largura = 300;
  const altura = Math.round(largura * SIMBOLO_PROPORCAO);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapar(nome)}">` +
    `<defs><linearGradient id="filete" x1="0" x2="1" y1="0" y2="0">` +
    `<stop offset="0" stop-color="${c.ambar}"/><stop offset=".55" stop-color="${c.marca}"/><stop offset="1" stop-color="${c.primaria}"/>` +
    `</linearGradient></defs>` +
    `<rect width="512" height="512" rx="112" fill="${c.faixaEscura}"/>` +
    `<rect x="96" y="452" width="320" height="10" rx="5" fill="url(#filete)"/>` +
    `<image href="data:image/webp;base64,${SIMBOLO_WEBP_BASE64}" x="${(512 - largura) / 2}" y="58" width="${largura}" height="${altura}"/>` +
    `<text x="256" y="372" text-anchor="middle" dominant-baseline="central" font-family="'Atkinson Hyperlegible Next', system-ui, sans-serif" font-size="170" font-weight="700" fill="${c.faixaEscuraTexto}">${inicial}</text>` +
    `</svg>`
  );
}

function escapar(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
