import type { Parametros } from "./rotas";

/** Adapta uma rota com parâmetros de caminho ao formato do Next (params chega como Promise). */
export const comParametros =
  (fn: (req: Request, p: Parametros) => Promise<Response>) =>
  async (req: Request, ctx: { params: Promise<Parametros> }) =>
    fn(req, await ctx.params);
