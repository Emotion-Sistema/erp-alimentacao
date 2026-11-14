import type { ReactNode } from "react";
import { EmConstrucao } from "@erp/interface";
import { aplicativoPorCodigo, itemDoCaminho } from "@erp/dominio";
import { Casca } from "./Casca";
import { carregarAtor } from "./sessao-servidor";

/**
 * Página provisória de um item do catálogo de aplicativos (decisão 0012).
 * A Casca confere a ação do item no servidor: quem não pode ver recebe só a recusa,
 * sem nenhum conteúdo do item.
 */
export async function paginaDoItem(codigoApp: string, caminho: string, oQueVem: string, depois?: ReactNode) {
  const ator = await carregarAtor();
  const app = aplicativoPorCodigo(codigoApp);
  const item = itemDoCaminho(app, caminho);
  if (!item) throw new Error(`Item sem cadastro no catálogo: ${codigoApp} ${caminho}`);
  return (
    <Casca ator={ator} app={codigoApp} exige={item.acao}>
      <EmConstrucao titulo={item.texto} etapa={item.etapa ?? "ainda sem data"} oQueVem={oQueVem} />
      {depois}
    </Casca>
  );
}
