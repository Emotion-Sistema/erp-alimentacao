import { Casca } from "../Casca";
import { HistoricoDeAvisos } from "../HistoricoDeAvisos";
import { carregarAtor } from "../sessao-servidor";

export const dynamic = "force-dynamic";

export default async function PaginaAvisos() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator}>
      <h1>Todos os avisos</h1>
      <HistoricoDeAvisos />
    </Casca>
  );
}
