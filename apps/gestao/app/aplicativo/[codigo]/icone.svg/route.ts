import { APLICATIVOS } from "@erp/dominio";
import { CORES_DO_TEMA_CLARO } from "@erp/interface";

/** Ícone simples do aplicativo: a inicial do nome sobre a cor primária. */
export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const app = APLICATIVOS.find((a) => a.codigo === codigo);
  if (!app) return new Response("Não encontrado", { status: 404 });
  const inicial = app.nome.charAt(0).toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${app.nome}">` +
    `<rect width="512" height="512" rx="96" fill="${CORES_DO_TEMA_CLARO.primaria}"/>` +
    `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="300" font-weight="700" fill="${CORES_DO_TEMA_CLARO.primariaTexto}">${inicial}</text>` +
    `</svg>`;
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
