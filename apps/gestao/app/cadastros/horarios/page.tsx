import { Casca } from "../../Casca";
import { carregarAtor } from "../../sessao-servidor";
import { TelaDeHorarios } from "./TelaDeHorarios";

export const dynamic = "force-dynamic";

/** Horários de venda (E07 parte 2, decisão 0016). Quem pode mudar vem do servidor (`podeMudar`); o servidor confere de novo. */
export default async function PaginaHorarios() {
  const ator = await carregarAtor();
  return (
    <Casca ator={ator} app="cadastros" exige="cadastros.ver">
      <TelaDeHorarios />
    </Casca>
  );
}
