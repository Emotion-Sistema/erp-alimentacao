import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { AREAS_DO_SALAO, contextoDoEstoque } from "../contexto";
import { PainelDoEstoque } from "../PainelDoEstoque";
import { TE } from "../textos";

export const dynamic = "force-dynamic";

/**
 * Estoque do salão: bebidas, cafeteria e potes de sorvete (E09, decisão 0027). A Casca confere
 * `estoque.salao` no servidor; cada consulta e lançamento confere a área de novo.
 */
export default async function PaginaDoSalao() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="estoque" exige="estoque.salao">
      <PainelDoEstoque contexto={contextoDoEstoque(ator)} areasDaPagina={AREAS_DO_SALAO} titulo={TE.painel.tituloSalao} />
    </Casca>
  );
}
