import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { PainelDasFichas } from "./PainelDasFichas";

export const dynamic = "force-dynamic";

/**
 * Fichas técnicas (E08, decisão 0025). A Casca confere `cadastros.ver` no servidor: quem não pode
 * recebe só a recusa. O painel diz se a pessoa vê custo e se grava; o servidor confere de novo.
 */
export default async function PaginaDasFichas() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <PainelDasFichas />
    </Casca>
  );
}
