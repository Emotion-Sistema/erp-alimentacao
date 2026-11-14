import { CARGOS, NOME_DO_CARGO } from "@erp/dominio";
import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { Comunicados } from "./Comunicados";

export const dynamic = "force-dynamic";

export default async function PaginaComunicados() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="gestao" exige="comunicados.enviar">
      <Comunicados cargos={CARGOS.map((c) => ({ valor: c, texto: NOME_DO_CARGO[c] }))} />
    </Casca>
  );
}
