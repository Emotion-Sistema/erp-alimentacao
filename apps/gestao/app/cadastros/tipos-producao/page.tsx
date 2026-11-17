import { pode } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { ListaDeTipos } from "./ListaDeTipos";

export const dynamic = "force-dynamic";

/** Tipos de produção (RC-10, decisão 0017). Quem só vê não recebe os botões; o servidor confere de novo. */
export default async function PaginaTiposDeProducao() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <ListaDeTipos podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} />
    </Casca>
  );
}
