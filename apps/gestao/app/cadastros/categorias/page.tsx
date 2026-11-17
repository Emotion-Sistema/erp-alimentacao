import { pode } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { ListaDeCategorias } from "./ListaDeCategorias";

export const dynamic = "force-dynamic";

/** Categorias do cardápio (E07 parte 2). Quem só vê não recebe os botões; o servidor confere de novo. */
export default async function PaginaCategorias() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <ListaDeCategorias podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} />
    </Casca>
  );
}
