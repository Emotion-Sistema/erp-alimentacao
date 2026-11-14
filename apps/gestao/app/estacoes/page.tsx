import { pode } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { Estacoes } from "./Estacoes";

export const dynamic = "force-dynamic";

export default async function PaginaEstacoes() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} exige="estacoes.ver">
      <Estacoes podeGerenciar={pode(ator.cargoAtivo, "estacoes.gerenciar")} />
    </Casca>
  );
}
