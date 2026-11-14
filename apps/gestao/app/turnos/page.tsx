import { Casca } from "../Casca";
import { carregarAtor } from "../sessao-servidor";
import { Turnos } from "./Turnos";

export const dynamic = "force-dynamic";

/** Turnos da equipe e margem de troca (decisão 0013). Só gerente geral, dono e administrador. */
export default async function PaginaTurnos() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="gestao" exige="horarios.gerenciar">
      <Turnos />
    </Casca>
  );
}
