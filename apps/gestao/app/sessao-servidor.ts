import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { banco } from "@erp/banco";
import { atorDaSessao, type Ator } from "@erp/dominio";
import { COOKIE_SESSAO } from "@/src/servidor/http";

/**
 * Para páginas protegidas (roda no servidor): sem sessão vai para a entrada;
 * com o segundo fator pendente vai para a página dele.
 */
export async function carregarAtor(): Promise<Ator> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const ator = await atorDaSessao(banco(), token);
  if (!ator) redirect("/entrar");
  if (ator.segundoFator === "pendente") redirect("/segundo-fator");
  return ator;
}
