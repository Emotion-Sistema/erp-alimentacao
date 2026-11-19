import { pode } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { ListaDeGrupos } from "./ListaDeGrupos";

export const dynamic = "force-dynamic";

/** Grupos de adicionais (decisão 0021). Quem só vê não recebe os botões; o servidor confere de novo. */
export default async function PaginaAdicionais() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <ListaDeGrupos podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} />
    </Casca>
  );
}
