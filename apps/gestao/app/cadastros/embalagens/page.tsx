import { pode } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { CatalogoDeEmbalagens } from "./CatalogoDeEmbalagens";

export const dynamic = "force-dynamic";

/** Aba Embalagens (ideia nº 6). Quem só vê não recebe os botões; o servidor confere de novo. */
export default async function PaginaEmbalagens() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <CatalogoDeEmbalagens podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} />
    </Casca>
  );
}
