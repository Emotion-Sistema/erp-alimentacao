import { APLICATIVOS } from "@erp/dominio";
import { iconeDoAplicativo } from "@erp/interface";

/** Ícone do aplicativo: símbolo da marca e a inicial do aplicativo (decisão 0019). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await params;
  const app = APLICATIVOS.find((a) => a.codigo === codigo);
  if (!app) return new Response("Não encontrado", { status: 404 });
  return new Response(iconeDoAplicativo(app.nome), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
