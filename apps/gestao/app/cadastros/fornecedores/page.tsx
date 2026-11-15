import { pode } from "@erp/dominio";
import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { Fornecedores } from "./Fornecedores";

export const dynamic = "force-dynamic";

export default async function PaginaFornecedores() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <Fornecedores podeGerenciar={pode(ator.cargoAtivo, "cadastros.gerenciar")} />
    </Casca>
  );
}
