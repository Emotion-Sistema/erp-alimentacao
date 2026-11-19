import { pode } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { TelaDoClube } from "./TelaDoClube";

export const dynamic = "force-dynamic";

/**
 * Clube E-MOTION (RC-21 seção 2, decisão 0024). A Casca confere `clube.ver` no servidor: quem não
 * pode recebe só a recusa. Quem só vê não recebe os botões; o servidor confere de novo cada gravação.
 */
export default async function PaginaDoClube() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="gestao" exige="clube.ver">
      <TelaDoClube podeGerenciar={pode(ator.cargoAtivo, "clube.gerenciar")} />
    </Casca>
  );
}
