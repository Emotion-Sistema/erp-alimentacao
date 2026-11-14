import { CORES_DO_TEMA_CLARO } from "@erp/interface";

export function GET() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Casa Exemplo">` +
    `<rect width="512" height="512" rx="96" fill="${CORES_DO_TEMA_CLARO.primaria}"/>` +
    `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="300" font-weight="700" fill="${CORES_DO_TEMA_CLARO.primariaTexto}">C</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
