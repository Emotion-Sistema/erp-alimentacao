import { pode } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { ListaDeProdutos } from "./ListaDeProdutos";

export const dynamic = "force-dynamic";

/** Produtos do cardápio (E07 parte 2, decisão 0018). Quem só vê não recebe os botões; o servidor confere de novo. */
export default async function PaginaProdutos() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <ListaDeProdutos podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} />
    </Casca>
  );
}
