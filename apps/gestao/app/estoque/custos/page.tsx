import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { contextoDoEstoque } from "../contexto";
import { Relatorios } from "./Relatorios";

export const dynamic = "force-dynamic";

/**
 * Custos da área (E09 parte 5, decisão 0027): relatórios do estoque. A Casca confere `custos.ver`
 * (o item do menu); cada relatório confere a área e os valores de novo no servidor.
 */
export default async function PaginaDeCustos() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="estoque" exige="custos.ver">
      <Relatorios contexto={contextoDoEstoque(ator)} />
    </Casca>
  );
}
