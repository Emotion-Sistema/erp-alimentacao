import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { AREAS_DA_COZINHA, contextoDoEstoque } from "./contexto";
import { PainelDoEstoque } from "./PainelDoEstoque";
import { TE } from "./textos";

export const dynamic = "force-dynamic";

/**
 * Estoque da cozinha (E09, decisão 0027). A Casca confere `estoque.cozinha` no servidor; cada
 * consulta e lançamento confere a área de novo.
 */
export default async function PaginaDoEstoque() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="estoque" exige="estoque.cozinha">
      <PainelDoEstoque contexto={contextoDoEstoque(ator)} areasDaPagina={AREAS_DA_COZINHA} titulo={TE.painel.tituloCozinha} />
    </Casca>
  );
}
