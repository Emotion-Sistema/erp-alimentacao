import { APLICATIVOS } from "@erp/dominio";
import { CORES_DO_TEMA_CLARO } from "@erp/interface";

/**
 * Atalho de instalação de cada aplicativo (RC-03). Público de propósito: só tem o nome e o
 * endereço do aplicativo, nenhum dado interno. Sem service worker nesta etapa.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const app = APLICATIVOS.find((a) => a.codigo === codigo);
  if (!app) return new Response("Não encontrado", { status: 404 });
  const manifesto = {
    name: `${app.nome} - Gestão`,
    short_name: app.nome,
    start_url: app.caminho,
    scope: app.codigo === "gestao" ? "/" : app.caminho,
    display: "standalone",
    lang: "pt-BR",
    background_color: CORES_DO_TEMA_CLARO.fundo,
    theme_color: CORES_DO_TEMA_CLARO.primaria,
    icons: [{ src: `/aplicativo/${app.codigo}/icone.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
  return new Response(JSON.stringify(manifesto), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
