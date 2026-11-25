import { cache } from "react";
import { cookies } from "next/headers";
import { banco } from "@erp/banco";
import { PREFERENCIAS_PADRAO, preferenciasDaSessao, type Preferencias } from "@erp/dominio";
import { COOKIE_SESSAO } from "@/src/servidor/http";

/**
 * Tema e letra de quem está dentro (decisão 0030), lidos uma vez por página (o layout e a casca
 * usam o mesmo resultado). Se o banco não responder, a página abre no padrão em vez de dar erro.
 */
export const minhasPreferencias = cache(async (): Promise<Preferencias> => {
  try {
    return await preferenciasDaSessao(banco(), (await cookies()).get(COOKIE_SESSAO)?.value);
  } catch {
    return PREFERENCIAS_PADRAO;
  }
});
